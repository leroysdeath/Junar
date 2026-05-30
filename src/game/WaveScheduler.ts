import {
  BandSpec,
  BeatRole,
  EnemyType,
  LevelWaveConfig,
  SpawnTemplate,
  Vector2,
  WaveTemplate,
} from './types';
import {
  TILE_SIZE,
  RUN_START_GRACE_MS,
  TRIPLET_BREAK_MIN_MS,
  TRIPLET_BREAK_MAX_MS,
  WAVE_ENEMYCOUNT_CAP,
  TYPE_UNLOCK_BEAR_WAVE,
} from './constants';

export interface SpawnRequest {
  type: EnemyType;
  position: Vector2;
  entryDirection: Vector2;
}

interface SchedulerCallbacks {
  onWaveStart?: (waveIndex: number, totalWaves: number, beatRole: BeatRole) => void;
  onWaveComplete?: (waveIndex: number) => void;
  onLullStart?: (durationMs: number) => void;
}

// ---------------------------------------------------------------------------
// Shared band-drip mechanics (used by both schedulers)
// ---------------------------------------------------------------------------

// Speeds in px/s — must mirror Enemy.ts. The schedulers don't construct
// Enemy instances, so they need their own copy to compute row drip cadence.
const ENEMY_SPEED: Record<EnemyType, number> = {
  panther: 395,
  bear: 218,
  snake: 68,
  gibbon: 34,
};

function templateEnemyCount(template: SpawnTemplate): number {
  let n = 0;
  for (const row of template.rows) n += row.length;
  return n;
}

// Map an in-row slot to a world-space pixel position for the enemy AABB's
// top-left. `slotOffset` is the cumulative width of the prior enemies in the
// row (so the AABB top-left sits exactly at that offset along the band's
// orthogonal axis); `rowIndex` stacks rows one tile deep opposite the entry
// direction.
function slotPosition(band: BandSpec, slotOffset: number, rowIndex: number): Vector2 {
  const horizontal = band.entryDirection.y !== 0;
  const slot: Vector2 = horizontal
    ? { x: band.rect.x + slotOffset, y: band.rect.y }
    : { x: band.rect.x, y: band.rect.y + slotOffset };
  return {
    x: slot.x - band.entryDirection.x * rowIndex * TILE_SIZE,
    y: slot.y - band.entryDirection.y * rowIndex * TILE_SIZE,
  };
}

interface PendingGroup {
  bandIndex: number;
  rows: EnemyType[][];
  nextRowToSpawn: number;
}

// Owns a set of spawn bands and the queue of group rows draining into them.
// Each band can accept one row at a time; after a row enters, the band is
// blocked until that row's slowest unit has cleared one tile. Both the
// per-level WaveScheduler and the GlobalWaveScheduler compose one of these.
class BandDripper {
  private bands: BandSpec[] = [];
  // Earliest time (ms, rAF clock) each band can accept a new row.
  private bandReadyAtMs: number[] = [];
  // Groups drawn but still dripping rows in.
  private pending: PendingGroup[] = [];

  setBands(bands: BandSpec[]): void {
    this.bands = bands;
    this.bandReadyAtMs = bands.map(() => -Infinity);
    this.pending = [];
  }

  // Shift every pending band-ready deadline forward by `deltaMs`. Used by the
  // GlobalWaveScheduler's pause/resume so a paused stretch (room transition,
  // boss arena) doesn't make blocked bands fire all at once on resume.
  shiftTime(deltaMs: number): void {
    for (let i = 0; i < this.bandReadyAtMs.length; i++) {
      if (Number.isFinite(this.bandReadyAtMs[i])) this.bandReadyAtMs[i] += deltaMs;
    }
  }

  // Indices of bands ready to accept a new group's front row right now.
  readyBands(nowMs: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.bands.length; i++) {
      if (this.bandReadyAtMs[i] <= nowMs) out.push(i);
    }
    return out;
  }

  addGroup(bandIndex: number, rows: EnemyType[][]): void {
    this.pending.push({ bandIndex, rows, nextRowToSpawn: 0 });
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  // Enemies still queued in pending rows (not yet emitted).
  pendingEnemyCount(): number {
    let n = 0;
    for (const g of this.pending) {
      for (let r = g.nextRowToSpawn; r < g.rows.length; r++) n += g.rows[r].length;
    }
    return n;
  }

  // Emit the next ready row of every pending group whose band is free. Lays
  // the row's enemies out along the band's orthogonal axis by cumulative
  // width, then blocks the band until the row's slowest unit clears one tile.
  drip(nowMs: number): SpawnRequest[] {
    const out: SpawnRequest[] = [];
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const group = this.pending[i];
      if (this.bandReadyAtMs[group.bandIndex] > nowMs) continue;

      const row = group.rows[group.nextRowToSpawn];
      const band = this.bands[group.bandIndex];
      let rowMinSpeed = Infinity;
      let offset = 0;
      for (let c = 0; c < row.length; c++) {
        const type = row[c];
        out.push({
          type,
          position: slotPosition(band, offset, group.nextRowToSpawn),
          entryDirection: { ...band.entryDirection },
        });
        // Advance by this enemy's AABB width. Step 1 uses a uniform tile
        // width for every type; Step 2 swaps in per-type ENEMY_AABB_PX
        // (ROADMAP §5.7), so snakes pack tightly and bears take more room.
        offset += TILE_SIZE;
        if (ENEMY_SPEED[type] < rowMinSpeed) rowMinSpeed = ENEMY_SPEED[type];
      }

      group.nextRowToSpawn++;

      // Block the band until this row has cleared one tile. An empty row
      // (no enemies) leaves the band ready immediately.
      if (Number.isFinite(rowMinSpeed)) {
        this.bandReadyAtMs[group.bandIndex] = nowMs + (TILE_SIZE / rowMinSpeed) * 1000;
      }

      if (group.nextRowToSpawn >= group.rows.length) {
        this.pending.splice(i, 1);
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Per-level WaveScheduler (legacy). As of Step 3 of the traversable-maps
// refactor this class is no longer wired into Game — the run-long
// GlobalWaveScheduler below drives all spawns — but it is kept here (unused)
// pending a later cleanup pass. Drives spawn ticks for a single level:
// setup → add → test waves gated on clearing each wave, with a fixed
// inter-wave lull.
// ---------------------------------------------------------------------------

type Phase = 'spawning' | 'awaiting_clear' | 'lull' | 'finished';

// Time source must be the rAF currentTime passed by gameLoop — never
// Date.now (Invariant 8). Each spawn tick draws a group template from the
// wave's pool, then drips the template's rows into the chosen band at one
// row per (TILE_SIZE / row's slowest unit speed) ms. Waves end when their
// enemyCount soft target is reached AND every spawned enemy has died.
export class WaveScheduler {
  private config: LevelWaveConfig;
  private callbacks: SchedulerCallbacks;
  private waveIndex = 0;
  private phase: Phase = 'spawning';
  private spawnedInWave = 0;
  private lastSpawnAt = -Infinity;
  private phaseStartedAt = 0;
  private started = false;
  private dripper = new BandDripper();

  constructor(config: LevelWaveConfig, callbacks: SchedulerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.dripper.setBands(config.bands);
  }

  // First tick after construction starts wave 0.
  tick(nowMs: number, liveEnemyCount: () => number): SpawnRequest[] {
    if (!this.started) {
      this.started = true;
      this.phaseStartedAt = nowMs;
      this.callbacks.onWaveStart?.(
        this.waveIndex,
        this.config.waves.length,
        this.currentWave().beatRole,
      );
    }

    if (this.phase === 'finished') return [];

    // Phase 1 — draw a new group if the spawn timer has elapsed and the
    // wave's soft target hasn't been reached.
    if (this.phase === 'spawning') {
      const wave = this.currentWave();
      if (
        this.spawnedInWave < wave.enemyCount &&
        nowMs - this.lastSpawnAt >= wave.spawnIntervalMs
      ) {
        const drawn = this.tryDrawGroup(nowMs, wave);
        if (drawn) {
          this.spawnedInWave += templateEnemyCount(drawn);
          this.lastSpawnAt = nowMs;
        }
      }
      if (this.spawnedInWave >= wave.enemyCount) {
        this.phase = 'awaiting_clear';
      }
    }

    // Phase 2 — drip ready pending rows (runs in every phase so groups that
    // overshot enemyCount still finish entering during awaiting_clear).
    const out = this.dripper.drip(nowMs);

    // Phase 3 — phase transitions. Note: spawns emitted in `out` this tick
    // aren't yet reflected in liveEnemyCount() (Game adds them to its enemy
    // list only after tick returns). Requiring out.length === 0 defers the
    // wave-complete check by one tick whenever we just emitted.
    if (this.phase === 'awaiting_clear') {
      if (
        out.length === 0 &&
        !this.dripper.hasPending() &&
        liveEnemyCount() === 0
      ) {
        this.callbacks.onWaveComplete?.(this.waveIndex);
        if (this.waveIndex >= this.config.waves.length - 1) {
          this.phase = 'finished';
        } else {
          this.phase = 'lull';
          this.phaseStartedAt = nowMs;
          this.callbacks.onLullStart?.(this.config.interWaveLullMs);
        }
      }
    } else if (this.phase === 'lull') {
      if (nowMs - this.phaseStartedAt >= this.config.interWaveLullMs) {
        this.waveIndex++;
        this.phase = 'spawning';
        this.spawnedInWave = 0;
        this.lastSpawnAt = -Infinity;
        this.phaseStartedAt = nowMs;
        this.callbacks.onWaveStart?.(
          this.waveIndex,
          this.config.waves.length,
          this.currentWave().beatRole,
        );
      }
    }

    return out;
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  currentWaveIndex(): number {
    return this.waveIndex;
  }

  currentBeatRole(): BeatRole | null {
    if (this.phase === 'finished') return null;
    return this.currentWave().beatRole;
  }

  totalWaves(): number {
    return this.config.waves.length;
  }

  // Live enemies + enemies still queued in pending rows + estimated enemies
  // for groups not yet drawn (soft target — may overshoot).
  remainingInWave(liveEnemyCount: () => number): number {
    if (this.phase === 'finished') return 0;
    const wave = this.currentWave();
    return (
      liveEnemyCount() +
      this.dripper.pendingEnemyCount() +
      Math.max(0, wave.enemyCount - this.spawnedInWave)
    );
  }

  remainingInLevel(liveEnemyCount: () => number): number {
    let total = this.remainingInWave(liveEnemyCount);
    for (let i = this.waveIndex + 1; i < this.config.waves.length; i++) {
      total += this.config.waves[i].enemyCount;
    }
    return total;
  }

  // Draw a template + a ready band. If no band is ready (all blocked by a
  // prior group's drip), defer the draw — caller retries next tick without
  // advancing the spawn clock.
  private tryDrawGroup(nowMs: number, wave: WaveTemplate): SpawnTemplate | null {
    const isFirstSpawn = this.spawnedInWave === 0;
    const pool =
      isFirstSpawn && wave.firstSpawnPool
        ? wave.firstSpawnPool
        : this.config.groupPool;
    if (pool.length === 0) return null;
    const ready = this.dripper.readyBands(nowMs);
    if (ready.length === 0) return null;

    const template = pool[Math.floor(Math.random() * pool.length)];
    const bandIndex = ready[Math.floor(Math.random() * ready.length)];
    this.dripper.addGroup(bandIndex, template.rows);
    return template;
  }

  private currentWave(): WaveTemplate {
    return this.config.waves[this.waveIndex];
  }
}

// ---------------------------------------------------------------------------
// GlobalWaveScheduler (Step 1 of the traversable-maps refactor)
// ---------------------------------------------------------------------------
//
// A single run-long scheduler (no per-level binding). Lifecycle:
//   grace (RUN_START_GRACE_MS) → wave 1 → … in triplets of three waves
//   (setup → add → test). Within a triplet, waves are separated by a short
//   inter-wave lull; between triplets, by a long random break. It never
//   finishes — wave size/cadence escalate via waveParams() indefinitely.
//
// Unlike the per-level scheduler, advancement is purely time-driven: a wave
// moves on once its enemies have been emitted (no clear-gate). All timing
// flows from the gameLoop currentTime (Invariant 8); the scheduler holds no
// listeners or timers, so it needs no disposal.

export interface GlobalSchedulerConfig {
  snakePantherPool: SpawnTemplate[];      // waves 1–6
  snakePantherBearPool: SpawnTemplate[];  // waves TYPE_UNLOCK_BEAR_WAVE+
  interWaveLullMs: number;                // short lull within a triplet
}

export interface GlobalSchedulerCallbacks {
  onGraceStart?: (durationMs: number) => void;
  onWaveStart?: (waveNum: number, triplet: number, beatRole: BeatRole) => void;
  onInterWaveLull?: (durationMs: number) => void;
  onTripletBreak?: (durationMs: number) => void;
}

type GlobalPhase = 'grace' | 'spawning' | 'lull' | 'break';

const WAVES_PER_TRIPLET = 3;
const BEAT_BY_ROLE: BeatRole[] = ['setup', 'add', 'test'];

// Per-wave enemy budget + spawn interval, indexed [triplet-1][role]
// (role: 0=setup, 1=add, 2=test). Triplets 1–3 are the hand-authored L1–L3
// numbers, except L3 wave 3 is retuned 28→25 to match the cap. Triplet 4+
// extends from the L3 row (see waveParams). ROADMAP §5.4 (Option A).
const AUTHORED_ENEMYCOUNT: number[][] = [
  [10, 14, 20], // triplet 1 (was L1)
  [14, 20, 26], // triplet 2 (was L2 — 26 retained; cap applies only at the formula branch)
  [16, 22, 25], // triplet 3 (was L3, wave 3 retuned 28→25)
];
const AUTHORED_INTERVAL_MS: number[][] = [
  [2500, 2000, 1500],
  [2000, 1700, 1400],
  [1700, 1400, 1300],
];
// The L3 row the formula extends from, for triplets beyond the authored set.
const L3_ENEMYCOUNT = [16, 22, 25];
const L3_INTERVAL_MS = [1700, 1400, 1300];
const TRIPLET_ENEMYCOUNT_GROWTH = 1;   // +1 enemy per triplet beyond authored
const TRIPLET_INTERVAL_DECAY_MS = 50;  // −50 ms interval per triplet beyond authored
const TRIPLET_INTERVAL_FLOOR_MS = 800; // interval never drops below this

interface WaveParams {
  enemyCount: number;
  spawnIntervalMs: number;
  triplet: number; // 1-indexed
  role: number;    // 0=setup, 1=add, 2=test
  beatRole: BeatRole;
}

// Resolve a 1-indexed global wave number to its size + cadence.
function waveParams(waveNum: number): WaveParams {
  const triplet = Math.floor((waveNum - 1) / WAVES_PER_TRIPLET) + 1;
  const role = (waveNum - 1) % WAVES_PER_TRIPLET;
  let enemyCount: number;
  let spawnIntervalMs: number;
  if (triplet <= AUTHORED_ENEMYCOUNT.length) {
    enemyCount = AUTHORED_ENEMYCOUNT[triplet - 1][role];
    spawnIntervalMs = AUTHORED_INTERVAL_MS[triplet - 1][role];
  } else {
    const beyond = triplet - AUTHORED_ENEMYCOUNT.length; // ≥ 1
    enemyCount = Math.min(
      L3_ENEMYCOUNT[role] + beyond * TRIPLET_ENEMYCOUNT_GROWTH,
      WAVE_ENEMYCOUNT_CAP,
    );
    spawnIntervalMs = Math.max(
      TRIPLET_INTERVAL_FLOOR_MS,
      L3_INTERVAL_MS[role] - beyond * TRIPLET_INTERVAL_DECAY_MS,
    );
  }
  return { enemyCount, spawnIntervalMs, triplet, role, beatRole: BEAT_BY_ROLE[role] };
}

export class GlobalWaveScheduler {
  private config: GlobalSchedulerConfig;
  private callbacks: GlobalSchedulerCallbacks;
  private dripper = new BandDripper();
  private phase: GlobalPhase = 'grace';
  private started = false;
  private waveNum = 0; // 0 until the first wave begins (during grace)
  private spawnedInWave = 0;
  private lastSpawnAt = -Infinity;
  // When the current timed phase (grace / lull / break) ends.
  private phaseDeadlineMs = 0;
  private currentEnemyCount = 0;
  private currentIntervalMs = 0;
  private currentPool: SpawnTemplate[] = [];
  // Pause state (Step 3). All phase timing is absolute rAF time, so a pause
  // records when it began and resume() shifts every future deadline forward by
  // the paused duration — keeping the grace/wave/lull/break cadence intact
  // across room transitions (and, later, the boss arena).
  private paused = false;
  private pausedAtMs = 0;

  constructor(config: GlobalSchedulerConfig, callbacks: GlobalSchedulerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  // The current room's spawn bands — updated on every room entry (Step 3) from
  // the room template's openings (per-opening bands, roadmap §5.5).
  //
  // A room transition can land mid-drip: dripper.setBands discards the old
  // room's still-queued group rows. spawnedInWave was credited the WHOLE
  // template at draw time, so without reconciling, those dropped (never-
  // emitted) enemies would still count toward the wave's soft target and the
  // completion gate (spawnedInWave >= currentEnemyCount && !hasPending) would
  // end the wave early with fewer enemies released. Credit the dropped count
  // back so the scheduler re-draws the remaining budget into the new room and
  // the per-wave enemy count stays honest across transitions.
  setBands(bands: BandSpec[]): void {
    this.spawnedInWave = Math.max(
      0,
      this.spawnedInWave - this.dripper.pendingEnemyCount(),
    );
    this.dripper.setBands(bands);
  }

  // Current 1-indexed wave number (0 during the run-start grace).
  currentWaveNum(): number {
    return this.waveNum;
  }

  isPaused(): boolean {
    return this.paused;
  }

  // Freeze the timer (room transition / boss arena). Idempotent.
  pause(nowMs: number): void {
    if (this.paused) return;
    this.paused = true;
    this.pausedAtMs = nowMs;
  }

  // Resume, shifting all absolute deadlines forward by the paused duration so
  // no phase "catches up" by firing immediately. Idempotent.
  resume(nowMs: number): void {
    if (!this.paused) return;
    this.paused = false;
    const delta = nowMs - this.pausedAtMs;
    if (delta <= 0) return;
    this.phaseDeadlineMs += delta;
    if (Number.isFinite(this.lastSpawnAt)) this.lastSpawnAt += delta;
    this.dripper.shiftTime(delta);
  }

  tick(nowMs: number): SpawnRequest[] {
    if (this.paused) return [];
    if (!this.started) {
      this.started = true;
      this.phase = 'grace';
      this.phaseDeadlineMs = nowMs + RUN_START_GRACE_MS;
      this.callbacks.onGraceStart?.(RUN_START_GRACE_MS);
      return [];
    }

    // Phase 1 — draw a new group during spawning until the soft target is met.
    if (this.phase === 'spawning') {
      if (
        this.spawnedInWave < this.currentEnemyCount &&
        nowMs - this.lastSpawnAt >= this.currentIntervalMs
      ) {
        const drawn = this.tryDrawGroup(nowMs);
        if (drawn) {
          this.spawnedInWave += templateEnemyCount(drawn);
          this.lastSpawnAt = nowMs;
        }
      }
    }

    // Phase 2 — drip ready rows. The spawning→lull/break transition (Phase 3)
    // waits until the dripper is empty, so this does real work during spawning
    // (including an overshooting final group) and is a harmless no-op in
    // grace/lull/break.
    const out = this.dripper.drip(nowMs);

    // Phase 3 — phase transitions (all time-driven; no clear-gate).
    if (this.phase === 'grace') {
      if (nowMs >= this.phaseDeadlineMs) this.beginWave(1);
    } else if (this.phase === 'spawning') {
      if (this.spawnedInWave >= this.currentEnemyCount && !this.dripper.hasPending()) {
        // Wave fully emitted. The triplet's third (test) wave is followed by
        // the long random break; the others by the short inter-wave lull.
        const role = (this.waveNum - 1) % WAVES_PER_TRIPLET;
        if (role === WAVES_PER_TRIPLET - 1) {
          const breakMs = this.rollTripletBreak();
          this.phase = 'break';
          this.phaseDeadlineMs = nowMs + breakMs;
          this.callbacks.onTripletBreak?.(breakMs);
        } else {
          this.phase = 'lull';
          this.phaseDeadlineMs = nowMs + this.config.interWaveLullMs;
          this.callbacks.onInterWaveLull?.(this.config.interWaveLullMs);
        }
      }
    } else if (this.phase === 'lull' || this.phase === 'break') {
      if (nowMs >= this.phaseDeadlineMs) this.beginWave(this.waveNum + 1);
    }

    return out;
  }

  // Set up `spawning` for wave n. lastSpawnAt = -Infinity makes the wave's
  // first group draw on the next tick; the deadline-based phases (grace /
  // lull / break) already fired the timing, so no timestamp is needed here.
  private beginWave(n: number): void {
    const params = waveParams(n);
    this.waveNum = n;
    this.phase = 'spawning';
    this.spawnedInWave = 0;
    this.lastSpawnAt = -Infinity;
    this.currentEnemyCount = params.enemyCount;
    this.currentIntervalMs = params.spawnIntervalMs;
    this.currentPool =
      n >= TYPE_UNLOCK_BEAR_WAVE
        ? this.config.snakePantherBearPool
        : this.config.snakePantherPool;
    this.callbacks.onWaveStart?.(n, params.triplet, params.beatRole);
  }

  private rollTripletBreak(): number {
    return (
      TRIPLET_BREAK_MIN_MS +
      Math.random() * (TRIPLET_BREAK_MAX_MS - TRIPLET_BREAK_MIN_MS)
    );
  }

  private tryDrawGroup(nowMs: number): SpawnTemplate | null {
    if (this.currentPool.length === 0) return null;
    const ready = this.dripper.readyBands(nowMs);
    if (ready.length === 0) return null;
    const template = this.currentPool[Math.floor(Math.random() * this.currentPool.length)];
    const bandIndex = ready[Math.floor(Math.random() * ready.length)];
    this.dripper.addGroup(bandIndex, template.rows);
    return template;
  }
}
