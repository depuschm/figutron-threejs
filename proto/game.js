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
    console.error(`[Figutron] Failed to load ${path} â€” keeping fallback geometry.`, error);
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
      new THREE.MeshStandardMajà