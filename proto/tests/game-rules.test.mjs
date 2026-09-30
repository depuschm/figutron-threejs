import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_HALF_SIZE,
  PLAYER_BOUNDARY,
  applyContactDamage,
  knockbackDistance,
  movePlayer,
  normalizeDirection,
  planarDistance,
  resolveEnemyHit,
} from '../game-rules.mjs';

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

test('contact damage removes 1 HP and starts an invincibility window', () => {
  const hit = applyContactDamage({ hp: 5, invulnerableUntil: 0 }, 2, 1.5);
  assert.deepEqual(hit, { hp: 4, invulnerableUntil: 3.5, hit: true });
});

test('no repeated contact damage during iframes, damage resumes once they end', () => {
  const during = applyContactDamage({ hp: 4, invulnerableUntil: 3.5 }, 3.49, 1.5);
  assert.deepEqual(during, { hp: 4, invulnerableUntil: 3.5, hit: false });
  const after = applyContactDamage({ hp: 4, invulnerableUntil: 3.5 }, 3.5, 1.5);
  assert.deepEqual(after, { hp: 3, invulnerableUntil: 5, hit: true });
});

test('HP never drops below zero and a dead player takes no further hits', () => {
  assert.equal(applyContactDamage({ hp: 1, invulnerableUntil: 0 }, 10, 1.5, 3).hp, 0);
  const dead = applyContactDamage({ hp: 0, invulnerableUntil: 0 }, 10, 1.5);
  assert.equal(dead.hit, false);
  assert.equal(dead.hp, 0);
});

test('five contacts spaced beyond the iframe window kill a full-HP player', () => {
  let state = { hp: 5, invulnerableUntil: 0 };
  let hits = 0;
  for (let t = 0; t <= 10; t += 0.1) {
    const next = applyContactDamage(state, t, 1.5);
    if (next.hit) hits++;
    state = next;
  }
  assert.equal(state.hp, 0);
  assert.equal(hits, 5);
});

test('planar distance ignores height', () => {
  assert.equal(planarDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 9, z: 4 }), 5);
});

test('knockback eases out and ends exactly at the full distance', () => {
  assert.equal(knockbackDistance(0, 0.15, 1.5), 0);
  assert.equal(knockbackDistance(0.15, 0.15, 1.5), 1.5);
  assert.equal(knockbackDistance(1, 0.15, 1.5), 1.5);
  const half = knockbackDistance(0.075, 0.15, 1.5);
  assert.ok(half > 0.75 && half < 1.5);
  assert.equal(knockbackDistance(-1, 0.15, 1.5), 0);
});
