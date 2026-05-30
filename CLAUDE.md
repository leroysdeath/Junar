# Junar — Project Knowledge Base

This file is the source of truth for the game's vision, mechanics, and rules of engagement. Claude Code reads it on every session — keep it in sync with reality. If a section here disagrees with the code, fix one of them.

---

## 1. Vision

The player is a male indigenous (Adivasi-coded) archer surviving with his family in the Indian jungle. He auto-fires arrows at the nearest enemy in line of sight (any angle, walls block) while hordes of crazed beasts — panthers, bears, snakes, and gibbons — pour through narrow paths cut between dense, untraversible trees. The family — wife, son, daughter — once lived in harmony with the jungle; now something is corrupting it. As the player advances, his family joins him as passive escorts, and protecting them becomes the central tension. The corruption traces back to a monstrous plant deep in the jungle that exudes black goo and infects the wildlife. In the final battle, the family stands and fights with the player to destroy the source and free the jungle.

**Title:** "Jungle X" is the final release title. The entry screen currently shows **"Jungle Archer"** as the working title during prototyping; it will be swapped to "Jungle X" at release. Repo codename remains "Junar". Other in-engine menu strings ("Survive the Ancient Forest", "Defeat the Ancient Tree Guardian", victory text) are placeholder and will be replaced in a dedicated copy pass.

## 2. Prototype goals

What "good" looks like for the prototype, above and beyond the pillars. Pillars (§3) are concrete rules every change is filtered against; goals are the higher-level intent those rules serve.

- **Build a fun, addictive gameplay loop.** The 30-second loop in §4 should pull the player into a "one more run" rhythm — readable threats, clean feedback, satisfying clears. If a change makes the loop more correct but less compelling, it's not done.
- **Evoke an emotional journey through visual storytelling and interactivity.** The corruption arc — harmony → infection → loss → confrontation — is told *without dialogue*. Two channels carry it:
  - **Short, dialogueless cut-scenes between stages.** Procedural-rectangle vignettes, a few seconds each, transitioning between levels. Text bubbles are allowed only as "…" — no written dialogue, no VO. Skippable; never block the loop. (Out of scope until the main loop is solid.)
  - **Mechanics and level design as story.** What the player is *forced to contend with* — chokepoints, family escort tension on Level 10, the boss arena — is the narrative. The level layout is the script.

## 3. Pillars

Every change must serve at least one of these. If a proposed change weakens a pillar, push back before implementing.

- **Tactical positioning over twitch.** Auto-fire targets the nearest enemy with a clear sightline at any angle (full 360°). Combat is still about *where you stand*, not *when you click* — walls block raycasts, so positioning around chokepoints, corners, and corridors is what creates and denies shots. No manual fire or click-to-aim without explicit owner approval.
- **Death is fast and fair — and weighted when family is present.** One enemy hit on the player ends solo levels; in family levels, any family member's death also ends the run. Deaths must always feel like the player's mistake.
- **The corruption is the antagonist, not the beasts.** The beasts are victims of an infection. Tone is tragic, not bloodthirsty. The boss — a monstrous plant exuding black goo — is the real enemy.
- **The jungle traps and channels.** Walls are dense trees; the playable space is narrow paths and small clearings. Power comes from reading the maze and forcing chokepoints.
- **Readable at a glance.** Procedural pixel-rectangle rendering is the direction for family, beasts, walls, and FX: every entity must be identifiable in one frame. The player is the single sprite-asset exception (CC0 LTTP-style sheet, owner-approved 2026-05-10 for playtesting fidelity) — the readability standard still applies, and the procedural rule still holds for everything else.
- **Short prototype, tight scope.** Ten levels, one boss arena. Resist scope creep until the prototype loop is solid.

## 4. Core loop (30 seconds of play)

1. Spawn into a maze; enemies appear from the edges.
2. Move (WASD/arrows) to expose targets through corridor gaps and to break LOS on threats you can't safely engage.
3. Arrows auto-fire every 500ms at the nearest enemy within 450px with an unobstructed center-to-center raycast (any angle).
4. Avoid contact — every enemy is melee, and any AABB overlap with the player is instant death.
5. Clear all enemies → 2-second "Level Complete" → next level.
6. Survive Levels 1–9 (mazes scaling in density), then Level 10 (open arena, boss intended but unimplemented).

## 5. Mechanics reference

**Controls** — WASD or arrow keys for movement; Shift or A for dash; Space or B for burst (mobile: on-screen D-pad for movement, A button for dash, B button for burst). Click canvas to start. Sound toggle is a UI button.

**Player** (`src/game/Player.ts`) — 32×32 sprite, 150 px/s free movement, AABB collision against tile walls. No health, no per-level stamina pool (stamina is playthrough-wide and persistent; see Stamina below). One hit kills. Death is **AABB-overlap only** — an enemy must physically touch the player to kill them. The 360° LOS check is the *player's* auto-fire mechanic, not an enemy attack.

**Enemies** (`src/game/Enemy.ts`) — four approved types, fixed speeds. All are infected jungle wildlife, not generic monsters:
| Type    | Speed (px/s) | In-world identity |
|---------|--------------|-------------------|
| panther | 395          | Black panther (Indian leopard) — apex pursuer; outruns the player (2.6× player speed) |
| bear    | 218          | Sloth bear — heavy chaser; also outruns the player (1.45×) |
| snake   | 68           | Indian rat snake — easy to outrun (0.45× player); thin slither sprite |
| gibbon  | 34           | Hoolock gibbon — long-armed jungle primate; near-stationary creeper (0.23×) |

Enemy pathfinding repolls every 200 ms; direct path if clear, else best cardinal step.

Each type has its own **collision AABB** (`ENEMY_AABB_PX` in `constants.ts`: bear 34, panther 21, gibbon 15, snake 4 px), centered inside the 32 px cell — so a bear can't fit a 1-tile corridor while a snake's 4 px footprint lets many pack per tile. Enemies can't overlap each other (snake-vs-snake is the one exception — snakes stack); a step that would overlap jitters to a free cardinal direction, else holds. The 32 px cell stays the positioning/render unit and the arrow-hit box, so auto-fire targeting and arrow collision are unchanged. See `docs/ROADMAP-traversable-maps.md` §5.7–5.8.

**No new enemy type may be added without explicit owner approval.** Tigers, monkeys, crocodiles, wild dogs, etc. are *unapproved*; ask before implementing.

**No ranged attacks.** Every beast threatens by contact only — there are no projectile-throwing or AoE infected variants. Don't add a ranged enemy without explicit owner approval; it would change the LOS-based combat contract from "where you stand" to "what you can react to."

**Family NPCs** (planned, behavior unwired in code) — wife, son, daughter. Current scope (updated 2026-05-09):
- Levels 1–3: solo, no family. (Note: these use wave-driven spawning; see Spawning below.)
- **Levels 4 or 5 onward (exact level TBD): family begins to appear** as translucent placeholder rectangles and continues through the boss arena. Family positions are seeded in level ASCII grids via the `N` tile marker and parsed into `npcPositions`.
- Level 10 (final boss): all three remaining family members fight alongside the player as active combatants.
- Currently in code, family is render-only: translucent placeholder rectangles at `N` tiles in `Renderer.renderNpcs`. No `FamilyMember` class, no AI, no AABB, no death triggers, no carryover yet — all to be built.

**Family-death rule:**
- **Alpha** ships the simple "any family member's death = game over" rule (prototype shape).
- **Demo** changes the rule to a branching shape — the specific behavior is TBD. See `docs/IDEATION.md` §1 for candidate shapes (survivor-set drives endings, player-choice moment, survivor behavior changes).

**Approved (simple) hut-attack branch — owner-approved 2026-05-09, EA target.** If the hut (marked with `H` tile in level ASCII) is destroyed or attacked during the run, family never appears in subsequent levels. This is the prototype form of the multi-ending system and the first divergence input. Hut positions are seeded in levels via the `H` tile marker and parsed into `hutPositions`.

**Future direction — full multi-ending system (still requires owner sign-off before implementation).** Beyond the simple hut-attack branch above, the eventual target is per-member carryover with multiple endings:
- Once family members are present in a level, they can die individually. Each dead family member does not appear in subsequent levels.
- Different endings flow from how many family members survive to the boss arena.

Don't structure family / hut code in a way that locks future per-member branching out (e.g., hardcoding "all family always present", or coupling family identity to a single boolean). See the `protagonist-and-family-tone` skill.

**Design ideation (TBD, not committed for any tier).** Several mechanics are under exploration but not on a build tier: gibbons-drop-from-trees spawn behavior, convert-beasts-to-allies, stick-barriers (mild Tower Defense), and (concept-only) free-movement between primary + connector levels with continuous waves. See `docs/IDEATION.md` for the full backlog and read it before proposing related changes.

**Stamina** (`src/game/Stamina.ts`) — playthrough-wide stamina pool, persists across all levels in a run, resets only when `Game.restart()` is called. Max is 100 points; no regen. Drained by:
- **Movement:** ~0.001 stamina per tile (negligible; ~100k tiles to deplete).
- **Arrows:** ~0.001 stamina per arrow (negligible).
- **Dash:** 0.5 stamina per use (primary stamina consumer).
- **Burst activation:** 5 stamina per use (significant cost).

When stamina drops below the low threshold (10 points), both movement speed and arrow fire rate are multiplied by 0.5×, creating a compounding penalty. When stamina hits zero, penalties are locked at 0.5×.

**Auto-fire** (`src/game/Game.ts`, `src/game/Stamina.ts`) — cooldown 500 ms (effective cooldown is `500 / (burstMultiplier × lowStaminaMultiplier)`), range 450 px, **full 360° at any angle**. Each frame, picks the nearest enemy within range whose center is reachable from the player center by an unobstructed wall raycast; fires an arrow on the raw unit vector to that enemy (no angle snapping). Arrow speed 400 px/s; arrows die on bounds, walls, or enemy hit (4×4 AABB collision vs enemy AABB).

**Burst rapid-fire** (`src/game/Stamina.ts`, triggered via Space/B or on-screen B button) — edge-triggered activation (not held). When active:
- Arrow cooldown is multiplied by the burst multiplier (starts at 2.0×, decays with each activation).
- Lasts 5 seconds.
- Resets after a 15-second break. Activating again within 15 seconds of the last burst end applies a decay rule: `multiplier *= 0.75`, so spamming burst eventually self-debuffs to <1×.

**Dash teleport** (`src/game/Player.ts`, triggered via Shift/A or on-screen A button) — edge-triggered activation. Instant blink:
- Direction: opposite of the player's current cardinal facing (up/down/left/right).
- Distance: 3 tiles = 96 pixels, or stops at the last open tile before a wall, whichever is shorter.
- Cost: 0.5 stamina (rejected if stamina < 0.5).
- AABB-vs-enemy collision still applies post-dash, so landing inside an enemy kills the player.

**Line of sight** (`src/game/Game.ts` → `hasDirectLineOfSight`) — generic point-to-point raycast from player center to enemy center, sampled in equal steps at ~8 px granularity (`steps = ceil(distance / 8)`); LOS is blocked if any sampled tile is a wall. Center-to-center is intentional: an enemy peeking out from behind a wall column doesn't qualify until the player steps to clear the line.

**Levels** (`src/game/levels.ts`) — hardcoded ASCII grids. Levels 1–3 are wave-driven (see Spawning below). Levels 4–10 use legacy static spawning. All levels:
- Grid size: 29 columns × 17 rows, each tile 32 px = 928×544 px total.
- Tile chars: `#` = wall (tree), `.` = floor (dirt), `N` = family-NPC placeholder (parsed into `npcPositions`; renderer draws translucent marker; behavior unwired), `H` = hut placeholder (parsed into `hutPositions`; mechanics deferred to the multiple-endings system). `N` and `H` tiles count as floor for collision/pathfinding.
- Enemy count (legacy levels 4–10): `min(3 + level_index * 2, 25)` spawned at edges, capped by available safe positions.
- Level 10: outer wall ring, all interior floor (open arena reserved for the boss).

**Spawning** — two paths, determined at level start:
- **Wave-driven (Levels 1–3):** A `WaveScheduler` manages spawning. Each level defines waves (`setup`, `add`, `test`). Waves draw from pre-designed group templates (typed enemy rows — `SpawnTemplate.rows: EnemyType[][]`, each row packed left-to-right by cumulative AABB width) and spawn them in drips across spawn bands (e.g., L1 has one top-centered band; L2 has top+left+right; L3 has all four cardinal bands). Each row lands in the band and blocks further spawns until the slowest unit in that row passes. A 3-second lull separates waves. Wave completes when all spawned enemies are dead. Level completes when all waves are done + all enemies are dead. (A run-long `GlobalWaveScheduler` variant — 10 s grace, triplet cadence, random inter-triplet break — exists behind the default-off `USE_GLOBAL_WAVE_SCHEDULER` flag for the traversable-maps refactor; see `docs/ROADMAP-traversable-maps.md` §5.4.)
- **Legacy (Levels 4–10):** Enemies spawn at level start from `enemySpawns` (calculated at runtime from edge positions). Optional `delayedSpawns` trickle enemies from an entryway over time. Level completes when all static + pending enemies are dead.

**Scoring** — +10 per kill, +100 × (level_index + 1) on level complete.

## 6. World & tone

**Setting** — the Indian jungle, pre-industrial / mythic time. Dense, mostly impassable forest; the playable space is the narrow paths and small clearings the family knows by heart. Aesthetic touchstone: *The Jungle Book* (visual style and bestiary inspiration only — no direct character references).

**Protagonist** — Adivasi/tribal-Indian archer, husband and father. Visual direction (in code, `Renderer.renderPlayer`): sprite-based using a CC0 LTTP-style sheet (16×32 px per frame, 4-frame walk animation per direction, directions = up/down/left/right). Color and proportions read as deep warm-brown skin, short black hair (no headdress), cream cotton tunic with a dark waist sash (dhoti-coded), bow held offhand on the left, leather quiver at right hip. Procedural rendering is not used for the player; sprite is the exception to the procedural-only rule.

**Family** — wife, son (boy), daughter. They lived in harmony with the jungle and read it like a second language. They are the player's reason. Rendered as translucent procedural rectangles (placeholder, not final art) with basic anthropomorphic cues: rectangular tunic, rounded head, dark hair. They appear on Levels 4+ as passive render-only placeholders and will gain AI and death triggers once family mechanics are implemented.

**Antagonist** — not the beasts. The beasts are victims of an infection: a black goo emanating from a monstrous plant deep in the jungle. The plant is the boss. Tone is tragic — the player is killing wildlife because there's no other choice, and the world is worth saving.

**Bestiary status:**
- **Approved and implemented:** Black panther (Indian leopard), sloth bear, Indian rat snake, Hoolock gibbon. Speed tuned so panther/bear outrun the player while snake/gibbon are slower — combat depends on chokepoints, not foot races. All four are rendered procedurally (not sprites).
- **Approved direction (visual cues):** Infected beasts should read as "wrong" — black streaks/sheen, glowing eyes, or similar. Keep visuals readable at a glance. Currently not yet implemented; planned as a next step (see §7 Roadmap).
- **Not yet approved (do not add without asking):** Tigers, monkeys, crocodiles, wild dogs, jackals, anything else.

**Rendering:**
- **Procedural (all entities except player):** Enemies, NPCs, huts, arrows, and effects render as hand-drawn Canvas 2D fills in `Renderer.ts`. Each enemy type has a distinct silhouette and palette; the canonical colours live in `Renderer.ts` — don't duplicate them here.
- **Sprite (player only):** CC0 LTTP pack, 16×32 cell size, 4-frame walk loops per direction. Sprite is scaled to native size and centered in the 32×32 AABB. Burst aura is procedural (warm-gold layers) and drawn behind the sprite so readability is preserved.
- **Palette direction:** Forest greens, earth browns, tan paths, dark canopy fills (see `Renderer.ts` for exact hexes). Roadmap: add a black-goo accent palette (deep oily black, sickly green/purple highlights) for infected beasts and the boss.

**Audio palette** (current code) — synthesized Web Audio tones (arrow 200 Hz square, hit 400 Hz square, gameOver 150 Hz sawtooth, victory 500 Hz sine). Acceptable as placeholder; future direction is owner-led.

**Working in-engine copy** — title "Jungle X" is final. The entry screen still shows "Jungle Archer" (working title for prototyping); will be swapped at release. The other menu strings ("Survive the Ancient Forest", "Defeat the Ancient Tree Guardian", "You have conquered the jungle!") are still placeholder and will be replaced in a dedicated copy pass once tone is locked.

## 7. Scope & roadmap

**In scope (prototype):**
- Levels 1–10 with current mechanics, evolved to fit the vision. (Code already contains all 10 level definitions; Levels 1–3 are wave-driven; Levels 4–10 use legacy spawning; Level 10 is an empty arena reserved for the boss.)
- Family appears on Levels 4+ as translucent placeholders and continues through the boss arena.
- Level 10 boss: corrupted plant exuding black goo.
- Visual update for the Adivasi-coded protagonist (complete: sprite asset in use as of 2026-05-10).
- Infected-beast visual treatment (black goo accents) within procedural rendering.
- Hit feedback, screen shake, death pop — within Canvas 2D.
- Stamina, burst, and dash mechanics (complete as of 2026-05-10).
- Wave scheduler for Levels 1–3 (complete as of 2026-05-06).

**Out of scope until owner says otherwise:**
- New enemy types beyond the four approved beasts. Ask first.
- Ranged enemy attacks. Touch-only is the design.
- A passive family-escort intro on a mid-game level. Possible future phase, not now.
- Multiple-endings system (hut-attack branch, family-survival carryover into later levels). Documented direction; do not implement without owner sign-off. See §5 and the `protagonist-and-family-tone` skill.
- Sprite assets for anything other than the player. The player is on a CC0 LTTP-style sheet (owner-approved 2026-05-10); family, beasts, walls, HUD, arrows, and FX stay procedural. Expanding sprite use to a second entity type needs owner approval. See `docs/IDEATION.md` §8 for the LPC upgrade path under consideration.
- New input methods (gamepad, mouse-aim). Touch input is now supported for mobile testing — phones and tablets get an on-screen D-pad via `src/MobileControls.tsx`. Detection uses `(pointer: coarse)` so desktop touchscreens stay on keyboard. Don't add additional input methods without owner sign-off.
- Saves, accounts, leaderboards.
- Multiplayer, online features.
- Migration to Phaser, Godot, or any other engine.
- New runtime dependencies. Ask before adding any package.
- Direct *Jungle Book* character references (style inspiration only).

**Ordered next steps:**
1. ✅ Critical bug fixes (input leak, setTimeout race, cardinal edge cases) — done in commit `e8a224b`.
2. **In-engine title swap to "Jungle X"** — release-time change; "Jungle Archer" remains the working title until then.
3. ✅ Protagonist visual update — Adivasi-coded archer (deep skin tone, cream dhoti, dark sash, no headdress) live in `Renderer.renderPlayer` via CC0 sprite.
4. **Infected-beast visual cue** — add black-goo accents (sheen/dripping/eye glow) to all four beast types so the corruption reads at a glance. Current procedural renderers already have distinct colors; adding overlay/glow is the next implementation step.
5. **Family rendering & combat** — design the family member entity (movement, collision, rendering, death-triggers-game-over, simple combat behavior for the boss fight).
6. **Level 10 boss** — corrupted plant (the "Ancient Tree Guardian" placeholder is roughly aligned). Family appears here as three active combatants; any family death = game over.
7. **Copy pass** — replace remaining placeholder strings ("Survive the Ancient Forest", "Defeat the Ancient Tree Guardian", victory text) with vision-aligned copy once tone is locked. (Non-code task.)
8. **Polish** — `SoundManager` rewrite (single shared `AudioContext`, lazy-init on first gesture), broader sweep to push remaining hardcoded `32`s through `TILE_SIZE`, hit feedback, screen shake.
9. **Inter-stage cut-scenes** — short dialogueless procedural-rectangle vignettes between levels carrying the corruption arc. "…" bubbles only, skippable, out of scope until the loop is solid (§2 Prototype goals).
10. **Tauri wrap for Steam** — once the prototype loop is solid, package the Vite build with Tauri for desktop. See section 8 for what this means for current development.

## 8. Distribution & target platform

**End target: Steam** (Windows / macOS / Linux / Steam Deck). **Vercel is for testing only** — preview URLs for branches and quick mobile/tablet checks, not the publishing platform.

**Planned packaging path: Tauri.** A small Rust shell that wraps the existing Vite/React/Canvas 2D build into a native desktop binary (~5–10 MB). This explicitly preserves the current stack — Tauri is a wrapper, not a game engine, so the "don't migrate to a game engine" guardrail still holds. Electron would also work but is heavier and not preferred. The Tauri integration itself is **out of scope until the prototype loop is solid**; it's the last step of the roadmap, not a near-term task.

**Things to stay aware of so we don't paint into corners:**
- **No browser-only APIs without a Tauri equivalent.** Web Audio, Canvas 2D, `requestAnimationFrame`, keyboard events — all fine. Storage, file system, fullscreen, and gamepad need Tauri-aware patterns when we get to them. Avoid service workers, Web Bluetooth, browser DRM, and pop-up windows.
- **Canvas is fixed 928×544** (≈17:10 aspect; chosen for an odd column count of 29 so every level has a true center column at col 14). Scales near 1080p at ×2 (1856×1088 — 32 px horizontal black bars and 8 px vertical bars on a 16:9 1080p monitor). Plan to add a fullscreen toggle with letterboxed scaling before any Steam build, not urgent for prototyping.
- **Saves don't exist yet.** When they do, write through Tauri's app-data dir, not `localStorage` long-term.
- **Steamworks SDK** (achievements, cloud save, leaderboards) integrates via a Tauri plugin or a small Rust crate. Post-prototype concern.

## 9. Guardrails for Claude

When working in this repo:

**Story / tone**
- **Beasts are victims, not villains.** The corruption is the antagonist. Don't write copy or design enemy behavior that frames the wildlife as evil. Tragic, not bloodthirsty.
- **Don't add new enemy types without owner approval.** The approved bestiary is black panther (Indian leopard), sloth bear, Indian rat snake, and Hoolock gibbon. Tigers, monkeys, crocodiles, etc. require explicit go-ahead.
- **Family NPCs are sacrosanct in family levels.** Their death = game over. Don't add behavior that undermines the "protect them" tension (no auto-fight, no respawn, no gimmicks).
- **Cultural representation matters.** The protagonist and family are Adivasi/tribal-Indian. Avoid feathered-headdress imagery, generic "tribal" stereotypes, or *Jungle Book* character likenesses. Keep visual cues minimal, dignified, and abstract.
- **No written dialogue or VO.** Story is told through visuals, mechanics, and level design (§2). Cut-scenes are dialogueless; "…" text bubbles are the only allowed copy. Don't draft scripts, captions, or voice-line stand-ins.

**Technical**
- **Don't add dependencies** without asking. The stack is React + TS + Vite + Tailwind + lucide-react + nothing else.
- **Don't introduce a state library.** UI state stays in React; game state stays in plain TS classes mutated in place. The callback bridge in `App.tsx` is the contract — extend it, don't replace it.
- **Don't break the 360-LOS auto-fire contract.** Auto-fire targets the nearest enemy with clear LOS at any angle, gated only by walls. No manual aim, click-to-fire, target-selection UI, lane snapping, or other input-driven targeting without explicit owner approval.
- **No ranged enemy attacks.** Beasts threaten by contact only. A ranged enemy would invalidate the "where you stand" pillar; if asked to add one, push back unless the owner explicitly approves.
- **Don't migrate to a game engine.** Decision logged: stay on Canvas 2D for the prototype.
- **Stay Tauri-compatible.** Steam is the eventual publish target via a Tauri wrap (see section 8). Don't introduce browser-only features that wouldn't survive a desktop build — Web Audio, Canvas 2D, keyboard input, and standard storage are all fine; service workers, Web Bluetooth, and pop-up windows are not.
- **Player is the only entity allowed to use a real sprite asset.** Owner-approved 2026-05-10 to swap the procedural player for a CC0 LTTP-style sheet. Family NPCs, beasts, walls, HUD, arrows, and FX still render procedurally via `Renderer.ts`. Don't extend sprite assets to any other entity without owner approval. See `docs/IDEATION.md` §8 for the LPC upgrade path under consideration.
- **Prefer extending existing modules** over adding new ones. The 14 files in `src/game/` cover the surface area; new concerns should fit in one of them: `Game.ts` (orchestrator), `Player.ts`, `Enemy.ts`, `Level.ts`, `levels.ts` (ASCII), `types.ts`, `Renderer.ts`, `InputManager.ts`, `CollisionManager.ts`, `SoundManager.ts`, `Stamina.ts`, `WaveScheduler.ts`, `Logger.ts`, `constants.ts`.
- **Pull magic numbers into named constants** when you touch them. Especially `928`, `544`, `32`, `16`, `400`, `450`, `500`. Use `src/game/constants.ts`.
- **Always clean up listeners and timers.** The early scaffolding leaked both — those are now fixed. Anything new that subscribes to `window` or schedules a `setTimeout` must be disposable from `Game.cleanup()`.
- **Lint and typecheck before declaring done.** `npm run lint` and `npx tsc -p tsconfig.app.json --noEmit` must be clean.
- **Use `Date.now()` only for wall-clock things.** Game timing flows from the `gameLoop` `currentTime` (a `performance.now()` value passed by `requestAnimationFrame`). Mixing the two causes pause/resume bugs. The crash logger uses `Date.now()` for UI timestamps, which is fine (those are non-critical wall-clock).
- **Crash logger is always running.** Do not remove or disable `src/game/Logger.ts`. It captures frame-by-frame state snapshots and renders an overlay on crash for debugging. Extend it if needed, but don't lose it.
- **Mobile input is wired.** The D-pad in `MobileControls.tsx` drives movement via `setVirtualInput` and buttons via `triggerBurst` / `triggerDash`. Desktop and mobile input paths converge in `InputManager.ts` so the game loop sees a unified input stream. Both paths must be tested.

## 10. File map

```
src/
├── App.tsx                       React shell: canvas + HUD overlays + menu/game-over/victory/levelComplete; useIsMobile hook
├── MobileControls.tsx            On-screen D-pad rendered when (pointer: coarse) matches; pointer-capture press/release tracking
├── main.tsx                      React entry point
├── index.css                     Global styles (Tailwind)
└── game/                         All game logic — pure TS, no React
    ├── Game.ts                   Orchestrator: game loop, state, arrow firing, collisions, stamina, burst, dash
    ├── Player.ts                 Player position, movement, wall collision, dash teleport, cardinal facing
    ├── Enemy.ts                  Enemy AI (direct pathfinding + cardinal-fallback, entry mode for wave spawns)
    ├── Level.ts                  Tilemap, isWall(), spawn helpers (player + enemies), NPC/hut positions
    ├── levels.ts                 Hardcoded ASCII grids for all 10 levels (Levels 1–3 wave-driven, 4–10 legacy)
    ├── types.ts                  Vector2, Rectangle, GameState, GameCallbacks, EnemyType, Facing, WaveScheduler types
    ├── Renderer.ts               Canvas 2D draw routines for level/player/enemies/arrows/NPCs/huts/HUD (hybrid sprite + procedural)
    ├── InputManager.ts           Keyboard + virtual (mobile) input listener → InputState; burst + dash edge-trigger detection
    ├── CollisionManager.ts       AABB overlap helper
    ├── SoundManager.ts           Web Audio synthesized SFX
    ├── Stamina.ts                Playthrough-wide stamina pool, burst state machine, decay multiplier, low-stamina penalty
    ├── WaveScheduler.ts          Wave sequencing for Levels 1–3 (group templates, spawn bands, inter-wave lulls)
    ├── Logger.ts                 Crash capture + frame-by-frame snapshot + on-screen overlay rendering
    └── constants.ts              Named constants: canvas size (928×544), tile size (32), grid (29×17), ranges, cooldowns, stamina costs, burst tuning
```
