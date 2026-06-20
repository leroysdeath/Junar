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
// - Looping beds (manifest §3–4, owner-greenlit 2026-06-11) are scene-driven:
//   Game declares WHERE the player is via setScene() and SoundManager owns
//   WHICH bed loops there (menu → music-menu, gameplay → ambience-jungle,
//   boss arena → music-boss + ambience-corrupted). Beds crossfade on scene
//   change, loop gaplessly via AudioBufferSourceNode.loop, and degrade to
//   silence while their file is missing. Because the menu shows before any
//   user gesture, setScene arms a one-time window gesture listener that
//   unlocks the context and starts the pending bed — removed on success and
//   from dispose().

// The four in-scope SFX (manifest §1) plus the optional event SFX the game
// already raises (§2). 'family-death' is specced but has no trigger until
// family combat lands (CLAUDE.md §5).
export type SoundKey =
  | 'arrow-fire'
  | 'enemy-hit'
  | 'game-over'
  | 'victory'
  | 'sprint'
  | 'burst-activate'
  | 'stamina-low'
  | 'room-transition'
  | 'family-death';

// Looping beds (manifest §3 ambience + §4 music, greenlit 2026-06-11).
export type LoopKey =
  | 'music-menu'
  | 'music-boss'
  | 'ambience-jungle'
  | 'ambience-corrupted';

// Where the player is, as far as audio is concerned. Game owns the state
// transitions; SoundManager owns the scene → bed mapping below.
export type SoundScene = 'menu' | 'gameplay' | 'boss' | 'silent';

// Beds per scene. A key with no decoded file is skipped, so a scene with
// missing files plays whatever subset exists (or nothing). 'silent' is the
// terminal game-over/victory state — the one-shot stings play over no bed.
const SCENE_LOOPS: Record<SoundScene, LoopKey[]> = {
  menu: ['music-menu'],
  gameplay: ['ambience-jungle'],
  boss: ['music-boss', 'ambience-corrupted'],
  silent: [],
};

// Beds ship pre-leveled well under the SFX peaks (manifest loudness spec:
// SFX ≈ −6 dBFS, beds −18 to −14 dBFS), so unity gain here keeps the mix
// relationship from the files; this is the per-cue trim knob for the
// owner-led mix pass later.
const LOOP_GAIN = 1.0;
// Bed crossfade on scene change — long enough to avoid a hard cut reading
// as a glitch, short enough that the boss room hits within a beat.
const LOOP_FADE_S = 0.5;

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
  private scene: SoundScene = 'silent';
  private activeLoops = new Map<
    LoopKey,
    { source: AudioBufferSourceNode; gain: GainNode }
  >();
  private gestureUnlock: (() => void) | null = null;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  // Create the shared AudioContext (first call) and resume it if the
  // autoplay policy left it suspended. Safe to call repeatedly; only
  // effective when reached from a user-gesture call stack. Once the context
  // is actually running, the pending scene's beds start (applyScene is
  // idempotent — already-playing beds are left alone).
  unlock() {
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtor) return;
      this.ctx = new AudioCtor();
      void this.decodeFiles(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx
        .resume()
        .then(() => {
          this.disarmGestureUnlock();
          this.applyScene();
        })
        .catch(() => {
          // Still outside a gesture; a later unlock()/play() retries.
        });
    } else if (this.ctx.state === 'running') {
      this.disarmGestureUnlock();
      this.applyScene();
    }
  }

  // Declare where the player is; the SCENE_LOOPS table decides what loops
  // there. Called by Game on state transitions (menu/run/boss/terminal).
  setScene(scene: SoundScene) {
    if (this.scene === scene) return;
    this.scene = scene;
    this.applyScene();
  }

  // Reconcile playing beds against the current scene: fade out beds the
  // scene doesn't want, fade in the ones it does. Runs on every scene
  // change, unlock, decode completion, and enable toggle — all the points
  // where "what should play" or "what can play" changes.
  private applyScene() {
    const ctx = this.ctx;
    if (!this.enabled || !ctx || ctx.state !== 'running') {
      this.stopAllLoops();
      // Blocked only by the autoplay gate (not by the sound toggle): arm a
      // window-level gesture hook so the menu bed can start on the first
      // interaction — the menu renders long before any game gesture.
      if (this.enabled && (!ctx || ctx.state !== 'running')) {
        this.armGestureUnlock();
      }
      return;
    }
    const desired = SCENE_LOOPS[this.scene].filter(
      (key) => (this.buffers.get(key) ?? []).length > 0,
    );
    for (const key of [...this.activeLoops.keys()]) {
      if (!desired.includes(key)) this.stopLoop(key);
    }
    for (const key of desired) {
      if (!this.activeLoops.has(key)) this.startLoop(ctx, key);
    }
  }

  private startLoop(ctx: AudioContext, key: LoopKey) {
    const buffer = this.buffers.get(key)?.[0];
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(LOOP_GAIN, ctx.currentTime + LOOP_FADE_S);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    this.activeLoops.set(key, { source, gain });
  }

  private stopLoop(key: LoopKey) {
    const loop = this.activeLoops.get(key);
    if (!loop) return;
    this.activeLoops.delete(key);
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      // No clock to fade against (context suspended/closed) — hard stop.
      try {
        loop.source.stop();
      } catch {
        // Already stopped — nothing to release.
      }
      return;
    }
    const t = ctx.currentTime;
    loop.gain.gain.cancelScheduledValues(t);
    loop.gain.gain.setValueAtTime(loop.gain.gain.value, t);
    loop.gain.gain.linearRampToValueAtTime(0, t + LOOP_FADE_S);
    loop.source.stop(t + LOOP_FADE_S);
  }

  private stopAllLoops() {
    for (const key of [...this.activeLoops.keys()]) {
      this.stopLoop(key);
    }
  }

  // The menu is on screen before any user gesture, so the menu bed can't
  // start until the user first touches the page. Listen window-wide for
  // that first gesture; unlock() disarms this once the context is running.
  // Not {once: true}: a gesture the browser rejects (edge cases around
  // synthetic events) must not burn the only retry.
  private armGestureUnlock() {
    if (this.gestureUnlock) return;
    const handler = () => this.unlock();
    this.gestureUnlock = handler;
    window.addEventListener('pointerdown', handler);
    window.addEventListener('keydown', handler);
  }

  private disarmGestureUnlock() {
    if (!this.gestureUnlock) return;
    window.removeEventListener('pointerdown', this.gestureUnlock);
    window.removeEventListener('keydown', this.gestureUnlock);
    this.gestureUnlock = null;
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
    // Muting fades the beds out; re-enabling brings the current scene back.
    this.applyScene();
  }

  // Release the shared AudioContext. Routed from Game.cleanup() so React
  // StrictMode's double-mount doesn't accumulate contexts.
  dispose() {
    this.disarmGestureUnlock();
    this.activeLoops.clear(); // closing the context halts every source
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
  // silence) — audio is non-critical and must never halt the game. Once all
  // decodes settle, the scene is re-applied: the active scene's bed usually
  // finishes decoding after the first gesture already unlocked the context.
  private async decodeFiles(ctx: AudioContext) {
    await Promise.all(
      Object.entries(AUDIO_FILE_URLS).map(async ([path, url]) => {
        try {
          const response = await fetch(url);
          const buffer = await ctx.decodeAudioData(
            await response.arrayBuffer(),
          );
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
    if (this.ctx === ctx) this.applyScene();
  }

  private playSynth(ctx: AudioContext, spec: SynthSpec) {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = spec.type;
    oscillator.frequency.setValueAtTime(spec.frequency, ctx.currentTime);

    gainNode.gain.setValueAtTime(SYNTH_GAIN, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      ctx.currentTime + spec.duration,
    );

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + spec.duration);
  }
}
