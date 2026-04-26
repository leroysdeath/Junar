---
name: cardinal-los-contract
description: Junar's combat pillar — auto-fire on cardinal line-of-sight, contact-only enemies and bosses, one-hit deaths. Use when changes touch arrow firing, line-of-sight, projectile direction, auto-fire cooldown/range, or player↔enemy contact damage; or when a request would introduce manual aim, click-to-shoot, diagonal shots, any ranged attack by an enemy or boss, AoE, or player health/iframes. These break the "where you stand, not when you click" pillar — push back before implementing.
---

# Cardinal LOS contract

Junar's combat pillar is "where you stand, not when you click." This is the prototype's load-bearing constraint. Breaking it produces a different game.

See CLAUDE.md §2 (pillars), §4 (auto-fire / cardinal LOS), §8 (guardrails).

## The rule

- Arrows auto-fire every 500 ms when an enemy is on a **cardinal-aligned** line of sight within 300 px.
- Four cardinal directions only. No diagonals.
- The player has no manual fire, no aim input, no targeted-fire click.
- Enemies threaten by **contact only**. No projectiles, no AoE, no telegraphed ranged moves.
- One enemy hit on the player ends the run. No HP, no regen, no armor.

## Where this lives in code

- `src/game/Game.ts`
  - `fireArrow()` (`Game.ts:336`) — picks the nearest cardinal-aligned enemy with clear LOS, emits an arrow with a unit `{x, y}` direction whose components are -1, 0, or 1.
  - `getCardinalDirection(dx, dy)` (`Game.ts:383`) — projects an enemy delta onto the dominant axis. Returns `null` for the zero-vector case (player and enemy overlap).
  - `hasCardinalLineOfSight(start, direction)` (`Game.ts:407`) — steps the cardinal ray every half-tile. Counts an enemy as "on the ray" only when its center is within `TILE_SIZE/2` perpendicular **and** `TILE_SIZE/2` on-axis from the current step. The on-axis check is what stops "any enemy on the same row/column registers a hit at step 1, before walls block." See commit `e8a224b`.
  - `getCardinalDistance(...)` (`Game.ts:461`) — distance along the cardinal axis only, used for nearest-enemy selection.
  - `checkCollisions()` (`Game.ts:472`) — kills the player on direct overlap **or** on cardinal LOS to an enemy. The overlap branch (`Game.ts:494`) handles the zero-delta case where `getCardinalDirection` returns `null`; without it the player is invulnerable when standing exactly on an enemy.

- `src/game/Renderer.ts`
  - `renderArrows()` (`Renderer.ts:172`) translates cardinal `dir` into one of four 90° rotations. Anything other than `(±1, 0)` or `(0, ±1)` will fall through to angle 0 (right).
  - `renderLineOfSightIndicator()` (`Renderer.ts:211`) is the existing hook for cardinal-LOS visual hints.

## Things that would break the contract

Push back before implementing any of these. They each need explicit owner approval.

1. **Manual fire / click-to-shoot / aim input.** The auto-fire-on-cardinal-LOS rule is what makes the game tactical-positioning rather than twitch-aim. The canvas only listens for one click — to leave the menu (`Game.ts:87`).
2. **Diagonal shots.** The arrow direction set is closed at 4 elements. `Renderer.renderArrows` and `getCardinalDistance` both assume one component is exactly zero.
3. **Targeted fire** ("fire at this specific enemy" / "lock-on"). `fireArrow` picks the nearest cardinal enemy; nothing higher up the stack addresses individual enemies.
4. **Ranged enemy attacks** — projectiles, breath, spit, shockwaves, telegraphed lunges that hit at a distance. The contact-only rule is what makes player positioning the entire game. There is no enemy-projectile system; adding one is a new subsystem, not an enemy variant.
5. **Enemy AoE damage.** Same rationale.
6. **Player health, regen, armor, i-frames.** One hit = death. CLAUDE.md §4.

## Things that are fine within the contract

- Tweaking `arrowCooldown` (500 ms), `arrowSpeed` (400 px/s), `maxDetectionRange` (300 px) — these are fields on `Game`. (See `tile-grid-and-canvas-constants` for promoting them to `constants.ts`.)
- Adding new beasts that follow the contact-only rule (still requires owner approval per `enemy-roster-and-tone`).
- Adding visual feedback for cardinal LOS (e.g., extending `renderLineOfSightIndicator`).
- Multi-arrow behaviors that still respect cardinal direction (e.g., a piercing arrow). Worth checking with the owner since it's a meaningful design shift, but it doesn't break the contract.

## When asked to add something that would break the contract

State the conflict explicitly, point at this skill plus CLAUDE.md §2/§4/§8, and ask the owner to confirm before implementing. Don't implement on a shrug — the cardinal-LOS rule is the prototype's identity.
