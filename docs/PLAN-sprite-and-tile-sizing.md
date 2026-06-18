# Plan: Unit sprite & jungle-tile sizing/quality pass

> **How to use this plan (read first).** This document is a *starting point*, not a
> locked spec. A later session will execute it. For **every** item below:
> 1. **Re-verify against the live code first** — line numbers, constants, and the
>    atlas may have changed since this was written (authored 2026-06-18 against
>    branch `claude/unit-sprite-dimensions-kos83o`). Re-read the cited files before
>    editing.
> 2. **Reassess the recommendation** — each item records *why* it's recommended and
>    the trade-offs. If the reasoning no longer holds, say so and adjust.
> 3. **Resolve the `OPEN —` questions** — these are decisions the owner (rbfyfe) must
>    make or values that must be picked. Do **not** guess them. Use `AskUserQuestion`
>    to confirm target sizes, art-sourcing scope, and any pillar-adjacent call before
>    writing code.
> 4. **Stay inside the guardrails** — CLAUDE.md §9 and the `procedural-rendering`,
>    `tile-grid-and-canvas-constants`, and `junar-pillars` skills apply. No new deps,
>    no AI-generated art, no share-alike (CC-BY-SA/GPL/LPC) art, collision/fairness
>    untouched unless explicitly approved.
>
> No code has been changed yet. This is analysis + a sequenced proposal only.

---

## Context

The owner reports two readability/aesthetic problems, framed against Vampire
Survivors (a genre touchstone for Junar):

1. **Units render too small.** VS basic units sit in a 24–32px band; most Junar
   units land at or below VS's *smallest* (pickup, 12–16px) tier.
2. **The jungle tree-wall pixels look bad.** They read as a flat grid of square
   stamps rather than continuous foliage.

The desired outcome is a scene where units have clear presence and the jungle
walls read as organic tree mass — at one coherent pixel scale — without breaking
the decoupled-hitbox fairness model or the procedural/sprite licensing rules.

These are **two separate problems** that happen to share a root symptom
("looks small / looks off"): a **scene-wide pixel-density incoherence**. Units are
drawn at ~1× of their source (fine pixels) while the world tiles are drawn at ×2
(chunky pixels), so nothing shares one pixel scale.

---

## Verified current state (re-confirm before editing)

### Unit rendered dimensions
All units are positioned inside a 32×32 px tile cell (`TILE_SIZE = 32`,
`src/game/constants.ts:5`).

| Unit | Source cell | Rendered (W×H) | Sizing rule | VS tier |
|------|-------------|----------------|-------------|---------|
| Player | 16×32 | **16×32** | native 1×, centered + foot-aligned | width = pickup tier |
| Wife/Son/Daughter | 16×32 | **16×32** | native 1×, α=0.7 | width = pickup tier |
| Panther (apex) | 38×28 | **21×15** | fit to AABB 21 | below basic |
| Bear | 38×26 | **34×23** | fit to AABB 34 | ~basic (width) |
| Snake | 16×16 | **16×16** | AABB 4 → 0.5 floor → 16 | pickup tier |
| Gibbon | 24×28 | **14×16** | AABB 15 → 0.5 floor → 16 | pickup tier |

Controlling constants/code:
- `SPRITE_CELL_W/H = 16/32`, `FAMILY_CELL_W/H = 16/32` (`Renderer.ts:40-41,63-64`)
- Player draw: `Renderer.ts:280-290` (native scale, `pos.x + 8` centering)
- Family draw: `Renderer.ts` `renderNpcs` (~435-445, native scale)
- Beast draw: `Renderer.ts` `drawBeast` (~355-397):
  `box = TILE_SIZE × max(ENEMY_AABB_PX[type]/TILE_SIZE, ENEMY_VISUAL_SCALE_FLOOR)`
- `ENEMY_VISUAL_SCALE_FLOOR = 0.5` (`Renderer.ts:78`)
- `ENEMY_AABB_PX = {bear:34, panther:21, gibbon:15, snake:4}` (`constants.ts:192-197`)
- `PLAYER_HURTBOX_PX = 16` (`constants.ts:210`) — **collision is already fully
  decoupled from drawn size.**

### Jungle tile atlas
- File `src/assets/sprites/jungle-tiles.png` is **128×16 px = 8 tiles × 16px, one row.**
  All 8 used: `0`=dirt floor, `1–6`=interior canopy variants, `7`=lit top-edge.
  (`JUNGLE_TILE_SRC=16`, `JUNGLE_WALL_VARIANTS=6`, `JUNGLE_WALL_TOP=7`,
  `Renderer.ts:48-50`.)
- `renderLevel` (`Renderer.ts:213-249`) checks **only the cell above**: floor→0,
  open-above→7, else hashed 1–6. **No edge/corner art exists** for left/right/
  bottom/corners, so a tree mass is a square field with a lit top lip only.
- Tiles upscale 16→32 (×2) with `imageSmoothingEnabled = false` (`Renderer.ts:187`).
- The set is the paid Time Fantasy "Jungle Tileset" (Jason Perry / finalbossblues),
  already credited (`docs/ART-CREDITS.md`) — re-extracting *more* tiles from the
  same pack is license-compatible.

---

## Problem A — Units too small

**Root finding.** Decoupled hitboxes already exist (VS's #1 recommendation is done),
so growing visuals is a render-layer-only change with **no collision/fairness
impact**. Two sub-issues: (a) absolute size is below the VS basic band, especially
unit *width*; (b) units render at finer pixel density than the ×2 world.

### A1. Match unit pixel density to the world (recommended core fix)
Draw units at an integer multiple so one screen-pixel is the same size on a tree, on
dirt, and on a character. This roughly doubles unit presence and fixes the
"high-res / out of place" look.
- Touch: `Renderer.renderPlayer`, `renderNpcs`, `drawBeast`.
- **Reassess:** confirm ×2 of source is the right factor vs. picking a smaller bump;
  check that foot-aligned drawing keeps feet on-tile when the sprite overflows the
  cell upward (precedent: bear box 34 already > 32).
- **OPEN — target size:** owner must choose the unit scale (candidates: ~1.5×,
  ~2× / "match world density", or "fill the cell"). Confirm separately for
  player/family vs. beasts if they shouldn't move together.

### A2. Flip the beast rule from "fit to AABB" to "visual ≥ AABB"
`drawBeast` currently sizes the sprite *to* the kill box, so the panther (apex
threat) draws at 21×15 — among the smallest things on screen. VS's forgiving-swarm
principle is the reverse: visible sprite **larger** than hitbox.
- Introduce a per-type **visual** multiplier independent of `ENEMY_AABB_PX` (the
  decoupling already exists — this just stops coupling visual *down* to the box).
- **Reassess:** does drawing the panther bigger than its 21px kill box hurt
  one-hit-death readability (Pillar: "deaths must feel like the player's mistake")?
  This is the key fairness check — flag to owner. Collision itself stays on
  `Enemy.getAABB`; only the drawn size changes.
- **OPEN — per-type visual sizes:** owner to confirm intended on-screen size per
  beast (panther/bear/snake/gibbon), and whether visible>hitbox is acceptable.

### A3. Raise `ENEMY_VISUAL_SCALE_FLOOR`
0.5 → ~0.7–0.75 lifts snake/gibbon out of the pickup tier into the basic band, zero
collision impact. Likely subsumed by A2 if a per-type visual size is adopted —
**reassess whether A3 is still needed once A2 is decided.**

### A4. Player/family are the biggest single gap
They draw at 1× and are the narrowest things on screen; they should be the focal
point. Likely resolved by A1, but **reassess** head-overflow framing (head extends
above the tile) and the family α=0.7 "not-yet-interactive" cue stays intact.

---

## Problem B — Jungle tree-walls look bad

**Root finding.** Two causes: (1) the atlas has **no edge/corner tiles** — only
interior + top — and `renderLevel` only inspects the cell above, so every non-top
side of a tree mass is a hard 32px square seam; (2) the art is an *autotile* used as
flat per-cell stamps, so adjacent cells don't visually connect. Adding more interior
variants will **not** help — the problem is boundaries, not variety.

### B1. Cheap, no-new-art interim — procedural canopy depth (recommended first)
Stamp a soft dark **overhang/shadow** onto floor cells directly below a wall (and
optionally a subtle edge shade on exposed left/right/bottom wall edges) in
`renderLevel`. Gives the tree mass depth and breaks the bottom seam with **zero new
art**. FX like this is explicitly in the procedural lane (`procedural-rendering`).
- **Reassess:** confirm this reads as "canopy depth" and not mud; tune alpha/extent.
- **OPEN:** is an interim acceptable, or does the owner want to go straight to the
  proper autotile (B2)?

### B2. Proper fix — richer atlas + neighbor-aware autotiling
Re-extract the full autotile (4 edges + outer corners + inner corners) from the
licensed Time Fantasy pack into a larger atlas, and extend `renderLevel` from its
single "above" check to a 4-bit (or 8-bit / 47-blob) neighbor bitmask that selects
the correct edge/corner tile. This is what makes trees read as trees.
- Touch: `src/assets/sprites/jungle-tiles.png` (regenerate), `Renderer.renderLevel`,
  the `JUNGLE_*` constants (`Renderer.ts:48-50`), possibly `constants.ts`.
- **Reassess:** confirm which autotile format the source pack provides (Wang vs.
  RPG-Maker A-tile vs. blob) — this dictates the bitmask scheme. Verify the new
  atlas stays CC0/CC-BY/paid (no share-alike) and log provenance in
  `docs/ART-CREDITS.md`.
- **OPEN — art sourcing:** who extracts/produces the expanded atlas? The owner must
  supply or approve the new tile sheet (no AI-generated art; must come from the
  already-licensed pack or another compatible source). This is the gating dependency
  for B2.

### B3. Scene-wide pixel-scale coherence (ties A and B together)
The trees aren't too chunky in isolation — ×2 is a fine VS chunk. The incoherence is
units rendering ~2× finer. Decide **one** chunk factor for the whole frame; A1's
density-match is the lever. **Reassess** this jointly once A1's factor is chosen so
trees and units share a pixel scale.

---

## Suggested sequence (reassess ordering before starting)

1. **Confirm scope & targets with owner** (`AskUserQuestion`): unit target size
   (A1), per-beast visual sizes + visible>hitbox approval (A2), interim-vs-proper
   tile fix (B1/B2), and who supplies expanded tile art (B2).
2. **A1 + A4** — unit density match (render-only, no art, no collision change). Pick
   one scale, apply to player/family/beasts, verify framing.
3. **A2 (+ A3 if still needed)** — per-type beast visual multiplier; re-check
   one-hit-death readability.
4. **B1** — procedural canopy overhang/shadow (render-only, immediate improvement).
5. **B3** — confirm units + trees now share one pixel scale; adjust.
6. **B2** — only once owner supplies/approves the expanded autotile atlas; implement
   neighbor-aware tile selection. (Largest, art-gated; can ship after the rest.)

Each step is independently shippable. Items 2–4 need no new assets; item 6 is gated
on art.

---

## Critical files

- `src/game/Renderer.ts` — `renderPlayer` (~280), `renderNpcs` (~435), `drawBeast`
  (~355), `renderLevel` (213–249); `JUNGLE_*` + `SPRITE_*` + `FAMILY_*` +
  `ENEMY_VISUAL_SCALE_FLOOR` constants (40–150).
- `src/game/constants.ts` — `TILE_SIZE` (5), `ENEMY_AABB_PX` (192), `PLAYER_HURTBOX_PX`
  (210). Per `tile-grid-and-canvas-constants`, promote any new sizing literal here.
- `src/assets/sprites/jungle-tiles.png` — atlas; regenerated only for B2.
- `docs/ART-CREDITS.md` / `docs/ART-ASSETS.md` — update provenance if the atlas grows.

## Guardrails to honor (do not violate)

- Collision/fairness model is decoupled and must stay so — **drawn size changes must
  not touch `Enemy.getAABB`, `ENEMY_AABB_PX`, `PLAYER_HURTBOX_PX`, or the kill test**
  unless the owner explicitly approves a fairness change (A2 is the one to flag).
- Sprite set is limited to the approved list; the boss, hut, arrows, FX, HUD stay
  procedural (B1 fits this). No new runtime deps. No AI-generated / share-alike art.
- Run `npm run lint` and `npm run typecheck` clean before declaring done.

## Verification

- **Visual:** run `npm run dev`, start a run; confirm (1) units have clear presence
  and share the world's pixel scale, (2) the panther reads at threat-appropriate
  size, (3) snake/gibbon are no longer pickup-sized, (4) tree masses read as bounded
  foliage with depth rather than a square grid. Capture before/after screenshots.
- **Fairness regression:** verify contact-death still triggers at the same positions
  (kill boxes unchanged) — walk a beast into the player at each type; deaths should
  feel identical to pre-change.
- **Mobile:** re-check on a `(pointer: coarse)` viewport that larger sprites don't
  overwhelm the smaller screen.
- `npm run lint` && `npm run typecheck` clean (covers app/node/api tsconfigs).
