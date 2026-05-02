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

    // Tunic / dhoti-coded cloth (cream cotton)
    this.ctx.fillStyle = '#DCC59C';
    this.ctx.fillRect(pos.x + 8, pos.y + 14, 16, 14);

    // Waist sash (dark earth)
    this.ctx.fillStyle = '#5D4037';
    this.ctx.fillRect(pos.x + 8, pos.y + 20, 16, 2);

    // Head (deep warm brown skin tone)
    this.ctx.fillStyle = '#4E342E';
    this.ctx.fillRect(pos.x + 10, pos.y + 6, 12, 10);

    // Hair (short black cap, no headdress)
    this.ctx.fillStyle = '#1A1A1A';
    this.ctx.fillRect(pos.x + 10, pos.y + 4, 12, 3);

    // Bow (dark wood, held in offhand, left side)
    this.ctx.fillStyle = '#654321';
    this.ctx.fillRect(pos.x + 2, pos.y + 6, 4, 16);

    // Quiver (dark leather, slung at right hip)
    this.ctx.fillStyle = '#4A3C28';
    this.ctx.fillRect(pos.x + 20, pos.y + 8, 6, 12);

    // Arrow fletchings peeking from the quiver
    this.ctx.fillStyle = '#FFEEAA';
    this.ctx.fillRect(pos.x + 21, pos.y + 5, 2, 3);
    this.ctx.fillRect(pos.x + 24, pos.y + 5, 2, 3);
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

  // Placeholder family-NPC marker. Translucent so it reads as "not final art."
  // Visual shorthand for a generic family member; behavior is unwired.
  renderNpcs(positions: Vector2[]) {
    this.ctx.save();
    this.ctx.globalAlpha = 0.7;
    positions.forEach(pos => {
      // Tunic
      this.ctx.fillStyle = '#E8D7B0';
      this.ctx.fillRect(pos.x + 9, pos.y + 14, 14, 14);
      // Head
      this.ctx.fillStyle = '#5D4037';
      this.ctx.fillRect(pos.x + 11, pos.y + 6, 10, 10);
      // Hair
      this.ctx.fillStyle = '#1A1A1A';
      this.ctx.fillRect(pos.x + 11, pos.y + 4, 10, 3);
      // Placeholder marker dot (signals "not final")
      this.ctx.fillStyle = '#FF6F00';
      this.ctx.fillRect(pos.x + 14, pos.y + 1, 4, 2);
    });
    this.ctx.restore();
  }

  // Placeholder hut marker. Translucent peaked-roof shape.
  renderHuts(positions: Vector2[]) {
    this.ctx.save();
    this.ctx.globalAlpha = 0.7;
    positions.forEach(pos => {
      // Hut base (woven walls)
      this.ctx.fillStyle = '#8B6F47';
      this.ctx.fillRect(pos.x + 4, pos.y + 14, 24, 16);
      // Base highlight
      this.ctx.fillStyle = '#A0825A';
      this.ctx.fillRect(pos.x + 6, pos.y + 16, 20, 2);
      // Door
      this.ctx.fillStyle = '#3E2723';
      this.ctx.fillRect(pos.x + 13, pos.y + 22, 6, 8);
      // Thatched roof (triangle approximated with trapezoid stack)
      this.ctx.fillStyle = '#5D4037';
      this.ctx.fillRect(pos.x + 2, pos.y + 12, 28, 2);
      this.ctx.fillRect(pos.x + 4, pos.y + 10, 24, 2);
      this.ctx.fillRect(pos.x + 6, pos.y + 8, 20, 2);
      this.ctx.fillRect(pos.x + 9, pos.y + 6, 14, 2);
      this.ctx.fillRect(pos.x + 12, pos.y + 4, 8, 2);
      // Placeholder marker dot
      this.ctx.fillStyle = '#FF6F00';
      this.ctx.fillRect(pos.x + 14, pos.y + 1, 4, 2);
    });
    this.ctx.restore();
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