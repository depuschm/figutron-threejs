import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { movePlayer, resolveEnemyHit } from './game-rules.mjs';

const ARENA_SIZE = 20;
const PLAYER_SPEED = 5.2;
const ENEMY_SPEED = 0.68;
const PROJECTILE_SPEED = 15;

const mount = document.querySelector('#game');
const modeButton = document.querySelector('#weapon-toggle');
const modeLabel = document.querySelector('#weapon-mode');
const modeHint = document.querySelector('#weapon-hint');
const remainingLabel = document.querySelector('#remaining-count');
const killLabel = document.querySelector('#kill-count');
const spareLabel = document.querySelector('#spare-count');
const toast = document.querySelector('#toast');

const ENEMY_SPAWNS = [
  { x: -7.2, z: -6.7 },
  { x: 7.5, z: -5.3 },
  { x: -5.7, z: 7.2 },
];

// ── Scene ────────────────────────────────────────────────────────────────────
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

// ── Lighting ─────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight('#1a2a3a', 0.55));
const overheadFill = new THREE.DirectionalLight('#2a3850', 0.4);
overheadFill.position.set(0, 20, 0);
scene.add(overheadFill);

// ── Floor ────────────────────────────────────────────────────────────────────
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE),
  new THREE.MeshStandardMaterial({ color: '#0e1416', roughness: 0.9, metalness: 0.1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ── Player ───────────────────────────────────────────────────────────────────
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

// ── Asset loader ──────────────────────────────────────────────────────────────
const loader = new GLTFLoader();

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
    () => {
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
    player.remove(playerFallback);
    const model = gltf.scene;
    model.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    player.add(model);
  });

  loader.load('./assets/cave-mite.glb', (gltf) => {
    enemies.forEach(e => {
      const model = gltf.scene.clone();
      model.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
      e.root.remove(e.fallbackMesh);
      e.root.add(model);
    });
  });

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
  });

  spawnMushroom(-5.5, -5.2, '#44ffcc', 7, 8);
  spawnMushroom(5.2,   4.1, '#66aaff', 6, 7);
  spawnMushroom(-3.1,  7.5, '#44ffcc', 5, 7);
  spawnMushroom(7.8,  -1.8, '#ff88cc', 5, 7);
  spawnMushroom(0.5,  -7.5, '#88ffaa', 6, 8);
}

// ── Enemies ───────────────────────────────────────────────────────────────────
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
  return { root, fallbackMesh, status: 'active', bobPhase: index * 2.1 };
});

// ── Projectiles ───────────────────────────────────────────────────────────────
const projectiles = [];
const projGeo = new THREE.SphereGeometry(0.1, 8, 8);
const projMat = new THREE.MeshBasicMaterial({ color: '#ff4444' });

let weaponMode = 'lethal';
const keys = new Set();
let kills = 0;
let spares = 0;
const clock = new THREE.Clock();

function setWeaponMode(mode) {
  weaponMode = mode;
  modeLabel.textContent = mode.toUpperCase();
  modeButton.className = `weapon-toggle ${mode}`;
  modeHint.textContent = mode === 'nonlethal'
    ? 'Impact will spare the contact.'
    : 'Impact is terminal.';
  projMat.color.set(mode === 'lethal' ? '#ff4444' : '#54dfd1');
}

function shoot() {
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
    if (e.status !== 'active') return;
    const d = player.position.distanceTo(e.root.position);
    if (d > 1) {
      const dir = new THREE.Vector3().subVectors(player.position, e.root.position).normalize();
      e.root.position.addScaledVector(dir, ENEMY_SPEED * delta);
    }
    const bobMesh = e.root.children[0];
    if (bobMesh) bobMesh.position.y = 0.5 + Math.sin(Date.now() * 0.005 + e.bobPhase) * 0.1;
  });
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.age += delta;
    p.mesh.position.addScaledVector(p.dir, PROJECTILE_SPEED * delta);
    for (const e of enemies) {
      if (e.status !== 'active') continue;
      if (p.mesh.position.distanceTo(e.root.position) < 0.7) {
        const outcome = resolveEnemyHit(e, weaponMode);
        if (outcome === 'killed') { scene.remove(e.root); kills++; }
        else {
          const mesh = e.root.children[0];
          if (mesh && mesh.isMesh) mesh.material.color.set('#64e8a2');
          spares++;
        }
        p.age = 100;
        updateStats();
      }
    }
    if (p.age > 2) { scene.remove(p.mesh); projectiles.splice(i, 1); }
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
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  update(delta);
  renderer.render(scene, camera);
}

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'q') setWeaponMode(weaponMode === 'lethal' ? 'nonlethal' : 'lethal');
  if (e.key === ' ') { e.preventDefault(); shoot(); }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
mount.addEventListener('click', shoot);

loadAssets();
updateStats();
animate();
