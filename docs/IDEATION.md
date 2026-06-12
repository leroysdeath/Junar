# Junar — Design Ideation Backlog

This doc captures design ideas under active exploration but not committed
to scope. CLAUDE.md is the source of truth for committed design; items here
move to CLAUDE.md when greenlit, or get archived if dropped. Each entry
should record: current status, open questions, and any decision the entry
is waiting on.

Ordered roughly by how concrete the idea is.

---

## 1. Family-death branching outcomes (Demo)

**Status:** Alpha may ship the current "any family death = game over" rule
as an iteration. Demo's "branches into options" shape is undecided as of
2026-05-09. Decision needed before the family-death wiring work begins.

**Candidate shapes (mix-and-match possible):**
- *Survivor-set drives endings.* Death removes that family member;
  surviving members continue; who survives determines the boss-arena
  outcome / ending. Death becomes a divergence input rather than a
  game-over trigger. Pairs naturally with the hut-attack simple branch
  already approved.
- *Player-choice moment.* Death triggers a brief choice (flee / retrieve
  body, advance / withdraw, etc.) that branches the run path.
- *Survivor behavior changes.* Surviving family change AI / role / cue
  (more defensive, withdraw, escalated enemies) without yet gating
  endings.

**Open questions:** Which combination ships at Demo? How does the death
moment read visually (slow-mo, tinted frame, family-specific copy)? Does
the Alpha rule stay intact for Alpha shipping or does Demo's shape
backport to Alpha?

---

## 2. Gibbons drop from trees near the player

**Status:** Idea under discussion. Spawn-source change only; gibbon stats
(34 px/s, contact-only, one-hit) stay as designed.

**Sketch:** Currently gibbons enter play only as static spawns rolled at
connector `s`/`S` candidate tiles (snake/gibbon 80/20 for `s`); they
appear in no wave pool, and the legacy perimeter randomizer
(`levels.ts initializeLevels`) is unwired dead code. Idea: gibbons emerge
from tree tiles (`#`) within some radius of the player, simulating a drop
from the canopy — an ambient threat appearing near the player rather than
sitting dormant at fixed candidate tiles.

**Open questions:** Detection radius? Cooldown between drops? Animation /
visual cue at the drop tile? Do they drop straight down or pick a random
nearby tree? Do they replace static-spawn gibbons or supplement?

---

## 3. Convert beasts to allies

**Status:** Idea under discussion. Trigger source (scripted vs. random)
undecided.

**Sketch:** Player gains the ability to convert one of the four approved
beasts (panther / bear / snake / gibbon) into a temporary or permanent
ally that fights enemies. Allies inherit speed and pathfinding of their
enemy form.

**Open questions:** Trigger source — input action, proximity, item pickup,
scripted level event? Ally cap? Ally lifetime? What happens when an ally
is hit (die / convert back / iframes)? Do allies count toward the
"family death = game over / branching" rule? Visual differentiation of
ally vs. enemy at-a-glance?

---

## 4. Stick barriers (mild Tower Defense)

**Status:** Idea under discussion. Bounded TD scope: barriers only.

**Sketch:** First gibbon appearance drops a pile of sticks on its spawn
tile. If the player walks over the sticks, they acquire a "barrier"
ability. Barriers funnel enemies (block AABB / LOS as walls do) and can
be placed on dirt tiles. Funnels feed the chokepoint pillar without
adding upgrade trees or resource economies.

**Hard scope:** This is the only TD mechanic. No tower upgrades, no
resource economy, no enemy-pathing scoring. Just barriers.

**Open questions:** Barrier count cap? Durability (HP, time-based, or
permanent)? Placement rules (cooldown, range from player)? Do barriers
block arrows? Can they be reclaimed? Does pickup persist across levels
or reset on level start?

---

## 5. Dash / roll

**Status:** Shipped 2026-05-10 as the dash teleport (CLAUDE.md §5);
entry trimmed per the exit process below. What shipped: 3-tile blink
opposite the player's facing, 0.5 stamina per use, Shift/A, no iframes,
walls block (the blink stops at the last open tile before a wall).

---

## 6. Free movement between primary + connector levels

**Status:** Shipped — superseded by the traversable-maps refactor
(`docs/ROADMAP-traversable-maps.md`). The 10 hand-authored levels are
now anchors in a procedurally generated room grid the player moves
freely through, with connector rooms linking them and one run-long wave
scheduler spawning into whichever room the player occupies.

**Open questions — answered by the implementation:**
- Generation method → hybrid: Poisson-disk-placed anchors plus template
  connectors (`RoomGrid.ts`, `RoomTemplates.ts`).
- Transition rendering → LTTP hard cuts (`Game.detectTransition`).
- Scheduler at boundaries → the `GlobalWaveScheduler` pauses during a
  room transition and inside the boss arena, resuming on room entry.
- Enemy carry-over → enemies persist per-room (no despawn, no cap);
  active enemies pursue the player room-to-room via the Hunt state
  machine (`src/game/Hunt.ts`).

---

## 7. Burst / rapid-fire ability

**Status:** Shipped 2026-05-10 (CLAUDE.md §5); entry trimmed per the
exit process below. What shipped: 2.0× fire rate for 5 s, multiplier
decays ×0.75 when re-activated within a 15 s break, 5 stamina per
activation, Space/B; implemented as `constants.ts` `ARROW_COOLDOWN_MS`
divided by a multiplier, not runtime constant mutation.

---

## 8. Upgrade player sprite to LPC (Liberated Pixel Cup)

**Status: DROPPED — resolved no-LPC, owner decision 2026-06-11.** The
license policy set with the Tier 1/2 sprite greenlights (`docs/ART-ASSETS.md`)
rejects share-alike outright on the art layer: no CC-BY-SA, no GPL — which
rules out LPC and the Universal LPC generator entirely, for the player and
for everything else. The open question this entry carried ("LPC player +
family vs. mixed styles?") is answered: the cast ships on CC0 / CC-BY /
paid royalty-free sheets (player: ArMM1998 CC0; family: Antifarea CC-BY 3.0
recolors; beasts: Time Fantasy royalty-free). Full original analysis in the
Archived section below.

---

## Process for moving an entry out of this doc

- **Greenlit:** owner commits the idea to a build tier. Entry's design
  is finalized and migrated into CLAUDE.md (the relevant section: §3
  pillars if it changes a pillar, §5 mechanics, §6 tone, or §7 roadmap).
  Delete or trim the entry here.
- **Dropped:** owner decides not to pursue. Move to an "Archived" section
  at the bottom of this file with the dated decision and one-line
  reasoning, so the rationale survives.

---

## Archived

### LPC player-sprite upgrade (dropped 2026-06-11)

**Decision:** no-LPC, ever — the owner's art-license policy (set with the
`docs/ART-ASSETS.md` Tier 1/2 greenlights) rejects share-alike (CC-BY-SA /
GPL) on the shipped art layer, and all LPC assets and the Universal LPC
generator are CC-BY-SA 3.0 / GPL 3.0+.

**Original sketch (for the record):** replace the ArMM1998 sword-character
sprite with one composed in the Universal LPC Spritesheet Generator — LPC
ships 4-directional walk/slash/thrust/bow-shoot/hurt/spellcast/die at
64×64, and the bow-shoot animation matched our auto-fire better than the
ArMM1998 sword swing. The blocker was always the license: shipping a
CC-BY-SA sheet means the modified sheet itself stays CC-BY-SA (anyone may
extract and reuse it) plus per-artist credits; that trade was judged
acceptable by some commercial games but the owner chose to keep the art
layer clear of viral terms. If a higher-fidelity player sprite is wanted
later, source it under CC0/CC-BY/paid royalty-free like the rest of the
cast (see `docs/ART-ASSETS.md`).
