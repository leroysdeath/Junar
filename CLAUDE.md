# Junar — Project Knowledge Base

This file is the source of truth for the game's vision, mechanics, and rules of engagement. Claude Code reads it on every session — keep it in sync with reality. If a section here disagrees with the code, fix one of them.

---

## 1. Vision

The player is a male indigenous (Adivasi-coded) archer surviving with his family in the Indian jungle. He auto-fires arrows at the nearest enemy in cardinal line of sight while hordes of crazed beasts — panthers, bears, primates, and others — pour through narrow paths cut between dense, untraversible trees. The family — wife, son, daughter — once lived in harmony with the jungle; now something is corrupting it. As the player advances, his family joins him as passive escorts, and protecting them becomes the central tension. The corruption traces back to a monstrous plant deep in the jungle that exudes black goo and infects the wildlife. In the final battle, the family stands and fights with the player to destroy the source and free the jungle.

**Working title:** "Jungle X" (final). Repo codename: "Junar". Other in-engine menu strings ("Survive the Ancient Forest", "Defeat the Ancient Tree Guardian") are still placeholder copy and will be replaced in a dedicated pass.

## 2. Pillars

Every change must serve at least one of these. If a proposed change weakens a pillar, push back before implementing.

- **Tactical positioning over twitch.** The auto-fire-on-cardinal-LOS rule means combat is about *where you stand*, not *when you click*. No manual fire, click-to-aim, or diagonal shots without explicit owner approval.
- **Death is fast and fair — and weighted when family is present.** One enemy hit on the player ends solo levels; in family levels, any family member's death also ends the run. Deaths must always feel like the player's mistake.
- **The corruption is the antagonist, not the beasts.** The beasts are victims of an infection. Tone is tragic, not bloodthirsty. The boss — a monstrous plant exuding black goo — is the real enemy.
- **The jungle traps and channels.** Walls are dense trees; the playable space is narrow paths and small clearings. Power comes from reading the maze and forcing chokepoints.
- **Readable at a glance.** Procedural pixel-rectangle rendering is a feature, not a limitation: every entity (player, family member, each beast type) must be identifiable in one frame.
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

**Enemies** (`src/game/Enemy.ts`) — three approved types, fixed speeds. All are infected jungle wildlife, not generic monsters:
| Type    | Speed (px/s) | In-world identity |
|---------|--------------|-------------------|
| panther | 120          | Black panther — fastest, *Jungle Book*-coded |
| primate | 80           | Jungle-Book-style primate (langur troop / corrupted ape) |
| bear    | 60           | Sloth bear — slow, bulky |

Enemy pathfinding repolls every 200 ms; direct path if clear, else best cardinal step.

**No new enemy type may be added without explicit owner approval.** Snakes, tigers, monkeys, crocodiles, wild dogs, etc. are *unapproved*; ask before implementing.

**No ranged attacks.** Every beast threatens by contact only — there are no projectile-throwing or AoE infected variants. Don't add a ranged enemy without explicit owner approval; it would change the cardinal-LOS contract from "where you stand" to "what you can react to."

**Family NPCs** (planned, not yet implemented) — wife, son, daughter. Current scope:
- Levels 1–9: solo, no family.
- Level 10 (final boss): all three family members are present and fight alongside the player as active combatants. Any family member's death = game over.
- An earlier-level intro and passive-escort phase may come after testing — not in current scope.

The "any family death = game over" rule on Level 10 is the central tension of the boss fight.

**Auto-fire** (`Game.ts`) — cooldown 500 ms, range 300 px, **cardinal directions only**. Picks the nearest cardinal-aligned enemy with clear LOS. Arrow speed 400 px/s; arrows die on bounds, walls, or enemy hit.

**Cardinal LOS** (`Game.ts`) — steps along the cardinal ray every half-tile, returns true if any enemy center is within half a tile *perpendicular* to the ray before a wall blocks. (Tightened from a loose 20 px circle in commit `e8a224b`.)

**Levels** (`src/game/levels.ts`) — hardcoded ASCII grids, 25×19 tiles at 32 px = 800×600 px. `#` = wall (tree), `.` = floor (dirt). Enemy count scales with level: `min(3 + level_index * 2, 25)`. Level 10 is an empty arena reserved for the boss.

**Scoring** — +10 per kill, +100 × (level_index + 1) on level complete.

## 5. World & tone

**Setting** — the Indian jungle, pre-industrial / mythic time. Dense, mostly impassable forest; the playable space is the narrow paths and small clearings the family knows by heart. Aesthetic touchstone: *The Jungle Book* (visual style and bestiary inspiration only — no direct character references).

**Protagonist** — Adivasi/tribal-Indian archer, husband and father. Visual direction (now in code, `Renderer.renderPlayer`): deep warm-brown skin, short black hair (no headdress), cream cotton tunic with a dark waist sash (dhoti-coded), bow held offhand on the left, leather quiver at the right hip with fletchings showing. Procedural rectangles only; readable at 32×32. Keep cues abstract and dignified — avoid stereotype.

**Family** — wife, son (boy), daughter. They lived in harmony with the jungle and read it like a second language. They are the player's reason. In current scope they appear only on Level 10 alongside the player as active combatants in the boss fight; an earlier-level passive-escort intro is a possible future phase.

**Antagonist** — not the beasts. The beasts are victims of an infection: a black goo emanating from a monstrous plant deep in the jungle. The plant is the boss. Tone is tragic — the player is killing wildlife because there's no other choice, and the world is worth saving.

**Bestiary status:**
- Approved and implemented: black panther, sloth bear, *Jungle Book*-style primate.
- Approved direction (visual cues): infected beasts should read as "wrong" — black streaks/sheen, glowing eyes, or similar. Keep visuals readable at a glance.
- **Not yet approved (do not add without asking):** snakes, tigers, monkeys, crocodiles, wild dogs, jackals, anything else.

**Visual palette** (current code) — forest greens (#228B22, #32CD32), earth browns (#8B4513), dark canopy fills. Roadmap: add a black-goo accent palette (deep oily black, sickly green/purple highlights) for infected beasts and the boss.

**Audio palette** (current code) — synthesized Web Audio tones (arrow 200 Hz square, hit 400 Hz square, gameOver 150 Hz sawtooth, victory 500 Hz sine). Acceptable as placeholder; future direction is owner-led.

**Working in-engine copy** — title "Jungle X" is final. The other menu strings ("Survive the Ancient Forest", "Defeat the Ancient Tree Guardian", "You have conquered the jungle!") are still placeholder and will be replaced in a dedicated copy pass once tone is locked.

## 6. Scope & roadmap

**In scope (prototype):**
- Levels 1–10 with current mechanics, evolved to fit the vision. (Code already contains all 10 level definitions; Level 10 is an empty arena reserved for the boss.)
- Family appears on Level 10 only — three active combatants alongside the player in the boss fight. Any family death = game over.
- Level 10 boss: corrupted plant exuding black goo.
- Visual update for the Adivasi-coded protagonist (and family).
- Infected-beast visual treatment (black goo accents) within procedural rendering.
- Hit feedback, screen shake, death pop — within Canvas 2D.

**Out of scope until owner says otherwise:**
- New enemy types beyond the three approved beasts. Ask first.
- Ranged enemy attacks. Touch-only is the design.
- A passive family-escort intro on a mid-game level. Possible future phase, not now.
- Sprite-sheet asset pipeline (staying procedural — see Pillars).
- New input methods (gamepad, touch, mouse-aim).
- Saves, accounts, leaderboards.
- Multiplayer, online features.
- Migration to Phaser, Godot, or any other engine.
- New runtime dependencies. Ask before adding any package.
- Direct *Jungle Book* character references (style inspiration only).

**Ordered next steps:**
1. ✅ Critical bug fixes (input leak, setTimeout race, cardinal edge cases) — done in commit `e8a224b`.
2. ✅ In-engine title updated to "Jungle X" — done in commit alongside this update.
3. ✅ Protagonist visual update — Adivasi-coded archer (deep skin tone, cream dhoti, dark sash, no headdress) live in `Renderer.renderPlayer`.
4. **Infected-beast visual cue** — add black-goo accents (sheen/dripping/eye glow) to all three beast types so the corruption reads at a glance.
5. **Level 10 boss** — corrupted plant (the "Ancient Tree Guardian" placeholder is roughly aligned). Family appears here as three active combatants; any family death = game over.
6. **Family rendering & combat** — design the family member entity (movement, collision, rendering, death-triggers-game-over, simple combat behavior for the boss fight).
7. **Copy pass** — replace remaining placeholder strings ("Survive the Ancient Forest", "Defeat the Ancient Tree Guardian", victory text) with vision-aligned copy once tone is locked.
8. **Polish** — `SoundManager` rewrite (single shared `AudioContext`, lazy-init on first gesture), broader sweep to push remaining hardcoded `32`s through `TILE_SIZE`, hit feedback, screen shake.
9. **Tauri wrap for Steam** — once the prototype loop is solid, package the Vite build with Tauri for desktop. See section 7 for what this means for current development.

## 7. Distribution & target platform

**End target: Steam** (Windows / macOS / Linux / Steam Deck). **Vercel is for testing only** — preview URLs for branches and quick mobile/tablet checks, not the publishing platform.

**Planned packaging path: Tauri.** A small Rust shell that wraps the existing Vite/React/Canvas 2D build into a native desktop binary (~5–10 MB). This explicitly preserves the current stack — Tauri is a wrapper, not a game engine, so the "don't migrate to a game engine" guardrail still holds. Electron would also work but is heavier and not preferred. The Tauri integration itself is **out of scope until the prototype loop is solid**; it's the last step of the roadmap, not a near-term task.

**Things to stay aware of so we don't paint into corners:**
- **No browser-only APIs without a Tauri equivalent.** Web Audio, Canvas 2D, `requestAnimationFrame`, keyboard events — all fine. Storage, file system, fullscreen, and gamepad need Tauri-aware patterns when we get to them. Avoid service workers, Web Bluetooth, browser DRM, and pop-up windows.
- **Canvas is fixed 800×600.** Steam users expect at least a fullscreen toggle with letterboxed scaling. Plan to address before any Steam build, not urgent for prototyping.
- **Saves don't exist yet.** When they do, write through Tauri's app-data dir, not `localStorage` long-term.
- **Steamworks SDK** (achievements, cloud save, leaderboards) integrates via a Tauri plugin or a small Rust crate. Post-prototype concern.

## 8. Guardrails for Claude

When working in this repo:

**Story / tone**
- **Beasts are victims, not villains.** The corruption is the antagonist. Don't write copy or design enemy behavior that frames the wildlife as evil. Tragic, not bloodthirsty.
- **Don't add new enemy types without owner approval.** The approved bestiary is black panther, sloth bear, and Jungle-Book-style primate. Snakes, tigers, monkeys, etc. require explicit go-ahead.
- **Family NPCs are sacrosanct in family levels.** Their death = game over. Don't add behavior that undermines the "protect them" tension (no auto-fight, no respawn, no gimmicks).
- **Cultural representation matters.** The protagonist and family are Adivasi/tribal-Indian. Avoid feathered-headdress imagery, generic "tribal" stereotypes, or *Jungle Book* character likenesses. Keep visual cues minimal, dignified, and abstract.

**Technical**
- **Don't add dependencies** without asking. The stack is React + TS + Vite + Tailwind + lucide-react + nothing else.
- **Don't introduce a state library.** UI state stays in React; game state stays in plain TS classes mutated in place. The callback bridge in `App.tsx` is the contract — extend it, don't replace it.
- **Don't break the cardinal-LOS contract.** No diagonal shooting, no manual aim, no targeted fire by clicking, unless explicitly approved.
- **No ranged enemy attacks.** Beasts threaten by contact only. A ranged enemy would invalidate the "where you stand" pillar; if asked to add one, push back unless the owner explicitly approves.
- **Don't migrate to a game engine.** Decision logged: stay on Canvas 2D for the prototype.
- **Stay Tauri-compatible.** Steam is the eventual publish target via a Tauri wrap (see section 7). Don't introduce browser-only features that wouldn't survive a desktop build — Web Audio, Canvas 2D, keyboard input, and standard storage are all fine; service workers, Web Bluetooth, and pop-up windows are not.
- **Don't add real sprite assets.** Procedural rendering is the chosen art direction. Improve `Renderer.ts` instead.
- **Prefer extending existing modules** over adding new ones. The 10 files in `src/game/` cover the surface area; new concerns should fit in one of them.
- **Pull magic numbers into named constants** when you touch them. Especially `800`, `600`, `32`, `16`, `20`, `300`, `400`, `500`. Use `src/game/constants.ts`.
- **Always clean up listeners and timers.** The Bolt.new scaffold leaked both — those are now fixed. Anything new that subscribes to `window` or schedules a `setTimeout` must be disposable from `Game.cleanup()`.
- **Lint and typecheck before declaring done.** `npm run lint` and `npx tsc -p tsconfig.app.json --noEmit` must be clean.
- **Use `Date.now()` only for wall-clock things.** Game timing flows from the `gameLoop` `currentTime` (a `performance.now()` value passed by `requestAnimationFrame`). Mixing the two causes pause/resume bugs.

## 9. File map

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
