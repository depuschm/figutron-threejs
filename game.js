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
scene.fog = new THREE.Fog('#020508', 5, 25);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
mount.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight('#1a2b3c', 0.4));

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE),
  new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.8, metalness: 0.2 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const player = new THREE.Group();
player.position.set(0, 0, 0);
scene.add(player);

const playerLight = new THREE.PointLight('#54dfd1', 12, 18);
playerLight.position.set(0, 2, 0);
playerLight.castShadow = true;
player.add(playerLight);

const playerFallback = new THREE.Mesh(
  new THREE.BoxGeometry(0.8, 1.2, 0.5),
  new THREE.MeshStandardMaterial({ color: '#54dfd1', emissive: '#114444' })
);
playerFallback.position.y = 0.6;
playerFallback.castShadow = true;
player.add(playerFallback);

const loader = new GLTFLoader();

function spawnMushroom(x, z) {
    loader.load('./assets/mushroom.glb', (gltf) => {
        const mush = gltf.scene.clone();
        mush.position.set(x, 0, z);
        mush.scale.set(1.5, 1.5, 1.5);
        scene.add(mush);
        const glow = new THREE.PointLight('#33ccff', 5, 6);
        glow.position.set(x, 1, z);
        scene.add(glow);
    });
}

function loadAssets() {
    loader.load('./assets/player.glb', (gltf) => {
        player.remove(playerFallback);
        const model = gltf.scene;
        model.traverse(n => { if(n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
        player.add(model);
    });
    loader.load('./assets/wall.glb', (gltf) => {
        for(let i=0; i<4; i++) {
            const w = gltf.scene.clone();
            const angle = (i * Math.PI) / 2;
            w.position.set(Math.cos(angle)*10, 0, Math.sin(angle)*10);
            w.rotation.y = -angle + Math.PI/2;
            w.scale.set(5, 5, 1);
            scene.add(w);
        }
    });
    spawnMushroom(-5, -5);
    spawnMushroom(5, 4);
    spawnMushroom(-3, 7);
    spawnMushroom(8, -2);
}

const enemies = ENEMY_SPAWNS.map((spawn, index) => {
  const root = new THREE.Group();
  root.position.set(spawn.x, 0, spawn.z);
  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5, 1),
    new THREE.MeshStandardMaterial({ color: '#ff4444', emissive: '#220000' }),
  );
  body.position.y = 0.5;
  body.castShadow = true;
  root.add(body);
  scene.add(root);
  return { root, status: 'active', bobPhase: index * 2.1 };
});

const projectiles = [];
const projGeo = new THREE.SphereGeometry(0.1, 8, 8);
const projMat = new THREE.MeshBasicMaterial({ color: '#54dfd1' });
let weaponMode = 'lethal';
const keys = new Set();
let kills = 0;
let spares = 0;

function setWeaponMode(mode) {
  weaponMode = mode;
  modeLabel.textContent = mode.toUpperCase();
  modeButton.className = `weapon-toggle ${mode}`;
  modeHint.textContent = mode === 'nonlethal' ? 'Impact will spare the contact.' : 'Impact is terminal.';
  projMat.color.set(mode === 'lethal' ? '#ff4444' : '#54dfd1');
}

function shoot() {
  const proj = new THREE.Mesh(projGeo, projMat.clone());
  proj.position.copy(player.position);
  proj.position.y = 0.5;
  let targetDir = new THREE.Vector3(0, 0, -1);
  let nearest = null;
  let minDist = Infinity;
  enemies.forEach(e => {
      if(e.status !== 'active') return;
      let d = e.root.position.distanceTo(player.position);
      if(d < minDist) { minDist = d; nearest = e; }
  });
  if(nearest) {
      targetDir.subVectors(nearest.root.position, player.position).normalize();
  }
  scene.add(proj);
  projectiles.push({ mesh: proj, dir: targetDir, age: 0 });
}

function update(delta) {
    const moveDir = { x: 0, z: 0 };
    if(keys.has('w')) moveDir.z -= 1;
    if(keys.has('s')) moveDir.z += 1;
    if(keys.has('a')) moveDir.x -= 1;
    if(keys.has('d')) moveDir.x += 1;
    if(moveDir.x !== 0 || moveDir.z !== 0) {
        const moved = movePlayer(player.position, moveDir, delta, PLAYER_SPEED);
        player.position.set(moved.x, 0, moved.z);
        player.rotation.y = Math.atan2(moveDir.x, moveDir.z);
    }
    camera.position.lerp(new THREE.Vector3(player.position.x, 12, player.position.z + 8), 0.1);
    camera.lookAt(player.position);
    enemies.forEach(e => {
        if(e.status !== 'active') return;
        const d = player.position.distanceTo(e.root.position);
        if(d > 1) {
            const dir = new THREE.Vector3().subVectors(player.position, e.root.position).normalize();
            e.root.position.addScaledVector(dir, ENEMY_SPEED * delta);
        }
        e.root.children[0].position.y = 0.5 + Math.sin(Date.now()*0.005 + e.bobPhase)*0.1;
    });
    for(let i=projectiles.length-1; i>=0; i--) {
        const p = projectiles[i];
        p.age += delta;
        p.mesh.position.addScaledVector(p.dir, PROJECTILE_SPEED * delta);
        enemies.forEach(e => {
            if(e.status !== 'active') continue;
            if(p.mesh.position.distanceTo(e.root.position) < 0.7) {
                const outcome = resolveEnemyHit(e, weaponMode);
                if(outcome === 'killed') { scene.remove(e.root); kills++; }
                else { 
                    e.root.children[0].material.color.set('#64e8a2'); 
                    spares++;
                }
                p.age = 100;
                updateStats();
            }
        });
        if(p.age > 2) {
            scene.remove(p.mesh);
            projectiles.splice(i, 1);
        }
    }
}

function updateStats() {
    remainingLabel.textContent = enemies.filter(e => e.status === 'active').length.toString().padStart(2, '0');
    killLabel.textContent = kills.toString().padStart(2, '0');
    spareLabel.textContent = spares.toString().padStart(2, '0');
}

function animate() {
    requestAnimationFrame(animate);
    update(0.016);
    renderer.render(scene, camera);
}

window.addEventListener('keydown', e => {
    keys.add(e.key.toLowerCase());
    if(e.key.toLowerCase() === 'q') setWeaponMode(weaponMode === 'lethal' ? 'nonlethal' : 'lethal');
    if(e.key === ' ') shoot();
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

loadAssets();
animate();