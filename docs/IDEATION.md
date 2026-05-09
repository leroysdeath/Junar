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

**Sketch:** Currently gibbons spawn at level edges via the perimeter
randomizer (`levels.ts initializeLevels`). Idea: gibbons emerge from tree
tiles (`#`) within some radius of the player, simulating a drop from the
canopy — an ambient threat appearing near the player rather than chasing
in from off-screen.

**Open questions:** Detection radius? Cooldown between drops? Animation /
visual cue at the drop tile? Do they drop straight down or pick a random
nearby tree? Do they replace edge-spawn gibbons or supplement?

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

**Status:** Idea under discussion. Compatible with the "where you stand"
pillar as long as it's positioning-extension, not aim-extension — the
player still doesn't aim, they reposition.

**Open questions:** Cooldown? Distance (in tiles or pixels)?
Invulnerability during dash? (recall: today there are no iframes — adding
them via dash would be a real pillar consideration). Can dash cross walls
or enemies? Key binding? Does it interact with the auto-fire cooldown?

---

## 6. Free movement between primary + connector levels

**Status:** Concept only — explicitly tier-assigned "no tier" by owner
on 2026-05-09. Captured here so the idea isn't lost; do not scope into
any current build.

**Sketch:** Architecture-scale change. Instead of the current
clear-level → next-level state machine, the 10 primary levels become
nodes the player can move freely between, with designed or
randomly-generated "connector levels" linking them. The wave system runs
continuously; "lulls" between waves become free-movement phases. Enemies
pursue the player into whichever level they're on.

**Why it's not on a tier yet:** Inverts the current `Game.ts` /
`WaveScheduler.ts` / `Level.ts` contracts. Big architectural rework with
high risk to the prototype loop. Worth re-evaluating after Demo ships
and the loop is solid.

**Open questions:** Connector-level count? Generation method (random vs.
designed vs. hybrid)? How do level transitions render visually
(seamless, fade, dedicated transition tile)? Enemy carry-over cap
between levels? Does the wave scheduler pause at level boundaries or
truly run continuously?

---

## 7. Burst / rapid-fire ability

**Status:** Idea under discussion. Compatible with the "where you stand"
pillar as long as the targeting layer is unchanged — the player chooses
*when* to burst, not *what* to shoot. Auto-fire still picks the nearest
LOS-cleared enemy on each shot.

**Sketch:** Press a button to double the arrow fire rate for X seconds.
At the cap of one keystroke and a duration window, this stays
positioning-flavored: you burst when you've forced a chokepoint and want
to cash in, not as a substitute for getting into a good position.

**Open questions:** Activation key? Buff duration (e.g., 3s, 5s)?
Cooldown between activations? Is it run-resource (limited charges per
run / per level) or cooldown-only? Does it stack with other buffs (e.g.,
dash)? Does the cooldown change `Game.ts` `ARROW_COOLDOWN_MS` at runtime,
or introduce a new `arrowCooldownMultiplier` field? Visual cue (player
glow, arrow trail change, on-screen icon)?

**Tension to watch:** if burst is too cheap or too frequent, it
under-cuts the tactical-positioning pillar — players will rely on burst
DPS rather than reading the maze. Tune toward "rare reward for good
positioning," not "always-on offensive crutch."

---

## Process for moving an entry out of this doc

- **Greenlit:** owner commits the idea to a build tier. Entry's design
  is finalized and migrated into CLAUDE.md (the relevant section: §3
  pillars if it changes a pillar, §5 mechanics, §6 tone, or §7 roadmap).
  Delete or trim the entry here.
- **Dropped:** owner decides not to pursue. Move to an "Archived" section
  at the bottom of this file with the dated decision and one-line
  reasoning, so the rationale survives.
