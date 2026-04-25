# Junar — Project Knowledge Base

This file is the source of truth for the game's vision, mechanics, and rules of engagement. Claude Code reads it on every session — keep it in sync with reality. If a section here disagrees with the code, fix one of them.

---

## 1. Vision

> _**TO BE PROVIDED BY OWNER.** This section captures what the game is in one paragraph: the feeling, the fantasy, the one-line pitch. Do not draft features that conflict with the vision once it's filled in. Until then, treat any vision-dependent decision as a question for the owner._

Working title shown in-game: **Jungle Archer — Survive the Ancient Forest**. The repo name "Junar" is the project's true name; its meaning in the world is owner-defined.

## 2. Pillars

Every change must serve at least one of these. If a proposed change weakens a pillar, push back before implementing.

- **Tactical positioning over twitch.** The auto-fire-on-cardinal-LOS rule means combat is about *where you stand*, not *when you click*. Don't add manual fire, click-to-aim, or diagonal shots without explicit owner approval.
- **Death is fast and fair.** One touch = game over. Hits should always feel like the player's mistake — no surprise spawns into the player, no offscreen instakills.
- **The forest is the antagonist.** Walls are trees, enemies are wildlife. The level *is* the encounter design. Power comes from reading the maze.
- **Readable at a glance.** Procedural pixel-rectangle rendering is a feature, not a limitation: every entity must be identifiable in one frame.
- **Short prototype, tight scope.** Ten levels, one boss arena. Resist scope creep until the prototype loop is solid.

## 3. Core loop (30 seconds of play)

1. Spawn into a maze; enemies appear from the edges.
2. Move (WASD/arrows) to line up an enemy in a cardinal direction.
3. Arrows auto-fire every 500ms whenever a cardinal-LOS target exists within 300px.
4. Avoid contact (cardinal-LOS-to-player = death).
5. Clear all enemies → 2-second "Level Complete" → next level.
6. Survive Levels 1–9 (mazes scaling in density), then Level 10 (open arena, boss intended but unimplemented).

## 4. Mechanics reference

**Controls** — WASD or arrow keys (movement only). Click canvas from menu to start. Sound toggle is a UI button.

**Player** (`src/game/Player.ts`) — 32×32 sprite, 150 px/s free movement, AABB collision against tile walls. No health, no stamina; one hit kills.

**Enemies** (`src/game/Enemy.ts`) — three types, fixed speeds:
| Type    | Speed (px/s) | Notes |
|---------|--------------|-------|
| panther | 120          | Fastest |
| primate | 80           | Mid    |
| bear    | 60           | Slow, bulky |

Pathfinding repolls every 200 ms (`Date.now()`). Direct path if clear, else best cardinal step.

**Auto-fire** (`Game.ts:214-266`) — cooldown 500 ms, range 300 px, **cardinal directions only**. Picks the nearest cardinal-aligned enemy with clear LOS. Arrow speed 400 px/s; arrows die on bounds, walls, or enemy hit.

**Cardinal LOS** (`Game.ts:292-333`) — steps along the cardinal ray every 16 px, returns true if any enemy center is within 20 px of a step before a wall blocks. (Note: the 20 px tolerance is loose against a 32 px grid — see `Roadmap`.)

**Levels** (`src/game/levels.ts`) — hardcoded ASCII grids, 25×19 tiles at 32 px = 800×600 px. `#` = wall (tree), `.` = floor (dirt). Enemy count scales with level: `min(3 + level_index * 2, 25)`. Level 10 is an empty arena reserved for the boss.

**Scoring** — +10 per kill, +100 × (level_index + 1) on level complete.

## 5. World & tone

> _**TO BE PROVIDED BY OWNER.** Setting, lore, naming conventions, what "Junar" means in-world, what the forest is, what the enemies are at a deeper level than "panther/primate/bear", and the protagonist's identity. Owner has stated they have a specific vision._

Until owner provides:
- **Visual palette** in code: forest greens (#228B22, #32CD32), earth browns (#8B4513), dark canopy fills.
- **Audio palette** in code: synthesized Web Audio tones — arrow (200 Hz square), hit (400 Hz square), gameOver (150 Hz sawtooth), victory (500 Hz sine).
- **In-game flavor strings** currently present: "Jungle Archer", "Survive the Ancient Forest", "Defeat the Ancient Tree Guardian". Treat these as placeholder unless owner confirms.

## 6. Scope & roadmap

**In scope (prototype):**
- Levels 1–10 with current mechanics.
- Boss encounter on Level 10.
- Polish pass: animation states, hit feedback, particles within Canvas 2D.
- Visual & audio coherence with the (forthcoming) world/tone vision.

**Out of scope until owner says otherwise:**
- Sprite-sheet asset pipeline (staying procedural — see Pillars).
- New input methods (gamepad, touch, mouse-aim).
- Saves, accounts, leaderboards.
- Multiplayer, online features.
- Migration to Phaser, Godot, or any other engine.
- New runtime dependencies. Ask before adding any package.

**Ordered next steps:**
1. **Critical bug fixes** (in progress) — input listener leak, untracked `setTimeout`, cardinal edge cases.
2. **Constants module** — collapse hardcoded `800/600/32` into one place.
3. **`SoundManager` rewrite** — single shared `AudioContext`, lazy-create on first user gesture.
4. **Owner provides vision** → finalize sections 1 and 5.
5. **Boss design** for Level 10 (Ancient Tree Guardian or replacement per vision).
6. **Visual feedback pass** — hit flashes, enemy death pop, arrow trail, screen shake.

## 7. Guardrails for Claude

When working in this repo:

- **Don't add dependencies** without asking. The stack is React + TS + Vite + Tailwind + lucide-react + nothing else.
- **Don't introduce a state library.** UI state stays in React; game state stays in plain TS classes mutated in place. The callback bridge in `App.tsx` is the contract — extend it, don't replace it.
- **Don't break the cardinal-LOS contract.** No diagonal shooting, no manual aim, no targeted fire by clicking, unless explicitly approved.
- **Don't migrate to a game engine.** Decision logged: stay on Canvas 2D for the prototype.
- **Don't add real sprite assets.** Procedural rendering is the chosen art direction. Improve `Renderer.ts` instead.
- **Prefer extending existing modules** over adding new ones. The 10 files in `src/game/` cover the surface area; new concerns should fit in one of them.
- **Pull magic numbers into named constants** when you touch them. Especially `800`, `600`, `32`, `16`, `20`, `300`, `400`, `500`.
- **Always clean up listeners and timers.** The Bolt.new scaffold leaks both. Anything you add that subscribes to `window` or schedules a `setTimeout` must be disposable from `Game.cleanup()`.
- **Lint and typecheck before declaring done.** `npm run lint` and `npx tsc --noEmit` must be clean.
- **Use `Date.now()` only for wall-clock things.** Game timing flows from the `gameLoop` `currentTime` (a `performance.now()` value passed by `requestAnimationFrame`). Mixing the two causes pause/resume bugs.

## 8. File map

```
src/
├── App.tsx                       React shell: canvas + HUD overlays + menu/game-over/victory/levelComplete
├── main.tsx                      React entry point
├── index.css                     Global styles (Tailwind)
└── game/                         All game logic — pure TS, no React
    ├── Game.ts                   Orchestrator: game loop, state, arrow firing, collisions
    ├── Player.ts                 Player position, movement, wall collision
    ├── Enemy.ts                  Enemy AI (direct + cardinal-fallback pathfinding)
    ├── Level.ts                  Tilemap, isWall(), spawn helpers (player + enemies)
    ├── levels.ts                 Hardcoded ASCII grids for all 10 levels
    ├── types.ts                  Vector2, Rectangle, GameState, GameCallbacks, EnemyType, etc.
    ├── Renderer.ts               Canvas 2D draw routines for level/player/enemies/arrows/HUD
    ├── InputManager.ts           Keyboard listener → InputState
    ├── CollisionManager.ts       AABB overlap helper
    └── SoundManager.ts           Web Audio synthesized SFX
```
