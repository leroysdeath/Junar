import { Player } from './Player';
import { Enemy } from './Enemy';
import { Level } from './Level';
import { InputManager } from './InputManager';
import { Renderer } from './Renderer';
import { SoundManager } from './SoundManager';
import { CollisionManager } from './CollisionManager';
import { CrashLogger, CrashSnapshot } from './Logger';
import { GameState, GameCallbacks, Vector2, EnemyType, InputState } from './types';
import { initializeLevels } from './levels';
import { CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE } from './constants';

type GameOverReason =
  | { kind: 'overlap'; enemyId: number; enemyType: EnemyType; dx: number; dy: number }
  | { kind: 'cardinal'; enemyId: number; enemyType: EnemyType; dist: number; dirX: number; dirY: number }
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
  private arrowCooldown = 500; // 0.5 seconds
  private maxDetectionRange = 300; // Maximum range for enemy detection
  private arrows: Array<{ pos: Vector2; dir: Vector2; id: number }> = [];
  private nextArrowId = 0;
  private hasLineOfSight = false; // Track if player has line of sight to any enemy
  private levelTransitionTimeoutId: ReturnType<typeof setTimeout> | null = null;

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
    this.enemies = this.level.getEnemySpawns().map((spawn, index) =>
      new Enemy(spawn.pos, spawn.type, index, this.level)
    );
    this.arrows = [];
    this.lastArrowTime = 0;

    this.callbacks.onStateChange('playing');
    this.callbacks.onLevelChange(this.currentLevelIndex + 1);
    this.callbacks.onEnemiesChange(this.enemies.length);
    this.callbacks.onScoreChange(this.score);
    this.hasLineOfSight = false;
    this.levelStartedAt = performance.now();
    this.lastSampleFrame = this.frameCount;
    this.logger.log('level', 'startLevel', {
      level: this.currentLevelIndex + 1,
      enemies: this.enemies.length,
      playerSpawn: this.player.getPosition(),
    });
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

    // Update line of sight detection
    this.hasLineOfSight = this.checkLineOfSightToEnemies();
    
    // Auto-fire arrows
    if (currentTime - this.lastArrowTime >= this.arrowCooldown && this.hasLineOfSight) {
      this.fireArrow();
      this.lastArrowTime = currentTime;
    }
    
    // Update enemies
    this.enemies.forEach(enemy => {
      enemy.update(deltaTime, this.player.getPosition(), this.level);
    });
    
    // Update arrows
    this.arrows = this.arrows.filter(arrow => {
      const arrowSpeed = 400; // pixels per second
      arrow.pos.x += arrow.dir.x * arrowSpeed * (deltaTime / 1000);
      arrow.pos.y += arrow.dir.y * arrowSpeed * (deltaTime / 1000);
      
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
    
    // Check level completion
    if (this.enemies.length === 0) {
      this.completeLevel();
    }
  }

  private checkLineOfSightToEnemies(): boolean {
    if (this.enemies.length === 0) return false;
    
    const playerPos = this.player.getPosition();
    const playerCenterX = playerPos.x + 16; // Player center
    const playerCenterY = playerPos.y + 16;
    
    // Check line of sight to each enemy
    for (const enemy of this.enemies) {
      const enemyPos = enemy.getPosition();
      const enemyCenterX = enemyPos.x + 16; // Enemy center
      const enemyCenterY = enemyPos.y + 16;
      
      // Calculate distance to enemy
      const dx = enemyCenterX - playerCenterX;
      const dy = enemyCenterY - playerCenterY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Skip if enemy is beyond detection range
      if (distance > this.maxDetectionRange) continue;
      
      // Check if there's a clear line of sight
      if (this.hasDirectLineOfSight(
        { x: playerCenterX, y: playerCenterY },
        { x: enemyCenterX, y: enemyCenterY }
      )) {
        return true; // Found at least one enemy with clear line of sight
      }
    }
    
    return false; // No enemies in line of sight
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

  private fireArrow() {
    if (this.enemies.length === 0 || !this.hasLineOfSight) return;
    
    // Find nearest enemy with line of sight in cardinal directions only
    const playerPos = this.player.getPosition();
    const playerCenterX = playerPos.x + 16;
    const playerCenterY = playerPos.y + 16;
    
    let nearestDistance = Infinity;
    let bestDirection: Vector2 | null = null;

    for (const enemy of this.enemies) {
      const enemyPos = enemy.getPosition();
      const enemyCenterX = enemyPos.x + TILE_SIZE / 2;
      const enemyCenterY = enemyPos.y + TILE_SIZE / 2;

      const dx = enemyCenterX - playerCenterX;
      const dy = enemyCenterY - playerCenterY;

      const cardinalDirection = this.getCardinalDirection(dx, dy);
      if (!cardinalDirection) continue;

      if (
        this.findEnemyOnCardinalRay(
          { x: playerCenterX, y: playerCenterY },
          cardinalDirection,
        ) === null
      ) {
        continue;
      }

      const dist = this.getCardinalDistance(playerCenterX, playerCenterY, enemyCenterX, enemyCenterY, cardinalDirection);

      if (dist < nearestDistance && dist <= this.maxDetectionRange) {
        nearestDistance = dist;
        bestDirection = cardinalDirection;
      }
    }

    if (!bestDirection) return;

    this.arrows.push({
      pos: { x: playerCenterX, y: playerCenterY },
      dir: { x: bestDirection.x, y: bestDirection.y },
      id: this.nextArrowId++
    });

    this.logger.log('fire', 'arrow', { dx: bestDirection.x, dy: bestDirection.y });
    this.soundManager.play('arrow');
  }

  private getCardinalDirection(dx: number, dy: number): Vector2 | null {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    // Determine which cardinal direction is dominant
    if (absDx > absDy) {
      // Horizontal movement is dominant
      if (dx > 0) return { x: 1, y: 0 }; // Right
      else return { x: -1, y: 0 }; // Left
    } else if (absDy > absDx) {
      // Vertical movement is dominant
      if (dy > 0) return { x: 0, y: 1 }; // Down
      else return { x: 0, y: -1 }; // Up
    }
    
    // If dx and dy are equal, prioritize horizontal movement
    if (absDx > 0) {
      if (dx > 0) return { x: 1, y: 0 }; // Right
      else return { x: -1, y: 0 }; // Left
    }
    
    return null; // No movement
  }

  // Walk the cardinal ray from `start` in `direction`, returning the first
  // enemy whose AABB straddles the ray, or null if a wall blocks the ray
  // before any enemy is reached.
  //
  // The wall scan looks at the FULL perpendicular corridor that the enemy
  // detection uses (a 32-wide band, since enemies count as on-the-ray when
  // their center is within ±perpTolerance). Without this, a tree in the
  // adjacent column could sit between the player and an enemy on that same
  // column and the ray would falsely report a clear path.
  private findEnemyOnCardinalRay(start: Vector2, direction: Vector2): Enemy | null {
    const stepSize = TILE_SIZE / 2;
    const maxSteps = Math.floor(this.maxDetectionRange / stepSize);
    const perpTolerance = TILE_SIZE / 2;

    for (let step = 1; step <= maxSteps; step++) {
      const checkX = start.x + direction.x * stepSize * step;
      const checkY = start.y + direction.y * stepSize * step;

      if (checkX < 0 || checkX >= CANVAS_WIDTH || checkY < 0 || checkY >= CANVAS_HEIGHT) {
        break;
      }

      // Wall corridor: along the on-axis the corridor is a single point,
      // along the off-axis it spans ±perpTolerance (one tile wide). That
      // can cover one or two adjacent grid cells.
      const xMin = direction.x !== 0 ? checkX : checkX - perpTolerance;
      const xMax = direction.x !== 0 ? checkX : checkX + perpTolerance - 1;
      const yMin = direction.y !== 0 ? checkY : checkY - perpTolerance;
      const yMax = direction.y !== 0 ? checkY : checkY + perpTolerance - 1;
      const gxMin = Math.floor(xMin / TILE_SIZE);
      const gxMax = Math.floor(xMax / TILE_SIZE);
      const gyMin = Math.floor(yMin / TILE_SIZE);
      const gyMax = Math.floor(yMax / TILE_SIZE);

      for (let gx = gxMin; gx <= gxMax; gx++) {
        for (let gy = gyMin; gy <= gyMax; gy++) {
          if (this.level.isWall(gx, gy)) {
            return null;
          }
        }
      }

      // Enemy hit: center within ±perpTolerance off-axis AND within
      // ±half-tile on-axis (so the step has actually reached it; without
      // the on-axis check, any enemy sharing the row/column would report
      // a hit at step 1, before walls could block).
      for (const enemy of this.enemies) {
        const enemyPos = enemy.getPosition();
        const enemyCenterX = enemyPos.x + TILE_SIZE / 2;
        const enemyCenterY = enemyPos.y + TILE_SIZE / 2;

        const offAxisDelta =
          direction.x !== 0
            ? Math.abs(checkY - enemyCenterY)
            : Math.abs(checkX - enemyCenterX);
        const onAxisDelta =
          direction.x !== 0
            ? Math.abs(checkX - enemyCenterX)
            : Math.abs(checkY - enemyCenterY);

        if (offAxisDelta <= perpTolerance && onAxisDelta <= TILE_SIZE / 2) {
          return enemy;
        }
      }
    }

    return null;
  }

  private getCardinalDistance(playerX: number, playerY: number, enemyX: number, enemyY: number, direction: Vector2): number {
    // Calculate distance along the cardinal direction only
    if (direction.x !== 0) {
      // Horizontal direction - use X distance
      return Math.abs(enemyX - playerX);
    } else {
      // Vertical direction - use Y distance
      return Math.abs(enemyY - playerY);
    }
  }

  private checkCollisions() {
    const playerPos = this.player.getPosition();
    const playerCenterX = playerPos.x + 16;
    const playerCenterY = playerPos.y + 16;

    // Pass 1: AABB-overlap kill. Enemies that have moved on top of the
    // player don't fit into the cardinal-direction model, so handle them
    // first. Returns immediately on hit so we don't double-report.
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

    // Pass 2: cardinal-LOS kill. Walk each of the 4 cardinal rays once and
    // attribute the kill to the enemy actually on the ray (not whichever
    // outer-loop iteration we happened to be in when the ray cleared).
    const cardinalDirs: Vector2[] = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];
    for (const dir of cardinalDirs) {
      const hit = this.findEnemyOnCardinalRay(
        { x: playerCenterX, y: playerCenterY },
        dir,
      );
      if (!hit) continue;

      const hitPos = hit.getPosition();
      const dist =
        dir.x !== 0
          ? Math.abs(hitPos.x + TILE_SIZE / 2 - playerCenterX)
          : Math.abs(hitPos.y + TILE_SIZE / 2 - playerCenterY);

      this.logger.log('collision', 'cardinal-kill', {
        type: hit.getType(),
        dist: Math.round(dist),
        dirX: dir.x,
        dirY: dir.y,
      });
      this.gameOver({
        kind: 'cardinal',
        enemyId: hit.getId(),
        enemyType: hit.getType(),
        dist,
        dirX: dir.x,
        dirY: dir.y,
      });
      return;
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
          this.callbacks.onEnemiesChange(this.enemies.length);
          this.logger.log('hit', 'arrow->enemy', { type: enemyType, remaining: this.enemies.length });
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
