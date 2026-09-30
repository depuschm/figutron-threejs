# Known Problems — Figutron Proto

## 🔴 Critical

### [P-01] Nonlethal hit detection unreliable
**Symptom:** Firing in NONLETHAL mode rarely increments the "Spared" counter.  
**Root cause:** Hit detection computes a 3D distance between the projectile mesh (`y = 0.5`) and the enemy root group (`y = 0`). The persistent 0.5-unit vertical offset means the effective x-z hit radius shrinks from 0.7 to only ≈ 0.49 units, making most shots appear to miss even when visually on-target.  
**Suggested fix:** Either move the enemy root origin to `y = 0.5` to match the projectile, or compute hit distance using only the x-z plane, or increase the collision radius to ≥ 0.9.

---

## 🟡 Medium

### [P-02] Dark splotch remains after enemy kill
**Symptom:** After a lethal kill, a black blob/splatter stays behind in the scene around the kill location.  
**Root cause:** `scene.remove(e.root)` removes the group but may leave shadow receivers, light cookies, or a GLB sub-object that was not parented to the root group.  
**Suggested fix:** Traverse all children of `e.root` and dispose geometries/materials before removing; also dispose any associated effects.

### [P-03] No win screen / run-end state
**Symptom:** When the last enemy is dealt with, the UI shows `00 remaining` but the scene stays live with no clear "mission complete" feedback (the toast is defined but not confirmed to fire reliably).  
**Suggested fix:** Verify the `toast.classList.add('visible')` path is hit; add a more prominent end-of-run overlay or redirect.

---

## 🟢 Low / Polish

### [P-04] Player model renders as dark box
**Symptom:** The player appears as a gray/dark flat box rather than a robot model.  
**Root cause:** The GLB loader path `./assets/player.glb` may be resolving incorrectly depending on how the server is run, falling back silently to the box geometry.  
**Suggested fix:** Add a `console.error` in the GLB `onError` callback; confirm assets are reachable at runtime with network DevTools.

### [P-05] Enemy model appears as plain sphere (fallback)
**Symptom:** Enemies show as teal/white icosahedron spheres instead of the cave-mite GLB.  
**Root cause:** Same asset-path issue as P-04 — the GLB either fails to load or the clone step does not replace the fallback mesh correctly.  
**Suggested fix:** Same as P-04; also check that `e.root.remove(e.fallbackMesh)` is reached after GLB load.

### [P-06] Projectile is hard to see
**Symptom:** The fired projectile is a very small red dot, nearly invisible against the dark background.  
**Suggested fix:** Increase projectile sphere radius (currently 0.1), add a point-light on the projectile, or add a brief muzzle-flash effect.
