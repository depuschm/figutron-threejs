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

const ENEMY_SPAWNS = [
  { x: -7.2, z: -6.7 },
  { x: 7.5, z: -5.3 },
  { x: -5.7, z: 7.2 },
];

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

function spawnMushroom(x, z, color = '#44ffcc', intensity = 6, radius = 7) {
  loader.load('./assets/mushroom.glb',
    (gltf) => {
      const mush = gltf.scene;
      mush.position.set(x, 0, z);
      mush.scale.set(1.4, 1.4, 1.4);
      mush.traverse(n => { if (n.isMesh) n.receiveShadow = true; });
      scene.add(mush);
    },
    undefined,
    (error) => {
      onAssetError('./assets/mushroom.glb')(error);
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 0.7, 8),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }),
      );
      m.position.set(x, 0.35, z);
      scene.add(m);
    },
  );
  const glow = new THREE.PointLight(color, intensity, radius);
  glow.position.set(x, 1.2, z);
  scene.add(glow);
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
    enemies.forEach(e => {
      const model = prepareModel(gltf.scene.clone());
      endFlash(e);
      e.root.remove(e.model);
      e.root.add(model);
      e.model = model;
      e.baseY = model.position.y + 0.1;
      if (e.status === 'spared') tintModel(model, SPARE_COLOR);
    });
  }, undefined, onAssetError('./assets/cave-mite.glb'));

  loader.load('./assets/wall.glb', (gltf) => {
    for (let i = 0; i < 4; i++) {
      const w = gltf.scene.clone();
      const angle = (i * Math.PI) / 2;
      w.position.set(Math.cos(angle) * 10, 0, Math.sin(angle) * 10);
      w.rotation.y = -angle + Math.PI / 2;
      w.scale.set(5, 5, 1);
      w.traverse(n => { if (n.isMesh) n.castShadow = true; });
      scene.add(w);
    }
  }, undefined, onAssetError('./assets/wall.glb'));

  spawnMushroom(-5.5, -5.2, '#44ffcc', 7, 8);
  spawnMushroom(5.2,   4.1, '#66aaff', 6, 7);
  spawnMushroom(-3.1,  7.5, '#44ffcc', 5, 7);
  spawnMushroom(7.8,  -1.8, '#ff88cc', 5, 7);
  spawnMushroom(0.5,  -7.5, '#88ffaa', 6, 8);
}

const enemies = ENEMY_SPAWNS.map((spawn, index) => {
  const root = new THREE.Group();
  root.position.set(spawn.x, 0, spawn.z);
  const fallbackMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5, 1),
    new THREE.MeshStandardMaterial({ color: '#ff5544', emissive: '#330a0a' }),
  );
  fallbackMesh.position.y = 0.5;
  fallbackMesh.castShadow = true;
  root.add(fallbackMesh);
  scene.add(root);
  return { root, model: fallbackMesh, baseY: fallbackMesh.position.y, status: 'active', bobPhase: index * 2.1, flash: null, knockback: null, removeAt: null };
});

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
      scene.remove(e.root);
      return;
    }
    if (e.status !== 'active') return;
    const d = player.position.distanceTo(e.root.position);
    if (d > ENEMY_STOP_DISTANCE && !e.knockback) {
      const dir = new THREE.Vector3().subVectors(player.position, e.root.position).normalize();
      e.root.position.addScaledVector(dir, ENEMY_SPEED * delta);
    }
    e.model.position.y = e.baseY + Math.sin(Date.now() * 0.005 + e.bobPhase) * 0.1;
  });

  updateFlash(playerVisual);
  checkContactDamage();

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.age += delta;
    p.mesh.position.addScaledVector(p.dir, PROJECTILE_SPEED * delta);
    for (const e of enemies) {
      if (e.status !== 'active') continue;
      if (planarDistance(p.mesh.position, e.root.position) < 0.7) {
        const outcome = resolveEnemyHit(e, weaponMode);
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
}

function updateStats() {
  const remaining = enemies.filter(e => e.status === 'active').length;
  remainingLabel.textContent = remaining.toString().padStart(2, '0');
  killLabel.textContent = kills.toString().padStart(2, '0');
  spareLabel.textContent = spares.toString().padStart(2, '0');
  if (remaining === 0 && toast) {
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 3500);
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
  scene, player, enemies, playerVisual,
  get hp() { return playerHp; },
  get gameOver() { return gameOver; },
};

loadAssets();
updateStats();
updateHp();
animate();
