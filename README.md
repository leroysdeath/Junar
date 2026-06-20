# Junar

A browser-based 2D top-down survival prototype. You are an Adivasi-coded archer in a pre-industrial Indian jungle, auto-firing arrows at infected wildlife while traversing a procedurally generated maze of jungle paths toward the corrupted plant poisoning it all. Your family is your reason — and, eventually, your escort.

**Working title:** "Jungle Archer" (shown in-game during prototyping). **Release title:** "Jungle X". **Repo codename:** Junar.

The beasts — black panther, sloth bear, Indian rat snake, Hoolock gibbon — are not villains. They are victims of a corruption seeping from a monstrous plant deep in the jungle. The tone is tragic, not bloodthirsty: you kill wildlife because there is no other choice, and the world is worth saving.

## Running it

```
npm install
npm run dev        # Vite dev server → http://localhost:5173
```

Quality gates (both must be clean before any change is "done"):

```
npm run lint       # eslint over src/ and api/
npm run typecheck  # tsc over src/, vite.config.ts, and api/
```

Stack: React 18 + TypeScript + Vite + Tailwind + lucide-react — and deliberately nothing else. All game logic is plain TS in `src/game/`; React is only the shell. No test runner; behavioral verification drives the dev server directly.

## How it plays

Move with WASD/arrows (mobile: floating touch joystick). Arrows auto-fire at the nearest enemy in line of sight — there is no fire button. Every enemy kills on touch; one hit ends the run. Sprint (Shift, or the A button on mobile) boosts your move speed for a few seconds; Burst (Space/B) doubles your fire rate briefly. Both draw from a shared Energy pool. Each run generates a fresh grid of rooms: traverse it, survive the waves, reach the boss arena.

## Pillars

Every change must serve at least one of these. If a proposed change weakens a pillar, it gets pushed back on before implementation. (Cited by `docs/INVARIANTS.md`; the wording here intentionally mirrors `CLAUDE.md` §3.)

- **Tactical positioning over twitch.** Auto-fire targets the nearest enemy with a clear sightline at any angle (full 360°). Combat is still about *where you stand*, not *when you click* — walls block raycasts, so positioning around chokepoints, corners, and corridors is what creates and denies shots. No manual fire or click-to-aim without explicit owner approval.
- **Death is fast and fair — and weighted when family is present.** One enemy hit on the player ends solo levels; in family levels, any family member's death also ends the run. Deaths must always feel like the player's mistake.
- **The corruption is the antagonist, not the beasts.** The beasts are victims of an infection. Tone is tragic, not bloodthirsty. The boss — a monstrous plant exuding black goo — is the real enemy.
- **The jungle traps and channels.** Walls are dense trees; the playable space is narrow paths and small clearings. Power comes from reading the maze and forcing chokepoints.
- **Readable at a glance.** Procedural pixel-rectangle rendering is the direction for family, beasts, walls, and FX: every entity must be identifiable in one frame. The player is the single sprite-asset exception (CC0 LTTP-style sheet, owner-approved 2026-05-10 for playtesting fidelity) — the readability standard still applies, and the procedural rule still holds for everything else.
- **Short prototype, tight scope.** Ten levels, one boss arena. Resist scope creep until the prototype loop is solid.

## Where things live

- `CLAUDE.md` — the project knowledge base: vision, mechanics reference, scope, guardrails. The source of truth; read it first.
- `docs/INVARIANTS.md` — hard rules that must hold after any commit, phrased as evaluator-checkable predicates.
- `docs/ROADMAP-traversable-maps.md` — design + implementation status of the room-grid refactor.
- `docs/IDEATION.md` — design backlog; ideas under exploration, not committed to any build tier.
- `src/game/` — all game logic, plain TS. `api/crash.ts` — Vercel Edge crash sink (crash report → GitHub issue).

## Distribution

The end target is **Steam** (via a Tauri wrap of the existing web build — Tauri is a wrapper, not an engine migration). Vercel deploys are for testing and playtest previews only.
