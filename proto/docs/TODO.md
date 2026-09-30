# TODO — Figutron Proto

## 🔴 Must-fix before next milestone

- [x] Fix nonlethal hit detection (P-01)
- [ ] Confirm and test win/end-of-run state (P-03)
- [x] Fix GLB loading (P-04, P-05)

## 🟡 Gameplay

- [x] Player health / damage — 5 HP, contact damage, 1.5s iframes, SYSTEM FAILURE + REBOOT
- [x] Enemy contact behavior — enemies close to 0.55u
- [ ] Wave / round system — new wave after room cleared
- [ ] Weapon cooldown / fire rate limit
- [ ] Projectile visual feedback — muzzle flash, impact particle
- [ ] Arena boundary feedback — visible border or bounce
- [ ] Enemy variety — second type with different behavior
- [ ] Integrate map-gen.mjs into game: room rendering, door transitions, minimap

## 🟡 UI / UX

- [ ] End-of-run summary screen (killed vs. spared, Pacifist bonus)
- [ ] Pause menu (Escape)
- [ ] Player blink during invincibility window
- [ ] Swept projectile collision (P-07)
- [ ] Sound effects and background music
- [ ] Minimap overlay

## 🟢 Polish

- [ ] Animated room-entry transition
- [x] Hit-flash on enemy (white 120ms + knockback); player flashes red on damage
- [ ] Screenshake on lethal kill
- [ ] Enemy death animation
- [ ] Mobile / touch controls

## 🔵 Tech Debt

- [ ] Extract constants to `config.mjs`
- [ ] Asset manifest / preloader with loading screen
- [ ] Fix P-08 (wall GLB half-buried)
- [ ] Fix P-09 (HUD crowding on small viewports)
- [ ] Port to Unity once mechanics are stable
