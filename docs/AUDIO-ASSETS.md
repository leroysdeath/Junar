# Junar — Audio Asset Manifest

This doc is the shopping list for replacing Junar's placeholder synthesized
audio (`src/game/SoundManager.ts`, four Web Audio oscillator tones) with real
recordings from a free library. It is the spec a sourcing pass works against —
whether that's the owner on Freesound, or a Claude chat with audio preview.

CLAUDE.md is the source of truth for committed design. Audio replacement of the
**four existing SFX** is in scope. **§3 ambience and §4 music are GREENLIT**
(owner sign-off given 2026-06-11) — the looping-bed system is now in scope and
implemented (see the integration note at the bottom). **§2 is skipped in its
entirety for this pass** (owner decision 2026-06-11): no files land for any §2
key, including the two "approved, optional" ones (`burst-activate`,
`stamina-low`). Move greenlit rows toward "done" as files land.

---

## Hard constraints (read before sourcing)

- **Human-made only — no AI-generated audio** (owner policy 2026-06-11; applies
  to ALL shipped assets, art and audio alike — see the matching constraint in
  `docs/ART-ASSETS.md`). The Steam release must contain only human-created
  assets. Free libraries increasingly host AI-generated uploads: check the
  asset's description, author profile, and any AI tags before accepting, and
  skip anything ambiguous about provenance.
- **License must allow commercial use + redistribution.** End target is a paid
  Steam release (CLAUDE.md §8). **CC0 / public domain is strongly preferred.**
  CC-BY is acceptable but creates an attribution obligation (see below).
  **Paid royalty-free packs** with commercial-use + redistribution rights are
  also acceptable (owner policy expansion 2026-06-11) — but purchases go
  through the owner: present link, price, exact license, and covered keys, and
  wait for the owner to buy and hand over the files. Prefer free CC0/CC-BY
  when quality is comparable. **Reject** anything share-alike (CC-BY-SA, GPL),
  CC-BY-NC (non-commercial), CC-BY-ND (no derivatives — blocks
  trimming/looping), "free for non-commercial," or unclear-license rips.
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

**Status (2026-06-11): all four §1 keys DONE.** `arrow-fire` shipped as three
round-robin variants sliced from one CC0 recurve session (release + whoosh
only — the impact thwack is cut so it doesn't double with `enemy-hit`);
`enemy-hit` is a CC0 muffled body thud; `game-over` a CC0 low dark impact;
`victory` a CC0 warm success chime. All trimmed/leveled to spec (−6 dBFS SFX
peaks) and verified in-game at their triggers. Full provenance + processing
notes per file in `docs/AUDIO-CREDITS.md`. Caveat: selection was made from
source descriptions, metadata, and waveform/spectrogram analysis (no human
listen pass yet) — an owner audition remains the final taste gate.

## 2. SFX — event sounds (SKIPPED for the 2026-06-11 sourcing pass)

**Owner decision 2026-06-11: skip ALL of §2 for the current sourcing pass —
including the two "approved, optional" keys (`burst-activate`,
`stamina-low`). No §2 file lands until the owner re-opens this section.**

Statuses set by owner 2026-06-11. The `dash`, `burst-activate`,
`stamina-low`, and `room-transition` hooks are already wired in code (silent
no-ops until a file exists), so for wired keys **the file is the approval
gate: don't land a file for a key that isn't approved.**

| Key | Status | Event | Feel / direction | Length | Loop | Notes |
|-----|--------|-------|------------------|--------|------|-------|
| `burst-activate` | approved, optional | burst rapid-fire start (`Stamina.ts`, Space/B) | rising "power-up" swell, short | 300–600 ms | no | 5-stamina cost, used sparingly |
| `stamina-low` | approved, optional | stamina crosses low threshold (10 pts) | subtle warning pulse — quiet, non-annoying | 200–400 ms | no | Fire once on threshold cross, not per frame |
| `dash` | optional — **mechanic may be removed** | dash teleport (`Player.ts`, Shift/A) | quick whoosh / blink | 150–300 ms | no | Don't prioritize sourcing; the dash mechanic itself is under review |
| `room-transition` | **not approved yet** | LTTP hard-cut into neighbor room (`Game.detectTransition`) | soft footstep-into-brush / whoosh | 150–300 ms | no | Could feel busy — owner taste call; needs sign-off before a file lands |
| `family-death` | **not approved yet** | a family member dies (distinct from generic `game-over`) | sharper grief sting layered before/with `game-over` | 0.5–1 s | no | Family combat unbuilt (CLAUDE.md §5); spec only — no trigger exists yet |
| `barrier-lay` | **TBD — mechanic unapproved** | placing a stick barrier (stick-barriers idea, `docs/IDEATION.md` §4) | soft woody stake-into-earth thunk | 150–300 ms | no | The barrier mechanic itself is ideation-only and not on a build tier; spec reserved here in case it's greenlit. No code hook exists |

## 3. Ambience — background bed (GREENLIT 2026-06-11)

Looping environmental bed under gameplay. Carries the corruption arc (CLAUDE.md
§1, §6): healthy jungle → "wrong"/oily as corruption deepens.

| Key | Where | Feel / direction | Length | Loop | Notes |
|-----|-------|------------------|--------|------|-------|
| `ambience-jungle` | general gameplay rooms | living jungle bed: insects, distant birds, leaves. Calm, immersive | 30–90 s | **seamless loop** | The default bed. Must loop with no audible seam |
| `ambience-corrupted` | near/inside boss approach (optional) | the bed turned wrong — low drone, sickly hum, sparser life | 30–90 s | **seamless loop** | Optional second bed for tone shift; could also be a filtered version of the jungle bed |

**Status (2026-06-11): both §3 keys DONE.** `ambience-jungle` is a 64 s
seamless loop cut from a CC0 Chiang Mai forest field recording (birds,
insects, leaves — steady, no weather/voice events); `ambience-corrupted` a
56 s seamless loop from a CC0 hand-synthesized deep drone. Loops built with
equal-power tail→head crossfades; wrap continuity verified numerically at
PCM level. Leveled to −16/−17 dBFS peaks (beds under SFX). Wired: jungle
loops under all non-boss gameplay; corrupted joins `music-boss` inside the
arena. Provenance in `docs/AUDIO-CREDITS.md`; owner audition still pending.

## 4. Music (GREENLIT 2026-06-11)

| Key | Where | Feel / direction | Length | Loop | Notes |
|-----|-------|------------------|--------|------|-------|
| `music-menu` | entry / title screen | quiet, evocative, Indian-jungle-coded *without* stereotype caricature (CLAUDE.md §9 cultural-rep guardrail) | 30–60 s | **seamless loop** | Set tone on the menu before play |
| `music-boss` | boss room (anchor 10) | tense, tragic confrontation — the plant is the antagonist | 60–120 s | **seamless loop** | Boss combat itself is deferred; track can wait but spec it here |

**Status (2026-06-11): both §4 keys DONE.** `music-menu` is a 60 s seamless
loop from a CC0 recording of a custom-built 8-string tambura drone in Eb —
the dignified tanpura-like direction, no stereotype instrumentation;
`music-boss` an 88 s seamless loop of cynicmusic's CC0 "Dark Forest Theme"
(dark brooding acoustic guitar + strings; courtesy credit logged). Leveled
to −15/−14 dBFS peaks. Wired: menu music on the title screen, boss music in
anchor 10. Provenance in `docs/AUDIO-CREDITS.md`; owner audition pending.

> Tone guardrail for music/ambience: the setting is the Indian jungle, mythic
> time (CLAUDE.md §6). Avoid generic "tribal" stereotype instrumentation and any
> *Jungle Book* likeness. Keep it atmospheric and dignified.

---

## Recommended free sources

- **Freesound.org** — huge SFX + field-recording library. **Filter by license:
  Creative Commons 0.** Great for arrow, impact, jungle ambience, whooshes.
  Watch for AI-generated uploads (human-made-only constraint above).
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

- [ ] Key's status allows landing a file (§2 Status column; wired ≠ approved)
- [ ] File found and previewed (listened to — it actually fits)
- [ ] Human-made provenance confirmed — not AI-generated (owner policy 2026-06-11)
- [ ] License is CC0 (preferred) or CC-BY; commercial + redistribution OK
- [ ] Trimmed/leveled to the spec (length, loop seam, ~target loudness)
- [ ] Exported as `.ogg`, named to the **Key**, placed in `src/assets/audio/<sub>/`
- [ ] If CC-BY: entry added to `docs/AUDIO-CREDITS.md`

The `SoundManager` rewrite landed 2026-06-11 (single shared `AudioContext`,
gesture-init in `Game.startRun`, disposal in `Game.cleanup()`): any file
dropped in `src/assets/audio/` under its Key name is auto-discovered at build
time and plays immediately — no per-asset code change needed. Variant
round-robin works via `-2`/`-3` filename suffixes (e.g. `arrow-fire-2.ogg`).
The §1 keys fall back to the original synth tones until their files land. The
§2 hooks for `dash`, `burst-activate`, `stamina-low`, and `room-transition`
are triggered by the game and stay silent until files exist — but check the
§2 Status column before landing a file (`room-transition` and `family-death`
are not approved; `dash` may be removed with its mechanic; `barrier-lay` has
no mechanic at all yet).

Looping bed playback landed 2026-06-11 with the §3–4 greenlight. It is
scene-driven: `Game` declares where the player is via
`SoundManager.setScene()` and the scene table owns which bed loops there —
`menu` → `music-menu`, `gameplay` → `ambience-jungle`, `boss` (anchor 10)
→ `music-boss` + `ambience-corrupted` (when its file exists), and `silent`
(game over / victory) → beds fade out so the sting lands over silence. Beds
crossfade ~0.5 s on scene change, loop gaplessly via
`AudioBufferSourceNode.loop`, and any missing file simply doesn't play —
same auto-discovery as SFX, no per-asset code. Because the title screen
shows before any user gesture, SoundManager arms a one-time window
pointer/key listener that unlocks the shared AudioContext and starts the
menu bed on the first interaction; the listener is removed on success and
from `Game.cleanup()`. The sound toggle mutes beds and SFX alike; beds play
at unity gain in code, so the file-side leveling above (beds −18 to −14
dBFS vs SFX −6 dBFS) is what keeps SFX readable over the bed.
