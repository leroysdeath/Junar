import { Player } from './Player';
import { Enemy } from './Enemy';
import { Level } from './Level';
import { InputManager, Direction } from './InputManager';
import { Renderer } from './Renderer';
import { SoundManager } from './SoundManager';
import { CollisionManager } from './CollisionManager';
import { CrashLogger, CrashSnapshot } from './Logger';
import { WaveScheduler, SpawnRequest } from './WaveScheduler';
import {
  GameState,
  GameCallbacks,
  Vector2,
  EnemyType,
  InputState,
  SpawnEntryway,
  Rectangle,
} from './types';
import { initializeLevels } from './levels';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TILE_SIZE,
  MAX_DETECTION_RANGE,
  ARROW_SPEED,
  ARROW_COOLDOWN_MS,
} from './constants';

type GameOverReason =
  | { kind: 'overlap'; enemyId: number; enemyType: EnemyType; dx: number; dy: number }
  | { kind: 'manual' };

interface GameOverVerdict {
  suspicious: boolean;
  flags: string[];
  nearestDist: number;
  nearestType: EnemyType | null;
  msSinceLevelStart: number;
}

const SAMPLE_EVERY_FRAMES = 10;
const EARLY_DEATH_MS = 500;

const round2 = (n: number) => Math.round(n * 100) / 100;

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private player: Player;
  private enemies: Enemy[] = [];
  private level: Level;
  private inputManager: InputManager;
  private renderer: Renderer;
  private soundManager: SoundManager;
  private collisionManager: CollisionManager;
  private callbacks: GameCallbacks;
  private logger: CrashLogger;

  private gameState: GameState = 'menu';
  private initializedLevels = initializeLevels();
  private currentLevelIndex = 0;
  private score = 0;
  private lastTime = 0;
  private animationId: number | null = null;
  private frameCount = 0;
  private levelStartedAt = 0;
  private lastSampleFrame = 0;

  private lastArrowTime = 0;
  private arrowCooldown = ARROW_COOLDOWN_MS;
  private maxDetectionRange = MAX_DETECTION_RANGE;
  private arrows: Array<{ pos: Vector2; dir: Vector2; id: number }> = [];
  private nextArrowId = 0;
  private hasLineOfSight = false; // Track if player has line of sight to any enemy
  private levelTransitionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pendingSpawns: Array<{
    spawnAtMs: number; // ms relative to levelStartedAt
    entryway: SpawnEntryway;
    entryDirection: Vector2;
  }> = [];
  private nextEnemyId = 0;
  private waveScheduler: WaveScheduler | null = null;
  // Cached perimeter spawn positions for the current level (filtered by
  // min distance from player center). Populated in startLevel().
  private perimeterSpawnPositions: Vector2[] = [];

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.callbacks = callbacks;

    this.logger = new CrashLogger({
      snapshotProvider: () => this.snapshotState(),
      frameProvider: () => this.frameCount,
      onCrash: (snap) => this.handleCrash(snap),
    });
    this.inputManager = new InputManager((cleared) => {
      this.logger.log('input', 'blur-clear', { keys: cleared });
    });
    this.renderer = new Renderer(this.ctx);
    this.soundManager = new SoundManager(callbacks.soundEnabled);
    this.collisionManager = new CollisionManager();

    this.level = new Level(this.initializedLevels[0]);
    this.player = new Player(this.level.getPlayerSpawn());

    this.logger.log('lifecycle', 'game constructed');
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.canvas.addEventListener('click', () => {
      if (this.gameState === 'menu') {
        this.startLevel();
      }
    });
  }

  start() {
    this.gameLoop(0);
  }

  restart() {
    this.clearLevelTransitionTimeout();
    this.currentLevelIndex = 0;
    this.score = 0;
    this.arrows = [];
    this.lastArrowTime = 0;
    this.logger.log('lifecycle', 'restart');
    this.startLevel();
  }

  private startLevel() {
    this.gameState = 'playing';
    this.level = new Level(this.initializedLevels[this.currentLevelIndex]);
    this.player = new Player(this.level.getSafePlayerSpawn());

    const waveConfig = this.level.getWaveConfig();
    if (waveConfig) {
      // Wave-driven path: scheduler authors all spawns. Skip both static
      // enemySpawns and delayedSpawns — they are mutually exclusive with
      // waveConfig at the levels.ts authoring layer.
      this.enemies = [];
      this.pendingSpawns = [];
      this.perimeterSpawnPositions = this.computePerimeterSpawnPositions();
      this.waveScheduler = new WaveScheduler(waveConfig, {
        onWaveStart: (i, total, beat) => {
          this.callbacks.onWaveStart?.(i, total, beat);
          this.logger.log('level', 'waveStart', { index: i, total, beat });
        },
        onWaveComplete: (i) => {
          this.callbacks.onWaveComplete?.(i);
          this.logger.log('level', 'waveComplete', { index: i });
        },
        onLullStart: (durMs) => {
          this.callbacks.onLullStart?.(durMs);
          this.logger.log('level', 'waveLull', { durationMs: durMs });
        },
      });
    } else {
      // Legacy path (Levels 4–10): static perimeter spawns + optional
      // entryway trickle.
      this.waveScheduler = null;
      this.perimeterSpawnPositions = [];
      this.enemies = this.level.getEnemySpawns().map((spawn, index) =>
        new Enemy(spawn.pos, spawn.type, index, this.level)
      );
      this.pendingSpawns = [];
      const dc = this.level.getDelayedSpawnConfig();
      if (dc) {
        for (let i = 0; i < dc.count; i++) {
          this.pendingSpawns.push({
            spawnAtMs: dc.initialDelayMs + i * dc.intervalMs,
            entryway: dc.entryway,
            entryDirection: { ...dc.entryDirection },
          });
        }
      }
    }

    this.nextEnemyId = this.enemies.length;
    this.arrows = [];
    this.lastArrowTime = 0;

    this.callbacks.onStateChange('playing');
    this.callbacks.onLevelChange(this.currentLevelIndex + 1);
    this.callbacks.onEnemiesChange(this.enemies.length + this.pendingSpawns.length);
    this.callbacks.onScoreChange(this.score);
    this.hasLineOfSight = false;
    this.levelStartedAt = performance.now();
    this.lastSampleFrame = this.frameCount;
    this.logger.log('level', 'startLevel', {
      level: this.currentLevelIndex + 1,
      enemies: this.enemies.length,
      pendingSpawns: this.pendingSpawns.length,
      waveDriven: this.waveScheduler !== null,
      playerSpawn: this.player.getPosition(),
    });
  }

  // Build the list of valid edge spawn positions for the current level,
  // filtered to those at least 128 px from the player center. Mirrors the
  // logic in initializeLevels() but runs against the live Level object so
  // wave-driven spawns can pick from the same pool.
  private computePerimeterSpawnPositions(): Vector2[] {
    const playerCenter = this.level.getMapCenter();
    const minDistance = 128;
    return this.level
      .getEdgeSpawnPositions()
      .filter((pos) => {
        const dx = pos.x - playerCenter.x;
        const dy = pos.y - playerCenter.y;
        return Math.sqrt(dx * dx + dy * dy) >= minDistance;
      });
  }

  // Runtime entryway spawning. Picks a random pixel position within the
  // entryway band and a random enemy type. Spawned enemies start in
  // 'entering' mode; they walk freely along entryDirection until their
  // AABB is fully inside the canvas, then collision/AI takes over.
  private spawnFromEntryway(
    entryway: SpawnEntryway,
    entryDirection: Vector2,
  ): Enemy {
    // Constrain spawn to grid-aligned tiles within the band so the AABB
    // doesn't straddle a side wall once the enemy enters.
    const tileCols = Math.max(1, Math.floor(entryway.width / TILE_SIZE));
    const tileRows = Math.max(1, Math.floor(entryway.height / TILE_SIZE));
    const colOffset = Math.floor(Math.random() * tileCols);
    const rowOffset = Math.floor(Math.random() * tileRows);
    const spawnPos: Vector2 = {
      x: entryway.x + colOffset * TILE_SIZE,
      y: entryway.y + rowOffset * TILE_SIZE,
    };
    const types: EnemyType[] = ['panther', 'snake', 'gibbon', 'bear'];
    const type = types[Math.floor(Math.random() * types.length)];
    return new Enemy(
      spawnPos,
      type,
      this.nextEnemyId++,
      undefined,
      { direction: { ...entryDirection } },
    );
  }

  private gameLoop(currentTime: number) {
    if (this.logger.hasCrashed()) return;

    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    this.frameCount++;

    try {
      if (this.gameState === 'playing') {
        this.update(deltaTime, currentTime);
      }
      this.render();
    } catch (err) {
      this.logger.captureCrash('gameLoop', err, { deltaTime });
      return;
    }

    this.animationId = requestAnimationFrame((time) => this.gameLoop(time));
  }

  private snapshotState(): Record<string, unknown> {
    let playerPos: Vector2 | undefined;
    try {
      playerPos = this.player?.getPosition();
    } catch {
      playerPos = undefined;
    }
    let pressedKeys: string[] = [];
    try {
      pressedKeys = this.inputManager?.getPressedKeys() ?? [];
    } catch {
      pressedKeys = [];
    }
    let enemyPositions: Array<Record<string, unknown>> = [];
    try {
      enemyPositions = this.enemies.slice(0, 12).map((e) => {
        const p = e.getPosition();
        return {
          id: e.getId(),
          type: e.getType(),
          x: Math.round(p.x),
          y: Math.round(p.y),
        };
      });
    } catch {
      enemyPositions = [];
    }
    return {
      gameState: this.gameState,
      level: this.currentLevelIndex + 1,
      score: this.score,
      enemies: this.enemies.length,
      arrows: this.arrows.length,
      nextArrowId: this.nextArrowId,
      hasLineOfSight: this.hasLineOfSight,
      frameCount: this.frameCount,
      lastTime: Math.round(this.lastTime),
      lastArrowTime: Math.round(this.lastArrowTime),
      msSinceLevelStart: this.levelStartedAt
        ? Math.round(performance.now() - this.levelStartedAt)
        : 0,
      playerX: playerPos !== undefined ? round2(playerPos.x) : undefined,
      playerY: playerPos !== undefined ? round2(playerPos.y) : undefined,
      pressedKeys,
      enemyPositions,
    };
  }

  private handleCrash(snapshot: CrashSnapshot) {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.clearLevelTransitionTimeout();
    try {
      this.logger.renderOverlay(this.ctx);
    } catch (e) {
      console.error('[Junar] failed to render crash overlay:', e, snapshot);
    }
  }

  private update(deltaTime: number, currentTime: number) {
    // Update player
    const input = this.inputManager.getInput();
    this.player.update(deltaTime, input, this.level, (rej) => {
      this.logger.log('wall', 'reject', {
        axis: rej.axis,
        from: round2(rej.from),
        to: round2(rej.attempted),
        cells: rej.cells,
        in: input,
      });
    });

    if (this.frameCount - this.lastSampleFrame >= SAMPLE_EVERY_FRAMES) {
      this.lastSampleFrame = this.frameCount;
      this.sampleTick(input, deltaTime);
    }

    // Process delayed entryway spawns (legacy path). Pending spawns are
    // sorted by spawnAtMs (since startLevel pushes them in order); pop
    // while their scheduled time has elapsed.
    if (this.pendingSpawns.length > 0) {
      const elapsed = currentTime - this.levelStartedAt;
      while (
        this.pendingSpawns.length > 0 &&
        this.pendingSpawns[0].spawnAtMs <= elapsed
      ) {
        const next = this.pendingSpawns.shift()!;
        const enemy = this.spawnFromEntryway(next.entryway, next.entryDirection);
        this.enemies.push(enemy);
        this.logger.log('spawn', 'entryway', {
          id: enemy.getId(),
          type: enemy.getType(),
          atMs: Math.round(elapsed),
          pos: enemy.getPosition(),
        });
        this.callbacks.onEnemiesChange(
          this.enemies.length + this.pendingSpawns.length,
        );
      }
    }

    // Wave-driven spawns. The scheduler maintains population floors and
    // emits wave/lull transitions on its own clock.
    if (this.waveScheduler) {
      const requests = this.waveScheduler.tick(currentTime, (pool) =>
        this.countEnemiesOfTypes(pool),
      );
      for (const req of requests) {
        const enemy = this.spawnFromRequest(req);
        if (enemy) {
          this.enemies.push(enemy);
          this.logger.log('spawn', 'wave', {
            id: enemy.getId(),
            type: enemy.getType(),
            waveIndex: this.waveScheduler.currentWaveIndex(),
            pos: enemy.getPosition(),
          });
          this.callbacks.onEnemiesChange(
            this.enemies.length + this.pendingSpawns.length,
          );
        }
      }
    }

    // Pick the nearest enemy with clear LOS at any angle. Drives both
    // auto-fire targeting and the on-screen LOS indicator.
    const visibleTarget = this.findNearestVisibleEnemy();
    this.hasLineOfSight = visibleTarget !== null;

    if (visibleTarget && currentTime - this.lastArrowTime >= this.arrowCooldown) {
      this.fireArrow(visibleTarget);
      this.lastArrowTime = currentTime;
    }
    
    // Update enemies
    this.enemies.forEach(enemy => {
      enemy.update(deltaTime, this.player.getPosition(), this.level);
    });
    
    // Update arrows
    this.arrows = this.arrows.filter(arrow => {
      arrow.pos.x += arrow.dir.x * ARROW_SPEED * (deltaTime / 1000);
      arrow.pos.y += arrow.dir.y * ARROW_SPEED * (deltaTime / 1000);
      
      // Check bounds
      if (arrow.pos.x < 0 || arrow.pos.x > CANVAS_WIDTH || arrow.pos.y < 0 || arrow.pos.y > CANVAS_HEIGHT) {
        return false;
      }

      // Check wall collision
      if (this.level.isWall(Math.floor(arrow.pos.x / TILE_SIZE), Math.floor(arrow.pos.y / TILE_SIZE))) {
        return false;
      }
      
      return true;
    });
    
    // Check collisions
    this.checkCollisions();
    
    // Check level completion. The level is clear when the live enemy list
    // is empty AND no future spawns are queued — for wave-driven levels
    // that means the scheduler has finished its last wave and lull;
    // otherwise the level would complete during the grace period before
    // the first wave's first spawn lands.
    const noFutureSpawns = this.waveScheduler
      ? this.waveScheduler.isFinished()
      : this.pendingSpawns.length === 0;
    if (this.enemies.length === 0 && noFutureSpawns) {
      this.completeLevel();
    }
  }

  // Translate a SpawnRequest from the scheduler into a live Enemy. If a
  // zone is given, spawn within it (entryway-style); otherwise pick a
  // random pre-filtered perimeter position.
  private spawnFromRequest(req: SpawnRequest): Enemy | null {
    if (req.zone) {
      const direction = req.entryDirection ?? { x: 0, y: 0 };
      return this.spawnInZone(req.type, req.zone, direction);
    }
    if (this.perimeterSpawnPositions.length === 0) return null;
    const pos = this.perimeterSpawnPositions[
      Math.floor(Math.random() * this.perimeterSpawnPositions.length)
    ];
    return new Enemy({ ...pos }, req.type, this.nextEnemyId++, this.level);
  }

  // Tile-aligned random spawn within a zone rectangle, skipping wall
  // collision until the AABB is fully on-canvas. Mirrors spawnFromEntryway
  // but with a caller-provided enemy type.
  private spawnInZone(
    type: EnemyType,
    zone: Rectangle,
    direction: Vector2,
  ): Enemy {
    const tileCols = Math.max(1, Math.floor(zone.width / TILE_SIZE));
    const tileRows = Math.max(1, Math.floor(zone.height / TILE_SIZE));
    const colOffset = Math.floor(Math.random() * tileCols);
    const rowOffset = Math.floor(Math.random() * tileRows);
    const spawnPos: Vector2 = {
      x: zone.x + colOffset * TILE_SIZE,
      y: zone.y + rowOffset * TILE_SIZE,
    };
    return new Enemy(
      spawnPos,
      type,
      this.nextEnemyId++,
      undefined,
      { direction: { ...direction } },
    );
  }

  private countEnemiesOfTypes(pool: EnemyType[]): number {
    if (pool.length === 0) return 0;
    let count = 0;
    for (const e of this.enemies) {
      if (pool.includes(e.getType())) count++;
    }
    return count;
  }

  // Scan all enemies and return the nearest one within MAX_DETECTION_RANGE
  // whose center is reachable from the player center by an unobstructed
  // raycast. Single source of truth for both auto-fire targeting and the
  // on-screen LOS indicator.
  private findNearestVisibleEnemy(): Enemy | null {
    if (this.enemies.length === 0) return null;

    const playerPos = this.player.getPosition();
    const playerCenter: Vector2 = {
      x: playerPos.x + TILE_SIZE / 2,
      y: playerPos.y + TILE_SIZE / 2,
    };

    let nearest: Enemy | null = null;
    let nearestDistance = Infinity;

    for (const enemy of this.enemies) {
      const enemyPos = enemy.getPosition();
      const enemyCenter: Vector2 = {
        x: enemyPos.x + TILE_SIZE / 2,
        y: enemyPos.y + TILE_SIZE / 2,
      };

      const dx = enemyCenter.x - playerCenter.x;
      const dy = enemyCenter.y - playerCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > this.maxDetectionRange) continue;
      if (distance >= nearestDistance) continue;
      if (!this.hasDirectLineOfSight(playerCenter, enemyCenter)) continue;

      nearestDistance = distance;
      nearest = enemy;
    }

    return nearest;
  }

  private hasDirectLineOfSight(start: Vector2, end: Vector2): boolean {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return true;
    
    // Use smaller steps for more accurate collision detection
    const steps = Math.ceil(distance / 8); // Check every 8 pixels
    const stepX = dx / steps;
    const stepY = dy / steps;
    
    // Check each point along the line for wall collisions
    for (let i = 1; i < steps; i++) {
      const checkX = start.x + stepX * i;
      const checkY = start.y + stepY * i;
      
      // Convert to grid coordinates
      const gridX = Math.floor(checkX / 32);
      const gridY = Math.floor(checkY / 32);
      
      // Check if this point hits a wall
      if (this.level.isWall(gridX, gridY)) {
        return false; // Line of sight blocked by wall
      }
    }
    
    return true; // Clear line of sight
  }

  private fireArrow(target: Enemy) {
    const playerPos = this.player.getPosition();
    const playerCenterX = playerPos.x + TILE_SIZE / 2;
    const playerCenterY = playerPos.y + TILE_SIZE / 2;

    const enemyPos = target.getPosition();
    const enemyCenterX = enemyPos.x + TILE_SIZE / 2;
    const enemyCenterY = enemyPos.y + TILE_SIZE / 2;

    const dx = enemyCenterX - playerCenterX;
    const dy = enemyCenterY - playerCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return;

    const dir: Vector2 = { x: dx / distance, y: dy / distance };

    this.arrows.push({
      pos: { x: playerCenterX, y: playerCenterY },
      dir,
      id: this.nextArrowId++,
    });

    this.logger.log('fire', 'arrow', { dx: round2(dir.x), dy: round2(dir.y) });
    this.soundManager.play('arrow');
  }

  private checkCollisions() {
    const playerPos = this.player.getPosition();
    const playerCenterX = playerPos.x + 16;
    const playerCenterY = playerPos.y + 16;

    // Pass 1: AABB-overlap kill. Contact-only enemies on top of the player
    // end the run immediately; return on hit so we don't double-report.
    for (const enemy of this.enemies) {
      const enemyPos = enemy.getPosition();
      const dx = enemyPos.x + TILE_SIZE / 2 - playerCenterX;
      const dy = enemyPos.y + TILE_SIZE / 2 - playerCenterY;
      if (Math.abs(dx) < TILE_SIZE / 2 && Math.abs(dy) < TILE_SIZE / 2) {
        this.logger.log('collision', 'overlap-kill', {
          type: enemy.getType(),
          dx: round2(dx),
          dy: round2(dy),
        });
        this.gameOver({
          kind: 'overlap',
          enemyId: enemy.getId(),
          enemyType: enemy.getType(),
          dx,
          dy,
        });
        return;
      }
    }

    // Check arrow-enemy collisions
    this.arrows = this.arrows.filter(arrow => {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const enemy = this.enemies[i];
        if (this.collisionManager.checkCollision(
          { x: arrow.pos.x, y: arrow.pos.y, width: 4, height: 4 },
          { x: enemy.getPosition().x, y: enemy.getPosition().y, width: 32, height: 32 }
        )) {
          const enemyType = enemy.getType();
          this.enemies.splice(i, 1);
          this.score += 10;
          this.callbacks.onScoreChange(this.score);
          this.callbacks.onEnemiesChange(
            this.enemies.length + this.pendingSpawns.length,
          );
          this.logger.log('hit', 'arrow->enemy', {
            type: enemyType,
            remaining: this.enemies.length,
            pending: this.pendingSpawns.length,
          });
          this.soundManager.play('hit');
          return false; // Remove arrow
        }
      }
      return true; // Keep arrow
    });
  }

  private completeLevel() {
    this.score += 100 * (this.currentLevelIndex + 1);
    this.callbacks.onScoreChange(this.score);
    this.logger.log('level', 'completeLevel', {
      level: this.currentLevelIndex + 1,
      score: this.score,
    });

    if (this.currentLevelIndex >= this.initializedLevels.length - 1) {
      this.victory();
    } else {
      this.gameState = 'levelComplete';
      this.callbacks.onStateChange('levelComplete');

      this.clearLevelTransitionTimeout();
      this.levelTransitionTimeoutId = setTimeout(() => {
        this.levelTransitionTimeoutId = null;
        // Guard: bail if the game state changed during the fade (restart, cleanup, gameOver)
        if (this.gameState !== 'levelComplete') return;
        this.currentLevelIndex++;
        this.startLevel();
      }, 2000);
    }
  }

  private clearLevelTransitionTimeout() {
    if (this.levelTransitionTimeoutId !== null) {
      clearTimeout(this.levelTransitionTimeoutId);
      this.levelTransitionTimeoutId = null;
    }
  }

  private gameOver(reason: GameOverReason = { kind: 'manual' }) {
    if (this.gameState === 'gameOver') return;
    this.gameState = 'gameOver';
    this.callbacks.onStateChange('gameOver');
    this.soundManager.play('gameOver');

    const verdict = this.classifyGameOver(reason);
    this.logger.log('state', 'gameOver', {
      level: this.currentLevelIndex + 1,
      score: this.score,
      reason: reason.kind,
      flags: verdict.flags,
      nearestDist: verdict.nearestDist,
      nearestType: verdict.nearestType,
      msSinceLevelStart: verdict.msSinceLevelStart,
    });

    const reasonLabel =
      reason.kind === 'manual'
        ? 'manual'
        : `${reason.kind}-kill by ${reason.enemyType} #${reason.enemyId}`;

    if (verdict.suspicious) {
      const err = new Error(
        `suspicious gameOver (${reasonLabel}): ${verdict.flags.join(', ')}`,
      );
      this.logger.captureCrash('suspicious', err, { reason, verdict });
      // Throw so the gameLoop's try/catch halts the loop before render()
      // overwrites the overlay handleCrash just painted.
      throw err;
    }

    this.logger.reportNonHalting('gameOver', new Error(`gameOver: ${reasonLabel}`), {
      reason,
      verdict,
    });
  }

  private classifyGameOver(reason: GameOverReason): GameOverVerdict {
    const playerPos = this.player.getPosition();
    const playerCx = playerPos.x + TILE_SIZE / 2;
    const playerCy = playerPos.y + TILE_SIZE / 2;

    let nearestDist = Infinity;
    let nearestType: EnemyType | null = null;
    for (const e of this.enemies) {
      const ep = e.getPosition();
      const d = Math.hypot(
        ep.x + TILE_SIZE / 2 - playerCx,
        ep.y + TILE_SIZE / 2 - playerCy,
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearestType = e.getType();
      }
    }

    const msSinceLevelStart = Math.round(performance.now() - this.levelStartedAt);
    const flags: string[] = [];

    if (reason.kind === 'manual') flags.push('manual-trigger');
    if (this.enemies.length === 0) flags.push('no-enemies');
    if (nearestDist === Infinity || nearestDist > this.maxDetectionRange) {
      flags.push('no-enemy-in-range');
    }
    if (msSinceLevelStart < EARLY_DEATH_MS) flags.push('early-death');

    return {
      suspicious: flags.length > 0,
      flags,
      nearestDist: nearestDist === Infinity ? -1 : Math.round(nearestDist),
      nearestType,
      msSinceLevelStart,
    };
  }

  private sampleTick(input: InputState, deltaTime: number) {
    const playerPos = this.player.getPosition();
    let nearestDist = Infinity;
    for (const e of this.enemies) {
      const ep = e.getPosition();
      const d = Math.hypot(ep.x - playerPos.x, ep.y - playerPos.y);
      if (d < nearestDist) nearestDist = d;
    }
    this.logger.log('sample', 'tick', {
      pX: round2(playerPos.x),
      pY: round2(playerPos.y),
      in: input,
      keys: this.inputManager.getPressedKeys(),
      enemies: this.enemies.length,
      nearestDist: nearestDist === Infinity ? -1 : Math.round(nearestDist),
      dt: round2(deltaTime),
      hasLOS: this.hasLineOfSight,
    });
  }

  private victory() {
    this.gameState = 'victory';
    this.callbacks.onStateChange('victory');
    this.logger.log('state', 'victory', { score: this.score });
    this.soundManager.play('victory');
  }

  private render() {
    // Clear canvas with dark green background
    this.ctx.fillStyle = '#1a4a3a';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Always render the level, player, and enemies when they exist
    // This ensures we can see the game even in menu state for debugging
    if (this.level && this.player) {
      this.renderer.renderLevel(this.level);
      this.renderer.renderHuts(this.level.getHutPositions());
      this.renderer.renderNpcs(this.level.getNpcPositions());
      this.renderer.renderPlayer(this.player);

      if (this.enemies.length > 0) {
        this.renderer.renderEnemies(this.enemies);
      }

      if (this.arrows.length > 0) {
        this.renderer.renderArrows(this.arrows);
      }
      
      // Render line of sight indicator
      if (this.gameState === 'playing') {
        this.renderer.renderLineOfSightIndicator(this.player, this.hasLineOfSight);
      }
    }
  }

  setSoundEnabled(enabled: boolean) {
    this.soundManager.setEnabled(enabled);
  }

  // Bridge for on-screen mobile controls. Touch handlers in App.tsx call
  // this on pointer down/up to drive movement without keyboard events.
  setVirtualInput(direction: Direction, pressed: boolean) {
    this.inputManager.setVirtualInput(direction, pressed);
  }

  cleanup() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.clearLevelTransitionTimeout();
    this.inputManager.dispose();
    this.logger.log('lifecycle', 'cleanup');
    this.logger.dispose();
  }
}
