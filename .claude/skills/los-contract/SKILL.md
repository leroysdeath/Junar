---
name: los-contract
description: Junar's combat pillar — auto-fire at the nearest enemy with clear 360° any-angle line of sight, contact-only enemies and bosses, one-hit deaths. Use when changes touch arrow firing, line-of-sight, auto-fire cooldown/range, or player↔enemy contact damage; or when a request would introduce manual aim, click-to-shoot, input-driven targeting, any ranged attack by an enemy or boss, AoE, or player health/iframes. These break the "where you stand, not when you click" pillar — push back before implementing.
---

# 360-LOS contract

Junar's combat pillar is "where you stand, not when you click." This is the prototype's load-bearing constraint. Breaking it produces a different game.

See CLAUDE.md §3 (pillars), §4–§5 (core loop / mechanics reference), §9 (guardrails).

## The rule

- Arrows auto-fire at the nearest enemy within 450 px whose center is reachable from the player center by an unobstructed wall raycast — **any angle, full 360°**. Walls are the only gate.
- Base cooldown is 500 ms; the effective cooldown is `ARROW_COOLDOWN_MS / (burst × low-stamina multiplier)`, recomputed every frame.
- The player has no manual fire, no aim input, no targeted-fire click.
- Enemies threaten by **contact only**. No projectiles, no AoE, no telegraphed ranged moves. The boss is no exception.
- One enemy hit on the player ends the run. No HP, no regen, no armor.

## Where this lives in code

- `src/game/Game.ts`
  - `findNearestVisibleEnemy()` (`Game.ts:1498`) — scans all enemies and returns the nearest by Euclidean center distance (centers = position + `TILE_SIZE/2`), skipping any beyond `maxDetectionRange` (a `Game` field initialized from `MAX_DETECTION_RANGE` = 450, `constants.ts`) or without LOS. Single source of truth for both auto-fire targeting **and** the on-screen LOS indicator.
  - `hasDirectLineOfSight(start, end)` (`Game.ts:1532`) — generic point-to-point raycast, sampled in equal steps at ~8 px granularity (`steps = ceil(distance / 8)`); blocked if any sampled tile is a wall; distance 0 returns `true`. Walls are the only gate — any angle qualifies. Center-to-center is intentional: an enemy peeking out from behind a wall column doesn't qualify until the player steps to clear the line.
  - `fireArrow(target)` (`Game.ts:1562`) — emits an arrow on the raw unit vector `{dx/d, dy/d}` toward the target center (no angle snapping); early-returns on distance 0. The per-frame cooldown check in `update` uses `ARROW_COOLDOWN_MS / stamina.getArrowRateMultiplier()` (burst × low-stamina). Arrows fly at `ARROW_SPEED` (400 px/s) and die on canvas bounds, walls, or enemy hit.
  - `checkCollisions(now)` (`Game.ts:1609`) — pass 1 kills the player on a true AABB overlap via `enemyTouchesPlayer` (`Game.ts:1596`): the enemy's per-type `ENEMY_AABB_PX` box against the player's `PLAYER_HURTBOX_PX` (16 px) kill core, both centred in their 32 px cells (owner-approved 2026-06-10; per-axis kill distance = `(16 + enemyAABB)/2` — bear 25, panther 18.5, gibbon 15.5, snake 10). Wall collision still uses the player's full `PLAYER_SIZE` cell. Pass 2 checks the 4×4 arrow box against the 32 px enemy cell; a hit removes the enemy and scores +10. Pass 1 (only) is held by two narrow doorway kill graces — see "Doorway kill graces" below.

- `src/game/Renderer.ts`
  - `renderArrows()` rotates each arrow via `Math.atan2(dir.y, dir.x)` — continuous angle, no snapping.
  - `renderLineOfSightIndicator()` draws a 36×36 dashed box around the player: green `#00FF00` when a target qualifies, red `#FF4444` when not. It reads the same `findNearestVisibleEnemy` result the auto-fire uses.

- **Input surface.** Exactly one canvas click listener exists (`Game.ts` `setupEventListeners`), and it only leaves the menu (`startRun`). The boss-arena win is a **walk-on trigger** — touching the corrupted growth's heart (`BOSS_GROWTH_CENTER` + `BOSS_GROWTH_TRIGGER_PX`, drawn by `Renderer.renderCorruptedGrowth`); **V** is an undocumented desktop debug shortcut for the same victory. Neither is a fire or aim input.

- **Doorway kill graces (owner-approved 2026-06-10).** Two narrow windows hold `checkCollisions` pass 1 only — auto-fire, movement, walls, and arrow hits keep running, so these are *not* general i-frames: `ARRIVAL_KILL_GRACE_MS` (300 ms on room transition, stamped in `doTransition`) and `HUNTER_ARRIVAL_GRACE_MS` (350 ms on a cross-room hunter materializing into the player's current room, stamped per-enemy in `settleHunterIntoRoom`; the renderer draws a white materialize flash over it for the window). The player-side window is **re-arm gated** (`ARRIVAL_GRACE_REARM_MS` = 2 s): a hard cut lands the player still pinned in the doorway, so an unconditional stamp would let doorway ping-pong chain windows into sustained immunity — `doTransition` grants a fresh window only when the last was armed ≥ 2 s ago, keeping the grace genuinely untunable by input. Rationale: a hard cut / mid-tick materialization gives the player zero rendered frames to react, and an invisible death breaks the "death is the player's mistake" pillar. Both deadlines flow from the gameLoop `currentTime` (Invariant 8). Don't extend these into combat i-frames, post-hit invulnerability, or anything input-triggered — that's pushback item 5.

## Things that would break the contract

Push back before implementing any of these. They each need explicit owner approval.

1. **Manual fire / click-to-shoot / aim input.** The auto-fire-on-LOS rule is what makes the game tactical-positioning rather than twitch-aim. The canvas only listens for one click — to leave the menu.
2. **Input-driven target selection or lock-on** ("fire at this specific enemy"). `findNearestVisibleEnemy` picks the target; nothing higher up the stack addresses individual enemies.
3. **Ranged enemy attacks** — projectiles, breath, spit, shockwaves, telegraphed lunges that hit at a distance. The contact-only rule is what makes player positioning the entire game. There is no enemy-projectile system; adding one is a new subsystem, not an enemy variant.
4. **Enemy AoE damage.** Same rationale.
5. **Player health, regen, armor, i-frames.** One hit = death. CLAUDE.md §5. (The two scoped doorway kill graces above are the standing owner-approved exceptions — short, positional, never input-triggered. Don't generalize them.)

## Things that are fine within the contract

- Tuning `ARROW_COOLDOWN_MS` (500 ms), `ARROW_SPEED` (400 px/s), `MAX_DETECTION_RANGE` (450 px) — all named constants in `constants.ts`.
- Adding new beasts that follow the contact-only rule (still requires owner approval per `enemy-roster-and-tone`).
- Adding visual feedback for LOS (e.g., extending `renderLineOfSightIndicator`).
- Multi-arrow behaviors that stay auto-targeted (e.g., a piercing arrow). Worth checking with the owner since it's a meaningful design shift, but it doesn't break the contract.

## When asked to add something that would break the contract

State the conflict explicitly, point at this skill plus CLAUDE.md §3/§4/§9, and ask the owner to confirm before implementing. Don't implement on a shrug — the 360-LOS auto-fire rule is the prototype's identity.
