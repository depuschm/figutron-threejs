# TODO — Figutron Proto

Items are loosely ordered by priority. Move resolved items to PROBLEMS.md (fixed) or remove them.

## 🔴 Must-fix before next milestone

- [ ] Fix nonlethal hit detection (see P-01 in PROBLEMS.md)
- [ ] Confirm and test win/end-of-run state (toast + any follow-up screen)
- [ ] Fix or suppress asset-load errors for player.glb and cave-mite.glb (P-04, P-05)

## 🟡 Gameplay

- [ ] Add player health / damage — currently enemies can walk into the player with no consequence
- [ ] Enemy attack behavior — enemies only chase; they need a way to hurt the player
- [ ] Wave / round system — after all enemies are cleared, start a new wave (more enemies, harder)
- [ ] Weapon cooldown / fire rate — Space can be mashed with no limit
- [ ] Projectile visual feedback — muzzle flash, impact particle, or hit indicator
- [ ] Arena boundary feedback — player bumps into invisible walls; add a visible border or bounce effect
- [ ] Enemy variety — second enemy type with different speed or behavior

## 🟡 UI / UX

- [ ] End-of-run summary screen (outcome breakdown: killed vs. spared, "Pacifist run" bonus)
- [ ] Pause menu (Escape key)
- [ ] Sound effects — movement, fire, hit, death, weapon-switch
- [ ] Background music loop
- [ ] Minimap or radar showing enemy positions

## 🟢 Nice-to-have / Polish

- [ ] Animated intro / room-entry transition
- [ ] Hit-flash on enemy when struck (color pulse, not just on spare)
- [ ] Screenshake on lethal kill
- [ ] Player animation state (idle, walk, shoot)
- [ ] Enemy death animation (currently instant remove)
- [ ] Mobile / touch controls
- [ ] Settings panel (volume, resolution, key rebind)

## 🔵 Architecture / Tech Debt

- [ ] Move game constants (speeds, counts, spawn positions) to a separate `config.mjs`
- [ ] Replace forEach + manual index loops with a unified entity-manager pattern
- [ ] Add a proper asset manifest / preloader with loading screen
- [ ] Automated tests for `resolveEnemyHit` edge cases (double-hit, wrong-mode, inactive enemy)
- [ ] Port prototype to Unity once mechanics are stable
