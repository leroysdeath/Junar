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

type Phase = 'wave' | 'lull' | 'finished';

// Drives spawn ticks for a level. Time source must be the rAF currentTime
// passed by gameLoop — never Date.now (per CLAUDE.md). The scheduler is a
// pure tick function: callers feed it `now` plus a population query and
// receive back zero or more SpawnRequests for the frame.
export class WaveScheduler {
  private config: LevelWaveConfig;
  private callbacks: SchedulerCallbacks;
  private waveIndex = 0;
  private phase: Phase = 'wave';
  private phaseStartedAt = 0;
  private lastSpawnAt = -Infinity;
  private started = false;

  constructor(config: LevelWaveConfig, callbacks: SchedulerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  // First tick after construction starts wave 0.
  tick(
    nowMs: number,
    poolPopulation: (pool: EnemyType[]) => number,
  ): SpawnRequest[] {
    if (!this.started) {
      this.started = true;
      this.phaseStartedAt = nowMs;
      this.lastSpawnAt = -Infinity;
      this.callbacks.onWaveStart?.(
        this.waveIndex,
        this.config.waves.length,
        this.currentWave().beatRole,
      );
    }

    if (this.phase === 'finished') return [];

    const requests: SpawnRequest[] = [];

    if (this.phase === 'wave') {
      const wave = this.currentWave();
      const elapsed = nowMs - this.phaseStartedAt;

      // Wave timer expired → emit complete, transition to lull or finished.
      if (elapsed >= wave.durationMs) {
        this.callbacks.onWaveComplete?.(this.waveIndex);
        const isLast = this.waveIndex >= this.config.waves.length - 1;
        if (isLast) {
          this.phase = 'finished';
          return requests;
        }
        this.phase = 'lull';
        this.phaseStartedAt = nowMs;
        this.callbacks.onLullStart?.(this.config.interWaveLullMs);
        return requests;
      }

      // Maintain the population floor by ticking spawns at intervals.
      if (
        nowMs - this.lastSpawnAt >= wave.spawnIntervalMs &&
        poolPopulation(wave.enemyPool) < wave.populationFloor
      ) {
        const type = wave.enemyPool[Math.floor(Math.random() * wave.enemyPool.length)];
        requests.push({
          type,
          zone: wave.spawnZone,
          entryDirection: wave.entryDirection
            ? { ...wave.entryDirection }
            : undefined,
        });
        this.lastSpawnAt = nowMs;
      }
      return requests;
    }

    // phase === 'lull'
    if (nowMs - this.phaseStartedAt >= this.config.interWaveLullMs) {
      this.waveIndex++;
      this.phase = 'wave';
      this.phaseStartedAt = nowMs;
      this.lastSpawnAt = -Infinity;
      this.callbacks.onWaveStart?.(
        this.waveIndex,
        this.config.waves.length,
        this.currentWave().beatRole,
      );
    }
    return requests;
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

  private currentWave(): WaveTemplate {
    return this.config.waves[this.waveIndex];
  }
}
