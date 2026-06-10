---
name: protagonist-and-family-tone
description: Junar's protagonist (Adivasi/tribal-Indian archer) and family (wife, son, daughter) — visual-cue intent, copy tone, cultural-representation guardrails, and the family-death-ends-the-run rule. Use when adding/editing protagonist or family copy, designing family member entity behavior (movement, collision, death triggers), reviewing visual-cue intent before it lands in Renderer.ts, judging stereotype/representation concerns, or scoping the multiple-endings system (approved hut-attack branch, per-member survival carryover). Not for: how the protagonist or family are drawn at the pixel level (see procedural-rendering — this skill owns what cues are appropriate, not the rectangles), enemy/beast tone (see enemy-roster-and-tone), or the 360° any-angle LOS combat contract (see los-contract).
---

# Protagonist and family tone

The protagonist is an Adivasi/tribal-Indian archer, husband and father. The family — wife, son, daughter — are his reason. Cultural representation is a first-class concern; design and copy that lean on stereotypes are not.

See CLAUDE.md §1 (vision), §3 (death weighted when family is present), §6 (world & tone — protagonist & family), §7 (roadmap — family rendering & combat), §9 (story / tone guardrails — cultural representation, family sacrosanct).

## Cast

| Role | Status | Notes |
|---|---|---|
| Protagonist | Implemented (`Renderer.renderPlayer`) | Adivasi-coded male archer |
| Wife | Render-only placeholder implemented | Translucent rect via `Renderer.renderNpcs` at `N` markers (anchors 6–9); AI, collision, death triggers not yet built. Active combatant on Level 10 in initial prototype |
| Son (boy) | Render-only placeholder implemented | Translucent rect via `Renderer.renderNpcs` at `N` markers (anchors 6–9); AI, collision, death triggers not yet built. Active combatant on Level 10 in initial prototype |
| Daughter | Render-only placeholder implemented | Translucent rect via `Renderer.renderNpcs` at `N` markers (anchors 6–9); AI, collision, death triggers not yet built. Active combatant on Level 10 in initial prototype |

## Visual cue intent

This skill owns *what reads correctly*, not pixel placement. The procedural rectangles themselves live in `Renderer.ts` (see `procedural-rendering`).

**Protagonist (current code, for reference):**
- Sprite-based: CC0 LTTP-style sheet (owner-approved 2026-05-10), 16×32 frames centered in the 32×32 AABB. The protagonist is the one approved sprite exception — everything else stays procedural.
- The sprite's intended read: deep warm-brown skin tone.
- Short black hair, no headdress.
- Cream cotton tunic with a dark waist sash (dhoti-coded).
- Bow held offhand on the left; leather quiver at the right hip.
- Readable at a glance at 32×32 — the readability standard still applies.

**Family (when designed):**
- Same dignified, abstract, culturally-grounded direction. Three silhouettes that read as wife / son / daughter at a glance — distinct from the protagonist and from each other.
- Same warm-brown skin range. No headdresses, no feather imagery.
- No costume cues borrowed from Disney/Jungle-Book character likenesses.

## Cultural representation guardrails

Lifted from CLAUDE.md §6 / §9:

- **Avoid feathered-headdress imagery** and other generic "tribal" stereotypes.
- **No direct Jungle Book character likenesses.** Style and bestiary are inspiration only — Mowgli, Bagheera, etc. are off-limits as references for the protagonist or family.
- **Keep cues minimal, dignified, and abstract.** The procedural-rectangle constraint helps — silhouette and palette over caricature.
- **No "savage" framing** in copy adjacent to the protagonist or family. The corruption is the antagonist; the family lived in harmony with the jungle.

## Family combat & death rules

**Initial prototype (current scope):**
- Family begins appearing Levels 4 or 5 onward (exact level TBD) as passive escorts and continues through the boss arena. In code today they're `N`-marker placeholders in anchors 6–9; the boss arena itself carries no `N` markers yet.
- On Level 10, all three remaining family members fight alongside the player as active combatants in the boss fight.
- **Any family member's death = game over.** This is the central tension (CLAUDE.md §3, §5, §9).
- No respawn, no auto-fight gimmicks, no "downed but revivable" mechanic.

**Approved — simple hut-attack branch (owner-approved 2026-05-09, EA target):**

The prototype form of the multi-ending system and the first divergence input:

- A **hut-attack event** earlier in the run can destroy the family's home.
  - If the hut is destroyed or attacked: the family never appears in subsequent levels (one ending branch).
  - If the hut survives: the family appears on the level(s) the design calls for.
- In code today, `H` tile markers (anchors 4–6) parse into `hutPositions` and render via `Renderer.renderHuts`; the destroy/attack gameplay logic is unbuilt.

**Future direction — full per-member multi-ending carryover (do not implement without owner sign-off):**

The any-death-ends-the-run rule is the prototype shape, not the final shape. Owner has flagged a full multi-ending system as the eventual target. Sketch:

- Once family members are present in a level, **they can die individually**. Each dead family member does not appear in subsequent levels.
- Different endings flow from how many family members survive to the boss arena.

Until that full system is designed and approved, **stay on the prototype rule** (any family death = game over) so the central tension is preserved.

If a request would lock out the multiple-endings direction — e.g., hardcoding "family always survives", baking the game-over rule into a place that can't branch later, or coupling family identity to a single boolean — push back and ask whether the multiple-endings system is in scope yet.

## OK without owner approval

- Adding family-adjacent copy (menu/UI strings) in line with the tone here and CLAUDE.md §6/§9. Written dialogue and VO are banned project-wide — "…" bubbles are the only in-scene text.
- Designing the family member entity (movement, collision, draw dispatch — see `procedural-rendering` for the canvas side, `los-contract` for combat behavior) so any family death triggers game over per the prototype rule.
- Adjusting protagonist visuals within the established palette (skin tone, dhoti, sash, quiver) for readability.

## Needs owner approval

- Any change to the family-death rule (revive, respawn, downed states, **enabling the full per-member multi-ending carryover** — the simple hut-attack branch is already owner-approved).
- Adding a fourth family member or recasting the existing three.
- Costume or visual changes that drift toward stereotype (headdress, feathers, "war paint", Jungle Book character likenesses).
- Family combat behavior beyond simple 360° any-angle LOS auto-fire (special abilities, healing, AoE).

## When asked to write protagonist/family copy

- Tragic, not heroic-bombastic. The family is a reason, not a power fantasy.
- Specific to Adivasi/tribal-Indian rather than pan-indigenous. Avoid generic "tribal" idioms in names, place-names.
- No copy that frames the wildlife as villains — that's `enemy-roster-and-tone`'s domain, but the overlap is real. If a protagonist intro describes a "monster panther", that's a tone violation under both skills.
