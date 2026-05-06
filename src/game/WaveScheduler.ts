import {
  BandSpec,
  BeatRole,
  EnemyType,
  LevelWaveConfig,
  SpawnTemplate,
  Vector2,
  WaveTemplate,
} from './types';
import { TILE_SIZE } from './constants';

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

type Phase = 'spawning' | 'awaiting_clear' | 'lull' | 'finished';

interface PendingGroup {
  bandIndex: number;
  cells: (EnemyType | null)[][];
  nextRowToSpawn: number;
}

// Speeds in px/s — must mirror Enemy.ts. The scheduler doesn't construct
// Enemy instances, so it needs its own copy to compute row drip cadence.
const ENEMY_SPEED: Record<EnemyType, number> = {
  panther: 395,
  bear: 218,
  snake: 68,
  gibbon: 34,
};

// Drives spawn ticks for a level. Time source must be the rAF currentTime
// passed by gameLoop — never Date.now (per CLAUDE.md). Each spawn tick
// draws a group template from the wave's pool, then drips the template's
// rows into the chosen band at one row per (TILE_SIZE / row's slowest
// unit speed) milliseconds. Waves end when their enemyCount soft target
// is reached AND every spawned enemy has died.
export class WaveScheduler {
  private config: LevelWaveConfig;
  private callbacks: SchedulerCallbacks;
  private waveIndex = 0;
  private phase: Phase = 'spawning';
  private spawnedInWave = 0;
  private lastSpawnAt = -Infinity;
  private phaseStartedAt = 0;
  private started = false;
  // Earliest time (ms, rAF clock) each band can accept a new row. Updated
  // when a row is spawned: bandReadyAt = now + TILE_SIZE / rowMinSpeed.
  private bandReadyAtMs: number[];
  // Groups that have been drawn but still have rows to drip in.
  private pendingGroups: PendingGroup[] = [];

  constructor(config: LevelWaveConfig, callbacks: SchedulerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.bandReadyAtMs = config.bands.map(() => -Infinity);
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
          this.spawnedInWave += this.templateEnemyCount(drawn.template);
          this.lastSpawnAt = nowMs;
        }
      }
      if (this.spawnedInWave >= wave.enemyCount) {
        this.phase = 'awaiting_clear';
      }
    }

    // Phase 2 — drip ready pending rows (runs in every phase so groups
    // that overshot enemyCount still finish entering during awaiting_clear).
    const out: SpawnRequest[] = [];
    for (let i = this.pendingGroups.length - 1; i >= 0; i--) {
      const group = this.pendingGroups[i];
      if (this.bandReadyAtMs[group.bandIndex] > nowMs) continue;

      const row = group.cells[group.nextRowToSpawn];
      const band = this.config.bands[group.bandIndex];
      let rowMinSpeed = Infinity;
      for (let col = 0; col < row.length; col++) {
        const type = row[col];
        if (!type) continue;
        out.push({
          type,
          position: this.cellPosition(band, col, group.nextRowToSpawn),
          entryDirection: { ...band.entryDirection },
        });
        if (ENEMY_SPEED[type] < rowMinSpeed) rowMinSpeed = ENEMY_SPEED[type];
      }

      group.nextRowToSpawn++;

      // Block the band until this row has cleared one tile. Empty rows
      // (no enemies in any cell) leave the band ready immediately.
      if (Number.isFinite(rowMinSpeed)) {
        this.bandReadyAtMs[group.bandIndex] =
          nowMs + (TILE_SIZE / rowMinSpeed) * 1000;
      }

      if (group.nextRowToSpawn >= group.cells.length) {
        this.pendingGroups.splice(i, 1);
      }
    }

    // Phase 3 — phase transitions. Note: spawns emitted in `out` this
    // tick aren't yet reflected in liveEnemyCount() (Game adds them to
    // its enemy list only after tick returns). Defer the wave-complete
    // check by one tick whenever we just emitted, to avoid skipping past
    // enemies that exist conceptually but not yet in the population.
    if (this.phase === 'awaiting_clear') {
      if (
        out.length === 0 &&
        this.pendingGroups.length === 0 &&
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

  // Live enemies + enemies still queued in pending rows + estimated
  // enemies for groups not yet drawn (soft target — may overshoot).
  remainingInWave(liveEnemyCount: () => number): number {
    if (this.phase === 'finished') return 0;
    const wave = this.currentWave();
    return (
      liveEnemyCount() +
      this.pendingRowsEnemyCount() +
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

  // Draw a template + a ready band. If no band is ready (all blocked by
  // a prior group's drip), defer the draw — caller will try again next
  // tick without advancing the spawn clock.
  private tryDrawGroup(
    nowMs: number,
    wave: WaveTemplate,
  ): { template: SpawnTemplate; bandIndex: number } | null {
    const isFirstSpawn = this.spawnedInWave === 0;
    const pool =
      isFirstSpawn && wave.firstSpawnPool
        ? wave.firstSpawnPool
        : this.config.groupPool;
    if (pool.length === 0) return null;
    const readyBands: number[] = [];
    for (let i = 0; i < this.config.bands.length; i++) {
      if (this.bandReadyAtMs[i] <= nowMs) readyBands.push(i);
    }
    if (readyBands.length === 0) return null;

    const template = pool[Math.floor(Math.random() * pool.length)];
    const bandIndex = readyBands[Math.floor(Math.random() * readyBands.length)];
    this.pendingGroups.push({
      bandIndex,
      cells: template.cells,
      nextRowToSpawn: 0,
    });
    return { template, bandIndex };
  }

  private templateEnemyCount(template: SpawnTemplate): number {
    let n = 0;
    for (const row of template.cells) {
      for (const cell of row) if (cell) n++;
    }
    return n;
  }

  private pendingRowsEnemyCount(): number {
    let n = 0;
    for (const group of this.pendingGroups) {
      for (let r = group.nextRowToSpawn; r < group.cells.length; r++) {
        for (const cell of group.cells[r]) if (cell) n++;
      }
    }
    return n;
  }

  // Map a (band, column, row) coordinate to a world-space pixel position
  // for the enemy AABB's top-left. Columns lay out along the band's
  // orthogonal axis; rows stack opposite to the entry direction.
  private cellPosition(band: BandSpec, col: number, row: number): Vector2 {
    const horizontal = band.entryDirection.y !== 0;
    const slot: Vector2 = horizontal
      ? { x: band.rect.x + col * TILE_SIZE, y: band.rect.y }
      : { x: band.rect.x, y: band.rect.y + col * TILE_SIZE };
    return {
      x: slot.x - band.entryDirection.x * row * TILE_SIZE,
      y: slot.y - band.entryDirection.y * row * TILE_SIZE,
    };
  }

  private currentWave(): WaveTemplate {
    return this.config.waves[this.waveIndex];
  }
}
