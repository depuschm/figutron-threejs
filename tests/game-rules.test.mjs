import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_HALF_SIZE, PLAYER_BOUNDARY, movePlayer, normalizeDirection, resolveEnemyHit } from '../game-rules.mjs';

test('movement stays inside the arena boundary', () => {
  const atEdge = movePlayer({ x: PLAYER_BOUNDARY, z: -PLAYER_BOUNDARY }, { x: 1, z: -1 }, 1, 8);
  assert.equal(atEdge.x, PLAYER_BOUNDARY);
  assert.equal(atEdge.z, -PLAYER_BOUNDARY);
  assert.ok(Math.abs(atEdge.x) < ARENA_HALF_SIZE && Math.abs(atEdge.z) < ARENA_HALF_SIZE);
});

test('diagonal movement is normalized and zero direction is safe', () => {
  const diagonal = movePlayer({ x: 0, z: 0 }, { x: 1, z: 1 }, 1, 4);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 4) < 1e-9);
  assert.deepEqual(normalizeDirection({ x: 0, z: 0 }), { x: 0, z: 0 });
  assert.deepEqual(movePlayer({ x: 2, z: 3 }, { x: 0, z: 0 }, 0.2, 4), { x: 2, z: 3 });
});

test('lethal shots kill and non-lethal shots spare; resolved contacts cannot change outcome', () => {
  const lethal = { status: 'active' };
  const spared = { status: 'active' };
  assert.equal(resolveEnemyHit(lethal, 'lethal'), 'killed');
  assert.equal(resolveEnemyHit(spared, 'nonlethal'), 'spared');
  assert.equal(resolveEnemyHit(spared, 'lethal'), 'spared');
});