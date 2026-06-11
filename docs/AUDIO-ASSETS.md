# Junar — Audio Asset Manifest

This doc is the shopping list for replacing Junar's placeholder synthesized
audio (`src/game/SoundManager.ts`, four Web Audio oscillator tones) with real
recordings from a free library. It is the spec a sourcing pass works against —
whether that's the owner on Freesound, or a Claude chat with audio preview.

CLAUDE.md is the source of truth for committed design. Audio replacement of the
**four existing SFX** is in scope. A **music / ambience system is a scope
addition** (CLAUDE.md §6 calls audio "owner-led, future direction"); the music
and ambience rows below are marked accordingly and need owner sign-off before
integration. Move greenlit rows toward "done" as files land.

---

## Hard constraints (read before sourcing)

- **License must allow commercial use + redistribution.** End target is a paid
  Steam release (CLAUDE.md §8). **CC0 / public domain is strongly preferred.**
  CC-BY is acceptable but creates an attribution obligation (see below).
  **Reject** anything CC-BY-NC (non-commercial), CC-BY-ND (no derivatives —
  blocks trimming/looping), "free for non-commercial," or unclear-license rips.
- **Attribution.** Any CC-BY asset must be logged in `docs/AUDIO-CREDITS.md`
  (title, author, source URL, license, what we changed). Prefer CC0 to avoid
  this entirely.
- **No new runtime dependency** without owner approval (CLAUDE.md §9). Playback
  uses the existing Web Audio API — no Howler/Tone.js/etc. unless blessed.
- **Tauri-compatible** (CLAUDE.md §8): Web Audio + bundled asset files are fine.
  No streaming-from-CDN, no service workers.
- **Format:** prefer **`.ogg` (Vorbis)** as primary (small, looped-music
  friendly, supported in Chromium/Tauri). Keep `.mp3` as a fallback only if a
  source is mp3-only. Avoid `.wav` in-repo for anything longer than a short
  one-shot (size).
- **File budget:** SFX one-shots well under ~50 KB each; ambience/music loops
  ideally < 1–2 MB each. Keep the whole `src/assets/audio/` footprint lean for
  the ~5–10 MB Tauri binary goal.
- **Loudness:** normalize so SFX peak around **−6 dBFS** and music/ambience beds
  sit lower (**−18 to −14 dBFS**) so SFX read over the bed. The owner-led mix
  can adjust gain per-cue in code later; ship roughly leveled source.

---

## Naming & placement convention

- Drop files in **`src/assets/audio/`** (create it), subfoldered:
  `sfx/`, `music/`, `ambience/`.
- Filename: `lowercase-hyphenated.ogg`, matching the **Key** column below
  (e.g. `sfx/arrow-fire.ogg`). The Key is what the rewritten `SoundManager`
  will reference, so keep it exact.

---

## 1. SFX — replacing the four existing tones (in scope)

These map 1:1 to sounds the game already triggers. Replacing them needs no
design sign-off.

| Key | Replaces | Trigger (call site) | Feel / direction | Length | Loop | Notes |
|-----|----------|---------------------|------------------|--------|------|-------|
| `arrow-fire` | `arrow` (200 Hz square) | every auto-fired arrow, `Game.ts:1526` | dry bow release + short arrow whoosh; **plays very often** (~2/sec, faster in burst) — must be short, soft, non-fatiguing | 100–250 ms | no | Source 2–3 slight variants to avoid machine-gun sameness; rewrite can round-robin them |
| `enemy-hit` | `hit` (400 Hz square) | arrow connects with enemy, `Game.ts:1576` | wet/soft thud or flesh impact — **tragic tone, not gory** (beasts are infected victims, CLAUDE.md §9). No squelchy splatter | 100–200 ms | no | Also fires very often; keep punchy but gentle |
| `game-over` | `gameOver` (150 Hz sawtooth) | player or family death ends run, `Game.ts:1588` | somber, low, final — a fall/loss sting, not a comedic buzzer | 0.5–1.5 s | no | Tone is loss, not failure-jingle |
| `victory` | `victory` (500 Hz sine) | boss-room stub victory (V key), `Game.ts:1673` | hopeful release / the jungle freed — warm, brief | 1–2.5 s | no | Placeholder boss flow; fine to ship a short flourish now |

## 2. SFX — events the game raises but doesn't yet sound (in scope, optional)

Low-risk additions: the game already fires these events; we'd just add a
`SoundManager.play(...)` call during the rewrite. Source if convenient.

| Key | Event | Feel / direction | Length | Loop | Notes |
|-----|-------|------------------|--------|------|-------|
| `dash` | dash teleport (`Player.ts`, Shift/A) | quick whoosh / blink | 150–300 ms | no | Edge-triggered; won't spam |
| `burst-activate` | burst rapid-fire start (`Stamina.ts`, Space/B) | rising "power-up" swell, short | 300–600 ms | no | 5-stamina cost, used sparingly |
| `stamina-low` | stamina crosses low threshold (10 pts) | subtle warning pulse — quiet, non-annoying | 200–400 ms | no | Fire once on threshold cross, not per frame |
| `room-transition` | LTTP hard-cut into neighbor room (`Game.detectTransition`) | soft footstep-into-brush / whoosh | 150–300 ms | no | Optional; could feel busy — owner taste call |
| `family-death` | a family member dies (distinct from generic `game-over`) | sharper grief sting layered before/with `game-over` | 0.5–1 s | no | Family combat unbuilt yet (CLAUDE.md §5); spec now, wire when family lands |

## 3. Ambience — background bed (SCOPE ADDITION — needs owner sign-off)

Looping environmental bed under gameplay. Carries the corruption arc (CLAUDE.md
§1, §6): healthy jungle → "wrong"/oily as corruption deepens.

| Key | Where | Feel / direction | Length | Loop | Notes |
|-----|-------|------------------|--------|------|-------|
| `ambience-jungle` | general gameplay rooms | living jungle bed: insects, distant birds, leaves. Calm, immersive | 30–90 s | **seamless loop** | The default bed. Must loop with no audible seam |
| `ambience-corrupted` | near/inside boss approach (optional) | the bed turned wrong — low drone, sickly hum, sparser life | 30–90 s | **seamless loop** | Optional second bed for tone shift; could also be a filtered version of the jungle bed |

## 4. Music (SCOPE ADDITION — needs owner sign-off)

| Key | Where | Feel / direction | Length | Loop | Notes |
|-----|-------|------------------|--------|------|-------|
| `music-menu` | entry / title screen | quiet, evocative, Indian-jungle-coded *without* stereotype caricature (CLAUDE.md §9 cultural-rep guardrail) | 30–60 s | **seamless loop** | Set tone on the menu before play |
| `music-boss` | boss room (anchor 10) | tense, tragic confrontation — the plant is the antagonist | 60–120 s | **seamless loop** | Boss combat itself is deferred; track can wait but spec it here |

> Tone guardrail for music/ambience: the setting is the Indian jungle, mythic
> time (CLAUDE.md §6). Avoid generic "tribal" stereotype instrumentation and any
> *Jungle Book* likeness. Keep it atmospheric and dignified.

---

## Recommended free sources

- **Freesound.org** — huge SFX + field-recording library. **Filter by license:
  Creative Commons 0.** Great for arrow, impact, jungle ambience, whooshes.
- **OpenGameArt.org** — game-oriented; filter to CC0. Good for SFX packs and
  loopable music.
- **Kenney.nl** (kenney assets) — CC0 game-asset packs, includes some SFX.
- **Sonniss GDC Game Audio Bundle** — royalty-free pro SFX, commercial-OK.
- For music loops: **incompetech** (Kevin MacLeod, CC-BY — attribution needed)
  or OpenGameArt CC0 tracks.

Always re-confirm the license on the asset's own page at download time — pack
licensing varies per file.

---

## Sourcing checklist (per asset)

- [ ] File found and previewed (listened to — it actually fits)
- [ ] License is CC0 (preferred) or CC-BY; commercial + redistribution OK
- [ ] Trimmed/leveled to the spec (length, loop seam, ~target loudness)
- [ ] Exported as `.ogg`, named to the **Key**, placed in `src/assets/audio/<sub>/`
- [ ] If CC-BY: entry added to `docs/AUDIO-CREDITS.md`

The `SoundManager` rewrite landed 2026-06-11 (single shared `AudioContext`,
gesture-init in `Game.startRun`, disposal in `Game.cleanup()`): any file
dropped in `src/assets/audio/` under its Key name is auto-discovered at build
time and plays immediately — no per-asset code change needed. Variant
round-robin works via `-2`/`-3` filename suffixes (e.g. `arrow-fire-2.ogg`).
The §1 keys fall back to the original synth tones until their files land; the
§2 event keys are already triggered by the game (except `family-death`,
which awaits family combat) and stay silent until files exist. Looping
music/ambience playback is still unimplemented pending the §3–4 greenlight.
