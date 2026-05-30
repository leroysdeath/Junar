# Junar — Traversable-Maps Refactor Roadmap

**Status:** Design locked, implementation not yet started.
**Purpose:** Source of truth for the traversable-maps refactor that replaces the current per-level "clear all enemies → next level" loop with a procedurally-laid room grid, global wave timer, Hunt system, and per-enemy AABB sizing. Every implementation chat for this refactor reads this document first and treats it as the contract.

**Audience:** Future Claude Code chats picking up an implementation step. Each chat should read this doc first, then `CLAUDE.md` and `docs/INVARIANTS.md`, then begin its scoped step.

---

## 1. Source documents

This doc is the working contract. The following remain canonical for higher-level concerns:

- `CLAUDE.md` — Vision, Pillars, Guardrails, Distribution. Read for tone, scope, and architectural guardrails.
- `docs/INVARIANTS.md` — Hard rules that gate any PR. None of the 16 invariants are violated by this refactor; verify after each step.
- `docs/IDEATION.md` — Backlog for ideas not committed to a build tier.
- `.claude/skills/junar-pillars/SKILL.md` — Pillar/invariant gate. Invoke when in doubt.

This doc supersedes nothing in the above. If a conflict arises, fix it in the right place (don't silently diverge).

---

## 2. Vision summary

See `CLAUDE.md` §1 for the full vision. Refactor-relevant intent:

- The jungle traps and channels — the player navigates corridors and clearings rather than re-entering discrete "level" arenas.
- The corruption is the antagonist — the boss spawns/corrupts more wildlife over time, and the density of corruption is highest near the boss. This narrative grounds the **B+C density formula** below.
- Death is fast and fair — one hit kills.
- Tactical positioning over twitch — auto-fire at any angle, walls block. The new corridor structure makes positioning even more central.

---

## 3. Pillar/invariant impact

All 6 pillars preserved. None of the 16 invariants violated. The pillar most affected is §3 #6 "Short prototype, tight scope" — this refactor is a substantial expansion. Acknowledged and approved.

Invariants requiring attention during implementation:
- **#7 (magic numbers in `constants.ts` only)** — all new constants (room-grid size, density formula constants, hitbox sizes, etc.) live in `src/game/constants.ts`.
- **#8 (`gameLoop` `currentTime`, never `Date.now()`)** — all new time-based logic uses `currentTime` from `gameLoop`. The Hunt system and global wave scheduler are time-sensitive; this matters.
- **#16 (listeners/timers disposed)** — new systems must dispose cleanly from `Game.cleanup()`.

---

## 4. Glossary

- **Room** — one 29×17 tile playfield (canonical canvas = 928×544 px). Equivalent in size to today's "level."
- **Room grid** — a 29×17 array of rooms, regenerated each run. World total: 493 rooms.
- **Room-grid coordinate** — `{col: 0..28, row: 0..16}` identifying a room's position in the grid. Distinct from in-room tile coordinates.
- **Anchor** — one of 10 hand-designed rooms with story/gameplay significance. Always includes the boss room (anchor 10).
- **Connector** — a procedurally-placed room drawn from the connector template pool. Most of the 493 rooms are connectors.
- **Triplet** — a group of 3 consecutive waves (setup → add → test), with 3 s inter-wave lull. Same shape as current per-level waves.
- **Triplet break** — random 15-60 s pause between triplets. Statics remain active; no new waves fire.
- **Hunter** — an active enemy that's pursuing the player across rooms (not a wave-spawn or sitter type per se, but a state).
- **Hunt range** — Manhattan distance ≤ 2 in room-grid coords from hunter's current room to the player's current room.
- **Static** — a dormant enemy sitting in a room, waiting to be aggroed.
- **Manhattan distance (rooms)** — `|colA - colB| + |rowA - rowB|`, where col/row are room-grid coords.

---

## 5. Design locks

### 5.1 Run structure

**Goal.** Reach and defeat the boss in **anchor 10**. No other required visits. No required visit order.

**Map.** 29×17 grid of rooms = 493 rooms total. Regenerated every run.

**Anchor count.** 10 (existing levels 1-10 serve as anchor templates).

**Anchor placement** — Poisson-disk + path-existence guarantee:
1. Randomly choose a cell for anchor 1.
2. For anchors 2..10, randomly pick a cell. Reject if its Manhattan distance to any existing anchor is `< MIN_ANCHOR_SPACING`. Retry until valid.
3. Recommended `MIN_ANCHOR_SPACING = 5` (tunable; range 4-6 reasonable).
4. After connectors are laid down, BFS from anchor 1 through walkable adjacencies. If anchor 10 is not reachable, regenerate the connector pass (worst case: re-place anchors).

**Anchor 1 position.** Random per run.

**Player initial spawn within anchor 1.** Existing `CENTER_SPAWN = (448, 256)` — keep using this constant.

**Anchor 10 marker.** Visually indistinguishable from other rooms until the player crosses its threshold. No mini-map, no compass, no preview.

**Death / restart.** Player dies → map fully regenerates → player respawns in (newly placed) anchor 1 → stamina pool resets via `Game.restart()` → wave timer resets to grace period.

### 5.2 Connector templates

**Pool size.** ~20 templates.

**Authoring status.** 6 written (T1-T6 below); ~14 remaining (see implementation step 8).

**Dimensions.** Each template is a 29×17 ASCII grid (matching the room dimensions).

**Tile chars (parser must support all):**
- `#` — wall (tree)
- `.` — floor (dirt)
- `N` — family marker (existing semantics; treated as floor)
- `H` — hut marker (existing semantics; treated as floor)
- `s` — **NEW.** Static spawn candidate, small enemies only (snake or gibbon). Treated as floor for collision.
- `S` — **NEW.** Static spawn candidate, any 1-tile-fitting type (snake, gibbon, or panther). Treated as floor.

Bears (34 px, exceed tile width) are not statically placed via these markers. Bears come only from waves (triplet 3+). If static bears are wanted later, add a `B` marker that reserves a 2×2 footprint — not for the prototype.

**Exit declaration.** Each template declares walkable edges and openings: `{ edge: 'N'|'S'|'E'|'W', rangeStart: number, rangeEnd: number }`. Multi-opening edges produce multiple bands (see §5.5 wave bands).

**First-pass template ASCII** (see source patterns from Labyrinth and Saboteur board games — straight, L-bend, T-junction, cross, dead-end, plus multi-opening variants):

```
T1 — Straight EW (W rows 7-9, E rows 7-9)
#############################
#############################
#############################
#############################
#############################
#############################
#############################
.............................
.......s.........S.........s.
.............................
#############################
#############################
#############################
#############################
#############################
#############################
#############################

T2 — Straight NS (N cols 13-15, S cols 13-15)
#############...#############
#############...#############
#############...#############
#############.s.#############
#############...#############
#############...#############
#############...#############
#############...#############
#############.S.#############
#############...#############
#############...#############
#############...#############
#############...#############
#############.s.#############
#############...#############
#############...#############
#############...#############

T3 — NE L-bend (N cols 13-15, E rows 7-9)
#############...#############
#############...#############
#############...#############
#############...#############
#############...#############
#############.s.#############
#############...#############
#############................
#############......S.........
#############................
#############################
#############################
#############################
#############################
#############################
#############################
#############################

T4 — 4-way cross (all 4 edges open at 3-wide centers)
#############...#############
#############...#############
#############...#############
#############.s.#############
#############...#############
#############...#############
#############...#############
......s..........s.....s.....
.............S...............
......s..............s.......
#############...#############
#############...#############
#############...#############
#############.s.#############
#############...#############
#############...#############
#############...#############

T5 — T-junction (E, S, W open; N closed)
#############################
#############################
#############################
#############################
#############################
#############################
#############################
......s..........s.....s.....
.............S...............
......s..............s.......
#############...#############
#############...#############
#############...#############
#############.s.#############
#############...#############
#############...#############
#############...#############

T6 — Dead-end chamber (N only; chamber holds static cache)
#############...#############
#############...#############
#############...#############
#############...#############
#############...#############
#############...#############
##########.........##########
##########.s.....s.##########
##########....S....##########
##########.........##########
##########.s.....s.##########
##########.........##########
#############################
#############################
#############################
#############################
#############################
```

Remaining templates to author in step 8: 3 more L-bend rotations (NW, SE, SW), 3 more T-junction rotations (open N, open E, open W), and ~8 multi-opening / interior-maze variants. Total ~20.

### 5.3 Room transitions (LTTP-style)

- **Hard cut** — no slide, no fade.
- **Exit topology** — declared by the template (see §5.2).
- **Adjacency constraint** — map generator must place rooms so neighboring exits align positionally. If room A has E exit at row 8, room B (east of A) must have W exit at row 8. If no template fits, regenerate.
- **Player position on entry** — opposite edge from exit, aligned by row or column. Exit east at y=240 → enter from west at y=240.

### 5.4 Wave system (global)

**Replaces** the current per-level `WaveScheduler` binding. One global scheduler across the entire run.

**Run start.** 10-second grace period after the player enters the first room. Wave 1 fires at t=10.

**Triplet cadence.** 3 waves per triplet (setup → add → test), with 3-second `interWaveLullMs` between waves in a triplet. Then a random 15-60-second triplet break, then the next triplet.

**Pause conditions:**
- Player is mid-transition between rooms: wave timer pauses, resumes on entry to destination room.
- Player is in the boss arena (anchor 10): wave timer pauses for duration of boss fight.
- Player dies: timer resets entirely (map regenerates).

**Spawn location.** Waves spawn at off-map edges of the player's current room. **Bands are per opening, not per edge** (see §5.5).

**Wave size scaling (Option A — flat +1).** Authored triplets 1-3 use the existing L1-L3 wave configs as-is, except L3 wave 3 is retuned from 28 to 25 to match the cap. For triplet T ≥ 4:

```
triplet = floor((wave_num - 1) / 3) + 1
role    = (wave_num - 1) % 3  // 0=setup, 1=add, 2=test

AUTHORED = [
  [10, 14, 20],  // triplet 1 (was L1)
  [14, 20, 26],  // triplet 2 (was L2)
  [16, 22, 25],  // triplet 3 (was L3, W3 retuned 28→25)
]
AUTHORED_INTERVAL = [
  [2500, 2000, 1500],
  [2000, 1700, 1400],
  [1700, 1400, 1300],
]
L3_DATA     = [16, 22, 25]
L3_INTERVAL = [1700, 1400, 1300]

if triplet <= 3:
  enemyCount    = AUTHORED[triplet - 1][role]
  spawnInterval = AUTHORED_INTERVAL[triplet - 1][role]
else:
  enemyCount    = min(L3_DATA[role] + (triplet - 3), 25)         // +1 per triplet
  spawnInterval = max(800, L3_INTERVAL[role] - (triplet - 3) * 50)  // -50 ms per triplet
```

**Cap.** 25 per wave. **Soft cap** — when a group template fires near the cap, the whole template's enemies spawn even if it overshoots (see `WaveScheduler.tick` line 86-95). Overshoot can be up to the largest template's enemy count (currently 12 for `T_12SNAKE`).

**Projection under flat +1** (cap-clamped values):

| Triplet | setup | add | test |
|---|---|---|---|
| 1 | 10 | 14 | 20 |
| 2 | 14 | 20 | 25* |
| 3 | 16 | 22 | 25 |
| 4 | 17 | 23 | 25 |
| 6 | 19 | 25 | 25 |
| 9 | 22 | 25 | 25 |
| 12 | 25 | 25 | 25 |

*Triplet 2 add (was 26 → now 25) and Triplet 2 test (was 26 → now 25): re-tune to the cap. Note this is more aggressive than just "retune L3 W3 = 28→25"; flag the implementation chat to verify if these are intended. **Confirm with owner before implementing.** If only L3 W3 should change, AUTHORED[1][2] stays 26 and the cap only applies starting at the formula branch.

> **Open clarification:** Should the cap of 25 apply to all authored triplets (1-3), or only to the formula-extended ones (4+)? My recommendation when this was discussed was retune L3 W3 only (28→25). If the broader retune of T2 isn't desired, leave AUTHORED rows 1 and 2 untouched.

### 5.5 Wave bands — per opening

Each template declares its openings as `{ edge, rangeStart, rangeEnd }`. The wave-spawn system, at each spawn tick, picks among the **openings** of the current room (not edges). A multi-opening edge produces multiple bands.

Each band sits one tile outside the canvas along the corresponding edge, sized to the opening width. Existing `BandSpec` (`src/game/types.ts:105`) shape is reusable; per-opening generation happens at room-load time from the template.

### 5.6 Wave group templates (matrix array)

**Replace** the current 3-wide × N-tall `cells: (EnemyType | null)[][]` grid with **typed row lists** — each row is `EnemyType[]`. The visual width of a row = sum of the contained enemies' AABB widths, since each type has its own width (§5.7). This naturally packs small enemies (snakes) tightly and gives big enemies (bears) more room.

**New `SpawnTemplate` shape:**

```ts
interface SpawnTemplate {
  id: string;
  rows: EnemyType[][];  // each row is an ordered list of enemies entering together
}
```

When a row enters a band, its enemies lay out along the band's orthogonal axis at positions `cumulative_width(prior_enemies) + (enemy.width / 2)`. Row clearance cadence (`bandReadyAt`) uses the slowest enemy in the row, as today.

**Type unlock by wave # (gates the group pool):**

```
if wave_num <= 6:   pool = SNAKE_PANTHER_POOL
else:               pool = SNAKE_PANTHER_BEAR_POOL
```

- **Waves 1-6:** snake + panther only.
- **Waves 7+ (triplet 3+):** bears unlock.
- **Gibbons:** not in any wave pool yet. Deferred decision.

This means the current `L2_3_GROUP_POOL` (which includes bears) is **not** used for waves 4-6 — those use the snake+panther-only pool. Confirm with owner before implementing if this nerf to current L2 content is undesired.

### 5.7 Enemy hitboxes (AABB widths)

Anchor: player width = **1.35 ft = 32 px**. Conversion: 1 ft = 32 / 1.35 ≈ 23.7 px.

| Enemy | Width (ft midpoint) | AABB (px) | Fit notes |
|---|---|---|---|
| Player | 1.35 | 32 | canonical, 1 tile |
| Bear | 1.45 | **34** | exceeds tile — can't fit 1-tile corridors |
| Panther | 0.9 | **21** | fits 1-tile corridor |
| Gibbon | 0.65 | **15** | 2 fit side-by-side in 1-tile corridor |
| Snake | 0.165 | **4** | 8 fit linearly per tile |

**Constants to add to `src/game/constants.ts`:**

```ts
export const PLAYER_WIDTH_FT = 1.35;       // anchor for AABB sizing
export const PX_PER_FT_WIDTH = 32 / PLAYER_WIDTH_FT;  // ≈ 23.7

export const ENEMY_AABB_PX: Record<EnemyType, number> = {
  bear:    34,
  panther: 21,
  gibbon:  15,
  snake:    4,
};
```

**Keep** existing `FEET_PER_TILE = 5.5` (world distances based on player height). Dual scale: width-based for AABBs, height-based for world distances. Document this distinction in `constants.ts` comments.

### 5.8 Enemy-vs-enemy collision

**Rule.** Enemy AABBs cannot overlap each other.

**Exception.** Snakes can overlap other snakes (writhing pile / swarm pack). All other type pairs respect no-overlap.

**Pathfinding granularity.** Stay **tile-only**, plus movement-time enforcement: each step, if the new position would AABB-overlap another enemy (excluding snake-snake), reject the step and jitter (random nudge to a neighboring tile direction). If still blocked, hold position this tick.

### 5.9 Static spawn semantics

**Anchors per-template (authored).** Each of the 10 anchor rooms has a per-template static manifest. **Default: empty for prototype.** Authoring happens in step 7 (post-integration). The boss arena (anchor 10) has no statics — the boss is the entire encounter.

**Connectors per-run pool (rolled).** Each connector template declares `s` / `S` candidate tiles. At run start (or on first room entry — see §5.10), the actual statics are rolled from the candidates per the B+C density formula.

**Type rules at roll time:**
- `s` tile rolls a snake (heavier weighting) or gibbon (lighter). Once gibbon-in-waves is decided, gibbon weights may shift.
- `S` tile rolls snake, gibbon, or panther — any 1-tile-fitting type. No bears.

**Per-tile occupancy cap.** AABB no-overlap is the structural limit. The "1 per tile" framing was superseded by variable AABB sizes (see §5.7). Snakes can pack ~8 per tile linearly.

### 5.10 Static density formula (B+C hybrid)

**When density is rolled.** On the player's **first entry** to each room. **Locked thereafter** — no re-rolls on revisit. Consistent with the no-respawn rule (§5.13).

**Formula:**

```
on_first_entry(room):
  base       = template.candidate_count  // total `s` + `S` slots
  boss_room  = anchor_10.coord
  boss_dist  = manhattan(room.coord, boss_room)
  wave_num   = current global wave number

  b_modifier = max(0, BOSS_HALO_RADIUS - boss_dist)
  c_modifier = floor(wave_num / WAVE_PER_C_INCREMENT)

  target_density = base + b_modifier + c_modifier
  actual_density = min(target_density, candidate_count)

  // Now pick `actual_density` candidates uniformly at random
  // from the template's candidate list, and roll a type per
  // each per §5.9 type rules.
```

**Constants** (in `constants.ts`):

```ts
export const BOSS_HALO_RADIUS = 6;       // extra statics within 6 rooms of boss
export const WAVE_PER_C_INCREMENT = 6;   // +1 static per ~2 triplets
```

**Sample outcomes:**

| Boss distance | Wave # | Formula | Density |
|---|---|---|---|
| 25 | 1 | base + 0 + 0 | base |
| 25 | 18 | base + 0 + 3 | base + 3 |
| 5 | 1 | base + 1 + 0 | base + 1 |
| 2 | 18 | base + 4 + 3 | min(base + 7, candidates) |
| 0 (boss room) | n/a | special — no statics; boss is the encounter |

### 5.11 Static aggro

**Dormancy.** Sitter is inactive until the player **enters the room** containing it.

**Aggro delay.** **1 second** after player enters the room, all sitters in that room activate.

**Telegraph.** None for prototype. (Plan to revisit if playtest shows fairness issues.)

**Post-aggro behavior.** Activated sitters behave identically to wave-spawned enemies: pursue the player, contact-kill on AABB overlap.

### 5.12 Hunt system (4-state enemy AI)

State machine, driven entirely by spatial position and room transitions. No damage-based aggro, no threat table.

| State | Enter on | Exit on |
|---|---|---|
| Dormant | Placed at static tile (template `s`/`S` roll); room not yet entered | Player enters room → start 1 s timer (transitions to Activating) |
| Activating | Aggro timer running | Timer expires → Active |
| Active | Pursuit AI in current room (either wake-from-static or wave-spawn) | Player transitions out → Hunting |
| Hunting | Pursuing across rooms | Player room Manhattan-distance > HUNT_RANGE from hunter room → de-aggro → settle as static via BFS |

**Constants:**

```ts
export const STATIC_AGGRO_DELAY_MS = 1000;
export const HUNT_RANGE = 2;  // Manhattan, in room-grid coords
```

**Hunt range.** Computed at the moment of evaluation as `manhattan(hunter.currentRoom, player.currentRoom)`. Path history doesn't matter — only current spatial separation.

**Hunt indefinite within range.** No time-based de-aggro. As long as Manhattan ≤ 2, the hunter is hunting. Hiding doesn't work.

### 5.13 No despawn (anti-exploit)

**Rule.** Spawned enemies **never despawn**. The only way an enemy leaves the world is by being killed by the player.

**Hunter de-aggro placement (BFS, map-wide).** When a hunter de-aggros (Manhattan > 2):

1. Try to settle in the hunter's current room. Find the nearest grid tile to hunter's current position whose AABB-fit is open.
2. If no fit in current room, BFS outward through connected adjacent rooms.
3. First room with an AABB-compatible spot wins.
4. No despawn. Because rooms are large (29×17 ≈ 200+ floor tiles) and snakes are tiny, true map-wide saturation is practically impossible.

### 5.14 Family

Family currently lives in a single anchor room. Family death → run ends (existing rule). Carryover / escort / per-member branching is **deferred**.

### 5.15 Boss arena (anchor 10)

Deferred. Implement after the loop is solid. Until then, anchor 10 is the empty arena it is today; winning is "reach anchor 10."

---

## 6. Files affected

**Modified:**

- `src/game/constants.ts` — new constants per §5.7, §5.10, §5.11, §5.12.
- `src/game/Enemy.ts` — variable size per `ENEMY_AABB_PX`; AABB-vs-AABB collision; Hunt state machine; pathfinding jitter on block; entry into room logic.
- `src/game/WaveScheduler.ts` — refactor to global (no per-level binding); 10 s grace; 3-wave triplets with random 15-60 s break between; pause on transition / boss / death; per-opening band derivation; new `rows: EnemyType[][]` template shape per §5.6.
- `src/game/levels.ts` — `parseLevel` accepts `s` and `S`; existing levels (anchors) parsed with empty static defaults; introduce connector template pool entries.
- `src/game/Game.ts` — orchestrator: room grid, transitions, Hunt tracking, wave pause/resume, room first-entry detection (for static rolling), restart-resets-map.
- `src/game/Renderer.ts` — variable-size enemy rendering; room-transition camera (hard cut).
- `src/game/types.ts` — `RoomGridCoord`, `RoomTemplate`, `HuntState`, `StaticCandidate`, updated `SpawnTemplate` (rows shape), updated `GameCallbacks` (new signals for room change, etc.).
- `src/App.tsx` — UI: replace per-level HUD with run-state HUD (current room coord, wave #, etc.); remove "Level Complete" flow; replace with "Reached Boss" / boss-arena overlay.

**New:**

- `src/game/RoomGrid.ts` — 29×17 grid representation, Poisson anchor placement, connector layout, path-existence BFS check.
- `src/game/RoomTemplates.ts` — connector + anchor template definitions (ASCII grids + parsed exit declarations + candidate tile lists).
- `src/game/Hunt.ts` — Hunt state machine, Manhattan-distance evaluation, de-aggro BFS.

---

## 7. Implementation phases

### Phase 0 — this doc

Done when this doc is committed and reviewed by the owner.

### Phase A — parallel (3 independent fresh chats)

| Step | Scope | Files |
|---|---|---|
| **1** | Global wave scheduler refactor. Replace per-level binding with a single global scheduler. Triplet cadence + random break + pause logic. Run in a single existing-style arena to start (no rooms yet — gated by feature flag). | `WaveScheduler.ts`, `Game.ts`, `levels.ts`, `types.ts`, `constants.ts` |
| **2** | Per-enemy AABB sizing + enemy-vs-enemy no-overlap collision. Variable `size` per type from `ENEMY_AABB_PX`. AABB-vs-AABB rejection at movement step with jitter. Snake-snake overlap exception. | `Enemy.ts`, `constants.ts`, `Renderer.ts` |
| **8** | Connector template authoring (~14 more templates). Pure content — ASCII grids in a new `RoomTemplates.ts`. No game-logic dependencies. | `RoomTemplates.ts` (new) |

These three don't share files meaningfully. Run in parallel windows.

### Phase B — sequential (1 fresh chat)

| Step | Scope | Files |
|---|---|---|
| **3** | Room-grid generator + LTTP transitions. `RoomGrid.ts` with Poisson + path-existence. Adjacency matching at room placement. Game.ts orchestrates room state and transitions. Player position alignment on transition. Hard-cut camera. | `RoomGrid.ts` (new), `Game.ts`, `types.ts`, `Renderer.ts`, `App.tsx` |

Foundational. Must land cleanly before Phase C.

### Phase C — parallel (3 independent fresh chats)

| Step | Scope | Files |
|---|---|---|
| **4** | Hunt 4-state machine + Manhattan tracking across rooms. | `Hunt.ts` (new), `Enemy.ts`, `Game.ts` |
| **5+6** | Static spawning: candidate-tile parsing (`s`/`S`); B+C density formula; on-first-entry roll; 1 s aggro delay; hunter-runoff BFS placement; snake stacking exception integration. | `levels.ts`, `RoomTemplates.ts`, `Game.ts`, `Enemy.ts`, `constants.ts` |
| **9** | Boss-room gating. Player entering anchor 10 triggers boss-arena state. Wave timer pauses. "Reached Boss" overlay. (Boss combat itself is deferred.) | `Game.ts`, `App.tsx` |

### Step 7 — anchor static authoring

Content only. Hand-author static manifests for each of the 10 anchor templates. Can land any time post-step-5. Empty defaults are fine for prototype.

---

## 8. Definition of done — every implementation step

Each step's PR / branch must:

1. **Lint clean** — `npm run lint` exits 0; no error lines.
2. **Typecheck clean** — `npx tsc -p tsconfig.app.json --noEmit` exits 0; empty stdout.
3. **Code review** — invoke the `code-review` skill at high effort; address all findings or document why ignored.
4. **Manual verify** — run the app and exercise the new behavior in browser. The `verify` skill is the recommended path. If the step is purely refactor with no visible UI change, manual verify confirms no regression in existing flows (player movement, auto-fire, dash, burst, stamina drain, sound).
5. **Pillar/invariant check** — re-read `CLAUDE.md` §3 and `docs/INVARIANTS.md`. No pillar weakened, no invariant violated. Invoke the `junar-pillars` skill if in doubt.
6. **Docs sync** — if the step changes architecture-level behavior described in `CLAUDE.md`, update `CLAUDE.md` in the same PR. Do not let docs drift.
7. **Disposal** — any new `addEventListener`, `setTimeout`, `setInterval`, or `requestAnimationFrame` registration in `src/game/` has a matching tear-down reachable from `Game.cleanup()` (Invariant 16).

After all steps integrate to a branch:

8. **`/ultrareview`** on the integrated branch before merge to main.

---

## 9. Open items / explicitly deferred

These are knowingly out of scope for the refactor itself:

- **Boss design** — anchor 10 combat mechanics, visual treatment of the corrupted plant.
- **Family beyond single anchor** — escort behavior, multi-member carryover, multiple endings system.
- **Gibbon in wave pools** — currently static-only.
- **Static spawn telegraph** — visual / audio cue during the 1 s aggro delay.
- **Cultural consultation** — see separate brief; engage before any custom-art commission.
- **Per-anchor static authoring content** — empty defaults are acceptable for prototype.
- **Anchor 1 visual marker / minimap / "you're here" indicator** — none for prototype; reconsider after playtest.
- **Density-formula constants tuning** — `BOSS_HALO_RADIUS = 6`, `WAVE_PER_C_INCREMENT = 6` are starting values; tune in playtest.
- **Wave-cap retune scope** — confirm whether 25 cap applies to authored triplets 1-3 or only to formula triplets 4+. Roadmap currently retunes only L3 W3 (28 → 25); broader retune of T1/T2 is **not** baked in. See §5.4 note.

---

## 10. Quick reference — constants to add

```ts
// constants.ts additions (verify exact names with owner before merge)

// Width-based AABB scale
export const PLAYER_WIDTH_FT = 1.35;
export const PX_PER_FT_WIDTH = 32 / PLAYER_WIDTH_FT; // ≈ 23.7

export const ENEMY_AABB_PX: Record<EnemyType, number> = {
  bear:    34,
  panther: 21,
  gibbon:  15,
  snake:    4,
};

// Room grid
export const ROOM_GRID_COLS = 29;
export const ROOM_GRID_ROWS = 17;
export const ANCHOR_COUNT = 10;
export const MIN_ANCHOR_SPACING = 5; // Manhattan rooms

// Wave system
export const RUN_START_GRACE_MS = 10_000;
export const TRIPLET_BREAK_MIN_MS = 15_000;
export const TRIPLET_BREAK_MAX_MS = 60_000;
export const WAVE_ENEMYCOUNT_CAP = 25;
export const TYPE_UNLOCK_BEAR_WAVE = 7;

// Static density (B+C)
export const BOSS_HALO_RADIUS = 6;
export const WAVE_PER_C_INCREMENT = 6;

// Hunt
export const STATIC_AGGRO_DELAY_MS = 1000;
export const HUNT_RANGE = 2; // Manhattan, in room-grid coords
```

---

## 11. Quick reference — type changes

```ts
// types.ts additions

export interface RoomGridCoord {
  col: number; // 0..28
  row: number; // 0..16
}

export type Edge = 'N' | 'S' | 'E' | 'W';

export interface RoomOpening {
  edge: Edge;
  rangeStart: number; // tile index along the edge
  rangeEnd: number;   // inclusive
}

export type StaticCandidateKind = 'small' | 'any';

export interface StaticCandidate {
  tile: Vector2;             // world-space pixel position
  kind: StaticCandidateKind; // 's' or 'S'
}

export interface RoomTemplate {
  id: string;
  walls: boolean[][];
  openings: RoomOpening[];
  candidates: StaticCandidate[];
  // Anchors-only: a per-template static manifest. Empty for default.
  authoredStatics: { type: EnemyType; pos: Vector2 }[];
}

export type HuntState = 'dormant' | 'activating' | 'active' | 'hunting';

// SpawnTemplate refactored per §5.6
export interface SpawnTemplate {
  id: string;
  rows: EnemyType[][]; // each row's enemies enter together
}
```

---

## 12. Cross-references to this doc from implementation chats

When a future chat starts work on a step, the very first action should be:

```
Read docs/ROADMAP-traversable-maps.md in full.
Read CLAUDE.md §3 (Pillars), §8 (Distribution), §9 (Guardrails).
Read docs/INVARIANTS.md.
Invoke junar-pillars skill if any decision feels boundary-pushing.
```

Implementation chats should treat §5 as the source of truth. If a step needs a design decision not covered here, escalate to the owner before implementing — don't improvise.
