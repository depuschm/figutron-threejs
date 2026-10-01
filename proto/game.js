import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  PLAYER_BOUNDARY,
  applyContactDamage,
  clamp,
  knockbackDistance,
  movePlayer,
  planarDistance,
  resolveEnemyHit,
} from './game-rules.mjs';
import { generateMap } from './map-gen.mjs';

const ARENA_SIZE = 20;
const PLAYER_SPEED = 5.2;
const ENEMY_SPEED = 0.68;
const PROJECTILE_SPEED = 15;
const MAX_HP = 5;
const CONTACT_RANGE = 0.8;
const INVINCIBILITY_SECONDS = 1.5;
const ENEMY_STOP_DISTANCE = 0.55;
const HIT_FLASH_SECONDS = 0.12;
const DAMAGE_FLASH_SECONDS = 0.2;
const KNOCKBACK_DISTANCE = 1.5;
const KNOCKBACK_SECONDS = 0.15;
const SPARE_COLOR = '#64e8a2';
const WALL_HEIGHT = 1.5;
const WALL_THICKNESS = 0.4;
const DOOR_WIDTH = 1.8;
const DOOR_TRIGGER_RANGE = 0.8;
const DOOR_ENTRY_INSET = 8;
const PICKUP_RANGE = 0.9;
const PICKUP_HEAL = 2;
const MAX_ROOM_ENEMIES = 6;
const BOSS_ENEMY_COUNT = 5;
const FADE_OUT_MS = 300;
const FADE_IN_MS = 600;
const MUSHROOM_COLORS = ['#44ffcc', '#66aaff', '#ff88cc', '#88ffaa'];
const ROOM_LABELS = { Start: 'START ROOM', Normal: 'COMBAT', Item: 'ITEM ROOM', Boss: 'BOSS' };
const SIDES = {
  north: { dx: 0, dy: -1, opposite: 'south' },
  south: { dx: 0, dy: 1, opposite: 'north' },
  east: { dx: 1, dy: 0, opposite: 'west' },
  west: { dx: -1, dy: 0, opposite: 'east' },
};

const mount = document.querySelector('#game');
const modeButton = document.querySelector('#weapon-toggle');
const modeLabel = document.querySelector('#weapon-mode');
const modeHint = document.querySelector('#weapon-hint');
const remainingLabel = document.querySelector('#remaining-count');
const killLabel = document.querySelector('#kill-count');
const spareLabel = document.querySelector('#spare-count');
const toast = document.querySelector('#toast');
const hpCard = document.querySelector('#hp-card');
const hpBars = [...document.querySelectorAll('#hp-bars .hp-bar')];
const hpValue = document.querySelector('#hp-value');
const failureOverlay = document.querySelector('#system-failure');
const rebootButton = document.querySelector('#reboot-button');
const transitionOverlay = document.querySelector('#transition-overlay');
const minimap = document.querySelector('#minimap');
const minimapCtx = minimap.getContext('2d');
const roomTypeLabel = document.querySelector('#room-type');

const map = generateMap(Date.now());
const roomsById = new Map(map.rooms.map(room => [room.id, room]));
let currentRoomId = map.rooms[0].id;
const visitedRooms = new Set();
const roomEnemyStates = new Map();
const roomDecor = new Map();
const collectedItems = new Set();
let roomGroup = null;
let doors = [];
let pickup = null;
let doorsUnlocked = false;
let transitioning = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#030608');
scene.fog = new THREE.Fog('#030608', 8, 26);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
mount.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

scene.add(new THREE.AmbientLight('#1a2a3a', 0.55));

const overheadFill = new THREE.DirectionalLight('#2a3850', 0.4);
overheadFill.position.set(0, 20, 0);
overheadFill.castShadow = true;
scene.add(overheadFill);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE),
  new THREE.MeshStandardMaterial({ color: '#0e1416', roughness: 0.9, metalness: 0.1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const player = new THREE.Group();
player.position.set(0, 0, 0);
scene.add(player);

const playerLight = new THREE.PointLight('#54dfd1', 14, 20);
playerLight.position.set(0, 2, 0);
playerLight.castShadow = true;
player.add(playerLight);

const playerFallback = new THREE.Mesh(
  new THREE.BoxGeometry(0.8, 1.2, 0.5),
  new THREE.MeshStandardMaterial({ color: '#54dfd1', emissive: '#0d4a44' }),
);
playerFallback.position.y = 0.6;
playerFallback.castShadow = true;
player.add(playerFallback);
const playerVisual = { model: playerFallback, flash: null };

const loader = new GLTFLoader();

function onAssetError(path) {
  return (error) => {
    console.error(`[Figutron] Failed to load ${path} — keeping fallback geometry.`, error);
  };
}

function prepareModel(model) {
  model.traverse(n => {
    if (!n.isMesh) return;
    n.castShadow = true;
    n.receiveShadow = true;
    n.material = Array.isArray(n.material) ? n.material.map(m => m.clone()) : n.material.clone();
  });
  model.position.set(0, 0, 0);
  const box = new THREE.Box3().setFromObject(model);
  model.position.y = -box.min.y;
  return model;
}

function forEachMaterial(root, fn) {
  root.traverse(n => {
    if (!n.isMesh) return;
    (Array.isArray(n.material) ? n.material : [n.material]).forEach(fn);
  });
}

let mushroomAsset;

function loadMushroomAsset() {
  if (!mushroomAsset) {
    mushroomAsset = new Promise(resolve => {
      loader.load('./assets/mushroom.glb', gltf => resolve(gltf.scene), undefined, (error) => {
        onAssetError('./assets/mushroom.glb')(error);
        resolve(null);
      });
    });
  }
  return mushroomAsset;
}

function spawnMushroom(group, x, z, color = '#44ffcc', intensity = 6, radius = 7) {
  loadMushroomAsset().then(template => {
    if (template) {
      const mush = template.clone();
      mush.position.set(x, 0, z);
      mush.scale.set(1.4, 1.4, 1.4);
      mush.traverse(n => { if (n.isMesh) n.receiveShadow = true; });
      group.add(mush);
      return;
    }
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 0.7, 8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }),
    );
    m.position.set(x, 0.35, z);
    group.add(m);
  });
  const glow = new THREE.PointLight(color, intensity, radius);
  glow.position.set(x, 1.2, z);
  group.add(glow);
}

function loadAssets() {
  loader.load('./assets/player.glb', (gltf) => {
    const model = prepareModel(gltf.scene);
    endFlash(playerVisual);
    player.remove(playerFallback);
    player.add(model);
    playerVisual.model = model;
  }, undefined, onAssetError('./assets/player.glb'));

  loader.load('./assets/cave-mite.glb', (gltf) => {
    enemyTemplate = gltf.scene;
    enemies.forEach(e => applyEnemyModel(e, prepareModel(enemyTemplate.clone())));
  }, undefined, onAssetError('./assets/cave-mite.glb'));
}

let enemyTemplate = null;
let enemies = [];

function applyEnemyModel(e, model) {
  endFlash(e);
  e.root.remove(e.model);
  e.root.add(model);
  e.model = model;
  e.baseY = model.position.y + 0.1;
  if (e.status === 'spared') tintModel(model, SPARE_COLOR);
}

function createEnemy(state, index) {
  const root = new THREE.Group();
  root.position.set(state.x, 0, state.z);
  root.scale.setScalar(state.scale);
  const fallbackMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5, 1),
    new THREE.MeshStandardMaterial({ color: '#ff5544', emissive: '#330a0a' }),
  );
  fallbackMesh.position.y = 0.5;
  fallbackMesh.castShadow = true;
  root.add(fallbackMesh);
  roomGroup.add(root);
  const e = { root, model: fallbackMesh, baseY: fallbackMesh.position.y, status: state.status, speed: state.speed, bobPhase: index * 2.1, flash: null, knockback: null, removeAt: null, state };
  if (enemyTemplate) applyEnemyModel(e, prepareModel(enemyTemplate.clone()));
  else if (e.status === 'spared') tintModel(fallbackMesh, SPARE_COLOR);
  return e;
}

const wallMaterial = new THREE.MeshStandardMaterial({ color: '#3a4c58', emissive: '#0c1a22', roughness: 0.85, metalness: 0.1 });
const doorMaterial = new THREE.MeshStandardMaterial({ color: '#00ffcc', emissive: '#00ffcc', emissiveIntensity: 1.6 });

function neighborOf(room, side) {
  const { dx, dy } = SIDES[side];
  const x = room.x + dx;
  const y = room.y + dy;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  const id = map.grid[y][x];
  if (!id) return null;
  const linked = map.connections.some(({ from, to }) =>
    (from === room.id && to === id) || (from === id && to === room.id));
  return linked ? id : null;
}

// Each side is built as if it were the north wall, then rotated into place.
function buildSide(side, open) {
  const angle = { north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 }[side];
  const pivot = new THREE.Group();
  pivot.rotation.y = angle;
  const edge = -(ARENA_SIZE / 2 + WALL_THICKNESS / 2);
  const fullLength = ARENA_SIZE + WALL_THICKNESS * 2;
  const segments = open
    ? [-1, 1].map(sign => ({ length: (fullLength - DOOR_WIDTH) / 2, x: sign * (DOOR_WIDTH + (fullLength - DOOR_WIDTH) / 2) / 2 }))
    : [{ length: fullLength, x: 0 }];
  for (const { length, x } of segments) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, WALL_HEIGHT, WALL_THICKNESS), wallMaterial);
    wall.position.set(x, WALL_HEIGHT / 2, edge);
    wall.castShadow = true;
    wall.receiveShadow = true;
    pivot.add(wall);
  }
  roomGroup.add(pivot);
  if (!open) return null;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(DOOR_WIDTH, 0.04, 0.5), doorMaterial);
  strip.position.set(0, 0.02, -(ARENA_SIZE / 2 - 0.3));
  strip.visible = false;
  pivot.add(strip);
  const center = new THREE.Vector3(0, 0, -(ARENA_SIZE / 2 - 0.3)).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  return { strip, center };
}

function randomSpawnPoint(avoid, minDistance) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = (Math.random() * 2 - 1) * 7.5;
    const z = (Math.random() * 2 - 1) * 7.5;
    if (!avoid || Math.hypot(x - avoid.x, z - avoid.z) >= minDistance) return { x, z };
  }
  return { x: -avoid.x * 0.6, z: -avoid.z * 0.6 };
}

function createRoomEnemyStates(room, entry) {
  const speed = ENEMY_SPEED * (1 + Math.min(room.depth, 5) * 0.12);
  if (room.type === 'Boss') {
    return Array.from({ length: BOSS_ENEMY_COUNT }, (_, i) => {
      const angle = (i / BOSS_ENEMY_COUNT) * Math.PI * 2;
      return { x: Math.cos(angle) * 4, z: Math.sin(angle) * 4, status: 'active', speed: speed * 1.25, scale: 1.3 };
    });
  }
  if (room.type !== 'Normal') return [];
  const count = Math.min(MAX_ROOM_ENEMIES, 2 + room.depth);
  return Array.from({ length: count }, () => ({ ...randomSpawnPoint(entry, 6), status: 'active', speed, scale: 1 }));
}

function getRoomDecor(roomId) {
  if (!roomDecor.has(roomId)) {
    roomDecor.set(roomId, [0, 1, 2, 3].map(i => {
      const angle = (i + 0.2 + Math.random() * 0.6) * (Math.PI / 2);
      const radius = 5 + Math.random() * 2.5;
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, color: MUSHROOM_COLORS[Math.floor(Math.random() * MUSHROOM_COLORS.length)] };
    }));
  }
  return roomDecor.get(roomId);
}

function createPickup() {
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 20, 16),
    new THREE.MeshStandardMaterial({ color: '#ffd84a', emissive: '#ffcc00', emissiveIntensity: 2 }),
  );
  orb.position.set(0, 0.7, 0);
  const light = new THREE.PointLight('#ffcc33', 6, 7);
  orb.add(light);
  roomGroup.add(orb);
  return orb;
}

function entryPosition(entry) {
  if (!entry) return { x: 0, z: 0 };
  const { dx, dy } = SIDES[entry];
  return { x: dx * DOOR_ENTRY_INSET, z: dy * DOOR_ENTRY_INSET };
}

function loadRoom(roomId, entry = null) {
  if (roomGroup) scene.remove(roomGroup);
  projectiles.forEach(p => scene.remove(p.mesh));
  projectiles.length = 0;
  roomGroup = new THREE.Group();
  scene.add(roomGroup);

  currentRoomId = roomId;
  visitedRooms.add(roomId);
  const room = roomsById.get(roomId);
  const spawn = entryPosition(entry);
  player.position.set(spawn.x, 0, spawn.z);

  doors = [];
  for (const side of Object.keys(SIDES)) {
    const target = neighborOf(room, side);
    const door = buildSide(side, Boolean(target));
    if (door) doors.push({ ...door, side, target });
  }

  getRoomDecor(roomId).forEach(({ x, z, color }) => spawnMushroom(roomGroup, x, z, color, 5, 7));

  if (!roomEnemyStates.has(roomId)) roomEnemyStates.set(roomId, createRoomEnemyStates(room, spawn));
  enemies = roomEnemyStates.get(roomId)
    .filter(state => state.status !== 'killed')
    .map((state, i) => createEnemy(state, i));

  pickup = room.type === 'Item' && !collectedItems.has(roomId) ? createPickup() : null;

  doorsUnlocked = false;
  if (!enemies.some(e => e.status === 'active')) unlockDoors();

  roomTypeLabel.textContent = ROOM_LABELS[room.type];
  roomTypeLabel.dataset.type = room.type.toLowerCase();
  camera.position.set(player.position.x, 12, player.position.z + 8);
  camera.lookAt(player.position);
  updateStats();
  renderMinimap();
}

function unlockDoors() {
  doorsUnlocked = true;
  doors.forEach(door => { door.strip.visible = true; });
}

function transitionToRoom(roomId, entry) {
  transitioning = true;
  keys.clear();
  transitionOverlay.classList.add('active');
  setTimeout(() => loadRoom(roomId, entry), FADE_OUT_MS);
  setTimeout(() => {
    transitionOverlay.classList.remove('active');
    transitioning = false;
  }, FADE_IN_MS);
}

function checkDoors() {
  if (!doorsUnlocked) return;
  const door = doors.find(d => planarDistance(player.position, d.center) < DOOR_TRIGGER_RANGE);
  if (door) transitionToRoom(door.target, SIDES[door.side].opposite);
}

function checkPickup() {
  if (!pickup) return;
  pickup.position.y = 0.7 + Math.sin(elapsed * 3) * 0.12;
  pickup.rotation.y += 0.03;
  if (planarDistance(player.position, pickup.position) > PICKUP_RANGE) return;
  roomGroup.remove(pickup);
  pickup = null;
  collectedItems.add(currentRoomId);
  playerHp = Math.min(MAX_HP, playerHp + PICKUP_HEAL);
  updateHp();
  showToast(`REPAIR ORB · +${PICKUP_HEAL} INTEGRITY`);
}

function renderMinimap() {
  const ratio = window.devicePixelRatio || 1;
  const size = 160;
  if (minimap.width !== size * ratio) {
    minimap.width = size * ratio;
    minimap.height = size * ratio;
  }
  const ctx = minimapCtx;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const cell = 14;
  const gap = 2;
  const offsetX = (size - (map.width * cell + (map.width - 1) * gap)) / 2;
  const offsetY = (size - (map.height * cell + (map.height - 1) * gap)) / 2;
  const centerOf = room => ({
    x: offsetX + room.x * (cell + gap) + cell / 2,
    y: offsetY + room.y * (cell + gap) + cell / 2,
  });

  ctx.strokeStyle = '#3d5566';
  ctx.lineWidth = 2;
  for (const { from, to } of map.connections) {
    if (!visitedRooms.has(from) || !visitedRooms.has(to)) continue;
    const a = centerOf(roomsById.get(from));
    const b = centerOf(roomsById.get(to));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const id of visitedRooms) {
    const room = roomsById.get(id);
    const { x, y } = centerOf(room);
    const left = x - cell / 2;
    const top = y - cell / 2;
    ctx.save();
    if (id === currentRoomId) {
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#00ffcc';
    } else {
      ctx.fillStyle = '#1a2a3a';
    }
    ctx.fillRect(left, top, cell, cell);
    ctx.restore();
    ctx.strokeStyle = '#334';
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, cell - 1, cell - 1);
    const marker = { Boss: '#ff6578', Item: '#ffd84a' }[room.type];
    if (marker && id !== currentRoomId) {
      ctx.fillStyle = marker;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const projectiles = [];
const projGeo = new THREE.SphereGeometry(0.1, 8, 8);
const projMat = new THREE.MeshBasicMaterial({ color: '#ff4444' });

let weaponMode = 'lethal';
const keys = new Set();
let kills = 0;
let spares = 0;
let playerHp = MAX_HP;
let invulnerableUntil = 0;
let gameOver = false;
let elapsed = 0;
let frameId = 0;
const clock = new THREE.Clock();

function startFlash(target, color, duration) {
  if (!target.flash) {
    const saved = [];
    forEachMaterial(target.model, m => {
      if (m.emissive) saved.push({ material: m, color: m.emissive.clone(), intensity: m.emissiveIntensity });
    });
    target.flash = { saved, until: 0 };
  }
  target.flash.saved.forEach(({ material }) => {
    material.emissive.set(color);
    material.emissiveIntensity = 1;
  });
  target.flash.until = elapsed + duration;
}

function endFlash(target) {
  if (!target.flash) return;
  target.flash.saved.forEach(({ material, color, intensity }) => {
    material.emissive.copy(color);
    material.emissiveIntensity = intensity;
  });
  target.flash = null;
}

function updateFlash(target) {
  if (target.flash && elapsed >= target.flash.until) endFlash(target);
}

function tintModel(model, color) {
  forEachMaterial(model, m => { if (m.color) m.color.set(color); });
}

function startKnockback(e, impactPoint, fallbackDir) {
  const dir = new THREE.Vector3(e.root.position.x - impactPoint.x, 0, e.root.position.z - impactPoint.z);
  if (dir.lengthSq() < 1e-6) dir.set(fallbackDir.x, 0, fallbackDir.z);
  e.knockback = { dir: dir.normalize(), time: 0, travelled: 0 };
}

function updateKnockback(e, delta) {
  const kb = e.knockback;
  if (!kb) return;
  kb.time += delta;
  const total = knockbackDistance(kb.time, KNOCKBACK_SECONDS, KNOCKBACK_DISTANCE);
  e.root.position.addScaledVector(kb.dir, total - kb.travelled);
  e.root.position.x = clamp(e.root.position.x, -PLAYER_BOUNDARY, PLAYER_BOUNDARY);
  e.root.position.z = clamp(e.root.position.z, -PLAYER_BOUNDARY, PLAYER_BOUNDARY);
  kb.travelled = total;
  if (kb.time >= KNOCKBACK_SECONDS) e.knockback = null;
}

function updateHp() {
  hpBars.forEach((bar, i) => bar.classList.toggle('empty', i >= playerHp));
  hpValue.textContent = `${playerHp}/${MAX_HP}`;
  hpCard.classList.toggle('critical', playerHp > 0 && playerHp <= 1);
  hpCard.setAttribute('aria-label', `Integrity ${playerHp} of ${MAX_HP}`);
}

function checkContactDamage() {
  const touching = enemies.some(e =>
    e.status === 'active' && planarDistance(player.position, e.root.position) < CONTACT_RANGE);
  if (!touching) return;
  const result = applyContactDamage({ hp: playerHp, invulnerableUntil }, elapsed, INVINCIBILITY_SECONDS);
  if (!result.hit) return;
  playerHp = result.hp;
  invulnerableUntil = result.invulnerableUntil;
  startFlash(playerVisual, '#ff0000', DAMAGE_FLASH_SECONDS);
  updateHp();
  if (playerHp <= 0) triggerGameOver();
}

function triggerGameOver() {
  gameOver = true;
  keys.clear();
  cancelAnimationFrame(frameId);
  failureOverlay.classList.add('visible');
  failureOverlay.setAttribute('aria-hidden', 'false');
  rebootButton.focus();
}

function setWeaponMode(mode) {
  weaponMode = mode;
  modeLabel.textContent = mode.toUpperCase();
  modeButton.classList.toggle('lethal', mode === 'lethal');
  modeButton.classList.toggle('nonlethal', mode === 'nonlethal');
  modeButton.setAttribute('aria-label', `Weapon Mode: ${mode === 'lethal' ? 'Lethal' : 'Non-lethal'}. Toggle weapon mode`);
  modeHint.textContent = mode === 'nonlethal' ? 'Impact will spare the contact.' : 'Impact is terminal.';
  projMat.color.set(mode === 'lethal' ? '#ff4444' : '#54dfd1');
}

function toggleWeaponMode() {
  setWeaponMode(weaponMode === 'lethal' ? 'nonlethal' : 'lethal');
}

function shoot() {
  if (gameOver) return;
  const proj = new THREE.Mesh(projGeo, projMat.clone());
  proj.position.copy(player.position);
  proj.position.y = 0.5;
  let targetDir = new THREE.Vector3(0, 0, -1);
  let minDist = Infinity;
  let nearest = null;
  enemies.forEach(e => {
    if (e.status !== 'active') return;
    const d = e.root.position.distanceTo(player.position);
    if (d < minDist) { minDist = d; nearest = e; }
  });
  if (nearest) targetDir.subVectors(nearest.root.position, player.position).normalize();
  scene.add(proj);
  projectiles.push({ mesh: proj, dir: targetDir, age: 0 });
}

function update(delta) {
  if (transitioning) return;
  const moveDir = { x: 0, z: 0 };
  if (keys.has('w') || keys.has('arrowup'))    moveDir.z -= 1;
  if (keys.has('s') || keys.has('arrowdown'))  moveDir.z += 1;
  if (keys.has('a') || keys.has('arrowleft'))  moveDir.x -= 1;
  if (keys.has('d') || keys.has('arrowright')) moveDir.x += 1;
  if (moveDir.x !== 0 || moveDir.z !== 0) {
    const moved = movePlayer(player.position, moveDir, delta, PLAYER_SPEED);
    player.position.set(moved.x, 0, moved.z);
    player.rotation.y = Math.atan2(moveDir.x, moveDir.z);
  }
  const camTarget = new THREE.Vector3(player.position.x, 12, player.position.z + 8);
  camera.position.lerp(camTarget, 0.1);
  camera.lookAt(player.position);

  enemies.forEach(e => {
    if (!e.root.parent) return;
    updateFlash(e);
    updateKnockback(e, delta);
    if (e.removeAt !== null && elapsed >= e.removeAt) {
      endFlash(e);
      roomGroup.remove(e.root);
      return;
    }
    if (e.status !== 'active') return;
    const d = player.position.distanceTo(e.root.position);
    if (d > ENEMY_STOP_DISTANCE && !e.knockback) {
      const dir = new THREE.Vector3().subVectors(player.position, e.root.position).normalize();
      e.root.position.addScaledVector(dir, e.speed * delta);
    }
    e.model.position.y = e.baseY + Math.sin(Date.now() * 0.005 + e.bobPhase) * 0.1;
  });

  updateFlash(playerVisual);
  checkContactDamage();
  checkPickup();

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.age += delta;
    p.mesh.position.addScaledVector(p.dir, PROJECTILE_SPEED * delta);
    for (const e of enemies) {
      if (e.status !== 'active') continue;
      if (planarDistance(p.mesh.position, e.root.position) < 0.7) {
        const outcome = resolveEnemyHit(e, weaponMode);
        e.state.status = outcome;
        if (outcome === 'killed') {
          e.removeAt = elapsed + KNOCKBACK_SECONDS;
          kills++;
        } else {
          tintModel(e.model, SPARE_COLOR);
          spares++;
        }
        startFlash(e, '#ffffff', HIT_FLASH_SECONDS);
        startKnockback(e, p.mesh.position, p.dir);
        p.age = 100;
        updateStats();
        break;
      }
    }
    if (p.age > 2) {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }

  checkDoors();
}

let toastTimer = 0;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}

function updateStats() {
  const remaining = enemies.filter(e => e.status === 'active').length;
  remainingLabel.textContent = remaining.toString().padStart(2, '0');
  killLabel.textContent = kills.toString().padStart(2, '0');
  spareLabel.textContent = spares.toString().padStart(2, '0');
  if (remaining === 0 && !doorsUnlocked) {
    unlockDoors();
    const isBoss = roomsById.get(currentRoomId).type === 'Boss';
    showToast(isBoss ? 'SECTOR CLEARED · BOSS RESOLVED' : 'ROOM CLEAR · DOORS OPEN');
  }
}

function animate() {
  frameId = requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  elapsed += delta;
  update(delta);
  renderer.render(scene, camera);
}

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (gameOver) {
    if (e.key === ' ') e.preventDefault();
    if (k === 'r') window.location.reload();
    return;
  }
  keys.add(k);
  if (k === 'q') toggleWeaponMode();
  if (e.key === ' ') { e.preventDefault(); shoot(); }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
mount.addEventListener('click', shoot);
modeButton.addEventListener('click', () => {
  if (gameOver) return;
  toggleWeaponMode();
  modeButton.blur();
});
rebootButton.addEventListener('click', () => window.location.reload());

window.__figutronDebug = {
  scene, player, playerVisual, map, visitedRooms,
  get enemies() { return enemies; },
  get doors() { return doors; },
  get currentRoomId() { return currentRoomId; },
  get currentRoom() { return roomsById.get(currentRoomId); },
  get hp() { return playerHp; },
  get gameOver() { return gameOver; },
  loadRoom,
};

loadAssets();
loadRoom(currentRoomId);
updateHp();
animate();
