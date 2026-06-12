# Junar — Art Asset Manifest

This doc is the planning spec for replacing Junar's procedural Canvas 2D
entity art (`src/game/Renderer.ts`) with sprite assets from free libraries —
the visual counterpart to `docs/AUDIO-ASSETS.md`. Owner-directed 2026-06-11.

> **This is a pillar change, tracked deliberately.** Pillar 5 and CLAUDE.md
> §9 currently mandate procedural pixel rectangles for every entity except
> the player (the sole owner-approved sprite exception, 2026-05-10), and
> `docs/INVARIANTS.md` Invariant 4 enforces it. This manifest is the sourcing
> spec only — **no sprite lands in code until the owner greenlights its tier
> below**, and each landing must update CLAUDE.md (§3 Pillars, §6 Rendering,
> §9 Guardrails), Invariant 4, and the `procedural-rendering` skill so the
> docs never disagree with the code.

CLAUDE.md remains the source of truth for committed design. Move greenlit
tiers toward "done" as decisions and files land.

---

## Hard constraints (read before sourcing)

- **Human-made only — no AI-generated art** (owner policy 2026-06-11; applies
  to ALL shipped assets, art and audio alike — see the matching constraint in
  `docs/AUDIO-ASSETS.md`). The Steam release must contain only human-created
  assets. Free libraries increasingly host AI-generated uploads: check the
  asset's description, author profile, and any AI tags before accepting, and
  skip anything ambiguous about provenance.
- **License must allow commercial use + redistribution.** End target is a
  paid Steam release (CLAUDE.md §8). **CC0 / public domain strongly
  preferred.** CC-BY acceptable with attribution logged in
  `docs/ART-CREDITS.md` (title, author, source URL, license, changes).
  **PAID royalty-free packs are acceptable** when the license covers
  commercial use and shipping the art inside a game build (owner decision
  2026-06-11). **Share-alike is rejected outright** (owner decision
  2026-06-11): no CC-BY-SA, no GPL — which rules out LPC and the LPC
  generator entirely (this also resolved `docs/IDEATION.md` §8: the answer
  is no-LPC). **Reject** NC, ND, and unclear-license rips.
- **Style coherence with the player sprite.** The player uses ArMM1998's
  "Zelda-like tilesets and sprites" pack (CC0, opengameart.org) at LTTP-scale
  texel density (16 px-wide character cells). Mixing pixel densities reads as
  broken; source beasts/tiles at the same density. **That same pack ships
  tilesets, objects, and some characters — check it first** for anything we
  need, since it's guaranteed style-coherent and CC0.
- **Readability is still the pillar.** Sprite or rectangle, every entity must
  be identifiable in one frame at 32×32 (Pillar 5). A sprite that muddies the
  silhouette is worse than the rectangles it replaces.
- **No new tech.** Drawing stays `ctx.drawImage` on the existing Canvas 2D
  context (`imageSmoothingEnabled = false`, integer coordinates), assets
  imported as bundled PNGs via Vite exactly like `player-sprite.png` in
  `Renderer.ts`. No sprite/animation library, no WebGL, no new dependencies
  (CLAUDE.md §9). Tauri-safe by construction.
- **Sprites are render-only swaps.** Collision is independent of art:
  `ENEMY_AABB_PX`, `PLAYER_HURTBOX_PX`, the 32 px cell/arrow-hit box, and all
  kill/wall rules are untouched. A swap replaces the body of one `renderX`
  method; `Game.render()` z-order and every gameplay number stay as they are.
- **Tone guardrails carry over.** Beasts are infected victims, not monsters —
  no demonic/gory sprite styling (CLAUDE.md §9). Family art must be
  Adivasi-coded, dignified, minimal: no feathered headdresses, no generic
  "tribal" stereotype, no *Jungle Book* likeness.
- **File budget:** indexed-color PNG sheets; keep the whole
  `src/assets/sprites/` footprint small for the ~5–10 MB Tauri goal.

---

## Naming & placement convention

- Drop files in **`src/assets/sprites/`** (create it), one sheet per entity,
  named to the **Key** column: `lowercase-hyphenated.png` (e.g.
  `panther.png`, `tree-wall.png`).
- The existing `src/assets/player-sprite.png` stays where it is (already
  wired); migrate it into `sprites/` only as part of a deliberate cleanup.

---

## Tier 1 — Beasts (GREENLIT 2026-06-11; sourced, awaiting owner purchase)

**Status:** greenlit by the owner 2026-06-11. Sourcing decided after a
license/provenance-verified sweep of OGA, itch.io, and paid packs: **Time
Fantasy "Animals Sprite Pack" ($5) + "Animals Sprite Pack 2" ($6) by Jason
Perry (finalbossblues)**, bought on itch.io (NOT the Steam RPG-Maker DLC,
which is engine-locked) — bear from pack 1; tiger black-recolored → panther
and monkey → gibbon from pack 2; snake from pack 2 if present, else the
free Tiny Tiny Heroes snake (CC-BY 4.0, thkaspar.itch.io/tth-animals — a
16 px sliver on screen, the least visible cross-artist seam). Both TF packs:
4-dir walks, 16×16 SNES density, "No generative AI was used" tags,
royalty-free commercial license (no standalone redistribution; in-game
shipping is the intended use). **Integration is blocked until the owner
provides the purchased zips**; the procedural beast bodies render meanwhile.
No free pack covers a feline panther or a 4-dir primate — verified across
an 18-agent research sweep, 2026-06-11.

Replaces the procedural bodies of `renderPanther` / `renderBear` /
`renderSnake` / `renderGibbon`. All four should come from one pack (or one
artist) so the bestiary reads as a set. Drawn size today scales to the
per-type `ENEMY_AABB_PX` with a 0.5 readability floor
(`ENEMY_VISUAL_SCALE_FLOOR`, `Renderer.ts`) — sprite swaps should keep each
type's relative bulk: bear biggest, snake smallest-but-visible.

| Key | Replaces | Sheet spec | Identity / direction |
|-----|----------|------------|----------------------|
| `panther` | `renderPanther` | 4-dir walk, 2–4 frames/dir, ~32×32 cells | Black panther (Indian leopard) — sleek, low, fast silhouette; dark coat |
| `bear` | `renderBear` | 4-dir walk, 2–4 frames/dir, ~32×32 cells (bulk may touch cell edges) | Sloth bear — shaggy, heavy, pale chest mark; reads bigger than panther |
| `snake` | `renderSnake` | 2–4 frame slither loop; thin horizontal/vertical poses or 4-dir | Indian rat snake — thin olive-brown sliver; many can share a tile, so silhouette must stay minimal |
| `gibbon` | `renderGibbon` | 2–3 frame idle/creep, 4-dir optional (near-stationary) | Hoolock gibbon — long arms, dark body, pale brow marks |

**Infected look (owner decision 2026-06-11):** infection shows **only as red
eyes** (`INFECTED_EYE_RED` in `Renderer.ts`); beast bodies look like normal
wildlife, and black goo is boss-only. For sprite sourcing this means: source
*normal-looking* animal sheets (no corrupted/monstrous variants needed), and
keep the red-eye cue as a small procedural overlay drawn on top of the
sprite — one treatment across sprite and procedural eras, no per-beast
"infected" variant sheets.

## Tier 2 — Family (GREENLIT 2026-06-11; LANDED)

**Status:** greenlit 2026-06-11; sheets landed the same day with the owner's
pick: **Charles Gabriel (Antifarea)'s CC-BY 3.0 charsets** from
OpenGameArt — wife = female Townfolk ("Twelve 16x18 RPG sprites, plus
base"), son = Child M and daughter = Child F ("Twelve more characters + 3
free characters and a child template"). Recolored to the Adivasi direction
(player-matched warm-brown skin + black hair; cream apron / red dress,
red-cream striped tunic, turmeric-ochre top; jeans → earth-brown shorts) and
recomposed to 48×72 sheets (3 walk cols × 4 dir rows of 16×18, row order
matching the player sheet: down/right/up/left) in `src/assets/sprites/`
(`family-wife.png`, `family-son.png`, `family-daughter.png`). Attribution
logged in `docs/ART-CREDITS.md`. Per-asset checklist completed for all three
(game-scale readability verified on the tan floor). `renderNpcs` draws the
down-facing idle frame, translucent, cycling wife/son/daughter by `N`-marker
index; the sheets carry full 3-frame 4-dir walks so the future
`FamilyMember` entity (CLAUDE.md §7 step 5) can animate without re-sourcing.

| Key | Replaces | Sheet spec | Identity / direction |
|-----|----------|------------|----------------------|
| `family-wife` | `renderNpcs` slot | 4-dir walk, matches player density (16×32 cells) | Adult woman, sari/tunic-coded, dark hair — dignified, minimal cues |
| `family-son` | `renderNpcs` slot | 4-dir walk, smaller cell | Boy, simple tunic |
| `family-daughter` | `renderNpcs` slot | 4-dir walk, smaller cell | Girl, simple tunic |

Cultural-representation guardrails (CLAUDE.md §9, `protagonist-and-family-tone`
skill) apply to every candidate sheet; when in doubt, show the owner before
committing.

## Tier 3 — Environment tiles (NOT GREENLIT — stays procedural)

**Status: not greenlit (owner decision 2026-06-11).** Tree walls, floor, and
hut keep their procedural rendering. Do not source or land tiles for this
tier without a fresh owner decision.

The most visible swap per pixel: every frame is mostly walls and floor.

| Key | Replaces | Sheet spec | Identity / direction |
|-----|----------|------------|----------------------|
| `tree-wall` | wall branch of `renderLevel` | 32×32 tile (single tile; autotiling/edge variants are explicitly out of scope for the first pass) | Dense jungle canopy/trunk block — must read as "impassable tree", not hedge |
| `floor-dirt` | floor branch of `renderLevel` | 32×32 tile, 1–3 subtle variants max | Tan jungle path — must stay quiet so entities pop (readability pillar) |
| `hut` | `renderHuts` | single ~32×32 (or 2×2-tile) image | Family hut — thatch/wood, pre-industrial, warm |

ArMM1998's pack (the player sprite's source) includes LTTP-style tilesets —
first candidate for guaranteed coherence.

## Tier 4 — Keep procedural (CONFIRMED 2026-06-11)

**Status: the keep-procedural recommendation below is owner-confirmed
(2026-06-11).** Arrows, burst aura, FX, and the plant boss stay code-drawn.

Arrows, the burst aura, the LOS indicator, the doorway materialize flash,
hit/death FX, and the **corrupted growth / plant boss** should stay
procedural. The FX are readability tools, not art surfaces; and the boss's
oily, pulsing goo animates better as code (the `GOO_*` palette work already
landed) than as a looping sheet. Spec boss sprites only if the eventual boss
combat design (roadmap §5.15) demands forms code can't deliver.

---

## Recommended free sources

- **ArMM1998 — "Zelda-like tilesets and sprites"** (opengameart.org, CC0) —
  the player sprite's own pack; style-coherent by definition. Check first.
- **OpenGameArt.org** — filter CC0; search "LTTP", "zelda-like", "16x16
  rpg", "animal sprites".
- **Kenney.nl** — CC0, though mostly a different (chunkier) pixel density —
  verify coherence before adopting.
- **itch.io** — many CC0 16-px jungle/animal packs; re-confirm license per
  pack page.
- **LPC / Universal LPC generator** — **rejected (owner decision
  2026-06-11):** CC-BY-SA/GPL share-alike terms are not accepted on the art
  layer. Kept here only so nobody re-proposes it; see the archived analysis
  in `docs/IDEATION.md` §8.

Always re-confirm the license on the asset's own page at download time.

---

## Sourcing checklist (per asset)

- [ ] Tier greenlit by owner (this is the pillar-change gate)
- [ ] File found and previewed at game scale (32×32 on a tan floor — it reads in one frame)
- [ ] Human-made provenance confirmed — not AI-generated (owner policy 2026-06-11)
- [ ] Pixel density matches the player sprite (LTTP-scale)
- [ ] License is CC0 (preferred) or CC-BY; commercial + redistribution OK
- [ ] If CC-BY: entry added to `docs/ART-CREDITS.md`
- [ ] Named to the **Key**, placed in `src/assets/sprites/`
- [ ] Renderer swap done as a render-only change (collision/AABB untouched)
- [ ] CLAUDE.md §3/§6/§9, `docs/INVARIANTS.md` Invariant 4, and the `procedural-rendering` skill updated to record the approved exception
