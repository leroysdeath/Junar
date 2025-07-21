import { Player } from './Player';
import { Enemy } from './Enemy';
import { Level } from './Level';
import { Vector2 } from './types';

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  renderLevel(level: Level) {
    const walls = level.getWalls();
    
    for (let y = 0; y < level.getHeight(); y++) {
      for (let x = 0; x < level.getWidth(); x++) {
        const pixelX = x * 32;
        const pixelY = y * 32;
        
        if (walls[y][x]) {
          // Render tree (green blocks)
          this.ctx.fillStyle = '#228B22';
          this.ctx.fillRect(pixelX, pixelY, 32, 32);
          
          // Add tree texture
          this.ctx.fillStyle = '#32CD32';
          this.ctx.fillRect(pixelX + 2, pixelY + 2, 28, 28);
          
          // Add tree highlights
          this.ctx.fillStyle = '#90EE90';
          this.ctx.fillRect(pixelX + 4, pixelY + 4, 4, 4);
          this.ctx.fillRect(pixelX + 24, pixelY + 12, 4, 4);
          this.ctx.fillRect(pixelX + 12, pixelY + 24, 4, 4);
        } else {
          // Render dirt/brown floor
          this.ctx.fillStyle = '#8B4513';
          this.ctx.fillRect(pixelX, pixelY, 32, 32);
          
          // Add dirt texture
          this.ctx.fillStyle = '#A0522D';
          if ((x + y) % 2 === 0) {
            this.ctx.fillRect(pixelX + 8, pixelY + 8, 16, 16);
          }
          
          // Add small dirt details
          this.ctx.fillStyle = '#654321';
          if ((x + y) % 3 === 0) {
            this.ctx.fillRect(pixelX + 4, pixelY + 4, 2, 2);
            this.ctx.fillRect(pixelX + 26, pixelY + 26, 2, 2);
          }
        }
      }
    }
  }

  renderPlayer(player: Player) {
    const pos = player.getPosition();
    
    // Player body
    this.ctx.fillStyle = '#8B4513';
    this.ctx.fillRect(pos.x + 8, pos.y + 8, 16, 20);
    
    // Player head
    this.ctx.fillStyle = '#D2691E';
    this.ctx.fillRect(pos.x + 10, pos.y + 4, 12, 12);
    
    // Bow
    this.ctx.fillStyle = '#654321';
    this.ctx.fillRect(pos.x + 2, pos.y + 6, 4, 16);
    
    // Arrow quiver
    this.ctx.fillStyle = '#8B4513';
    this.ctx.fillRect(pos.x + 20, pos.y + 8, 6, 12);
    
    // Feathers in hair
    this.ctx.fillStyle = '#FFD700';
    this.ctx.fillRect(pos.x + 12, pos.y + 2, 2, 6);
    this.ctx.fillRect(pos.x + 16, pos.y + 2, 2, 6);
  }

  renderEnemies(enemies: Enemy[]) {
    enemies.forEach(enemy => {
      const pos = enemy.getPosition();
      const type = enemy.getType();
      
      switch (type) {
        case 'panther':
          this.renderPanther(pos);
          break;
        case 'primate':
          this.renderPrimate(pos);
          break;
        case 'bear':
          this.renderBear(pos);
          break;
      }
    });
  }

  private renderPanther(pos: Vector2) {
    // Panther body
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(pos.x + 4, pos.y + 12, 24, 12);
    
    // Panther head
    this.ctx.fillStyle = '#2a2a2a';
    this.ctx.fillRect(pos.x + 8, pos.y + 8, 16, 12);
    
    // Eyes
    this.ctx.fillStyle = '#FFD700';
    this.ctx.fillRect(pos.x + 12, pos.y + 10, 2, 2);
    this.ctx.fillRect(pos.x + 18, pos.y + 10, 2, 2);
    
    // Tail
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(pos.x + 26, pos.y + 16, 4, 8);
  }

  private renderPrimate(pos: Vector2) {
    // Primate body
    this.ctx.fillStyle = '#8B4513';
    this.ctx.fillRect(pos.x + 8, pos.y + 12, 16, 16);
    
    // Primate head
    this.ctx.fillStyle = '#D2691E';
    this.ctx.fillRect(pos.x + 10, pos.y + 6, 12, 12);
    
    // Arms
    this.ctx.fillStyle = '#8B4513';
    this.ctx.fillRect(pos.x + 4, pos.y + 14, 8, 6);
    this.ctx.fillRect(pos.x + 20, pos.y + 14, 8, 6);
    
    // Eyes
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(pos.x + 12, pos.y + 8, 2, 2);
    this.ctx.fillRect(pos.x + 18, pos.y + 8, 2, 2);
  }

  private renderBear(pos: Vector2) {
    // Bear body
    this.ctx.fillStyle = '#4a3c28';
    this.ctx.fillRect(pos.x + 4, pos.y + 8, 24, 20);
    
    // Bear head
    this.ctx.fillStyle = '#5a4c38';
    this.ctx.fillRect(pos.x + 8, pos.y + 4, 16, 16);
    
    // Ears
    this.ctx.fillStyle = '#4a3c28';
    this.ctx.fillRect(pos.x + 8, pos.y + 4, 4, 4);
    this.ctx.fillRect(pos.x + 20, pos.y + 4, 4, 4);
    
    // Eyes
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(pos.x + 12, pos.y + 8, 2, 2);
    this.ctx.fillRect(pos.x + 18, pos.y + 8, 2, 2);
    
    // Nose
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(pos.x + 15, pos.y + 12, 2, 2);
  }

  renderArrows(arrows: Array<{ pos: Vector2; dir: Vector2; id: number }>) {
    arrows.forEach(arrow => {
      this.ctx.fillStyle = '#8B4513';
      this.ctx.fillRect(arrow.pos.x, arrow.pos.y, 4, 2);
      
      // Arrow tip
      this.ctx.fillStyle = '#C0C0C0';
      this.ctx.fillRect(arrow.pos.x + 2, arrow.pos.y + 1, 2, 1);
    });
  }
}