import { Player } from './Player';
import { Enemy } from './Enemy';
import { Level } from './Level';
import { InputManager } from './InputManager';
import { Renderer } from './Renderer';
import { SoundManager } from './SoundManager';
import { CollisionManager } from './CollisionManager';
import { GameState, GameCallbacks, Vector2 } from './types';
import { initializeLevels } from './levels';

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
  
  private gameState: GameState = 'menu';
  private initializedLevels = initializeLevels();
  private currentLevelIndex = 0;
  private score = 0;
  private lastTime = 0;
  private animationId: number | null = null;
  
  private lastArrowTime = 0;
  private arrowCooldown = 500; // 0.5 seconds
  private arrowLength = 32; // Match player avatar height (32px)
  private arrowSpacing = 8; // 25% of arrow length (32 * 0.25 = 8px)
  private maxDetectionRange = 300; // Maximum range for enemy detection
  private arrows: Array<{ pos: Vector2; dir: Vector2; id: number }> = [];
  private nextArrowId = 0;
  private hasLineOfSight = false; // Track if player has line of sight to any enemy

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.callbacks = callbacks;
    
    this.inputManager = new InputManager();
    this.renderer = new Renderer(this.ctx);
    this.soundManager = new SoundManager(callbacks.soundEnabled);
    this.collisionManager = new CollisionManager();
    
    this.level = new Level(this.initializedLevels[0]);
    this.player = new Player(this.level.getPlayerSpawn());
    
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
    this.currentLevelIndex = 0;
    this.score = 0;
    this.arrows = [];
    this.lastArrowTime = 0;
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
  }

  private gameLoop(currentTime: number) {
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    if (this.gameState === 'playing') {
      this.update(deltaTime, currentTime);
    }
    
    this.render();
    this.animationId = requestAnimationFrame((time) => this.gameLoop(time));
  }

  private update(deltaTime: number, currentTime: number) {
    // Update player
    const input = this.inputManager.getInput();
    this.player.update(deltaTime, input, this.level);
    
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
      if (arrow.pos.x < 0 || arrow.pos.x > 800 || arrow.pos.y < 0 || arrow.pos.y > 600) {
        return false;
      }
      
      // Check wall collision
      if (this.level.isWall(Math.floor(arrow.pos.x / 32), Math.floor(arrow.pos.y / 32))) {
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
    
    let nearestEnemy = null;
    let nearestDistance = Infinity;
    let bestDirection: Vector2 | null = null;
    
    this.enemies.forEach(enemy => {
      const enemyPos = enemy.getPosition();
      const enemyCenterX = enemyPos.x + 16;
      const enemyCenterY = enemyPos.y + 16;
      
      // Calculate direction to enemy
      const dx = enemyCenterX - playerCenterX;
      const dy = enemyCenterY - playerCenterY;
      
      // Determine which cardinal direction the enemy is in
      const cardinalDirection = this.getCardinalDirection(dx, dy);
      if (!cardinalDirection) return; // Skip if not in a cardinal direction
      
      // Check if there's line of sight in this cardinal direction
      if (!this.hasCardinalLineOfSight(
        { x: playerCenterX, y: playerCenterY },
        cardinalDirection
      )) return;
      
      // Calculate distance using cardinal direction only
      const dist = this.getCardinalDistance(playerCenterX, playerCenterY, enemyCenterX, enemyCenterY, cardinalDirection);
      
      // Only consider enemies within range and with line of sight
      if (dist < nearestDistance && dist <= this.maxDetectionRange) {
        nearestDistance = dist;
        nearestEnemy = enemy;
        bestDirection = cardinalDirection;
      }
    });
    
    if (!nearestEnemy || !bestDirection) return; // No valid target found
    
    // Fire arrow in cardinal direction
    this.arrows.push({
      pos: { x: playerCenterX, y: playerCenterY },
      dir: { x: bestDirection.x, y: bestDirection.y },
      id: this.nextArrowId++
    });
    
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

  private hasCardinalLineOfSight(start: Vector2, direction: Vector2): boolean {
    const stepSize = 16; // Check every 16 pixels
    const maxSteps = Math.floor(this.maxDetectionRange / stepSize);
    
    for (let step = 1; step <= maxSteps; step++) {
      const checkX = start.x + (direction.x * stepSize * step);
      const checkY = start.y + (direction.y * stepSize * step);
      
      // Check bounds
      if (checkX < 0 || checkX >= 800 || checkY < 0 || checkY >= 600) {
        break; // Reached boundary
      }
      
      // Convert to grid coordinates
      const gridX = Math.floor(checkX / 32);
      const gridY = Math.floor(checkY / 32);
      
      // Check if this point hits a wall
      if (this.level.isWall(gridX, gridY)) {
        return false; // Line of sight blocked by wall
      }
      
      // Check if there's an enemy at this position
      for (const enemy of this.enemies) {
        const enemyPos = enemy.getPosition();
        const enemyCenterX = enemyPos.x + 16;
        const enemyCenterY = enemyPos.y + 16;
        
        // Check if enemy is close to this cardinal line position
        const distanceToLine = Math.sqrt(
          Math.pow(checkX - enemyCenterX, 2) + 
          Math.pow(checkY - enemyCenterY, 2)
        );
        
        if (distanceToLine <= 20) { // Enemy is close enough to the cardinal line
          return true; // Found enemy in line of sight
        }
      }
    }
    
    return false; // No enemy found in cardinal line of sight
  }

  private getCardinalDistance(playerX: number, playerY: number, enemyX: number, enemyY: number, direction: Vector2): number {
    // Calculate distance along the cardinal direction only
    if (direction.x !== 0) {
      // Horizontal direction - use X distance
      return Math.abs(enemyX - playerX);
    } else {
      // Vertical direction - use Y distance
      // Calculate direction to enemy
    }
  }
  private checkCollisions() {
      // Get cardinal direction
      const cardinalDirection = this.getCardinalDirection(dx, dy);
      if (!cardinalDirection) continue;
      
      // Calculate cardinal distance
      const distance = this.getCardinalDistance(playerCenterX, playerCenterY, enemyCenterX, enemyCenterY, cardinalDirection);
      
      // Skip if enemy is beyond detection range
      if (distance > this.maxDetectionRange) continue;
    // Check enemy-player collisions
      // Check if there's a clear cardinal line of sight
      if (this.hasCardinalLineOfSight(
        { x: playerCenterX, y: playerCenterY },
        cardinalDirection
      )) {
        this.gameOver();
        return;
      }
    });
    
    // Check arrow-enemy collisions
    this.arrows = this.arrows.filter(arrow => {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const enemy = this.enemies[i];
        if (this.collisionManager.checkCollision(
          { x: arrow.pos.x, y: arrow.pos.y, width: 4, height: 4 },
          { x: enemy.getPosition().x, y: enemy.getPosition().y, width: 32, height: 32 }
        )) {
          this.enemies.splice(i, 1);
          this.score += 10;
          this.callbacks.onScoreChange(this.score);
          this.callbacks.onEnemiesChange(this.enemies.length);
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
    
    if (this.currentLevelIndex >= this.initializedLevels.length - 1) {
      this.victory();
    } else {
      this.gameState = 'levelComplete';
      this.callbacks.onStateChange('levelComplete');
      
      setTimeout(() => {
        this.currentLevelIndex++;
        this.startLevel();
      }, 2000);
    }
  }

  private gameOver() {
    this.gameState = 'gameOver';
    this.callbacks.onStateChange('gameOver');
    this.soundManager.play('gameOver');
  }

  private victory() {
    this.gameState = 'victory';
    this.callbacks.onStateChange('victory');
    this.soundManager.play('victory');
  }

  private render() {
    // Clear canvas with dark green background
    this.ctx.fillStyle = '#1a4a3a';
    this.ctx.fillRect(0, 0, 800, 600);
    
    // Always render the level, player, and enemies when they exist
    // This ensures we can see the game even in menu state for debugging
    if (this.level && this.player) {
      this.renderer.renderLevel(this.level);
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
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}
