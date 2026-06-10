---
name: junar-pillars
description: Pillar-and-guardrail gate for the Junar prototype (React + Vite + Canvas 2D HTML5 game, Adivasi archer survival in the Indian jungle). Load when working in a repo containing src/game/Game.ts and src/game/levels.ts. Every change is filtered through the six Pillars from the README and the rules in docs/INVARIANTS.md; scope creep is flagged explicitly.
---

# junar-pillars

**Filter, then suggest.** Read `docs/INVARIANTS.md` if not already in context, plus the six Pillars below. For each proposed change ask:

1. Which Pillar(s) does this serve?
2. Does it violate any invariant?
3. Is it scope creep? (If you can't tie it to a Pillar, flag it explicitly.)

## Six Pillars (CLAUDE.md §3; mirrored in README.md)

1. **Tactical positioning over twitch.** Auto-fire at the nearest enemy with clear LOS, any angle (360°). Walls block. No manual aim, click-to-fire, target selection, or lane snapping.
2. **Death is fast and fair — weighted when family is present.** One enemy hit ends solo levels; any family-member death ends the run in family levels.
3. **The corruption is the antagonist, not the beasts.** Tragic, not bloodthirsty. The boss (corrupted plant) is the real enemy.
4. **The jungle traps and channels.** Walls are dense trees; play space is narrow paths and small clearings.
5. **Readable at a glance.** Procedural pixel rectangles for every entity except the player (sole sprite-asset exception, owner-approved 2026-05-10).
6. **Short prototype, tight scope.** Ten hand-authored anchor levels — the tenth is the boss arena — placed as anchors in the generated room grid. Resist scope creep until the loop is solid.

## Scope-creep prompts (flag these explicitly before writing code)

- New enemy type → Pillar 5 + Invariant 3. Approved roster is exactly `panther / snake / gibbon / bear`.
- New input method (gamepad, mouse-aim, etc. — touch/mobile via `src/MobileControls.tsx` is already approved and shipped) → Pillar 1 + Invariant 1. Auto-fire only.
- Ranged enemy attack → Pillar 1 + Invariant 2. Contact-only.
- New dependency → Invariant 9 (allow-list: `react`, `react-dom`, `lucide-react` + dev toolchain).
- Sprite asset for any non-player entity → Invariant 4.
- Engine migration, WebGL, or state library → Invariants 5, 6.
- Written dialogue or VO → Invariant 13. "…" bubbles only.
- New magic number in `src/game/*.ts` (other than `constants.ts`) → Invariant 7.
- `Date.now()` in simulation code → Invariant 8. Use `currentTime` from `gameLoop`.

## When in doubt

If a request can't be tied to a Pillar and would expand scope, say so before writing code: "This doesn't map to a Pillar — confirm before I implement."
