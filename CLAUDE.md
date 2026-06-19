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
- **Readable at a glance.** Every entity must be identifiable in one frame at 32×32. **Characters, beasts, and the jungle tree-walls/dirt-floor are sprite-based** (owner-greenlit: player 2026-05-10; the four beasts and the family 2026-06-11 — Tiers 1/2 of `docs/ART-ASSETS.md`; tree walls + floor 2026-06-15 — Tier 3, partial); **the hut, arrows, FX, HUD, and the plant boss stay procedural** (rest of Tier 3 not greenlit; Tier 4 keep-procedural confirmed 2026-06-11). Sprite or rectangle, readability is the bar — a sprite that muddies the silhouette is worse than the rectangles it replaced.
- **Short prototype, tight scope.** Ten levels, one boss arena. Resist scope creep until the prototype loop is solid.

## 4. Core loop (30 seconds of play)

1. Spawn in **anchor 1** (the run-start room) of a freshly generated room grid; a 2-second grace precedes the first wave.
2. Move (WASD/arrows) to expose targets through corridor gaps and to break LOS on threats you can't safely engage.
3. Arrows auto-fire every 500ms at the nearest enemy within 450px with an unobstructed center-to-center raycast (any angle).
4. Avoid contact — every enemy is melee, and contact is instant death (kill test: the enemy's per-type `ENEMY_AABB_PX` box overlapping the player's 16 px hurtbox core; see §5 Player).
5. Walk to a room-edge opening that connects to a neighbor → **LTTP hard-cut transition** into that room. One run-long wave scheduler keeps spawning into whichever room you currently occupy.
6. Traverse the grid to reach the **boss room (anchor 10)**. Entering it pauses the wave timer (no new spawns in the arena) and shows a "Reached Boss" banner; the run otherwise keeps playing (movement, auto-fire, contact-death all live), and walking back out resumes the waves. Death regenerates the whole map and respawns you in a new anchor 1. (Boss combat is still deferred per `docs/ROADMAP-traversable-maps.md` §5.15; until it lands, **walking into the corrupted growth at the arena's center tile** triggers a stub victory — a positional trigger, so it works identically on keyboard, touch, and gamepad. Pressing V inside the arena is an undocumented desktop debug shortcut for the same stub.)

> **Note (traversable-maps refactor):** §4 describes the post-refactor room-grid loop (Step 3, 2026-05-30; boss-room gating added in Step 9). The legacy per-level "clear all enemies → Level Complete → next level" loop is gone. The full design lives in `docs/ROADMAP-traversable-maps.md`.

## 5. Mechanics reference

**Controls** — W/A/S/D plus arrow keys for movement (A moves left); Shift for dash (the keyboard A binding for dash was removed 2026-06-15 — A is movement only on desktop); Space for burst (mobile: floating joystick — touch anywhere on the left half of the screen — for movement; A and B buttons pinned lower-right for dash and burst — the mobile A button is still the dash on touch). Runs start from the menu's "Start Adventure" button (Game's legacy canvas click-to-start listener is occluded by the menu overlay). Sound toggle is a UI button.

**Player** (`src/game/Player.ts`) — 32×32 sprite, 150 px/s free movement, AABB collision against tile walls. No health, no per-level stamina pool (stamina is playthrough-wide and persistent; see Stamina below). One hit kills. Death is **contact-only**, and the kill test is a **true AABB overlap** (owner-approved 2026-06-10, replacing the old flat center-distance rule): the enemy's per-type `ENEMY_AABB_PX` box against the player's `PLAYER_HURTBOX_PX` (16 px) kill core, both centered in their 32 px cells (`Game.enemyTouchesPlayer`, used by `Game.checkCollisions`). Per-axis kill distance is `(16 + enemyAABB)/2` — bear 25, panther 18.5, gibbon 15.5, snake 10 px — so the bear's bulk reaches farther while the snake's sliver demands near-touch. Wall collision still uses the player's full 32 px cell. Two narrow **doorway kill graces** (owner-approved 2026-06-10; *not* general i-frames — auto-fire, movement, and arrow hits keep running) hold only the kill pass: `ARRIVAL_KILL_GRACE_MS` (300 ms on room transition, re-armed at most once per `ARRIVAL_GRACE_REARM_MS` = 2 s so doorway ping-pong can't chain windows into sustained immunity) and `HUNTER_ARRIVAL_GRACE_MS` (200 ms — lowered from 350 ms 2026-06-13 — on a cross-room hunter materializing into the player's room; the white materialize flash that used to mark it was removed by owner decision 2026-06-13 — the hunter simply appears as its normal sprite during the grace, with no extra cue). The 360° LOS check is the *player's* auto-fire mechanic, not an enemy attack.

**Enemies** (`src/game/Enemy.ts`) — four approved types, fixed speeds. All are infected jungle wildlife, not generic monsters:
| Type    | Speed (px/s) | In-world identity |
|---------|--------------|-------------------|
| panther | 395          | Black panther (Indian leopard) — apex pursuer; outruns the player (2.6× player speed) |
| bear    | 218          | Sloth bear — heavy chaser; also outruns the player (1.45×) |
| snake   | 68           | Indian rat snake — easy to outrun (0.45× player); thin slither sprite |
| gibbon  | 34           | Hoolock gibbon — long-armed jungle primate; near-stationary creeper (0.23×) |

Enemy pathfinding repolls every 200 ms (cross-room `hunting` enemies re-poll every frame so pursuit doesn't waver at doorways — owner decision 2026-06-13); direct path if clear, else a **BFS shortest route** over the room's tile grid, path-smoothed to aim at the farthest route tile reachable by a clear ray (the greedy best-cardinal step is now only an unreachable-target fallback — greedy-only trapped fast chasers like the panther in local minima against a wall, oscillating in place instead of routing around it; fixed 2026-06-18).

Enemies also carry a **Hunt state** (`src/game/Hunt.ts`, traversable-maps Step 4): `dormant → activating → active → hunting`. Wave spawns start `active` (in-room pursuit); when the player leaves a room its active enemies become `hunting` and chase the player room-to-room through openings (no despawn), de-aggroing back to a dormant static once the player's room is more than 3 rooms (Manhattan) away (`HUNT_RANGE` bumped 2 → 3 on 2026-06-13 so fast hunters run the player down instead of giving up as they close). Dormant/activating sitters hold position until woken. See `docs/ROADMAP-traversable-maps.md` §5.11–5.12. (Static placement and the de-aggro BFS settlement landed in Step 5+6: statics roll from template candidates on the player's first entry to a room, and a de-aggroing hunter is relocated via a map-wide BFS to the nearest compatible open tile.)

Each type has its own **collision AABB** (`ENEMY_AABB_PX` in `constants.ts`: bear 34, panther 21, gibbon 15, snake 4 px), centered inside the 32 px cell — so a bear can't fit a 1-tile corridor while a snake's 4 px footprint lets many pack per tile. The same box drives the player-kill test (vs the player's 16 px hurtbox core; see Player above) as well as wall and enemy-vs-enemy collision. Enemies can't overlap each other — two exceptions: snake-vs-snake (snakes stack), and panthers/bears brush through snakes (the 4 px sliver never blocks a big cat, so pursuing snakes can't plug a corridor against a fast chaser — owner decision 2026-06-13, directional: a snake mover still respects the larger body); a step that would overlap jitters to a free cardinal direction, else holds. The 32 px cell stays the positioning/render unit and the arrow-hit box, so auto-fire targeting and arrow collision are unchanged. See `docs/ROADMAP-traversable-maps.md` §5.7–5.8.

**No new enemy type may be added without explicit owner approval.** Tigers, monkeys, crocodiles, wild dogs, etc. are *unapproved*; ask before implementing.

**No ranged attacks.** Every beast threatens by contact only — there are no projectile-throwing or AoE infected variants. Don't add a ranged enemy without explicit owner approval; it would change the LOS-based combat contract from "where you stand" to "what you can react to."

**Family NPCs** (planned, behavior unwired in code) — wife, son, daughter. Current scope (updated 2026-05-09):
- Levels 1–3: solo, no family. (Note: these use wave-driven spawning; see Spawning below.)
- **Levels 4 or 5 onward (exact level TBD; currently seeded from anchor 6): family begins to appear** as translucent placeholder rectangles, eventually continuing through the boss arena (the boss-arena grid carries no `N` markers yet). Family positions are seeded in level ASCII grids via the `N` tile marker (today: anchors 6–9) and parsed into `npcPositions`.
- Level 10 (final boss): all three remaining family members fight alongside the player as active combatants.
- Currently in code, family is render-only: translucent **sprites** at `N` tiles in `Renderer.renderNpcs` (wife/son/daughter sheets cycled by position index, down-facing idle frame; Tier 2 swap landed 2026-06-11 — the translucency deliberately signals "not yet interactive"). No `FamilyMember` class, no AI, no AABB, no death triggers, no carryover yet — all to be built; the sheets carry full 3-frame 4-direction walks for when the entity lands.

**Family-death rule:**
- **Alpha** ships the simple "any family member's death = game over" rule (prototype shape).
- **Demo** changes the rule to a branching shape — the specific behavior is TBD. See `docs/IDEATION.md` §1 for candidate shapes (survivor-set drives endings, player-choice moment, survivor behavior changes).

**Approved (simple) hut-attack branch — owner-approved 2026-05-09, EA target.** If the hut (marked with `H` tile in level ASCII) is destroyed or attacked during the run, family never appears in subsequent levels. This is the prototype form of the multi-ending system and the first divergence input. Hut positions are seeded in levels via the `H` tile marker and parsed into `hutPositions`.

**Future direction — full multi-ending system (still requires owner sign-off before implementation).** Beyond the simple hut-attack branch above, the eventual target is per-member carryover with multiple endings:
- Once family members are present in a level, they can die individually. Each dead family member does not appear in subsequent levels.
- Different endings flow from how many family members survive to the boss arena.

Don't structure family / hut code in a way that locks future per-member branching out (e.g., hardcoding "all family always present", or coupling family identity to a single boolean). See the `protagonist-and-family-tone` skill.

**Design ideation (TBD, not committed for any tier).** Several mechanics are under exploration but not on a build tier: gibbons-drop-from-trees spawn behavior, convert-beasts-to-allies, stick-barriers (mild Tower Defense), and (concept-only) free-movement between primary + connector levels with continuous waves. See `docs/IDEATION.md` for the full backlog and read it before proposing related changes.

**TODO — ally-beast friend marker (deferred; do when convert-beasts-to-allies is built).** A recruited/freed beast keeps its normal wildlife body (no red eyes) but still needs an *angle-robust* friend cue so an ally reads instantly against an infected (red-eyed) enemy of the same type in a horde — friend/foe confusion is an instant-death risk (Pillar 5). A single neck collar/garland was prototyped 2026-06-18 and **rejected**: one shape can't be correct across all four facings (front necklace vs. side profile vs. back). Candidate angle-robust cues for next time: a marigold bloom on the crown / behind the ear, or a soft "cured" body tint — both read the same from any facing. Art only was explored; the mechanic itself is unbuilt and needs its own owner gate.

**Stamina** (`src/game/Stamina.ts`) — playthrough-wide stamina pool, persists across all levels in a run, resets only when `Game.restart()` is called. Max is 100 points; no regen. Drained by:
- **Movement:** ~0.001 stamina per tile (negligible; ~100k tiles to deplete).
- **Arrows:** ~0.001 stamina per arrow (negligible).
- **Dash:** 0.5 stamina per use (primary stamina consumer).
- **Burst activation:** 5 stamina per use (significant cost).

When stamina drops below the low threshold (10 points), both movement speed and arrow fire rate are multiplied by 0.5×, creating a compounding penalty. When stamina hits zero, penalties are locked at 0.5×.

**Auto-fire** (`src/game/Game.ts`, `src/game/Stamina.ts`) — cooldown 500 ms (effective cooldown is `500 / (burstMultiplier × lowStaminaMultiplier)`), range 450 px, **full 360° at any angle**. Each frame, picks the nearest enemy within range whose center is reachable from the player center by an unobstructed wall raycast; fires an arrow on the raw unit vector to that enemy (no angle snapping). Arrow speed 400 px/s; arrows die on bounds, walls, or enemy hit (4×4 arrow box vs the enemy's full 32 px cell — not the per-type collision AABB).

**Burst rapid-fire** (`src/game/Stamina.ts`, triggered via Space or the on-screen B button — there is no keyboard B binding) — edge-triggered activation (not held). When active:
- Arrow cooldown is multiplied by the burst multiplier (starts at 2.0×, decays with each activation).
- Lasts 5 seconds.
- Resets after a 15-second break. Activating again within 15 seconds of the last burst end applies a decay rule: `multiplier *= 0.75`, so spamming burst eventually self-debuffs to <1×.

**Dash teleport** (`src/game/Player.ts`, triggered via Shift or the on-screen A button) — edge-triggered activation. Instant blink:
- Direction: opposite of the player's current cardinal facing (up/down/left/right).
- Distance: 3 tiles = 96 pixels, or stops at the last open tile before a wall, whichever is shorter.
- Cost: 0.5 stamina (rejected if stamina < 0.5).
- The contact-death check (the AABB kill rule in `Game.checkCollisions`) still applies at the post-dash position, so landing on an enemy kills the player (unless a doorway kill grace happens to be running — see Player above).

**Line of sight** (`src/game/Game.ts` → `hasDirectLineOfSight`) — generic point-to-point raycast from player center to enemy center, sampled in equal steps at ~8 px granularity (`steps = ceil(distance / 8)`); LOS is blocked if any sampled tile is a wall. Center-to-center is intentional: an enemy peeking out from behind a wall column doesn't qualify until the player steps to clear the line.

**Rooms & map** (`src/game/RoomGrid.ts`, `src/game/RoomTemplates.ts`, `src/game/levels.ts`) — each run generates a **29×17 grid of rooms** (`generateRunMap`, 493 rooms), regenerated on every run/death. Each room is one 29×17-tile playfield (928×544 px). Two kinds:
- **Anchors (10):** the hand-authored ASCII levels in `levels.ts`. Anchor 1 = run start, anchor 10 = boss. Placed by Poisson-disk sampling (≥ `MIN_ANCHOR_SPACING` rooms apart, interior cells only). At build time `RoomGrid` carves canonical doorways (N/S at cols 13–15, E/W at rows 7–9) into a *copy* of each anchor's walls so they connect to the corridor fabric — the boss arena was an unenterable sealed wall ring otherwise. `N`/`H` family/hut markers ride along and still render in their anchor room.
- **Connectors (~483):** procedurally placed from `CONNECTOR_TEMPLATE_POOL` (20 templates: straights, bends, T-junctions, cross, dead-end, multi-opening hubs, interior mazes). Adjacent connectors are chosen so shared-edge openings match; a BFS path-existence check guarantees the boss is reachable from the start, else the map regenerates.
- Grid size: 29 columns × 17 rows, each tile 32 px = 928×544 px total. Tile chars: `#` wall (tree), `.` floor (dirt), `N`/`H` family/hut markers (floor); connector templates additionally use `s`/`S` static-spawn candidates (floor; rolled into dormant statics on the player's first entry to the room — Step 5+6). `N`/`H`/`s`/`S` all count as floor for collision/pathfinding.
- **Transitions are LTTP hard cuts:** walking (pressing outward) into an edge opening that overlaps a neighbor room's opening drops the player at the aligned opposite edge of that neighbor (`Game.detectTransition`).

**Spawning** (`src/game/WaveScheduler.ts`) — one run-long **`GlobalWaveScheduler`** drives all spawns. (The per-level `WaveScheduler` class and the legacy static-`enemySpawns`/`delayedSpawns` paths still exist in the source but are no longer wired by `Game`; the `USE_GLOBAL_WAVE_SCHEDULER` flag is removed — global is permanent.) Lifecycle: a 2 s run-start grace, then **triplets** of three waves (setup → add → test) separated by a random 2–6 s inter-wave lull, with a random 10–30 s break between triplets; wave size/cadence escalate indefinitely (`waveParams`; cap 25/wave). The group pool widens by global wave number (`WAVE_POOL_MID_UNLOCK`/`WAVE_POOL_LATE_UNLOCK`): waves 1–4 are 3-snake/6-snake/1-panther only; waves 5–8 add 2-panther, 1-panther+6-snake, and 9-snake; waves 9+ add 1-bear and 12-snake (bears unlock here). Each tick, group templates (`SpawnTemplate.rows: EnemyType[][]`, rows laid out at uniform one-tile slots — the per-type AABB packing from roadmap §5.7 has not been wired into the dripper) drip row-by-row into the **current room's per-opening spawn bands** — one band per room opening, derived on room entry (`Game.bandsForRoom`, roadmap §5.5). The scheduler **pauses during a room transition** and resumes on entry; the boss arena reuses the same hooks — entering pauses the timer for the whole visit, leaving resumes it. Enemies **persist per-room** (no despawn): leaving a room parks its enemies; they're still there on return. Statics are separate from the wave pipeline — Game rolls them from template candidates on first room entry — and cross-room hunters are driven by the Hunt machine (see Hunt state above); the `GlobalWaveScheduler` drives all wave spawns.

**Scoring** — +10 per kill. (The old +100 × level "level complete" bonus is gone with the level-complete flow; run/room-progression scoring is TBD.)

## 6. World & tone

**Setting** — the Indian jungle, pre-industrial / mythic time. Dense, mostly impassable forest; the playable space is the narrow paths and small clearings the family knows by heart. Aesthetic touchstone: *The Jungle Book* (visual style and bestiary inspiration only — no direct character references).

**Protagonist** — Adivasi/tribal-Indian archer, husband and father. Visual direction (in code, `Renderer.renderPlayer`): sprite-based using a Time Elements modular composite (16×32 px per frame, 4-frame walk animation per direction, directions = up/down/left/right; replaced the original CC0 LTTP sheet 2026-06-18). Color and proportions read as deep warm-brown skin, short black hair (no headdress), cream cotton tunic with a dark waist sash (dhoti-coded), bow held offhand on the left, leather quiver at right hip. Procedural rendering is not used for the player; sprite is the exception to the procedural-only rule.

**Family** — wife, son (boy), daughter. They lived in harmony with the jungle and read it like a second language. They are the player's reason. Rendered as translucent 16×32 sprites (Time Elements modular composites — same Core Set + Adivasi palette as the player; recolored, see `docs/ART-CREDITS.md`): deep warm-brown skin and black hair matching the player, wife in a red dress (a cream apron is a pending detail), son in a red tunic with dark shorts, daughter in a turmeric-ochre dress — dignified, minimal, no headdress or caricature; built as their own distinct designs rather than shrunk-down adults. They currently appear in anchors 6–9 (the levels whose ASCII grids carry `N` markers) as passive render-only figures (translucency = "not yet interactive") and will gain AI and death triggers once family mechanics are implemented.

**Antagonist** — not the beasts. The beasts are victims of an infection: a black goo emanating from a monstrous plant deep in the jungle. The plant is the boss. Tone is tragic — the player is killing wildlife because there's no other choice, and the world is worth saving.

**Bestiary status:**
- **Approved and implemented:** Black panther (Indian leopard), sloth bear, Indian rat snake, Hoolock gibbon. Speed tuned so panther/bear outrun the player while snake/gibbon are slower — combat depends on chokepoints, not foot races. All four are sprite-based as of 2026-06-12 (Tier 1 of `docs/ART-ASSETS.md`): panther, bear, and gibbon (gorilla sheet) from the paid Time Fantasy Animals packs, snake from the CC-BY Tiny Tiny Heroes pack recolored olive. Sprites face their movement direction, animate a 3-frame walk, and draw at their per-type `ENEMY_VISUAL_PX` size — decoupled from the kill AABB, with the apex panther (29 px) and bear (39 px) enlarged for presence 2026-06-19 while snake/gibbon stay at the 16 px floor; the red-eye infection cue stays a procedural overlay stamped over each sprite's eyes (none when facing away).
- **Approved + implemented (visual cue, owner decision 2026-06-11):** infection shows **only as red eyes** on all four beasts (`INFECTED_EYE_RED` in `Renderer.ts`); their bodies read as normal wildlife. The earlier "black-goo accents on beasts" direction is dropped — black goo is the boss's signature only. Don't add goo streaks/sheen/drips to beasts.
- **Not yet approved (do not add without asking):** Tigers, monkeys, crocodiles, wild dogs, jackals, anything else.

**Rendering:**
- **Sprite (characters + beasts; `docs/ART-ASSETS.md` Tiers 1–2, greenlit 2026-06-11):** player (Time Elements Core Set modular composite, 16×32 cells, 4-frame walks — replaced the original CC0 LTTP sheet 2026-06-18); family wife/son/daughter (Time Elements modular composites, 16×32 cells, 3-frame 4-dir walks — replaced the Antifarea CC-BY recolors 2026-06-18; idle frame only until the `FamilyMember` entity lands). Player + family draw at **1.5×** (24×48, foot-aligned, head overflows the cell upward) since 2026-06-19 for more presence against the ×2 tiles — render-only, collision unchanged. The four beasts (in use since 2026-06-12 — Time Fantasy panther/bear/gorilla-gibbon + CC-BY TTH snake, 3-frame 4-dir sheets) draw at a per-type **`ENEMY_VISUAL_PX`** box decoupled from the kill AABB (`ENEMY_AABB_PX`): owner sizing 2026-06-19 makes the apex panther (29 px) and bear (39 px) read larger than their kill box, while the small-bodied gibbon and thin snake stay at the 16 px readability floor. The jungle **tree walls + dirt floor** (in use since 2026-06-15 — free Time Fantasy "Jungle Tileset" by Jason Perry / finalbossblues, `src/assets/sprites/jungle-tiles.png`, 16px tiles drawn ×2 to the grid) use a **10-tile atlas sliced from the pack's own tree objects** (dirt + 4 canopy interiors + 2 crowns + 2 undersides + 1 trunk/roots); `Renderer.renderLevel` paints dirt on every cell, then picks crown / trunk-or-underside / interior per wall cell **neighbour-aware** (by whether the cell above/below is open), so wall masses render as a **stand of jungle trees** — crowns on top edges, trunks at corridor bases, dense interior, plus a procedural canopy depth-shadow (re-sliced from the earlier flat canopy-fill 2026-06-19, owner "option C — actual trees"). All sprites draw via `ctx.drawImage` with `imageSmoothingEnabled = false`, bundled as PNGs through Vite.
- **Procedural (everything else):** the hut, arrows, burst aura, LOS indicator, FX, and the corrupted growth / plant boss render as hand-drawn Canvas 2D fills in `Renderer.ts` (rest of Tier 3 — the hut — not greenlit; Tier 4 keep-procedural confirmed 2026-06-11). Walls/floor moved to the sprite layer 2026-06-15 (see the Sprite bullet above). The infected red-eye cue stays a procedural overlay even on sprite beasts. Canonical colours live in `Renderer.ts` — don't duplicate them here.
- **Palette direction:** Forest greens, earth browns, tan paths, dark canopy fills (see `Renderer.ts` for exact hexes). The black-goo accent palette (deep oily black, sickly green/purple highlights — `GOO_*` in `Renderer.ts`) is live and **boss-only**; beasts carry the red-eye infection cue (`INFECTED_EYE_RED`) instead.

**Audio palette** (current code) — `SoundManager` is file-first (rewritten 2026-06-11): one shared `AudioContext`, created/resumed inside the start-gesture (`Game.startRun`, plus a window-level first-gesture hook so the menu bed can start pre-run), disposed from `Game.cleanup()`. Sound keys follow `docs/AUDIO-ASSETS.md` (the sourcing spec); `.ogg`/`.mp3` files dropped in `src/assets/audio/` are auto-discovered (build-time glob) with round-robin variants. **Real files landed 2026-06-12** (all CC0, provenance logged in `docs/AUDIO-CREDITS.md`): the four §1 SFX (arrow-fire ×3 variants, enemy-hit, game-over, victory) plus the greenlit §3/§4 beds (ambience-jungle, ambience-corrupted, music-menu, music-boss). Beds are scene-driven looping (`SoundManager.setScene`: menu → music-menu, gameplay → ambience-jungle, boss arena → music-boss + ambience-corrupted, terminal screens → silent), crossfaded, driven by `Game` state transitions. The synth tones remain as per-key fallbacks only if a file fails to decode. §2 event keys (dash, burst-activate, stamina-low, room-transition) are deliberately skipped — wired but silent; per-key approval statuses live in the manifest's §2 Status column (room-transition and family-death are not approved; dash may be removed with its mechanic). All shipped audio must be human-made, not AI-generated (see §9).

**Working in-engine copy** — title "Jungle X" is final. The entry screen still shows "Jungle Archer" (working title for prototyping); will be swapped at release. The other menu strings ("Survive the Ancient Forest", "Defeat the Ancient Tree Guardian", "You have conquered the jungle!") are still placeholder and will be replaced in a dedicated copy pass once tone is locked.

## 7. Scope & roadmap

**In scope (prototype):**
- **Traversable room grid** (`docs/ROADMAP-traversable-maps.md`): the 10 hand-authored levels become **anchors** in a procedurally generated grid of rooms; the player traverses room-to-room toward the boss. Generator + LTTP hard-cut transitions + global wave scheduler landed as **Step 3 (2026-05-30)**; cross-room Hunt AI (4), static spawns + density with BFS de-aggro settlement (5/6), the full connector template pool (8), and boss-room gating (9) have all landed since. Remaining refactor work: per-anchor static authoring (Step 7) and boss combat (roadmap §5.15).
- Family appears in the anchor rooms that carry `N` markers (currently anchors 6–9) as translucent sprite figures, and through the boss arena.
- Boss room (anchor 10): corrupted plant exuding black goo.
- Visual update for the Adivasi-coded protagonist (complete: sprite asset in use as of 2026-05-10).
- Infected-beast visual treatment (red-eye cue — complete 2026-06-11; goo accents on beasts dropped by owner decision).
- Hit feedback, screen shake, death pop — within Canvas 2D.
- Stamina, burst, and dash mechanics (complete as of 2026-05-10).
- Global run-long wave scheduler (complete; replaced the per-level scheduler in the Step-3 room refactor, 2026-05-30).

**Out of scope until owner says otherwise:**
- New enemy types beyond the four approved beasts. Ask first.
- Ranged enemy attacks. Touch-only is the design.
- A passive family-escort intro on a mid-game level. Possible future phase, not now.
- Multiple-endings system (hut-attack branch, family-survival carryover into later levels). Documented direction; do not implement without owner sign-off. See §5 and the `protagonist-and-family-tone` skill.
- Sprite assets beyond the approved set: player (2026-05-10), the four beasts and the family (Tiers 1–2 of `docs/ART-ASSETS.md`, greenlit 2026-06-11), and the jungle tree-walls + dirt-floor (Tier 3, partial — greenlit 2026-06-15). The **hut** (rest of Tier 3 — explicitly not greenlit), arrows, FX, HUD, and the plant boss (Tier 4 — keep-procedural confirmed) stay procedural; extending sprites to any of them needs fresh owner approval. License policy for sourced art: CC0 / CC-BY / paid royalty-free only — **share-alike is rejected** (no CC-BY-SA, no GPL, hence no LPC; resolved in `docs/IDEATION.md` §8), no NC/ND, nothing AI-generated.
- New input methods (gamepad, mouse-aim). Touch input is now supported for mobile testing — phones and tablets get a floating joystick over the left half of the screen plus on-screen A/B buttons via `src/MobileControls.tsx`. Detection uses `(pointer: coarse)` so desktop touchscreens stay on keyboard. Don't add additional input methods without owner sign-off.
- Saves, accounts, leaderboards.
- Multiplayer, online features.
- Migration to Phaser, Godot, or any other engine.
- New runtime dependencies. Ask before adding any package.
- Direct *Jungle Book* character references (style inspiration only).

**Ordered next steps:**
1. ✅ Critical bug fixes (input leak, setTimeout race, cardinal edge cases) — done in commit `e8a224b`.
2. **In-engine title swap to "Jungle X"** — release-time change; "Jungle Archer" remains the working title until then.
3. ✅ Protagonist visual update — Adivasi-coded archer (deep skin tone, cream dhoti, dark sash, no headdress) live in `Renderer.renderPlayer` via a Time Elements modular composite (replaced the original CC0 sprite 2026-06-18).
4. ✅ **Infected-beast visual cue** — done 2026-06-11. Owner decision replaced the black-goo-accent plan: all four beasts carry red eyes (`INFECTED_EYE_RED`) and otherwise look like normal wildlife; the goo palette stays boss-only.
5. **Family rendering & combat** — rendering half landed 2026-06-11 (sprite swap, idle frames at `N` markers; beast sprites followed 2026-06-12); still to build: the `FamilyMember` entity (movement, collision, walk animation from the existing sheets, death-triggers-game-over, simple combat behavior for the boss fight).
6. **Level 10 boss** — corrupted plant (the "Ancient Tree Guardian" placeholder is roughly aligned). Family appears here as three active combatants; any family death = game over.
7. **Copy pass** — replace remaining placeholder strings ("Survive the Ancient Forest", "Defeat the Ancient Tree Guardian", victory text) with vision-aligned copy once tone is locked. (Non-code task.)
8. **Polish** — ✅ `SoundManager` rewrite done 2026-06-11; ✅ audio files sourced + looping scene beds landed 2026-06-12 (CC0 set per `docs/AUDIO-CREDITS.md`). Remaining: broader sweep to push remaining hardcoded `32`s through `TILE_SIZE`, hit feedback, screen shake.
9. **Inter-stage cut-scenes** — short dialogueless procedural-rectangle vignettes between levels carrying the corruption arc. "…" bubbles only, skippable, out of scope until the loop is solid (§2 Prototype goals).
10. **Tauri wrap for Steam** — once the prototype loop is solid, package the Vite build with Tauri for desktop. See section 8 for what this means for current development.

## 8. Distribution & target platform

**End target: Steam** (Windows / macOS / Linux / Steam Deck). **Vercel is for testing only** — preview URLs for branches and quick mobile/tablet checks, not the publishing platform.

**Planned packaging path: Tauri.** A small Rust shell that wraps the existing Vite/React/Canvas 2D build into a native desktop binary (~5–10 MB). This explicitly preserves the current stack — Tauri is a wrapper, not a game engine, so the "don't migrate to a game engine" guardrail still holds. Electron would also work but is heavier and not preferred. The Tauri integration itself is **out of scope until the prototype loop is solid**; it's the last step of the roadmap, not a near-term task.

**Things to stay aware of so we don't paint into corners:**
- **No browser-only APIs without a Tauri equivalent.** Web Audio, Canvas 2D, `requestAnimationFrame`, keyboard events — all fine. Storage, file system, fullscreen, and gamepad need Tauri-aware patterns when we get to them. Avoid service workers, Web Bluetooth, browser DRM, and pop-up windows.
- **Canvas is fixed 928×544** (≈17:10 aspect; chosen for an odd column count of 29 so every level has a true center column at col 14). A clean ×2 scale is 1856×1088 — 32 px side bars but 8 px **too tall** for a 16:9 1080p monitor, so an integer scale doesn't fit; desktop fullscreen will need fit-to-height letterboxed scaling (~×1.985) or a small crop. Mobile already requests fullscreen + orientation lock on the start gesture and CSS-fits the canvas to the frame; a desktop fullscreen toggle is still to-do before any Steam build, not urgent for prototyping.
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
- **All shipped assets must be human-made — no AI-generated art or audio** (owner policy 2026-06-11). Applies to every sprite, sound, music, and ambience file in the Steam release. When sourcing from free libraries, verify provenance (description, author, AI tags) and reject anything ambiguous. Both manifests (`docs/AUDIO-ASSETS.md`, `docs/ART-ASSETS.md`) carry this as a hard constraint and a checklist item.
- **Don't add dependencies** without asking. The stack is React + TS + Vite + Tailwind + lucide-react + nothing else.
- **Don't introduce a state library.** UI state stays in React; game state stays in plain TS classes mutated in place. The callback bridge in `App.tsx` is the contract — extend it, don't replace it.
- **Don't break the 360-LOS auto-fire contract.** Auto-fire targets the nearest enemy with clear LOS at any angle, gated only by walls. No manual aim, click-to-fire, target-selection UI, lane snapping, or other input-driven targeting without explicit owner approval.
- **No ranged enemy attacks.** Beasts threaten by contact only. A ranged enemy would invalidate the "where you stand" pillar; if asked to add one, push back unless the owner explicitly approves.
- **Don't migrate to a game engine.** Decision logged: stay on Canvas 2D for the prototype.
- **Stay Tauri-compatible.** Steam is the eventual publish target via a Tauri wrap (see section 8). Don't introduce browser-only features that wouldn't survive a desktop build — Web Audio, Canvas 2D, keyboard input, and standard storage are all fine; service workers, Web Bluetooth, and pop-up windows are not.
- **Sprite assets are limited to the approved set: player, the four beasts, the family, and the jungle tree-walls/dirt-floor.** (Player owner-approved 2026-05-10; beasts + family greenlit 2026-06-11 as Tiers 1–2 of `docs/ART-ASSETS.md`; tree walls + floor greenlit 2026-06-15 as Tier 3, partial.) The hut, HUD, arrows, FX, and the plant boss render procedurally via `Renderer.ts` — the rest of Tier 3 (the hut) was not greenlit and Tier 4's keep-procedural recommendation was confirmed. Don't extend sprite assets to any other entity without owner approval. Sourced art must be CC0 / CC-BY (logged in `docs/ART-CREDITS.md`) / paid royalty-free; share-alike (CC-BY-SA, GPL — including all LPC assets) is rejected, as are NC/ND and anything AI-generated.
- **Prefer extending existing modules** over adding new ones. The 17 files in `src/game/` cover the surface area; new concerns should fit in one of them: `Game.ts` (orchestrator), `Player.ts`, `Enemy.ts`, `Hunt.ts` (hunt-state machine), `Level.ts`, `levels.ts` (anchor ASCII), `RoomGrid.ts` (run-map generation), `RoomTemplates.ts` (connector templates), `types.ts`, `Renderer.ts`, `InputManager.ts`, `CollisionManager.ts`, `SoundManager.ts`, `Stamina.ts`, `WaveScheduler.ts`, `Logger.ts`, `constants.ts`.
- **Pull magic numbers into named constants** when you touch them. Especially `928`, `544`, `32`, `16`, `400`, `450`, `500`. Use `src/game/constants.ts`.
- **Always clean up listeners and timers.** The early scaffolding leaked both — those are now fixed. Anything new that subscribes to `window` or schedules a `setTimeout` must be disposable from `Game.cleanup()`.
- **Lint and typecheck before declaring done.** `npm run lint` and `npm run typecheck` must be clean. Both cover `api/` (the Vercel Edge crash sink) as well as `src/` — the typecheck script runs all three tsconfigs (app, node, api).
- **Use `Date.now()` only for wall-clock things.** Game timing flows from the `gameLoop` `currentTime` (a `performance.now()` value passed by `requestAnimationFrame`). Mixing the two causes pause/resume bugs. The crash logger uses `Date.now()` for UI timestamps, which is fine (those are non-critical wall-clock).
- **Crash logger is always running.** Do not remove or disable `src/game/Logger.ts`. It captures frame-by-frame state snapshots and renders an overlay on crash for debugging. Extend it if needed, but don't lose it.
- **Mobile input is wired.** The floating joystick in `MobileControls.tsx` drives movement via `setVirtualInput` (analog vector mapped to cardinal booleans) and the A/B buttons via `triggerDash` / `triggerBurst`. Desktop and mobile input paths converge in `InputManager.ts` so the game loop sees a unified input stream. Both paths must be tested.

## 10. File map

```
src/
├── App.tsx                       React shell: canvas + HUD overlays (room coord, wave #, kills, stamina/burst) + menu/game-over/victory + "Reached Boss" banner; useIsMobile/useIsPortrait hooks, CSS force-landscape rotation, mobile fullscreen + orientation lock
├── MobileControls.tsx            Floating left-half joystick + lower-right A/B buttons (rendered by App when (pointer: coarse) matches); pointer-capture tracking; remaps coordinates when the root is CSS force-rotated to landscape
├── main.tsx                      React entry point
├── index.css                     Global styles (Tailwind)
└── game/                         All game logic — pure TS, no React
    ├── Game.ts                   Orchestrator: game loop, room grid + LTTP transitions, arrow firing, collisions, statics, stamina, burst, dash, boss-arena win trigger
    ├── Player.ts                 Player position, movement, wall collision, dash teleport, cardinal facing, setPosition
    ├── Enemy.ts                  Enemy AI (direct path → BFS shortest route around walls, path-smoothed; greedy cardinal only as unreachable fallback; entry mode for wave spawns)
    ├── Hunt.ts                   Hunt-state machine (dormant/activating/active/hunting): room enter/leave transitions, cross-room hunting, BFS de-aggro settlement hook
    ├── Level.ts                  Tilemap, isWall(), spawn helpers (player + enemies), NPC/hut positions
    ├── levels.ts                 Hardcoded ASCII grids for the 10 anchor levels + global wave-pool templates
    ├── RoomGrid.ts               Run-map generator: Poisson anchors, anchor door-carving, connector fill, BFS path-existence, transition helpers
    ├── RoomTemplates.ts          Connector template pool (ASCII → walls/openings/candidates) + parser (deriveOpenings)
    ├── types.ts                  Vector2, Rectangle, GameState, GameCallbacks, EnemyType, Facing, room-grid + WaveScheduler types
    ├── Renderer.ts               Canvas 2D draw routines for the current room/player/enemies/arrows/NPCs/huts/corrupted growth (sprites for player + family + beasts + jungle tree-walls/dirt-floor; procedural for the hut, arrows, FX, boss)
    ├── InputManager.ts           Keyboard + virtual (mobile) input listener → InputState; burst + dash + win-stub edge-trigger detection
    ├── CollisionManager.ts       AABB overlap helper
    ├── SoundManager.ts           File-first SFX (shared AudioContext, manifest keys per docs/AUDIO-ASSETS.md) with synth-tone fallback + scene-driven looping beds (menu/gameplay/boss music & ambience)
    ├── Stamina.ts                Playthrough-wide stamina pool, burst state machine, decay multiplier, low-stamina penalty
    ├── WaveScheduler.ts          GlobalWaveScheduler (run-long triplets, grace, per-opening bands, pause/resume) + legacy per-level WaveScheduler
    ├── Logger.ts                 Crash capture + frame-by-frame snapshot + on-screen overlay rendering; POSTs crash snapshots to /api/crash
    └── constants.ts              Named constants: canvas size (928×544), tile size (32), grid (29×17), room grid, ranges, cooldowns, stamina costs, burst tuning, boss-growth trigger

api/
├── crash.ts                      Vercel Edge crash sink — POST target of Logger's /api/crash reports; opens/updates GitHub issues by crash fingerprint (typechecked via tsconfig.api.json, linted)
└── env.d.ts                      Ambient process.env declaration for the Edge runtime (no @types/node)
```
