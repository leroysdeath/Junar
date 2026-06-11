# Junar — Audio Credits & Provenance Log

Companion to `docs/AUDIO-ASSETS.md`. One entry per shipped audio file: where it
came from, its license as verified on the source page at download time, the
human-made-provenance evidence (owner policy 2026-06-11: nothing AI-generated),
and what we changed.

**Every shipped asset below is CC0 / public-domain dedication — no attribution
is legally required.** This log exists because the manifest's sourcing
checklist requires provenance to be auditable, and because one CC0 author
requests a courtesy credit (noted in their entry). If a CC-BY or paid asset
ever lands, its legally required attribution goes here too.

All freesound files are the login-free 128 kbps HQ MP3 previews from
`cdn.freesound.org` (the originals are login-gated; CC0 covers the work in any
rendition). Quality upgrade path: pull the original WAVs through a free
freesound account and re-run the same processing — sources and edits are fully
documented below.

---

## SFX (`src/assets/audio/sfx/`)

### `arrow-fire.ogg`, `arrow-fire-2.ogg`, `arrow-fire-3.ogg`
- **Source:** "Razorback Archery.wav" by **arcandio** —
  <https://freesound.org/people/arcandio/sounds/347884/>
- **License:** CC0 (verified on page 2026-06-11)
- **Provenance:** uploaded 2016-06-16 (pre-generative-AI); description
  documents a real session — 30# PSE Razorback recurve, 1000-spine arrows,
  recorded at 5 yards in a basement archery range. No AI tags.
- **Changes:** sliced three distinct shots (source offsets ≈ 2.5 s, 57.7 s,
  66.2 s) from the 78 s session; trimmed each to the ~120 ms release + whoosh
  transient, cutting before the target-impact thwack (the impact is
  `enemy-hit`'s job); mono; faded; peak-normalized to −6 dBFS; OGG Vorbis q4.

### `enemy-hit.ogg`
- **Source:** "LowHit_01.wav" by **Faulkin** —
  <https://freesound.org/people/Faulkin/sounds/336495/>
- **License:** CC0 (verified on page 2026-06-11)
- **Provenance:** uploaded 2016-02-14 (pre-generative-AI); plain foley
  descriptors (soft, impact, thud), no AI tags.
- **Changes:** 163 ms "short muffled thud" kept whole; mono; tail fade;
  +20.6 dB gain to bring the quiet source to −6 dBFS peak; OGG Vorbis q4.

### `game-over.ogg`
- **Source:** "Very low frequency impact.wav" by **AudioPapkin** —
  <https://freesound.org/people/AudioPapkin/sounds/541029/>
- **License:** CC0 (verified on page 2026-06-11)
- **Provenance:** uploaded 2020-10-25 (pre-2022); field-recording gear notes
  in description (Zoom H6, Oktava MK-012-01). No AI tags.
- **Changes:** trimmed 1.9 s source to a 1.45 s core with a 250 ms tail fade;
  mono; peak-normalized to −6 dBFS; OGG Vorbis q4.

### `victory.ogg`
- **Source:** "GASP_Chimes_Success_4.wav" by **Rob_Marion** (Game Audio
  Starter Pack) — <https://freesound.org/people/Rob_Marion/sounds/541985/>
- **License:** CC0 (verified on page 2026-06-11)
- **Provenance:** uploaded 2020-11-03 (pre-2022), part of the hand-organized
  GASP pack with per-variation descriptions. No AI tags.
- **Changes:** kept the 1.59 s warm success chime whole; resampled
  48 kHz → 44.1 kHz; tail safety fade; peak-normalized to −6 dBFS; stereo;
  OGG Vorbis q4.

## Ambience (`src/assets/audio/ambience/`)

### `ambience-jungle.ogg`
- **Source:** "Forest Ambience, Monk's Trail, Chiang Mai, Thailand
  (March 7, 2019)" by **marc.om** —
  <https://freesound.org/people/marc.om/sounds/804838/>
- **License:** CC0 (verified on page 2026-06-11)
- **Provenance:** uploaded 2025-05-08, but the recording date (2019-03-07,
  pre-generative-AI) is corroborated independently: the author's account
  predates 2016, the catalog is dozens of date/location-stamped SE-Asia field
  recordings from Feb–May 2019, and a sibling same-day recording from the
  same trail exists on the profile. Adversarial verifier approved on that
  trail. Real field recording (birdsong, insects, rustling leaves).
- **Changes:** took the steady 8–76 s region; built a 64 s seamless loop via
  a 4 s equal-power tail→head crossfade (wrap continuity verified at PCM
  level); leveled to −16 dBFS peak; stereo; OGG Vorbis q3.

### `ambience-corrupted.ogg`
- **Source:** "Ominous and Deep Ambience" by **Resaural** —
  <https://freesound.org/people/Resaural/sounds/467026/>
- **License:** CC0 (verified on page 2026-06-11). The description adds an
  informal "don't claim authorship" request — we don't.
- **Provenance:** uploaded 2019-04-21 (pre-generative-AI); description
  documents the hand-built synth chain (FL Studio 20, Harmor, Harmless,
  ValhallaRoom, layered sub-bass). No AI tags.
- **Changes:** took the 2–62 s region; 56 s seamless loop via a 4 s
  equal-power crossfade; leveled to ≈−17 dBFS peak (the restrained, lower
  end of the bed window); stereo; OGG Vorbis q3.

## Music (`src/assets/audio/music/`)

### `music-menu.ogg`
- **Source:** "Tambura_Eb_fat.aiff" (8-string tambura drone in Eb) by
  **Kaczinski** — <https://freesound.org/people/Kaczinski/sounds/506312/>
- **License:** CC0 (verified on page 2026-06-11)
- **Provenance:** uploaded 2020-02-18 (pre-2022); stereo recording of the
  author's own custom-built 8-string tambura through two Groove Tubes GT33
  mics. An authentic tanpura-family drone — the dignified "Indian-coded
  without caricature" direction the manifest names. No AI tags.
- **Changes:** took the steady 20–84 s region of the 189 s recording; 60 s
  seamless loop via a 4 s equal-power crossfade; leveled to −15 dBFS peak;
  stereo; OGG Vorbis q3.

### `music-boss.ogg`
- **Source:** "Dark Forest Theme" by **cynicmusic** (Alex Smith,
  pixelsphere.org) — <https://opengameart.org/content/dark-forest-theme>
- **License:** CC0 (verified on page 2026-06-11)
- **Courtesy credit (requested on the page, not legally required):**
  *Music: "Dark Forest Theme" — The Cynic Project / cynicmusic.com /
  pixelsphere.org.* Keep this line in any shipped credits screen.
- **Provenance:** uploaded to OpenGameArt 2017-12-31 (pre-generative-AI);
  one of a 50-song soundtrack the author composed for the game Pixelsphere;
  dark brooding acoustic guitar and strings. No AI tags.
- **Changes:** cut before the authored fade-out (0.05–91.5 s); 88.45 s
  seamless loop via a 3 s equal-power crossfade; leveled to −14 dBFS peak
  (the most present bed — it scores the boss confrontation); stereo;
  OGG Vorbis q3.
