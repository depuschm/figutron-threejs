const GRID_SIZE = 9;
export function generateMap(seed = 'figutron-map') {
  return {
    seed: String(seed),
    rooms: [{ id: 'room-0', x: 4, y: 4, type: 'Start' }]
  };
}