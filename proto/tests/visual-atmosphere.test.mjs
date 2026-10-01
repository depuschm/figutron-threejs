import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = readFileSync(new URL('../game.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('scene uses near-black background and dense fog', () => {
  assert.match(game, /scene\.background = new THREE\.Color\('#020508'\)/);
  assert.match(game, /scene\.fog = new THREE\.Fog\('#020508', 2, 12\)/);
});

test('player carries the specified teal point light and floor has icy material', () => {
  assert.match(game, /const keyLight = new THREE\.PointLight\('#54dfd1', 5\.0, 15\)/);
  assert.match(game, /player\.add\(keyLight\)/);
  assert.match(game, /color: '#050a10', roughness: 0\.2, metalness: 0\.5/);
});

test('one hundred snow points drift, wrap back into the arena, and update per frame', () => {
  assert.match(game, /const snowCount = 100/);
  assert.match(game, /new THREE\.Points\(/);
  assert.match(game, /function updateSnow\(delta, elapsed\)/);
  assert.match(game, /positions\.needsUpdate = true/);
  assert.match(game, /updateSnow\(delta, elapsed\)/);
});

test('vignette and animated grain overlays are present above the canvas', () => {
  assert.match(styles, /\.vignette\s*\{[^}]*radial-gradient/s);
  assert.match(styles, /\.grain\s*\{[^}]*animation:\s*grain-shift/s);
  assert.match(styles, /@keyframes grain-shift/);
  assert.match(html, /class="vignette" aria-hidden="true"/);
  assert.match(html, /class="grain" aria-hidden="true"/);
});
