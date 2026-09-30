# Figutron — Three.js Prototype

A single-player, top-down arena prototype. The player moves inside a 20 × 20 floor, three contacts approach slowly, and each hit resolves according to the currently selected lethal/non-lethal weapon mode.

## Run

Serve this folder over HTTP (ES modules and the GLB assets need an HTTP origin):

```sh
python -m http.server 8000
```

Open the local server URL in a modern browser with an internet connection. Three.js and its GLTFLoader are imported from jsDelivr; Google Fonts are an optional visual enhancement. WASD/arrow keys move, Space or a canvas click fires at the nearest active contact, and Q or the weapon button switches mode.

## Models

`assets/player.glb` and `assets/enemy.glb` were generated in Blender. To regenerate them using the included Blender Python script:

```sh
blender --background --python generate_models.py
```

The game includes simple in-code mesh fallbacks while the GLB assets are loading.

## Tests

```sh
node --test tests/game-rules.test.mjs
```