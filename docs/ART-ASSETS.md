# Junar — Art Asset Commission Manifest

This doc is the commission brief for sourcing real art for Junar / **Jungle X**.
It is the spec a commissioning pass works against — whether that's the owner
hiring a pixel artist directly, posting a brief to a marketplace, or evaluating
portfolio samples. It mirrors `docs/AUDIO-ASSETS.md` in structure.

CLAUDE.md is the source of truth for committed design. **Integration status
matters here more than it does for audio:** per the Pillars and
`docs/INVARIANTS.md` Invariant 4, the **player is the only entity allowed to
use a sprite asset** — everything else renders procedurally in `Renderer.ts`.
Commissioning art does not by itself change that; each section below is tagged:

- **INTEGRABLE NOW** — a sprite path already exists, or the asset never touches
  the engine (store/marketing art).
- **SCOPE ADDITION** — integrating it in-engine requires the owner to formally
  extend the sprite exception (amend CLAUDE.md §9 + Invariant 4) first.
  Commissioning ahead of that decision is fine — just know the art sits on the
  shelf until the rule changes.

---

## Hard constraints (read before commissioning)

- **Ownership: work-for-hire / full-rights transfer, in writing.** End target
  is a paid Steam release (CLAUDE.md §8). The contract must grant exclusive
  commercial rights including modification and redistribution inside the game.
  This is also the clean answer to the LPC license problem flagged in
  `docs/IDEATION.md` §8 — a commissioned player sheet we own outright beats a
  CC-BY-SA composite we'd have to credit and share-alike.
- **Style: pixel art, hard edges, no anti-aliasing against transparency.**
  The renderer runs with `imageSmoothingEnabled = false` and the game is
  pixel-rectangle aesthetic throughout. Assets must be authored at native
  resolution (1×) on the sizes specified per row — not downscaled from HD.
- **Readable at a glance (Pillar 5).** Every entity must be identifiable in a
  single frame at gameplay zoom. Silhouette first, detail second. If a sample
  needs squinting at 100% zoom on a 32 px tile, it fails.
- **Cultural representation (CLAUDE.md §9, Invariant 14).** The protagonist
  and family are Adivasi/tribal-Indian. **No feathered headdresses, no generic
  "tribal" stereotype cues, no _Jungle Book_ character likenesses** (style
  inspiration only). Cues stay minimal and dignified: deep warm-brown skin,
  short black hair, cream cotton garments, dark waist sash. Put this paragraph
  verbatim in any character brief.
- **Tone: tragic, not bloodthirsty.** The beasts are infected victims; the
  corruption (black goo) is the antagonist. No gore, no snarling-monster
  framing. Infected cues are oily-black streaks/sheen and a sickly glow —
  "wrong," not "evil."
- **Palette anchors.** Match or harmonize with the in-engine palette:
  - Jungle/walls: `#228B22` / `#32CD32` / `#90EE90`; floor tan `#D2B48C`
  - Corruption (canonical, from `Renderer.ts`): oily black `#0B0A10`, purple
    tendril `#1C1426`, sheen `#5B2A86`, sickly vein `#6B8E23`, heart glow
    `#9ACD32` / `#D9F99D`
  - Burst aura golds: `#FFC857` / `#FFD97A`
- **Geometry anchors.** Tile = **32 px**; playfield = 29×17 tiles =
  **928×544 px**; current player sprite cell = **16×32 px**, 4-frame walk per
  direction, rows = down/right/up/left.
- **No written dialogue in any art** (Invariant 13). Cut-scene or marketing art
  may include "…" bubbles only — no captions, no speech.

---

## Delivery format

- **In-engine sprites:** PNG with transparency, uniform cell grid, no padding
  bleed between cells, 1× native resolution. Include the source file
  (`.aseprite` preferred, or layered equivalent) so we can re-export.
- **Marketing/store art:** layered source (PSD/Krita/Aseprite) + flattened
  PNG/JPG at the listed pixel dimensions.
- Drop in-engine files in `src/assets/` named `lowercase-hyphenated.png`
  matching the **Key** column; marketing files in `art/` at repo root (create
  it — it's not part of the Vite build).

---

## 1. Marketing & store art — INTEGRABLE NOW (never touches the engine)

No engine constraint applies; this is the safest work to commission first and
it's required for Steam regardless of any in-engine art decision.

| Key | Asset | Size (px) | Direction | Notes |
|-----|-------|-----------|-----------|-------|
| `key-art` | Hero illustration | ~3840×2160 master | The archer at a jungle chokepoint, family behind him, corruption creeping at the edges — tragic, protective, dignified. Painterly or hi-bit pixel both fine | Source for all capsule crops below; commission this once, crop many times |
| `logo-wordmark` | "Jungle X" logo | vector or ≥2000 px wide, transparent | Final title is **Jungle X** (not "Jungle Archer" — that's the working title) | Needed for every capsule + library logo |
| `steam-capsules` | Steam capsule set | header 920×430; small 462×174; main 1232×706; vertical 748×896; library 600×900; library hero 3840×1240; library logo 1280×720; page bg 1438×810 | Crops/recompositions of key art + wordmark | **Verify sizes against current Steamworks docs at submission time** — Valve revises them |
| `app-icon` | Tauri/desktop icon | 1024×1024 master (exports: 512/256/128/32 PNG, `.ico`, `.icns`) | Single read-at-16px mark — bow silhouette or the goo heart | Needed for the Tauri wrap (roadmap step 10) |
| `community-icon` | Steam community icon | 184×184 | Crop of app icon | Same verify-at-submission caveat |

## 2. Player sprite sheet — INTEGRABLE NOW (the one approved sprite slot)

Replaces the prototype's CC0 ArMM1998 placeholder. The renderer
(`Renderer.renderPlayer`) already consumes a sheet, so a commissioned sheet on
the same layout drops in with zero rule changes. This is the highest-value
in-engine commission.

| Key | Asset | Spec | Direction |
|-----|-------|------|-----------|
| `player-sprite` | Adivasi archer sheet | 16×32 px cells (or 32×32 if proportions need it — flag it; renderer math changes), 4 directions (rows: down/right/up/left), 4-frame walk loop per direction. **Stretch goals:** bow-draw/release loop timed to read inside the 500 ms auto-fire cooldown; 2-frame idle; death frame | Male, adult, husband/father. Deep warm-brown skin, short black hair (**no headdress**), cream cotton tunic with dark waist sash (dhoti-coded), bow held offhand left, leather quiver at right hip. Dignified posture; he is protecting his family, not rampaging |

If the artist proposes a larger cell (24×32, 32×32), accept only if the figure
still reads inside one 32 px tile next to 32 px enemies — get a mockup against
the tan floor `#D2B48C` before approving.

## 3. Family character sheets — SCOPE ADDITION (Invariant 4)

Family currently renders as translucent procedural placeholder rectangles;
giving them sprites extends the sprite exception and needs the owner to amend
the rule first. Worth commissioning alongside the player for style consistency
if the decision is going that way — same artist, same session.

| Key | Asset | Spec | Direction |
|-----|-------|------|-----------|
| `family-wife` | Wife sheet | Same layout as player sheet | Adult woman, same cultural cues as player (cream garment, dark hair, no stereotype props). Reads as capable, not damsel |
| `family-son` | Son sheet | Same layout, smaller figure (~12×24 in a 16×32 cell) | Boy; distinct silhouette from daughter at a glance |
| `family-daughter` | Daughter sheet | Same layout, smaller figure | Girl; distinct silhouette from son at a glance |

All three need walk loops (they escort/follow) and — for the Level 10 boss
fight where they become combatants — a simple attack or brace pose each.
Death/fall frame: **one dignified collapse frame**, no gore (their death ends
the run; the moment must read as loss, not spectacle).

## 4. Beast sheets + infected variants — SCOPE ADDITION (Invariant 4)

The four approved beasts (and **only** these four — Invariant 3) render
procedurally today; roadmap step 4 (infected black-goo accents) is currently
planned *within* procedural rendering. Commission these only if the owner
decides on a full sprite pass. Each beast needs a **healthy-read base** plus an
**infected overlay/variant** (oily streaks, `#5B2A86` sheen, glowing eyes)
because the corruption arc may eventually show both states.

| Key | Asset | Spec | Silhouette / direction |
|-----|-------|------|------------------------|
| `beast-panther` | Black panther (Indian leopard) | 32×32 cells, 4-dir, 4-frame run loop | Sleek, low-slung, fast — it animates at 395 px/s so the run cycle must read at speed. Near-black `#1a1a1a` body, gold eyes `#FFD700` |
| `beast-bear` | Sloth bear | 32×32 cells, 4-dir, 4-frame lumber loop | Chunky, fills the tile (~30 px visible; its 34 px AABB can't fit 1-tile corridors — bulk is gameplay information). Shaggy dark brown `#4a3c28`/`#5a4c38` |
| `beast-snake` | Indian rat snake | 32×32 cells, 2–4 frame slither loop (direction optional — thin zigzag reads omnidirectionally) | Very thin — its 4 px AABB means many stack per tile; the sprite must stay a sliver, not fatten up. Olive `#2F4F2F`/`#556B2F` |
| `beast-gibbon` | Hoolock gibbon | 32×32 cells, 4-dir, 2–4 frame creep loop | Long arms are the signature trait; near-stationary creeper. Sandy gold `#B8860B`/`#DAA520` to separate from panther/bear darks |

Per-beast death pop: a 2–3 frame dissolve/slump, tragic tone — they're
victims. No blood sprays.

## 5. Boss — corrupted plant — SCOPE ADDITION (Invariant 4)

Boss combat is still deferred (roadmap §5.15); the arena currently shows a
procedural goo pool with a pulsing heart (`renderCorruptedGrowth`), which is
the canonical visual seed. Spec it now so a commission can start when boss
design lands.

| Key | Asset | Spec | Direction |
|-----|-------|------|-----------|
| `boss-growth` | Corrupted plant boss | Multi-tile, ~5×4 tiles (160×128 px) ground footprint + vertical growth; idle pulse loop (3–4 frames), hit-react flash, 4–6 frame death/wither | Monstrous plant exuding black goo. Use the canonical goo palette (`#0B0A10` mass, `#1C1426` tendrils, `#5B2A86` sheen, `#9ACD32`/`#D9F99D` pulsing heart). The heart is the readable weak point/touch target. Organic, oily, *wrong* — not a cartoon villain face |

## 6. Environment tileset — SCOPE ADDITION (Invariant 4)

Walls and floor are flat procedural fills today. A tileset is the biggest
visual lift but also the biggest rule change — it converts the whole world to
image assets. Commission last, if at all for the prototype.

| Key | Asset | Spec | Direction |
|-----|-------|------|-----------|
| `tiles-jungle` | Wall + floor set | 32×32 tiles: dense-tree wall (with edge/corner variants so corridors read), dirt path floor (2–3 variants), doorway/opening accent | Walls are untraversable jungle, not bricks — canopy greens `#228B22`–`#90EE90`, floor tan `#D2B48C`. Corridors and chokepoints must stay high-contrast: the maze *is* the gameplay |
| `tiles-corrupted` | Corruption overlay tiles | 32×32 overlays: goo-veined floor, infected tree | For the boss approach / corruption-spread arc; goo palette |
| `prop-hut` | Family hut | fits 1×1 tile (32×32), or 2×2 (64×64) if the owner approves a footprint change | Woven walls + thatched roof per current placeholder (`#8B6F47`/`#5D4037`); the hut is the hut-attack branch trigger, so it must be instantly recognizable and feel worth protecting |

## 7. FX & pickups — SCOPE ADDITION (Invariant 4), low priority

Arrows, the burst aura, hit flashes, and the materialize flash are all
procedural and already read well. Only commission if a full sprite pass
happens; otherwise skip.

| Key | Asset | Spec |
|-----|-------|------|
| `fx-arrow` | Arrow projectile | ~24×8 px, drawn pointing right (engine rotates); shaft `#4a3c28`, fletching `#8B4513` |
| `fx-hit` | Hit spark | 3–4 frame 16×16 burst, soft, non-gory |
| `fx-death-pop` | Generic enemy death | 3–4 frame 32×32 dissolve, tragic tone |

## 8. Cut-scene vignettes — SCOPE ADDITION, deferred (CLAUDE.md §2)

Inter-stage cut-scenes are explicitly out of scope until the main loop is
solid, and are currently spec'd as *procedural-rectangle* vignettes. Do not
commission yet. When greenlit: a handful of single-screen illustrated frames
(928×544) carrying the corruption arc — harmony → infection → loss →
confrontation — **dialogueless**, "…" bubbles only.

---

## Suggested commission order

1. **Player sprite sheet** (§2) — only in-engine slot open today; replaces the
   placeholder and settles the LPC-license question for good.
2. **Logo/wordmark + key art** (§1) — needed for Steam no matter what; long
   lead time; does not touch the engine.
3. **Steam capsule set + icons** (§1) — derived from #2.
4. *Decision gate:* owner rules on extending the sprite exception
   (Invariant 4). If extended → family (§3), then beasts (§4), then boss (§5),
   then tiles (§6), FX (§7) last. If not → §3–§7 stay procedural and this
   manifest ends at #3.

## Commissioning checklist (per asset)

- [ ] Brief sent includes: spec row, palette anchors, cultural-representation
      paragraph (for any human figure), tone paragraph (for any beast/boss)
- [ ] Contract grants exclusive commercial rights / work-for-hire, in writing
- [ ] Sample/WIP reviewed at 100% zoom on a 32 px grid against `#D2B48C` floor
      — passes the one-frame readability test
- [ ] Human figures reviewed against Invariant 14 (no headdress/stereotype
      cues, no *Jungle Book* likeness)
- [ ] Final delivered as spec'd PNG + layered source, named to the **Key**
- [ ] In-engine assets: integration only proceeds if the section's scope tag
      allows it (or the owner has amended Invariant 4 in CLAUDE.md +
      `docs/INVARIANTS.md`)
