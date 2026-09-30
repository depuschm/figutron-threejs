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