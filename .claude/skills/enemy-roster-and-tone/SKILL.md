---
name: enemy-roster-and-tone
description: Junar's approved enemy bestiary (panther, primate, sloth bear) and the tone framing that beasts are infected victims, not villains. Adding any other beast (snake, tiger, monkey, crocodile, wolf, jackal, etc.) requires explicit owner approval. Use when adding/removing enemy types in EnemyType, tuning per-enemy stats like speed in Enemy.ts, naming or describing beasts in copy, or judging whether a proposed creature needs owner sign-off. Not for: how enemies are drawn (see procedural-rendering), the cardinal-LOS combat contract that makes them contact-only (see cardinal-los-contract), or protagonist/family tone — that gap currently has no owner skill, fall back to CLAUDE.md §5/§8.
---

# Enemy roster and tone

The bestiary is closed. Three approved beasts, contact-only, framed as victims of corruption rather than villains.

See CLAUDE.md §1 (vision), §2 ("The corruption is the antagonist, not the beasts"), §4 (mechanics), §5 (world & tone, bestiary status), §8 (story / tone guardrails).

## Approved roster

| `EnemyType` | In-world identity | Speed (px/s) |
|---|---|---|
| `panther` | Black panther — fastest, *Jungle Book*-coded | 120 |
| `primate` | Jungle-Book-style primate (langur troop / corrupted ape) | 80 |
| `bear` | Sloth bear — slow, bulky | 60 |

These are the only values of `EnemyType` (`src/game/types.ts:30`). The full enemy set is hardcoded in three places — `Enemy.ts:25-35` (speed switch), `Renderer.ts:90-107` (draw dispatch), and `levels.ts:393` (spawn type pool). Adding a new type means touching all three plus the rendering for it.

## Not approved (do not add without explicit owner approval)

Snakes, tigers, generic monkeys, crocodiles, wild dogs, jackals, wolves, scorpions, spiders, demons, ghosts, anything else. CLAUDE.md §5 lists this explicitly and §8 reiterates the guardrail.

If a request says "add a [non-approved] enemy", stop and ask the owner to confirm before writing code. Don't extend `EnemyType`, don't add a render method, don't add a speed entry on a shrug.

## Contract: contact-only, no ranged attacks

Every beast threatens by **contact only**. There are no projectile-throwing, spitting, breath-attack, shockwave, or AoE-on-trigger enemies. CLAUDE.md §4: "A ranged enemy would invalidate the 'where you stand' pillar." See also the `cardinal-los-contract` skill.

Even within the approved roster, do not add ranged behavior to the panther / primate / bear. "The bear throws rocks" is a contract break, not an enemy variant.

## Tone

The corruption is the antagonist; the beasts are infected wildlife. CLAUDE.md §2, §5.

- **Tragic, not bloodthirsty.** The player is killing wildlife because there is no other choice.
- **No villain framing in copy.** Avoid "evil panther", "vicious bear", "monstrous beast". The monster is the corrupting plant on Level 10 (the boss); the beasts are its victims.
- **Visual cue direction:** infected beasts should read as "wrong" — black streaks/sheen, glowing eyes, dripping black goo. CLAUDE.md §5 earmarks this as approved direction (still procedural — see `procedural-rendering`).
- **No direct *Jungle Book* character likenesses.** Style and bestiary inspiration only. CLAUDE.md §5, §8.
- **Cultural representation.** The protagonist and family are Adivasi/tribal-Indian. Don't add enemy designs or copy that lean on stereotypes adjacent to that representation (e.g., "savage" framing).

## When extending an existing enemy

OK without owner approval:
- Tuning speed (lift the value into `constants.ts` per `tile-grid-and-canvas-constants`).
- Refining the procedural sprite for readability or adding the planned corruption accents.
- Adjusting per-type spawn weighting in `levels.ts` (currently uniform-random over the three).

Needs owner approval:
- Per-type behavior beyond movement (charge, knockback, "leader" who calls others).
- Per-type death effects beyond the current `splice + score + sound`.
- Anything that changes how the enemy threatens the player.

## When asked to add a new beast

Confirm with the owner first. If approved, the additions land in:

1. `EnemyType` union in `src/game/types.ts`.
2. Speed switch and any per-type fields in `Enemy.ts`.
3. Render dispatch + `renderX` method in `Renderer.ts` (procedural, readable at 32×32).
4. Spawn pool in `levels.ts` (`enemyTypes` array).
5. CLAUDE.md §4 / §5 update so the bestiary section stays the source of truth.
