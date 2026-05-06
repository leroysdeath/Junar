import {
  BeatRole,
  EnemyType,
  LevelWaveConfig,
  Rectangle,
  Vector2,
  WaveTemplate,
} from './types';

export interface SpawnRequest {
  type: EnemyType;
  zone?: Rectangle;
  entryDirection?: Vector2;
}

interface SchedulerCallbacks {
  onWaveStart?: (waveIndex: number, totalWaves: number, beatRole: BeatRole) => void;
  onWaveComplete?: (waveIndex: number) => void;
  onLullStart?: (durationMs: number) => void;
}

type Phase = 'spawning' | 'awaiting_clear' | 'lull' | 'finished';

// Drives spawn ticks for a level. Time source must be the rAF currentTime
// passed by gameLoop — never Date.now (per CLAUDE.md). The scheduler is a
// pure tick function: callers feed it `now` plus a population query and
// receive back zero or more SpawnRequests for the frame.
//
// Each wave spawns a fixed `enemyCount` enemies one at a time, then waits
// for every enemy of that wave to die before starting the inter-wave lull.
// Because the next wave can't start until the current one is fully cleared,
// the live population during a wave equals "live enemies from this wave."
export class WaveScheduler {
  private config: LevelWaveConfig;
  private callbacks: SchedulerCallbacks;
  private waveIndex = 0;
  private phase: Phase = 'spawning';
  private spawnedInWave = 0;
  private lastSpawnAt = -Infinity;
  private phaseStartedAt = 0;
  private started = false;

  constructor(config: LevelWaveConfig, callbacks: SchedulerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  // First tick after construction starts wave 0.
  tick(
    nowMs: number,
    livePoolPopulation: (pool: EnemyType[]) => number,
  ): SpawnRequest[] {
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

    const wave = this.currentWave();

    if (this.phase === 'spawning') {
      const out: SpawnRequest[] = [];
      if (
        this.spawnedInWave < wave.enemyCount &&
        nowMs - this.lastSpawnAt >= wave.spawnIntervalMs
      ) {
        const type =
          wave.enemyPool[Math.floor(Math.random() * wave.enemyPool.length)];
        out.push({
          type,
          zone: wave.spawnZone,
          entryDirection: wave.entryDirection
            ? { ...wave.entryDirection }
            : undefined,
        });
        this.spawnedInWave++;
        this.lastSpawnAt = nowMs;
      }
      if (this.spawnedInWave >= wave.enemyCount) {
        this.phase = 'awaiting_clear';
      }
      return out;
    }

    if (this.phase === 'awaiting_clear') {
      if (livePoolPopulation(wave.enemyPool) === 0) {
        this.callbacks.onWaveComplete?.(this.waveIndex);
        if (this.waveIndex >= this.config.waves.length - 1) {
          this.phase = 'finished';
        } else {
          this.phase = 'lull';
          this.phaseStartedAt = nowMs;
          this.callbacks.onLullStart?.(this.config.interWaveLullMs);
        }
      }
      return [];
    }

    // phase === 'lull'
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
    return [];
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

  // Live + still-to-spawn enemies for the current wave.
  remainingInWave(
    livePoolPopulation: (pool: EnemyType[]) => number,
  ): number {
    if (this.phase === 'finished') return 0;
    const wave = this.currentWave();
    return (
      livePoolPopulation(wave.enemyPool) + (wave.enemyCount - this.spawnedInWave)
    );
  }

  // Remaining for the current wave plus the full enemyCount of every
  // wave that hasn't started yet.
  remainingInLevel(
    livePoolPopulation: (pool: EnemyType[]) => number,
  ): number {
    let total = this.remainingInWave(livePoolPopulation);
    for (let i = this.waveIndex + 1; i < this.config.waves.length; i++) {
      total += this.config.waves[i].enemyCount;
    }
    return total;
  }

  private currentWave(): WaveTemplate {
    return this.config.waves[this.waveIndex];
  }
}
