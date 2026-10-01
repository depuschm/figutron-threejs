export const ROOM_TYPES = ['Start', 'Normal', 'Item', 'Boss'];

const WIDTH = 9;
const HEIGHT = 9;
const MIN_ROOMS = 7;
const MAX_ROOMS = 10;
const STEPS = [[0, -1], [0, 1], [1, 0], [-1, 0]];

function hashSeed(seed) {
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

function mulberry32(state) {
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (x, y) => `${x},${y}`;
const inBounds = (x, y) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;

function occupiedNeighbors(x, y, occupied) {
  return STEPS.filter(([dx, dy]) => occupied.has(key(x + dx, y + dy))).length;
}

// Random walk that branches from already placed cells. Cells touching more than one
// existing room are rejected while possible, which keeps the layout corridor-like.
function placeCells(random, target) {
  const cx = Math.floor(WIDTH / 2);
  const cy = Math.floor(HEIGHT / 2);
  const cells = [{ x: cx, y: cy }];
  const occupied = new Set([key(cx, cy)]);
  let current = cells[0];
  let attempts = 0;

  while (cells.length < target) {
    attempts++;
    const strict = attempts < 400;
    if (random() < 0.35) current = cells[Math.floor(random() * cells.length)];
    const [dx, dy] = STEPS[Math.floor(random() * STEPS.length)];
    const x = current.x + dx;
    const y = current.y + dy;
    if (!inBounds(x, y) || occupied.has(key(x, y))) continue;
    if (strict && occupiedNeighbors(x, y, occupied) > 1) continue;
    current = { x, y };
    cells.push(current);
    occupied.add(key(x, y));
  }
  return { cells, occupied };
}

function depthsFrom(start, occupied) {
  const depth = new Map([[key(start.x, start.y), 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    const d = depth.get(key(x, y));
    for (const [dx, dy] of STEPS) {
      const next = key(x + dx, y + dy);
      if (occupied.has(next) && !depth.has(next)) {
        depth.set(next, d + 1);
        queue.push({ x: x + dx, y: y + dy });
      }
    }
  }
  return depth;
}

export function generateMap(seed = 'default') {
  const random = mulberry32(hashSeed(seed));
  const target = MIN_ROOMS + Math.floor(random() * (MAX_ROOMS - MIN_ROOMS + 1));
  const { cells, occupied } = placeCells(random, target);
  const depth = depthsFrom(cells[0], occupied);
  const depthOf = (cell) => depth.get(key(cell.x, cell.y));
  const isDeadEnd = (cell) => occupiedNeighbors(cell.x, cell.y, occupied) === 1;

  const others = cells.slice(1);
  const bossPool = others.filter(isDeadEnd);
  const boss = (bossPool.length > 0 ? bossPool : others)
    .reduce((best, cell) => (depthOf(cell) > depthOf(best) ? cell : best));
  const middle = others.filter((cell) => cell !== boss);
  const itemPool = middle.filter(isDeadEnd);
  const item = (itemPool.length > 0 ? itemPool : middle)[Math.floor(random() * (itemPool.length || middle.length))];

  const ordered = [cells[0], ...middle, boss];
  const rooms = ordered.map((cell, index) => ({
    id: `room-${index}`,
    x: cell.x,
    y: cell.y,
    type: index === 0 ? 'Start' : cell === boss ? 'Boss' : cell === item ? 'Item' : 'Normal',
    depth: depthOf(cell),
  }));

  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(null));
  for (const room of rooms) grid[room.y][room.x] = room.id;

  const connections = [];
  for (const room of rooms) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const x = room.x + dx;
      const y = room.y + dy;
      if (inBounds(x, y) && grid[y][x]) connections.push({ from: room.id, to: grid[y][x] });
    }
  }

  return { seed: String(seed), width: WIDTH, height: HEIGHT, grid, rooms, connections };
}
