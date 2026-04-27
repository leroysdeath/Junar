---
name: protagonist-and-family-tone
description: Junar's protagonist (Adivasi/tribal-Indian archer) and family (wife, son, daughter) — visual-cue intent, copy/dialog tone, cultural-representation guardrails, and the family-death-ends-the-run rule. Use when adding/editing protagonist or family copy, designing family member entity behavior (movement, collision, death triggers), reviewing visual-cue intent before it lands in Renderer.ts, judging stereotype/representation concerns, or scoping the planned multiple-endings system (hut-attack branch, family-survival carryover). Not for: how the protagonist or family are drawn at the pixel level (see procedural-rendering — this skill owns what cues are appropriate, not the rectangles), enemy/beast tone (see enemy-roster-and-tone), or the cardinal-LOS combat contract (see cardinal-los-contract).
---

# Protagonist and family tone

The protagonist is an Adivasi/tribal-Indian archer, husband and father. The family — wife, son, daughter — are his reason. Cultural representation is a first-class concern; design and copy that lean on stereotypes are not.

See CLAUDE.md §1 (vision), §2 (death weighted when family is present), §5 (world & tone — protagonist & family), §6 (roadmap — family rendering & combat), §8 (story / tone guardrails — cultural representation, family sacrosanct).

## Cast

| Role | Status | Notes |
|---|---|---|
| Protagonist | Implemented (`Renderer.renderPlayer`) | Adivasi-coded male archer |
| Wife | Planned, not yet implemented | Active combatant on Level 10 in initial prototype |
| Son (boy) | Planned, not yet implemented | Active combatant on Level 10 in initial prototype |
| Daughter | Planned, not yet implemented | Active combatant on Level 10 in initial prototype |

## Visual cue intent

This skill owns *what reads correctly*, not pixel placement. The procedural rectangles themselves live in `Renderer.ts` (see `procedural-rendering`).

**Protagonist (current code, for reference):**
- Deep warm-brown skin tone.
- Short black hair, no headdress.
- Cream cotton tunic with a dark waist sash (dhoti-coded).
- Bow held offhand on the left; leather quiver at the right hip with fletchings showing.
- Procedural rectangles only; readable at 32×32.

**Family (when designed):**
- Same dignified, abstract, culturally-grounded direction. Three silhouettes that read as wife / son / daughter at a glance — distinct from the protagonist and from each other.
- Same warm-brown skin range. No headdresses, no feather imagery.
- No costume cues borrowed from Disney/Jungle-Book character likenesses.

## Cultural representation guardrails

Lifted from CLAUDE.md §5 / §8:

- **Avoid feathered-headdress imagery** and other generic "tribal" stereotypes.
- **No direct Jungle Book character likenesses.** Style and bestiary are inspiration only — Mowgli, Bagheera, etc. are off-limits as references for the protagonist or family.
- **Keep cues minimal, dignified, and abstract.** The procedural-rectangle constraint helps — silhouette and palette over caricature.
- **No "savage" framing** in copy adjacent to the protagonist or family. The corruption is the antagonist; the family lived in harmony with the jungle.

## Family combat & death rules

**Initial prototype (current scope):**
- Family appears only on Level 10, alongside the player as three active combatants in the boss fight.
- **Any family member's death = game over.** This is the central tension of the boss fight (CLAUDE.md §2, §4, §8).
- No respawn, no auto-fight gimmicks, no "downed but revivable" mechanic.

**Future direction — multiple-endings system (do not implement without owner sign-off):**

The any-death-ends-the-run rule is the prototype shape, not the final shape. Owner has flagged a multi-ending system as the eventual target. Sketch:

- A **hut-attack event** earlier in the run can destroy the family's home.
  - If the hut is destroyed: the family never appears in subsequent levels (one ending branch).
  - If the hut survives: the family appears on the level(s) the design calls for.
- Once family members are present in a level, **they can die individually**. Each dead family member does not appear in subsequent levels.
- Different endings flow from how many family members survive to the boss arena.

Until that system is designed and approved, **stay on the prototype rule** (any family death = game over) so the central tension is preserved.

If a request would lock out the multiple-endings direction — e.g., hardcoding "family always survives", baking the game-over rule into a place that can't branch later, or coupling family identity to a single boolean — push back and ask whether the multiple-endings system is in scope yet.

## OK without owner approval

- Adding family copy/dialog in line with the tone here and CLAUDE.md §5/§8.
- Designing the family member entity (movement, collision, draw dispatch — see `procedural-rendering` for the canvas side, `cardinal-los-contract` for combat behavior) so any family death triggers game over per the prototype rule.
- Adjusting protagonist visuals within the established palette (skin tone, dhoti, sash, quiver) for readability.

## Needs owner approval

- Any change to the family-death rule (revive, respawn, downed states, **enabling the multiple-endings branches**).
- Adding a fourth family member or recasting the existing three.
- Costume or visual changes that drift toward stereotype (headdress, feathers, "war paint", Jungle Book character likenesses).
- Family combat behavior beyond simple cardinal-LOS auto-fire (special abilities, healing, AoE).

## When asked to write protagonist/family copy

- Tragic, not heroic-bombastic. The family is a reason, not a power fantasy.
- Specific to Adivasi/tribal-Indian rather than pan-indigenous. Avoid generic "tribal" idioms in names, dialog, place-names.
- No copy that frames the wildlife as villains — that's `enemy-roster-and-tone`'s domain, but the overlap is real. If a protagonist intro describes a "monster panther", that's a tone violation under both skills.
