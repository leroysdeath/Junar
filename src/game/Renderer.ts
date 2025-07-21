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
          // Render tree (green blocks with collision)
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
          // Render dirt/brown floor (no collision)
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
      const arrowLength = 24; // Slightly smaller for cardinal directions
      const arrowWidth = 4; // Thinner shaft for cleaner look
      const headLength = 6; // Smaller arrow head
      const headWidth = 8; // Narrower arrow head
      
      // Determine cardinal direction and set angle accordingly
      let angle = 0;
      if (arrow.dir.x === 1) angle = 0; // Right
      else if (arrow.dir.x === -1) angle = Math.PI; // Left
      else if (arrow.dir.y === 1) angle = Math.PI / 2; // Down
      else if (arrow.dir.y === -1) angle = -Math.PI / 2; // Up
      
      this.ctx.save();
      this.ctx.translate(arrow.pos.x, arrow.pos.y);
      this.ctx.rotate(angle);
      
      // Arrow shaft - solid dark brown for better visibility
      this.ctx.fillStyle = '#4a3c28';
      this.ctx.fillRect(-arrowLength/2, -arrowWidth/2, arrowLength - headLength, arrowWidth);
      
      // Arrow head - solid dark brown triangle
      this.ctx.fillStyle = '#4a3c28';
      this.ctx.beginPath();
      this.ctx.moveTo(arrowLength/2, 0); // Point of arrow
      this.ctx.lineTo(arrowLength/2 - headLength, -headWidth/2); // Top of head
      this.ctx.lineTo(arrowLength/2 - headLength, headWidth/2); // Bottom of head
      this.ctx.closePath();
      this.ctx.fill();
      
      // Add arrow fletching for cardinal direction clarity
      this.ctx.fillStyle = '#8B4513';
      this.ctx.fillRect(-arrowLength/2, -arrowWidth/4, 4, arrowWidth/2);
      
      this.ctx.restore();
    });
  }

  renderLineOfSightIndicator(player: Player, hasLineOfSight: boolean) {
    const pos = player.getPosition();
    const centerX = pos.x + 16;
    const centerY = pos.y + 16;
    
    // Draw a subtle indicator around the player
    this.ctx.save();
    this.ctx.globalAlpha = 0.6;
    
    if (hasLineOfSight) {
      // Green glow when enemy is in sight
      this.ctx.strokeStyle = '#00FF00';
      this.ctx.lineWidth = 3;
      this.ctx.setLineDash([4, 4]);
    } else {
      // Red outline when no enemy in sight
      this.ctx.strokeStyle = '#FF4444';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([2, 2]);
    }
    
    this.ctx.strokeRect(pos.x - 2, pos.y - 2, 36, 36);
    this.ctx.setLineDash([]); // Reset line dash
    
    this.ctx.restore();
  }
}