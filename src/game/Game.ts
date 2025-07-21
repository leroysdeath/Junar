import { Player } from './Player';
import { Enemy } from './Enemy';
import { Level } from './Level';
import { InputManager } from './InputManager';
import { Renderer } from './Renderer';
import { SoundManager } from './SoundManager';
import { CollisionManager } from './CollisionManager';
import { GameState, GameCallbacks, Vector2 } from './types';
import { levels } from './levels';

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
  private currentLevelIndex = 0;
  private score = 0;
  private lastTime = 0;
  private animationId: number | null = null;
  
  private lastArrowTime = 0;
  private arrowCooldown = 500; // 0.5 seconds
  private arrows: Array<{ pos: Vector2; dir: Vector2; id: number }> = [];
  private nextArrowId = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.callbacks = callbacks;
    
    this.inputManager = new InputManager();
    this.renderer = new Renderer(this.ctx);
    this.soundManager = new SoundManager(callbacks.soundEnabled);
    this.collisionManager = new CollisionManager();
    
    this.level = new Level(levels[0]);
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
    this.startLevel();
  }

  private startLevel() {
    this.gameState = 'playing';
    this.level = new Level(levels[this.currentLevelIndex]);
    this.player = new Player(this.level.getPlayerSpawn());
    this.enemies = this.level.getEnemySpawns().map((spawn, index) => 
      new Enemy(spawn.pos, spawn.type, index)
    );
    this.arrows = [];
    
    this.callbacks.onStateChange('playing');
    this.callbacks.onLevelChange(this.currentLevelIndex + 1);
    this.callbacks.onEnemiesChange(this.enemies.length);
    this.callbacks.onScoreChange(this.score);
  }

  private gameLoop(currentTime: number) {
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    if (this.gameState === 'playing') {
      this.update(deltaTime);
    }
    
    this.render();
    this.animationId = requestAnimationFrame((time) => this.gameLoop(time));
  }

  private update(deltaTime: number) {
    // Update player
    const input = this.inputManager.getInput();
    this.player.update(deltaTime, input, this.level);
    
    // Auto-fire arrows
    if (currentTime - this.lastArrowTime >= this.arrowCooldown) {
      this.fireArrow();
      this.lastArrowTime = currentTime;
    }
    
    // Update enemies
    this.enemies.forEach(enemy => {
      enemy.update(deltaTime, this.player.getPosition(), this.level);
    });
    
    // Update arrows
    this.arrows = this.arrows.filter(arrow => {
      arrow.pos.x += arrow.dir.x * 400 * (deltaTime / 1000);
      arrow.pos.y += arrow.dir.y * 400 * (deltaTime / 1000);
      
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

  private fireArrow() {
    if (this.enemies.length === 0) return;
    
    // Find nearest enemy
    const playerPos = this.player.getPosition();
    let nearestEnemy = this.enemies[0];
    let nearestDistance = Infinity;
    
    this.enemies.forEach(enemy => {
      const dist = Math.sqrt(
        Math.pow(enemy.getPosition().x - playerPos.x, 2) +
        Math.pow(enemy.getPosition().y - playerPos.y, 2)
      );
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestEnemy = enemy;
      }
    });
    
    // Calculate direction
    const enemyPos = nearestEnemy.getPosition();
    const dx = enemyPos.x - playerPos.x;
    const dy = enemyPos.y - playerPos.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length > 0) {
      this.arrows.push({
        pos: { x: playerPos.x + 16, y: playerPos.y + 16 },
        dir: { x: dx / length, y: dy / length },
        id: this.nextArrowId++
      });
      
      this.soundManager.play('arrow');
    }
  }

  private checkCollisions() {
    const playerPos = this.player.getPosition();
    
    // Check enemy-player collisions
    this.enemies.forEach(enemy => {
      if (this.collisionManager.checkCollision(
        { x: playerPos.x, y: playerPos.y, width: 32, height: 32 },
        { x: enemy.getPosition().x, y: enemy.getPosition().y, width: 32, height: 32 }
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
    
    if (this.currentLevelIndex >= levels.length - 1) {
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
    this.ctx.fillStyle = '#1a4a3a';
    this.ctx.fillRect(0, 0, 800, 600);
    
    if (this.gameState === 'playing' || this.gameState === 'levelComplete') {
      this.renderer.renderLevel(this.level);
      this.renderer.renderPlayer(this.player);
      this.renderer.renderEnemies(this.enemies);
      this.renderer.renderArrows(this.arrows);
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