# Known Problems — Figutron Proto

## 🔴 Critical

### [P-01] ✅ FIXED — Nonlethal hit detection unreliable
**Fix (2026-09-30):** hit test now uses `planarDistance()` (x-z only) from `game-rules.mjs`.

---

## 🟡 Medium

### [P-02] Dark splotch remains after enemy kill
**Symptom:** After a lethal kill, a black blob stays behind in the scene.  
**Suggested fix:** Traverse all children of `e.root` and dispose geometries/materials before removing.

### [P-03] No win screen / run-end state
**Symptom:** Toast fires but no prominent end-of-run overlay.  
**Suggested fix:** Add a full mission-complete overlay similar to SYSTEM FAILURE.

---

## 🟢 Low / Polish

### [P-04] ✅ FIXED — Player model renders as dark box
**Fix (2026-09-30):** `prepareModel()` lifts every GLB so its bounding-box bottom sits at y = 0. All loaders log `console.error('[Figutron] Failed to load …')` on failure.

### [P-05] ✅ FIXED — Enemy model appears as plain sphere
**Fix (2026-09-30):** each enemy now tracks `e.model` + `e.baseY`, clones its own materials, and tints/flashes by traversing all meshes.

### [P-06] Projectile is hard to see
**Suggested fix:** Increase projectile sphere radius, add a point-light on the projectile, or add a muzzle-flash.

---

## Open (found 2026-09-30)

### [P-07] Projectile tunnelling at very low frame rates
**Symptom:** At < ~10 fps a projectile can skip over an enemy's 0.7 hit radius.  
**Suggested fix:** Swept hit test, or sub-step projectile movement.

### [P-08] Walls are half-buried and very tall
**Symptom:** `wall.glb` is scaled `(5, 5, 1)` at y = 0 while the model is centred on its origin.  
**Suggested fix:** Apply `prepareModel()` lift and revisit Y scale.

### [P-09] Small-viewport HUD crowding
**Symptom:** Below ~480 px viewport height the left column touches the controls footer.  
**Suggested fix:** Responsive HUD grid, or collapse the mission card on short screens.
