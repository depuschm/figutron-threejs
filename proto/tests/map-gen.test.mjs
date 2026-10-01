import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, ROOM_TYPES } from '../map-gen.mjs';

function getReachableRoomIds(map) {
  const adjacency = new Map(map.rooms.map(({ id }) => [id, new Set()]));

  for (const { from, to } of map.connections) {
    adjacency.get(from).add(to);
    adjacency.get(to).add(from);
  }

  const visited = new Set();
  const pending = [map.rooms[0].id];

  while (pending.length > 0) {
    const roomId = pending.pop();
    if (visited.has(roomId)) continue;
    visited.add(roomId);
    pending.push(...adjacency.get(roomId));
  }

  return visited;
}

test('generates a bounded map with the required room types and valid grid layout', () => {
  const map = generateMap('test-seed');

  assert.equal(map.width, 9);
  assert.equal(map.height, 9);
  assert.equal(map.grid.length, map.height);
  assert.ok(map.rooms.length >= 5 && map.rooms.length <= 10);
  assert.equal(map.grid.every((row) => row.length === map.width), true);
  assert.equal(map.rooms[0].type, 'Start');
  assert.equal(map.rooms.at(-1).type, 'Boss');
  assert.ok(map.rooms.some((room) => room.type === 'Item'));
  assert.ok(map.rooms.every((room) => ROOM_TYPES.includes(room.type)));

  const roomIds = new Set(map.rooms.map(({ id }) => id));
  const occupiedCells = map.grid.flat().filter((cell) => cell !== null);
  assert.equal(roomIds.size, map.rooms.length);
  assert.equal(occupiedCells.length, map.rooms.length);
  assert.deepEqual(new Set(occupiedCells), roomIds);
  assert.ok(map.rooms.every(({ x, y }) => x >= 0 && x < map.width && y >= 0 && y < map.height));
});

test('all generated rooms are reachable through the returned connections', () => {
  for (const seed of ['alpha', 'beta', 'gamma', 42, 987654]) {
    const map = generateMap(seed);
    assert.equal(getReachableRoomIds(map).size, map.rooms.length, `seed ${seed}`);

    const roomById = new Map(map.rooms.map((room) => [room.id, room]));
    const connectionKeys = new Set();
    for (const { from, to } of map.connections) {
      assert.ok(roomById.has(from));
      assert.ok(roomById.has(to));
      assert.notEqual(from, to);
      const key = [from, to].sort().join(':');
      assert.equal(connectionKeys.has(key), false);
      connectionKeys.add(key);

      const first = roomById.get(from);
      const second = roomById.get(to);
      assert.equal(Math.abs(first.x - second.x) + Math.abs(first.y - second.y), 1);
    }
  }
});

test('same seed returns identical JSON and different seeds remain valid maps', () => {
  const first = generateMap('repeatable');
  const second = generateMap('repeatable');

  assert.deepEqual(second, first);
  assert.notDeepEqual(generateMap('different'), first);
});

test('default seed is repeatable and room ids occupy their matching grid cells', () => {
  const first = generateMap();
  const second = generateMap();

  assert.deepEqual(first, second);
  for (const room of first.rooms) {
    assert.equal(first.grid[room.y][room.x], room.id);
  }
});
