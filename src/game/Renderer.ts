import { Player } from './Player';
import { Enemy } from './Enemy';
import { Level } from './Level';
import { Facing, Vector2 } from './types';
import { TILE_SIZE, ENEMY_AABB_PX, BOSS_GROWTH_CENTER } from './constants';
// ArMM1998's "Zelda-like tilesets and sprites" pack, CC0 / public domain
// (opengameart.org/content/zelda-like-tilesets-and-sprites). Owner-approved
// 2026-05-10 as the player-only sprite swap; see CLAUDE.md §9.
import playerSpriteUrl from '../assets/player-sprite.png';

// Sprite-sheet layout — character.png from ArMM1998's pack uses 16-wide ×
// 32-tall cells, 4-frame walk per direction across columns, one direction
// per row. Row order inferred visually from the sheet: down, left, up, right.
const SPRITE_CELL_W = 16;
const SPRITE_CELL_H = 32;
const SPRITE_WALK_FRAMES = 4;
const SPRITE_WALK_FRAME_MS = 140;
const SPRITE_DIR_ROW: Record<Facing, number> = {
  down: 0,
  right: 1,
  up: 2,
  left: 3,
};

// Enemy procedural art is scaled around its cell centre so drawn size
// reflects the per-type collision AABB (ENEMY_AABB_PX): the bear reads
// biggest, the snake smallest. Floored here so the smallest beasts (gibbon,
// snake) stay identifiable in one frame rather than shrinking to a sub-pixel
// speck — Pillar 5 (readable at a glance) is a hard constraint, so the drawn
// size is allowed to exceed the tiny collision box. Collision itself always
// uses the true AABB (Enemy.getAABB), independent of this.
const ENEMY_VISUAL_SCALE_FLOOR = 0.5;

// Corrupted-growth palette — first use of the black-goo accent direction from
// CLAUDE.md §6 (deep oily black, sickly green/purple highlights). The planned
// infected-beast accents (§7 roadmap step 4) should reuse these constants.
const GOO_BLACK = '#0B0A10'; // oily pool mass
const GOO_TENDRIL = '#1C1426'; // near-black purple tendrils
const GOO_PURPLE = '#5B2A86'; // sheen highlights on the pool
const GOO_VEIN = '#6B8E23'; // sickly olive veins feeding the heart
const GOO_HEART = '#9ACD32'; // glowing heart body
const GOO_HEART_CORE = '#D9F99D'; // pale core flash at peak pulse

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private playerSprite: HTMLImageElement;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    // Disable bilinear filtering so the pixel-art sprite stays crisp when
    // scaled. fillRect-based procedural drawing is unaffected by this flag.
    this.ctx.imageSmoothingEnabled = false;
    this.playerSprite = new Image();
    this.playerSprite.src = playerSpriteUrl;
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
          // Solid pathway tile — single tan fill, no accents.
          this.ctx.fillStyle = '#D2B48C';
          this.ctx.fillRect(pixelX, pixelY, 32, 32);
        }
      }
    }
  }

  renderPlayer(player: Player, burstActive = false, currentTime = 0) {
    const pos = player.getPosition();
    const facing = player.getFacing();

    // Burst aura — single warm-gold layer behind the player. Drawn first
    // so the figure remains readable on top. Fixed alpha and color; no
    // multiplier-tied intensity (intentional — keeps the cue binary).
    if (burstActive) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.35;
      this.ctx.fillStyle = '#FFC857';
      this.ctx.fillRect(pos.x - 6, pos.y - 6, 44, 44);
      this.ctx.globalAlpha = 0.55;
      this.ctx.fillStyle = '#FFD97A';
      this.ctx.fillRect(pos.x - 3, pos.y - 3, 38, 38);
      this.ctx.restore();
    }

    // Walk frame: cycle through 0..3 while a direction is held; hold col 0
    // (idle pose) otherwise. currentTime comes from the gameLoop's RAF
    // timestamp per CLAUDE.md — defaulting to 0 just freezes the idle frame.
    const frame = player.isMoving()
      ? Math.floor(currentTime / SPRITE_WALK_FRAME_MS) % SPRITE_WALK_FRAMES
      : 0;
    const row = SPRITE_DIR_ROW[facing];

    // Source cell from the sheet. Destination: native scale (16w × 32h)
    // centered horizontally in the 32×32 AABB so the burst aura still
    // envelopes the visible character correctly.
    this.ctx.drawImage(
      this.playerSprite,
      frame * SPRITE_CELL_W,
      row * SPRITE_CELL_H,
      SPRITE_CELL_W,
      SPRITE_CELL_H,
      pos.x + 8,
      pos.y,
      SPRITE_CELL_W,
      SPRITE_CELL_H,
    );
  }

  renderEnemies(enemies: Enemy[]) {
    enemies.forEach(enemy => {
      const pos = enemy.getPosition();
      const type = enemy.getType();

      // Scale the procedural art around the cell centre so drawn size tracks
      // the per-type collision AABB (bear biggest → snake smallest), floored
      // so the smallest beasts stay identifiable in one frame (Pillar 5).
      const scale = Math.max(
        ENEMY_AABB_PX[type] / TILE_SIZE,
        ENEMY_VISUAL_SCALE_FLOOR,
      );
      const cx = pos.x + TILE_SIZE / 2;
      const cy = pos.y + TILE_SIZE / 2;

      this.ctx.save();
      this.ctx.translate(cx, cy);
      this.ctx.scale(scale, scale);
      this.ctx.translate(-cx, -cy);

      switch (type) {
        case 'panther':
          this.renderPanther(pos);
          break;
        case 'snake':
          this.renderSnake(pos);
          break;
        case 'gibbon':
          this.renderGibbon(pos);
          break;
        case 'bear':
          this.renderBear(pos);
          break;
      }

      this.ctx.restore();
    });
  }

  // Panther — sleek, low-slung, ~23 px visible width.
  private renderPanther(pos: Vector2) {
    // Body
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(pos.x + 5, pos.y + 13, 22, 11);

    // Head
    this.ctx.fillStyle = '#2a2a2a';
    this.ctx.fillRect(pos.x + 9, pos.y + 8, 14, 11);

    // Eyes
    this.ctx.fillStyle = '#FFD700';
    this.ctx.fillRect(pos.x + 12, pos.y + 10, 2, 2);
    this.ctx.fillRect(pos.x + 18, pos.y + 10, 2, 2);

    // Tail
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(pos.x + 24, pos.y + 16, 4, 8);
  }

  // Gibbon — long-armed jungle primate; ~20 px visible width with arms.
  // Lanky arms hang prominently. Sandy gold color distinguishes from
  // panther/bear browns.
  private renderGibbon(pos: Vector2) {
    // Body (compact torso)
    this.ctx.fillStyle = '#B8860B';
    this.ctx.fillRect(pos.x + 11, pos.y + 14, 10, 12);

    // Head
    this.ctx.fillStyle = '#DAA520';
    this.ctx.fillRect(pos.x + 12, pos.y + 6, 8, 9);

    // Long arms (signature gibbon trait)
    this.ctx.fillStyle = '#B8860B';
    this.ctx.fillRect(pos.x + 6, pos.y + 12, 4, 14);
    this.ctx.fillRect(pos.x + 22, pos.y + 12, 4, 14);

    // Eyes
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(pos.x + 13, pos.y + 9, 2, 2);
    this.ctx.fillRect(pos.x + 17, pos.y + 9, 2, 2);
  }

  // Bear — chunky, slightly fills the 32-px AABB; ~30 px visible width.
  private renderBear(pos: Vector2) {
    // Body
    this.ctx.fillStyle = '#4a3c28';
    this.ctx.fillRect(pos.x + 1, pos.y + 7, 30, 24);

    // Body shading / fur tone
    this.ctx.fillStyle = '#5a4c38';
    this.ctx.fillRect(pos.x + 3, pos.y + 9, 26, 20);

    // Head
    this.ctx.fillStyle = '#4a3c28';
    this.ctx.fillRect(pos.x + 5, pos.y + 3, 22, 16);

    // Ears
    this.ctx.fillStyle = '#4a3c28';
    this.ctx.fillRect(pos.x + 4, pos.y + 2, 5, 5);
    this.ctx.fillRect(pos.x + 23, pos.y + 2, 5, 5);

    // Eyes
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(pos.x + 11, pos.y + 8, 2, 2);
    this.ctx.fillRect(pos.x + 19, pos.y + 8, 2, 2);

    // Nose
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(pos.x + 14, pos.y + 13, 4, 3);
  }

  // Snake — thin slithering body, drawn within the cell (scaled in
  // renderEnemies). Collision AABB is a tiny 4 px box (ENEMY_AABB_PX) so many
  // snakes pack/stack per tile; the 32 px cell still drives arrow-hit in
  // Game.ts, so arrows land reliably. Serpentine zigzag suggests motion.
  private renderSnake(pos: Vector2) {
    // Body segments alternating high/low to suggest a slither
    this.ctx.fillStyle = '#2F4F2F';
    this.ctx.fillRect(pos.x + 3, pos.y + 17, 6, 2);
    this.ctx.fillRect(pos.x + 9, pos.y + 15, 6, 2);
    this.ctx.fillRect(pos.x + 15, pos.y + 17, 6, 2);
    this.ctx.fillRect(pos.x + 21, pos.y + 15, 6, 2);

    // Head (slightly larger, lighter color)
    this.ctx.fillStyle = '#556B2F';
    this.ctx.fillRect(pos.x + 26, pos.y + 14, 4, 3);

    // Eye — orange-red hint of corruption
    this.ctx.fillStyle = '#FF6F00';
    this.ctx.fillRect(pos.x + 29, pos.y + 14, 1, 1);
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
      const arrowLength = 24;
      const arrowWidth = 4;
      const headLength = 6;
      const headWidth = 8;

      const angle = Math.atan2(arrow.dir.y, arrow.dir.x);

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

  // Corrupted growth — the boss-arena stub win trigger (and the visual seed
  // of the eventual plant boss, roadmap §5.15). An oily black goo pool with
  // purple sheen and a pulsing sickly-green heart at the arena's center tile.
  // Drawn as a ground feature (under the player) so walking onto it reads.
  // The glowing heart is the touch target (BOSS_GROWTH_TRIGGER_PX in Game);
  // the dark fringe is safe to stand on — readable in one frame against the
  // arena's empty floor. `time` is the gameLoop rAF timestamp (drives the
  // pulse; never Date.now — Invariant 8).
  renderCorruptedGrowth(time: number) {
    const cx = BOSS_GROWTH_CENTER.x;
    const cy = BOSS_GROWTH_CENTER.y;

    // Goo pool — irregular blob from overlapping rects, oily black.
    this.ctx.fillStyle = GOO_BLACK;
    this.ctx.fillRect(cx - 40, cy - 24, 80, 48); // main pool
    this.ctx.fillRect(cx - 24, cy - 36, 48, 12); // top lobe
    this.ctx.fillRect(cx - 24, cy + 24, 48, 10); // bottom lobe
    this.ctx.fillRect(cx - 52, cy - 12, 12, 24); // left lobe
    this.ctx.fillRect(cx + 40, cy - 12, 12, 24); // right lobe

    // Tendrils creeping outward along the floor (slightly asymmetric so the
    // mass reads organic, not stamped).
    this.ctx.fillStyle = GOO_TENDRIL;
    this.ctx.fillRect(cx - 68, cy - 4, 16, 4);
    this.ctx.fillRect(cx + 52, cy + 2, 16, 4);
    this.ctx.fillRect(cx - 6, cy - 48, 4, 12);
    this.ctx.fillRect(cx + 2, cy + 34, 4, 14);

    // Purple sheen — wet-looking highlights on the pool surface.
    this.ctx.fillStyle = GOO_PURPLE;
    this.ctx.fillRect(cx - 32, cy - 16, 10, 4);
    this.ctx.fillRect(cx + 16, cy + 8, 12, 4);
    this.ctx.fillRect(cx - 8, cy + 16, 8, 3);

    // Sickly veins feeding the heart.
    this.ctx.fillStyle = GOO_VEIN;
    this.ctx.fillRect(cx - 14, cy - 2, 28, 4);
    this.ctx.fillRect(cx - 2, cy - 14, 4, 28);

    // Pulsing heart — the win touch target. Pulse expands the square 12→20 px
    // on a slow sine; floored to whole pixels so image-rendering: pixelated
    // stays crisp.
    const pulse = Math.floor((Math.sin(time / 350) + 1) * 2); // 0..4
    const heartSize = 12 + pulse * 2;
    const half = Math.floor(heartSize / 2);
    this.ctx.fillStyle = GOO_HEART;
    this.ctx.fillRect(cx - half, cy - half, heartSize, heartSize);
    // Pale core flash at peak pulse only — reads as a heartbeat.
    if (pulse >= 3) {
      this.ctx.fillStyle = GOO_HEART_CORE;
      this.ctx.fillRect(cx - 3, cy - 3, 6, 6);
    }
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