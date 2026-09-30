export const ARENA_HALF_SIZE = 10;
export const PLAYER_BOUNDARY = ARENA_HALF_SIZE - 0.55;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeDirection(direction) {
  const length = Math.hypot(direction.x, direction.z);
  if (length === 0) return { x: 0, z: 0 };
  return { x: direction.x / length, z: direction.z / length };
}

export function movePlayer(position, direction, deltaSeconds, speed) {
  const normalized = normalizeDirection(direction);
  const step = Math.max(0, deltaSeconds) * speed;
  return {
    x: clamp(position.x + normalized.x * step, -PLAYER_BOUNDARY, PLAYER_BOUNDARY),
    z: clamp(position.z + normalized.z * step, -PLAYER_BOUNDARY, PLAYER_BOUNDARY),
  };
}

export function resolveEnemyHit(enemy, mode) {
  if (enemy.status !== 'active') return enemy.status;
  enemy.status = mode === 'lethal' ? 'killed' : 'spared';
  return enemy.status;
}

export function planarDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function applyContactDamage(state, now, invincibilitySeconds, damage = 1) {
  if (state.hp <= 0 || now < state.invulnerableUntil) {
    return { hp: state.hp, invulnerableUntil: state.invulnerableUntil, hit: false };
  }
  return {
    hp: Math.max(0, state.hp - damage),
    invulnerableUntil: now + invincibilitySeconds,
    hit: true,
  };
}

export function knockbackDistance(elapsed, duration, distance) {
  const t = clamp(elapsed / duration, 0, 1);
  return distance * (1 - (1 - t) * (1 - t));
}
