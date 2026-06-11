---
name: enemy-roster-and-tone
description: Junar's approved enemy bestiary (black panther, sloth bear, Indian rat snake, Hoolock gibbon) and the tone framing that beasts are infected victims, not villains. Adding any other beast (tiger, monkey, crocodile, wild dog, jackal, etc.) requires explicit owner approval. Use when adding/removing enemy types in EnemyType, tuning per-enemy stats like speed in Enemy.ts, naming or describing beasts in copy, or judging whether a proposed creature needs owner sign-off. Not for: how enemies are drawn (see procedural-rendering), the 360° LOS combat contract that makes them contact-only (see los-contract), or protagonist/family tone (see protagonist-and-family-tone).
---

# Enemy roster and tone

The bestiary is closed. Four approved beasts, contact-only, framed as victims of corruption rather than villains.

See CLAUDE.md §1 (vision), §3 ("The corruption is the antagonist, not the beasts"), §5 (mechanics), §6 (world & tone, bestiary status), §9 (story / tone guardrails).

## Approved roster

| `EnemyType` | In-world identity | Speed (px/s) |
|---|---|---|
| `panther` | Black panther (Indian leopard) — apex pursuer | 395 (2.6× player) |
| `bear` | Sloth bear — heavy chaser | 218 (1.45×) |
| `snake` | Indian rat snake — easy to outrun | 68 (0.45×) |
| `gibbon` | Hoolock gibbon — near-stationary creeper | 34 (0.23×) |

These are the only values of `EnemyType`. The full enemy set is hardcoded in six places — the `EnemyType` union (`src/game/types.ts:55`), the speed switch (`Enemy.ts:82-95`), the `ENEMY_SPEED` mirror in `WaveScheduler.ts` (a `Record<EnemyType, number>` used for band drip cadence — "must mirror Enemy.ts" per its comment, and typecheck fails without the new key), the draw dispatch in `Renderer.ts` (`renderPanther` / `renderGibbon` / `renderBear` / `renderSnake`), `ENEMY_AABB_PX` in `constants.ts` (also a `Record` keyed by `EnemyType`), and the `SpawnTemplate` pools in `levels.ts`. Adding a new type means touching all six plus the rendering for it. (Legacy full-set arrays also linger in the unwired edge-spawn paths at `Level.ts` and `levels.ts`.)

## Not approved (do not add without explicit owner approval)

Tigers, generic monkeys, crocodiles, wild dogs, jackals, wolves, scorpions, spiders, demons, ghosts, anything else. CLAUDE.md §6 lists this explicitly and §9 reiterates the guardrail.

If a request says "add a [non-approved] enemy", stop and ask the owner to confirm before writing code. Don't extend `EnemyType`, don't add a render method, don't add a speed entry on a shrug.

## Contract: contact-only, no ranged attacks

Every beast threatens by **contact only**. There are no projectile-throwing, spitting, breath-attack, shockwave, or AoE-on-trigger enemies. CLAUDE.md §9: "A ranged enemy would invalidate the 'where you stand' pillar." See also the `los-contract` skill.

Even within the approved roster, do not add ranged behavior to the panther / bear / snake / gibbon. "The bear throws rocks" is a contract break, not an enemy variant.

## Tone

The corruption is the antagonist; the beasts are infected wildlife. CLAUDE.md §3, §6.

- **Tragic, not bloodthirsty.** The player is killing wildlife because there is no other choice.
- **No villain framing in copy.** Avoid "evil panther", "vicious bear", "monstrous beast". The monster is the corrupting plant on Level 10 (the boss); the beasts are its victims.
- **Visual cue (owner decision 2026-06-11, implemented):** infection shows only as **red eyes** (`INFECTED_EYE_RED` in `Renderer.ts`) on all four beasts; bodies look like normal wildlife. Black goo is boss-only — do NOT add goo streaks/sheen/drips to beasts (still procedural — see `procedural-rendering`).
- **No direct *Jungle Book* character likenesses.** Style and bestiary inspiration only. CLAUDE.md §6, §9.
- **Cultural representation.** The protagonist and family are Adivasi/tribal-Indian. Don't add enemy designs or copy that lean on stereotypes adjacent to that representation (e.g., "savage" framing).

## When extending an existing enemy

OK without owner approval:
- Tuning speed (lift the value into `constants.ts` per `tile-grid-and-canvas-constants`). Note: a speed change in `Enemy.ts` must be mirrored in `WaveScheduler.ts`'s `ENEMY_SPEED` Record or the scheduler's row-drip cadence desyncs.
- Refining the procedural sprite for readability or adding the planned corruption accents.
- Adjusting spawn composition in `levels.ts` (composition is per-`SpawnTemplate` group, drawn from the wave-tiered pools `WAVE_POOL_EARLY` / `WAVE_POOL_MID` / `WAVE_POOL_LATE` — waves 1–4 / 5–8 / 9+ — gated by `WAVE_POOL_MID_UNLOCK` / `WAVE_POOL_LATE_UNLOCK` in `constants.ts`).

Needs owner approval:
- Per-type behavior beyond movement (charge, knockback, "leader" who calls others).
- Per-type death effects beyond the current `splice + score + sound`.
- Anything that changes how the enemy threatens the player.

## When asked to add a new beast

Confirm with the owner first. If approved, the additions land in:

1. `EnemyType` union in `src/game/types.ts`.
2. Speed switch and any per-type fields in `Enemy.ts`.
3. Render dispatch + `renderX` method in `Renderer.ts` (procedural, readable at 32×32).
4. `SpawnTemplate` groups and the `WAVE_POOL_EARLY` / `WAVE_POOL_MID` / `WAVE_POOL_LATE` pools in `levels.ts`.
5. `ENEMY_AABB_PX` entry in `constants.ts` — mandatory, since it's a `Record<EnemyType, number>` and typecheck fails without the new key.
6. `ENEMY_SPEED` entry in `WaveScheduler.ts` — also mandatory (`Record<EnemyType, number>`, must mirror the `Enemy.ts` speed) so the scheduler can compute row drip cadence; typecheck fails without it.
7. CLAUDE.md §5 / §6 update so the bestiary section stays the source of truth.
