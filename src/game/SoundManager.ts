// SoundManager — file-first SFX playback with the legacy synth tones as
// fallback. Rewritten per CLAUDE.md §7 (single shared AudioContext, lazy
// gesture-init) against the asset spec in docs/AUDIO-ASSETS.md.
//
// How it works:
// - ONE AudioContext for the whole game, created/resumed by unlock().
//   Browsers gate audio behind a user gesture, so unlock() must first run
//   inside a gesture call stack — Game.startRun qualifies (it executes
//   synchronously inside the Start/Restart button's click handler and the
//   menu canvas-click listener). play() also calls unlock() defensively.
// - Sound keys follow the manifest's Key column. Real recordings dropped in
//   src/assets/audio/{sfx,music,ambience}/<key>.ogg (or .mp3 fallback) are
//   discovered at build time via import.meta.glob — zero files present is
//   valid, and per-key synth fallbacks keep the four original tones playing
//   until their files land. Keys with no file and no fallback are silent.
// - Variants round-robin: arrow-fire.ogg, arrow-fire-2.ogg, arrow-fire-3.ogg
//   all register under 'arrow-fire' and alternate per play (the manifest
//   asks for 2–3 arrow variants to avoid machine-gun sameness).
// - Music/ambience keys are discovered like any other but there is no loop
//   playback here yet — beds are a scope addition needing owner sign-off
//   (docs/AUDIO-ASSETS.md §3–4); add looping only once greenlit.

// The four in-scope SFX (manifest §1) plus the optional event SFX the game
// already raises (§2). 'family-death' is specced but has no trigger until
// family combat lands (CLAUDE.md §5).
export type SoundKey =
  | 'arrow-fire'
  | 'enemy-hit'
  | 'game-over'
  | 'victory'
  | 'dash'
  | 'burst-activate'
  | 'stamina-low'
  | 'room-transition'
  | 'family-death';

interface SynthSpec {
  frequency: number;
  duration: number;
  type: OscillatorType;
}

// The original placeholder tones, preserved verbatim under their manifest
// keys so the game sounds identical until real recordings replace them.
const SYNTH_FALLBACK: Partial<Record<SoundKey, SynthSpec>> = {
  'arrow-fire': { frequency: 200, duration: 0.1, type: 'square' },
  'enemy-hit': { frequency: 400, duration: 0.15, type: 'square' },
  'game-over': { frequency: 150, duration: 0.5, type: 'sawtooth' },
  victory: { frequency: 500, duration: 0.8, type: 'sine' },
};

const SYNTH_GAIN = 0.3;

// Build-time discovery of bundled audio. Resolves to an empty object while
// src/assets/audio/ has no files, so the build never breaks on the missing
// directory. Vite fingerprints + bundles whatever lands there (Tauri-safe:
// plain bundled assets, no streaming).
const AUDIO_FILE_URLS = import.meta.glob('../assets/audio/**/*.{ogg,mp3}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

// 'sfx/arrow-fire-2.ogg' → base key 'arrow-fire'. A trailing -<n> marks a
// round-robin variant of the same key (no manifest key ends in a digit).
const keyFromPath = (path: string): string => {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.(ogg|mp3)$/, '').replace(/-\d+$/, '');
};

export class SoundManager {
  private enabled: boolean;
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer[]>();
  private nextVariant = new Map<string, number>();

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  // Create the shared AudioContext (first call) and resume it if the
  // autoplay policy left it suspended. Safe to call repeatedly; only
  // effective when reached from a user-gesture call stack.
  unlock() {
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      this.ctx = new AudioCtor();
      void this.decodeFiles(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        // Still outside a gesture; a later unlock()/play() retries.
      });
    }
  }

  play(soundName: SoundKey) {
    if (!this.enabled) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;

    const variants = this.buffers.get(soundName);
    if (variants && variants.length > 0) {
      const i = this.nextVariant.get(soundName) ?? 0;
      this.nextVariant.set(soundName, (i + 1) % variants.length);
      const source = ctx.createBufferSource();
      source.buffer = variants[i];
      source.connect(ctx.destination);
      source.start();
      return;
    }

    const synth = SYNTH_FALLBACK[soundName];
    if (synth) this.playSynth(ctx, synth);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  // Release the shared AudioContext. Routed from Game.cleanup() so React
  // StrictMode's double-mount doesn't accumulate contexts.
  dispose() {
    if (this.ctx) {
      void this.ctx.close().catch(() => {
        // Already closed/closing — nothing to release.
      });
      this.ctx = null;
    }
    this.buffers.clear();
    this.nextVariant.clear();
  }

  // One-time fetch+decode of every discovered asset, kicked off when the
  // context is created. Failures degrade silently to the synth fallback (or
  // silence) — audio is non-critical and must never halt the game.
  private async decodeFiles(ctx: AudioContext) {
    await Promise.all(
      Object.entries(AUDIO_FILE_URLS).map(async ([path, url]) => {
        try {
          const response = await fetch(url);
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          if (this.ctx !== ctx) return; // disposed mid-decode
          const key = keyFromPath(path);
          const variants = this.buffers.get(key) ?? [];
          variants.push(buffer);
          this.buffers.set(key, variants);
        } catch {
          // Undecodable/missing file — this key keeps its fallback behavior.
        }
      }),
    );
  }

  private playSynth(ctx: AudioContext, spec: SynthSpec) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = spec.type;
    oscillator.frequency.setValueAtTime(spec.frequency, ctx.currentTime);

    gainNode.gain.setValueAtTime(SYNTH_GAIN, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + spec.duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + spec.duration);
  }
}
