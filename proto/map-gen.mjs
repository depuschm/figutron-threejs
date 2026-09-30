const GRID_SIZE = 9;
const START = 4;
const DIRECTIONS = [
  ['north', 0, -1],
  ['south', 0, 1],
  ['east', 1, 0],
  ['west', -1, 0],
];

function randomFromSeed(seed) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function roomId(x, y) {
  return `room-${x}-${y}`;
}

function freeNeighbors(room, occupied) {
  return DIRECTIONS
    .map(([, dx, dy]) => ({ x: room.x + dx, y: room.y + dy }))
    .filter(({ x, y }) => x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE && !occupied.has(roomId(x, y)));
}

export function generateMap(seed = 'figutron-map') {
  const mapSeed = String(seed);
  const random = randomFromSeed(mapSeed);
  const targetCount = 8 + Math.floor(random() * 5);
  let rooms, boss, treasureCandidates;

  do {
    const occupied = new Set([roomId(START, START)]);
    const positions = [{ x: START, y: START }];
    let current = positions[0];

    while (positions.length < targetCount) {
      let options = freeNeighbors(current, occupied);
      if (options.length === 0 || random() < 0.3) {
        const origins = positions.filter((position) => freeNeighbors(position, occupied).length > 0);
        current = origins[Math.floor(random() * origins.length)];
        options = freeNeighbors(current, occupied);
      }
      current = options[Math.floor(random() * options.length)];
      positions.push(current);
      occupied.add(roomId(current.x, current.y));
    }

    rooms = positions.map(({ x, y }) => ({
      id: roomId(x, y),
      x, y,
      type: 'normal',
      doors: Object.fromEntries(DIRECTIONS.map(([direction, dx, dy]) => [
        direction,
        occupied.has(roomId(x + dx, y + dy)),
      ])),
    }));

    boss = rooms.reduce((furthest, room) =>
      Math.abs(room.x - START) + Math.abs(room.y - START) >
      Math.abs(furthest.x - START) + Math.abs(furthest.y - START) ? room : furthest);
    treasureCandidates = rooms.filter((room) =>
      room !== rooms[0] && room !== boss && Object.values(room.doors).filter(Boolean).length === 1);
  } while (treasureCandidates.length === 0);

  rooms[0].type = 'start';
  boss.type = 'boss';
  const treasure = treasureCandidates[Math.floor(random() * treasureCandidates.length)];
  treasure.type = 'treasure';

  const shopCandidates = rooms.filter((room) =>
    room.type === 'normal' && Object.values(room.doors).filter(Boolean).length === 1);
  const normalRooms = rooms.filter((room) => room.type === 'normal');
  const shopPool = shopCandidates.length > 0 ? shopCandidates : normalRooms;
  shopPool[Math.floor(random() * shopPool.length)].type = 'shop';

  return { seed: mapSeed, rooms, startRoom: rooms[0].id, bossRoom: boss.id };
}
