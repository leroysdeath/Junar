# Junar — Art Credits & Attribution Log

Every non-CC0 art asset shipped in the game is logged here per the license
policy in `docs/ART-ASSETS.md` (CC-BY needs attribution; paid royalty-free
needs its license terms recorded). This file is the source for the in-game /
Steam-page credits screen when it gets built.

---

## CC-BY attributions (required)

### Family sprites — wife, son, daughter (RETIRED 2026-06-15)

- **Status: RETIRED 2026-06-15** — replaced by Time Elements modular composites
  (see the paid royalty-free section below); these Antifarea sheets no longer
  ship. Attribution retained here for provenance.
- **Titles:** "Twelve 16x18 RPG sprites, plus base" (wife — female Townfolk)
  and "Twelve more characters + 3 free characters and a child template"
  (son — Child M; daughter — Child F)
- **Author:** Charles Gabriel (Antifarea). Commissioned by OpenGameArt.org
  (https://opengameart.org) — the license requires attributing the author
  and linking back to OpenGameArt.org.
- **Sources:**
  - https://opengameart.org/content/twelve-16x18-rpg-sprites-plus-base
  - https://opengameart.org/content/twelve-more-characters-3-free-characters-and-a-child-template
- **License:** CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/)
- **Changes:** background keyed to transparency; palette-recolored to
  Junar's Adivasi family direction (deep warm-brown skin and black hair
  matching the player sprite's palette; wife's dress kept red with the cream
  apron re-toned, son's jeans recolored to earth-brown shorts, daughter's
  pink hair recolored black and top re-toned to turmeric ochre); frames
  recomposed into 48×72 sheets (3 walk columns × 4 direction rows of 16×18,
  rows reordered to down/right/up/left). Shipped as
  `src/assets/sprites/family-wife.png`, `family-son.png`,
  `family-daughter.png`.
- **Suggested credit line:** "Family character sprites by Charles Gabriel
  (Antifarea), commissioned by OpenGameArt.org — CC-BY 3.0; recolored and
  recomposed for Jungle X."

### Snake sprite

- **Status: LANDED 2026-06-12** (Time Fantasy Animals 2 contains no snake,
  so the planned CC-BY fallback is in use).
- **Title:** "Tiny, Tiny Heroes - Animals"
- **Author:** Kacper Woźniak (thkaspar)
- **Source:** https://thkaspar.itch.io/tth-animals
- **License:** CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
- **Changes:** greens recolored to olive (Indian rat snake); side row
  h-flipped for the left facing; frames recomposed into a 3×4 sheet.
  Shipped as `src/assets/sprites/snake.png`.
- **Required credit line:** "'Tiny, Tiny Heroes - Animals' by
  Kacper Woźniak (thkaspar) — https://thkaspar.itch.io/tth-animals —
  CC BY 4.0; recolored for Jungle X."

---

## Paid royalty-free licenses (recorded, attribution optional)

### Player sprite — Adivasi archer

- **Status: LANDED 2026-06-15** (owner reopened the player sprite 2026-06-14,
  paid OK; Core Set purchased on itch.io 2026-06-15). Replaces the prior
  ArMM1998 CC0 sheet.
- **Title:** "Time Elements: Character Core Set" ($20)
- **Author:** Jason Perry (finalbossblues), timefantasy.net — the same art line
  as the beasts and the jungle tileset.
- **Source:** https://finalbossblues.itch.io/time-elements-character-core-set
- **License:** Time Fantasy royalty-free terms (creator's published statement on
  the product page): "you are welcome to use these assets in any commercial
  project … no restrictions on how you use them within your game"; recolors and
  edits allowed; no standalone redistribution of the raw assets. Listing tagged
  "No generative AI was used" and carries no AI-adjacency clause (clean for this
  AI-assisted repo).
- **Changes:** composited from modular pieces (head1 + bottom1 + top10 + hair7)
  recolored to the Adivasi palette (deep warm-brown skin, black hair, cream
  tunic, dark dhoti, dark eyes); the `bow1` stave seated in the offhand per
  facing as a wood-recolored overlay; walk frames repacked into a 64×128 sheet
  (4 columns stand/step/stand/step × 4 direction rows down/right/up/left of
  16×32). Shipped as `src/assets/player-sprite.png`.
- **Courtesy credit line (optional):** "Character sprites: Time Fantasy by Jason
  Perry (finalbossblues), timefantasy.net."

### Family sprites — wife, son, daughter

- **Status: LANDED 2026-06-15** (rebuilt to match the new player; the prior
  Antifarea CC-BY sheets retired — see the CC-BY section above).
- **Source:** "Time Elements: Character Core Set" (finalbossblues / Jason Perry)
  — same pack and license as the player sprite above.
- **Changes:** modular composites recolored to the Adivasi palette — wife
  (`head1+bottom5+top10+hair10`): long black hair, red dress, deep-brown skin;
  son (`head1+bottom1+top6+hair4`): short hair, red tunic, dark shorts; daughter
  (`head1+bottom5+top10+hair11`): long hair, turmeric-ochre dress. Repacked into
  48×128 sheets (3 walk columns × 4 direction rows down/right/up/left of 16×32).
  Shipped as `src/assets/sprites/family-wife.png`, `family-son.png`,
  `family-daughter.png`.

### Beast sprites — panther, bear, gibbon

- **Status: LANDED 2026-06-12** (owner purchased on itch.io 2026-06-11).
- **Titles:** "Animals Sprite Pack" ($5; bear from `animals5.png`) and
  "Animals Sprite Pack 2" ($6; `panther.png`, `gorilla.png` → gibbon)
- **Author:** Jason Perry (finalbossblues), timefantasy.net
- **Sources (bought on itch.io, not the Steam RPG-Maker DLC):**
  - https://finalbossblues.itch.io/animals-sprite-pack
  - https://finalbossblues.itch.io/animals-2
- **License:** Time Fantasy royalty-free terms (per the creator's published
  statements): commercial use yes, royalty-free; edits/recolors yes;
  any engine; no credit required ("please don't attribute my art to someone
  else"); NO standalone redistribution of the raw assets — shipping inside
  the game build is the intended use. One purchase covers the team on the
  same project. **Zip check 2026-06-12:** neither zip ships a formal
  license file (READMEs are thank-you notes only), so the operative terms
  are the creator's published statements above.
- **Changes:** no recolors (native palette kept for set coherence); frames
  recomposed into 3-column × 4-direction-row sheets (down/right/up/left)
  with tight union-bbox cells. Shipped as `src/assets/sprites/panther.png`,
  `bear.png`, `gibbon.png`.
- **Courtesy credit line (optional):** "Animal sprites: Time Fantasy by
  Jason Perry (finalbossblues), timefantasy.net."

### Environment — Jungle Tileset (tree walls + dirt floor)

- **Status: LANDED 2026-06-15** (Tier 3 reopened and greenlit by the owner the
  same day; tree walls + dirt floor only — the hut stays procedural).
- **Title:** "Jungle Tileset" — a free Time Fantasy mini-expansion (Patreon
  goal release).
- **Author:** Jason Perry (finalbossblues), timefantasy.net
- **Source:** https://finalbossblues.itch.io/tf-jungle-tileset
- **License:** Time Fantasy "free graphics" royalty-free terms (creator's
  published statement, finalbossblues.com): "using them in commercial projects
  is fine. Edit them all you want. No credit necessary." Commercial use + edits
  allowed; only direct redistribution of the raw assets is prohibited. Free /
  name-your-own-price. NOT share-alike / NC / ND; the itch listing is tagged
  "No generative AI was used."
- **Changes:** built a small in-repo atlas `src/assets/sprites/jungle-tiles.png`
  by slicing the pack's own tree objects. Re-sliced 2026-06-19 to render wall
  masses as **actual jungle trees** (owner "option C — actual trees"), replacing
  the earlier flat canopy-fill. The atlas is now **10 tiles**: tile 0 = dirt-path
  floor recolored from the set's seamless grass autotile (green→earth ramp);
  tiles 1–4 = pure-leaf canopy interiors (sheet cols 11–13, rows 6–7); tiles 5–6
  = lit tree-crowns with transparent shoulders (canopy tops, cols 12 & 17 row 5);
  tiles 7–8 = soft canopy-underside overhang (cols 16–17 row 8); tile 9 = a
  canopy + tree-trunk/roots base composited from the standalone tree's trunk.
  `Renderer.renderLevel` paints dirt on every cell, then picks crown / underside-
  or-trunk / interior per wall cell by whether the cell above/below is open
  (neighbour-aware), so each wall mass reads as a stand of trees. 16px tiles
  upscaled ×2 to the 32px grid; render-only — collision is untouched.
- **Courtesy credit line (optional):** "Jungle tileset: Time Fantasy by Jason
  Perry (finalbossblues), timefantasy.net."

---

## CC0 assets (no attribution required; logged for provenance)

- **Player sprite** — ArMM1998, "Zelda-like tilesets and sprites"
  (https://opengameart.org/content/zelda-like-tilesets-and-sprites), CC0.
  Recolored to the Adivasi-coded archer. In use 2026-05-10 → 2026-06-15;
  **replaced** by the Time Elements composite above (no longer shipped).

All assets above were verified human-made (no generative AI) at sourcing
time per the policy in `docs/ART-ASSETS.md`.
