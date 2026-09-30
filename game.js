import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { movePlayer, resolveEnemyHit } from './game-rules.mjs';

const ARENA_SIZE = 20;
const PLAYER_SPEED = 5.2;
const ENEMY_SPEED = 0.68;
const PROJECTILE_SPEED = 15;
const PLAYER_Y = 0.52;
const PLAYER_BODY_Y = 0.3;
const ENEMY_SPAWNS = [
  { x: -7.2, z: -6.7 },
  { x: 7.5, z: -5.3 },
  { x: -5.7, z: 7.2 },
];

const mount = document.querySelector('#game');
const modeButton = document.querySelector('#weapon-toggle');
const modeLabel = document.querySelector('#weapon-mode');
const modeHint = document.querySelector('#weapon-hint');
const remainingLabel = document.querySelector('#remaining-count');
const killLabel = document.querySelector('#kill-count');
const spareLabel = document.querySelector('#spare-count');
const toast = document.querySelector('#toast');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#020508');
scene.fog = new THREE.Fog('#020508', 2, 12);
const camera = new THREE.OrthographicCamera(-18, 18, 11, -11, 0.1, 100);
camera.position.set(0, 5.5, 2.45);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.domElement.setAttribute('aria-label', 'Three-dimensional arena. Move with WASD and fire with space or click.');
mount.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight('#a4d9f2', '#152536', 0.42));

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE),
  new THREE.MeshStandardMaterial({ color: '#050a10', roughness: 0.2, metalness: 0.5 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const snowCount = 100;
const snowPositions = new Float32Array(snowCount * 3);
const snowDrifts = Array.from({ length: snowCount }, () => ({
  x: (Math.random() - 0.5) * 0.16,
  z: (Math.random() - 0.5) * 0.16,
  fallSpeed: 0.12 + Math.random() * 0.2,
}));
for (let i = 0; i < snowCount; i += 1) {
  snowPositions[i * 3] = (Math.random() - 0.5) * ARENA_SIZE;
  snowPositions[i * 3 + 1] = 0.3 + Math.random() * 3.2;
  snowPositions[i * 3 + 2] = (Math.random() - 0.5) * ARENA_SIZE;
}
const snowGeometry = new THREE.BufferGeometry();
snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
const snow = new THREE.Points(
  snowGeometry,
  new THREE.PointsMaterial({ color: '#dffbff', size: 0.055, transparent: true, opacity: 0.62, depthWrite: false }),
);
scene.add(snow);

const grid = new THREE.GridHelper(ARENA_SIZE, 20, '#39717a', '#294354');
grid.position.y = 0.014;
grid.material.transparent = true;
grid.material.opacity = 0.33;
scene.add(grid);

const border = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(ARENA_SIZE, 0.025, ARENA_SIZE)),
  new THREE.LineBasicMaterial({ color: '#50d7d0', transparent: true, opacity: 0.75 }),
);
border.position.y = 0.02;
scene.add(border);

const markerMaterial = new THREE.MeshStandardMaterial({ color: '#294455', emissive: '#112c3a', emissiveIntensity: 0.55, roughness: 0.75 });
for (const [x, z] of [[-9.4, -9.4], [9.4, -9.4], [-9.4, 9.4], [9.4, 9.4]]) {
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.42), markerMaterial);
  marker.position.set(x, 0.07, z);
  marker.castShadow = true;
  scene.add(marker);
}

const player = new THREE.Group();
player.position.set(0, 0, 0);
scene.add(player);
const keyLight = new THREE.PointLight('#54dfd1', 5.0, 15);
keyLight.position.set(0, 2.4, 0);
player.add(keyLight);
const playerFallback = new THREE.Group();
const playerBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.76, 0.58, 1.02),
  new THREE.MeshStandardMaterial({ color: '#51dfd5', emissive: '#0a746c', emissiveIntensity: 0.5, roughness: 0.38, metalness: 0.23 }),
);
playerBody.position.y = PLAYER_BODY_Y;
playerBody.castShadow = true;
playerFallback.add(playerBody);
const playerCap = new THREE.Mesh(
  new THREE.BoxGeometry(0.36, 0.12, 0.29),
  new THREE.MeshStandardMaterial({ color: '#c0fff5', emissive: '#63e7d3', emissiveIntensity: 0.75, roughness: 0.35 }),
);
playerCap.position.set(0, PLAYER_BODY_Y + 0.31, -0.06);
playerFallback.add(playerCap);
player.add(playerFallback);

const enemies = ENEMY_SPAWNS.map((spawn, index) => {
  const root = new THREE.Group();
  root.position.set(spawn.x, 0, spawn.z);
  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.48, 1),
    new THREE.MeshStandardMaterial({ color: '#ff7a78', emissive: '#6c1b2a', emissiveIntensity: 0.62, roughness: 0.48, metalness: 0.13 }),
  );
  body.position.y = PLAYER_Y;
  body.castShadow = true;
  body.name = `enemy-fallback-${index}`;
  root.add(body);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.64, 0.035, 6, 36),
    new THREE.MeshBasicMaterial({ color: '#ff6578', transparent: true, opacity: 0.76 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.045;
  root.add(ring);
  scene.add(root);
  return { root, status: 'active', ring, fallback: body, bobPhase: index * 2.1 };
});

const projectiles = [];
const projectileGeometry = new THREE.SphereGeometry(0.105, 12, 10);
const projectileMaterial = new THREE.MeshStandardMaterial({ color: '#c9fff5', emissive: '#53e7d2', emissiveIntensity: 2.8, roughness: 0.25 });
let weaponMode = 'lethal';
let lastShotAt = 0;
let lastDirection = { x: 0, z: -1 };
let kills = 0;
let spares = 0;
let resolvedToastTimer = 0;
const keys = new Set();
const clock = new THREE.Clock();

function cloneSceneMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
  });
}

function loadModels() {
  const loader = new GLTFLoader();
  loader.load('./assets/player.glb', (gltf) => {
    cloneSceneMaterials(gltf.scene);
    gltf.scene.position.y = PLAYER_BODY_Y;
    player.remove(playerFallback);
    player.add(gltf.scene);
  });
  loader.load('./assets/enemy.glb', (gltf) => {
    enemies.forEach((enemy) => {
      const model = gltf.scene.clone(true);
      cloneSceneMaterials(model);
      model.position.y = PLAYER_Y;
      enemy.root.remove(enemy.fallback);
      enemy.root.add(model);
      enemy.model = model;
    });
  });
}

function setWeaponMode(mode) {
  weaponMode = mode;
  const nonlethal = mode === 'nonlethal';
  modeLabel.textContent = nonlethal ? 'NON-LETHAL' : 'LETHAL';
  modeButton.classList.toggle('nonlethal', nonlethal);
  modeButton.classList.toggle('lethal', !nonlethal);
  modeButton.setAttribute('aria-label', `Weapon Mode: ${nonlethal ? 'Non-Lethal' : 'Lethal'}. Toggle weapon mode`);
  modeHint.textContent = nonlethal ? 'Impact will spare the contact.' : 'Impact is terminal.';
}

function updateStats() {
  const remaining = enemies.filter((enemy) => enemy.status === 'active').length;
  remainingLabel.textContent = String(remaining).padStart(2, '0');
  killLabel.textContent = String(kills).padStart(2, '0');
  spareLabel.textContent = String(spares).padStart(2, '0');
  if (remaining === 0) {
    toast.classList.add('visible');
    window.clearTimeout(resolvedToastTimer);
    resolvedToastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2400);
  }
}

function getShotDirection() {
  let target = null;
  let nearestDistance = Infinity;
  for (const enemy of enemies) {
    if (enemy.status !== 'active') continue;
    const distance = Math.hypot(enemy.root.position.x - player.position.x, enemy.root.position.z - player.position.z);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      target = enemy;
    }
  }
  if (target) {
    const x = target.root.position.x - player.position.x;
    const z = target.root.position.z - player.position.z ;
    const length = Math.hypot(x, z) || 1;
    return { x: x / length, z: z / length };
  }
  return lastDirection;
}

function shoot() {
  const now = performance.now();
  if (now - lastShotAt < 210) return;
  lastShotAt = now;
  const direction = getShotDirection();
  const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
  projectile.position.set(player.position.x + direction.x * 0.66, PLAYER_Y, player.position.z + direction.z * 0.66);
  projectile.castShadow = false;
  scene.add(projectile);
  projectiles.push({ mesh: projectile, direction, age: 0 });
}

function spareEnemy(enemy) {
  enemy.status = 'spared';
  enemy.ring.material.color.set('#64e8a2');
  const modelRoot = enemy.model || enemy.fallback;
  modelRoot.traverse((part) => {
    if (!part.isMesh) return;
    const setMaterial = (material) => {
      material.color.set('#66e89f');
      if (material.emissive) material.emissive.set('#126842');
    };
    if (Array.isArray(part.material)) part.material.forEach(setMaterial);
    else setMaterial(part.material);
  });
  spares += 1;
  updateStats();
}

function removeEnemy(enemy) {
  enemy.status = 'killed';
  scene.remove(enemy.root);
  kills += 1;
  updateStats();
}

function updateProjectiles(delta) {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = projectiles[i];
    projectile.age += delta;
    projectile.mesh.position.x += projectile.direction.x * PROJECTILE_SPEED * delta;
    projectile.mesh.position.z += projectile.direction.z * PROJECTILE_SPEED * delta;
    let collided = false;
    for (const enemy of enemies) {
      if (enemy.status !== 'active') continue;
      const distance = Math.hypot(projectile.mesh.position.x - enemy.root.position.x, projectile.mesh.position.z - enemy.root.position.z);
      if (distance <= 0.7) {
        collided = true;
        const outcome = resolveEnemyHit(enemy, weaponMode);
        if (outcome === 'killed') removeEnemy(enemy);
        else if (outcome === 'spared') spareEnemy(enemy);
        break;
      }
    }
    const outsideArena = Math.abs(projectile.mesh.position.x) > 11 || Math.abs(projectile.mesh.position.z) > 11;
    if (collided || outsideArena || projectile.age > 2.1) {
      scene.remove(projectile.mesh);
      projectiles.splice(i, 1);
    }
  }
}

function updateSnow(delta, elapsed) {
  const positions = snow.geometry.attributes.position;
  for (let i = 0; i < snowCount; i += 1) {
    positions.array[i * 3] += snowDrifts[i].x * delta + Math.sin(elapsed + i) * 0.012 * delta;
    positions.array[i * 3 + 1] -= snowDrifts[i].fallSpeed * delta;
    positions.array[i * 3 + 2] += snowDrifts[i].z * delta + Math.cos(elapsed + i) * 0.012 * delta;
    if (positions.array[i * 3 + 1] < 0.2) {
      positions.array[i * 3] = (Math.random() - 0.5) * ARENA_SIZE;
      positions.array[i * 3 + 1] = 2.5 + Math.random() * 1.2;
      positions.array[i * 3 + 2] = (Math.random() - 0.5) * ARENA_SIZE;
    }
  }
  positions.needsUpdate = true;
}

function updatePlayer(delta) {
  const direction = {
    x: Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')),
    z: Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.hash('w') || keys.has('arrowup')),
  };
  if (direction.x !== 0 || direction.z !== 0) {
    const moved = movePlayer(player.position, direction, delta, PLAYER_SPEED);
    player.position.set(moved.x, 0, moved.zone);
    const length = Math.hypot(direction.x, direction.z);
    lastDirection = { x: direction.x/length, z: direction.z / length };
  }
}

function updateEnemies(delta, elapsed) {
  for (const enemy of enemies) {
    if (enemy.status !== 'active') ontinue;
    const dx = player.position.x - enemy.root.position.x;
    const dz = player.position.z - enemy.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 1.08) {
      enemy.root.position.x += (dx / distance) * ENEMY_SPEED * delta;
      enemy.root.position.z+= (dz0 distance) * ENEMY_SPEED * delta;
    }
    enemy.root.rotation.y = Math.atan2(dx, dz);
    const body = enemy.model || enemy.fallback;
    body.position.y = PLAYER_Y + Math.sin(elapsed * 1.8 + enemy.bobPhase) * 0.035;
  }
}

function resize() {
  const width = mount.clientWidth || window.innerWidth;
  const height = mount.clientHeight || window.innerHeight;
  const aspect = width / height;
  const viewHeight = Math.max(22, 22 / aspect);
  camera.left = -(viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  updatePlayer(delta);
  updateSnow(delta, elapsed);
  updateEnemies(delta, elapsed);
  updateProjectiles(delta);
  renderer.render(scene, camera);
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
  keys.add(key);
  if (key === 'q' && !event.repeat) setWeaponMode(weaponMode === 'lethal' ? 'nonlethal' : 'lethal');
  if (key === ' ' && !event.repeat) shoot();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
modeButton.addEventListener('click', () => setWeaponMode(weaponMode === 'lethal' ? 'nonlethal' : 'lethal'));
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button === 0) shoot();
});

window.figutron = {
  get state() {
    return {
      weaponMode,
      player: { x: player.position.x, z: player.position.z },
      enemies: enemies.map((enemy) => ({ status: enemy.status, x: enemy.root.position.x, z: enemy.root.position.z })),
      kills,
      spares,
    };
  },
  shoot,
  toggleWeapon: () => setWeaponMode(weaponMode === 'lethal' ? 'nonlethal' : 'lethal'),
};

resize();
loadModels();
updateStats();
animate();
