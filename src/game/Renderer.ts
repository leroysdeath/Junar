import { Player } from './Player';
import { Enemy } from './Enemy';
import { Level } from './Level';
import { EnemyType, Facing, Vector2 } from './types';
import { TILE_SIZE, ENEMY_AABB_PX, BOSS_GROWTH_CENTER } from './constants';
// ArMM1998's "Zelda-like tilesets and sprites" pack, CC0 / public domain
// (opengameart.org/content/zelda-like-tilesets-and-sprites). Owner-approved
// 2026-05-10 as the player-only sprite swap; see CLAUDE.md §9.
import playerSpriteUrl from '../assets/player-sprite.png';
// Family sheets — Tier 2 of docs/ART-ASSETS.md, owner-greenlit 2026-06-11.
// Recolored from Charles Gabriel (Antifarea)'s CC-BY 3.0 charsets
// (opengameart.org); attribution logged in docs/ART-CREDITS.md.
import familyWifeUrl from '../assets/sprites/family-wife.png';
import familySonUrl from '../assets/sprites/family-son.png';
import familyDaughterUrl from '../assets/sprites/family-daughter.png';
// Beast sheets — Tier 1 of docs/ART-ASSETS.md, owner-greenlit 2026-06-11,
// files landed 2026-06-12. Panther/gibbon(gorilla)/bear from the paid Time
// Fantasy Animals packs 1+2 (Jason Perry / finalbossblues, royalty-free
// commercial — license recorded in docs/ART-CREDITS.md, raw redistribution
// prohibited); snake from "Tiny, Tiny Heroes - Animals" (Kacper Woźniak /
// thkaspar, CC-BY 4.0, attribution logged) recolored green→olive.
import pantherSpriteUrl from '../assets/sprites/panther.png';
import bearSpriteUrl from '../assets/sprites/bear.png';
import snakeSpriteUrl from '../assets/sprites/snake.png';
import gibbonSpriteUrl from '../assets/sprites/gibbon.png';

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

// Family-sheet layout — each sheet is 3 walk columns (walk1 / stand / walk2)
// x 4 direction rows of 16x18 cells, recomposed to the same row order as
// SPRITE_DIR_ROW so a future FamilyMember entity can animate them exactly
// like the player. renderNpcs draws only the down-facing stand frame today
// (family is render-only; CLAUDE.md §5).
const FAMILY_CELL_W = 16;
const FAMILY_CELL_H = 18;
const FAMILY_STAND_COL = 1;

// Beast sprites draw at a size that tracks the per-type collision AABB
// (ENEMY_AABB_PX): each sheet's frame is fitted into a square box of
// TILE_SIZE × max(AABB/TILE_SIZE, ENEMY_VISUAL_SCALE_FLOOR) px, centred in
// the cell. The bear reads biggest and the snake smallest, while the floor
// keeps the smallest beasts (gibbon, snake) identifiable in one frame rather
// than shrinking to a sub-pixel speck — Pillar 5 (readable at a glance) is a
// hard constraint, so the drawn size is allowed to exceed the tiny collision
// box. A side effect of fitting to the AABB box (vs the old procedural art,
// which drew the panther ~15 px against its 21 px kill box): the visible
// body now matches the kill box, so contact deaths read fairer. Collision
// itself always uses the true AABB (Enemy.getAABB), independent of this.
const ENEMY_VISUAL_SCALE_FLOOR = 0.5;

// Beast-sheet layout — same convention as the family sheets: 3 walk columns
// (walk1 / stand / walk2) × 4 direction rows in SPRITE_DIR_ROW order
// (down, right, up, left), uniform per-sheet cell size (the tight union
// bbox of the source frames, so cells differ per beast). `eyes` are the
// sprite's own eye pixels per facing, in cell coordinates — the infected
// red-eye cue (INFECTED_EYE_RED) is drawn over them as 2×2 fills scaled
// with the body (owner decision 2026-06-11: one treatment across sprite
// and procedural eras). Up-facing shows the back of the head: no eyes.
interface BeastSheetSpec {
  cellW: number;
  cellH: number;
  eyes: {
    down: [number, number][];
    right: [number, number][];
    left: [number, number][];
  };
}
const BEAST_SHEET: Record<EnemyType, BeastSheetSpec> = {
  panther: {
    cellW: 38,
    cellH: 28,
    eyes: {
      down: [
        [14, 7],
        [19, 7],
      ],
      right: [[31, 7]],
      left: [[5, 7]],
    },
  },
  bear: {
    cellW: 38,
    cellH: 26,
    eyes: {
      down: [
        [15, 8],
        [21, 8],
      ],
      right: [[30, 8]],
      left: [[6, 8]],
    },
  },
  snake: {
    cellW: 16,
    cellH: 16,
    eyes: {
      down: [
        [4, 8],
        [11, 8],
      ],
      right: [[9, 7]],
      left: [[6, 7]],
    },
  },
  gibbon: {
    cellW: 24,
    cellH: 28,
    eyes: {
      down: [
        [8, 8],
        [14, 8],
      ],
      right: [[15, 8]],
      left: [[4, 8]],
    },
  },
};
const BEAST_WALK_FRAME_MS = 170;
// walk1 → stand → walk2 → stand, the classic RPG charset gait.
const BEAST_WALK_CYCLE = [0, 1, 2, 1];
const BEAST_STAND_COL = 1;

// Corrupted-growth palette — the black-goo accent direction from CLAUDE.md
// §6 (deep oily black, sickly green/purple highlights). Boss-only: the goo
// is the antagonist plant's signature (owner decision 2026-06-11 — beasts
// do NOT carry goo accents; their infection cue is INFECTED_EYE_RED below).
const GOO_BLACK = '#0B0A10'; // oily pool mass
const GOO_TENDRIL = '#1C1426'; // near-black purple tendrils
const GOO_PURPLE = '#5B2A86'; // sheen highlights on the pool
const GOO_VEIN = '#6B8E23'; // sickly olive veins feeding the heart
const GOO_HEART = '#9ACD32'; // glowing heart body
const GOO_HEART_CORE = '#D9F99D'; // pale core flash at peak pulse

// Infected-beast cue — owner decision 2026-06-11 (replacing the earlier
// "black-goo accents on beasts" roadmap direction): corruption shows ONLY
// as red eyes, shared by all four beasts. Bodies stay normal wildlife —
// the beasts are victims, and they should still look like animals.
const INFECTED_EYE_RED = '#FF2B2B';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private playerSprite: HTMLImageElement;
  private familySprites: HTMLImageElement[];
  private beastSprites: Record<EnemyType, HTMLImageElement>;
  // Render-side movement tracking so beast sprites face their walk direction
  // and idle on the stand frame. Rebuilt every frame from the live enemy
  // list (no leak across deaths/rooms); purely visual — AI owns real motion.
  private beastTrack = new Map<
    number,
    { x: number; y: number; facing: Facing }
  >();

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    // Disable bilinear filtering so the pixel-art sprite stays crisp when
    // scaled. fillRect-based procedural drawing is unaffected by this flag.
    this.ctx.imageSmoothingEnabled = false;
    this.playerSprite = new Image();
    this.playerSprite.src = playerSpriteUrl;
    // Wife, son, daughter — N markers cycle through these by position index
    // so a 3-marker anchor shows the whole family, deterministically per room.
    this.familySprites = [familyWifeUrl, familySonUrl, familyDaughterUrl].map(
      (url) => {
        const img = new Image();
        img.src = url;
        return img;
      },
    );
    const load = (url: string) => {
      const img = new Image();
      img.src = url;
      return img;
    };
    this.beastSprites = {
      panther: load(pantherSpriteUrl),
      bear: load(bearSpriteUrl),
      snake: load(snakeSpriteUrl),
      gibbon: load(gibbonSpriteUrl),
    };
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

  renderEnemies(enemies: Enemy[], currentTime = 0) {
    const track = new Map<number, { x: number; y: number; facing: Facing }>();
    enemies.forEach((enemy) => {
      const pos = enemy.getPosition();
      const type = enemy.getType();

      // Derive facing + idle/walk from frame-to-frame movement (render-side
      // only). Unseen or stationary enemies idle on their last facing
      // (default: down — statics sit watching the room).
      const prev = this.beastTrack.get(enemy.getId());
      const dx = prev ? pos.x - prev.x : 0;
      const dy = prev ? pos.y - prev.y : 0;
      const moving = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
      let facing: Facing = prev?.facing ?? 'down';
      if (moving) {
        facing =
          Math.abs(dx) > Math.abs(dy)
            ? dx < 0
              ? 'left'
              : 'right'
            : dy < 0
              ? 'up'
              : 'down';
      }
      track.set(enemy.getId(), { x: pos.x, y: pos.y, facing });

      const frameCol = moving
        ? BEAST_WALK_CYCLE[
            Math.floor(currentTime / BEAST_WALK_FRAME_MS) %
              BEAST_WALK_CYCLE.length
          ]
        : BEAST_STAND_COL;

      switch (type) {
        case 'panther':
          this.renderPanther(pos, facing, frameCol);
          break;
        case 'snake':
          this.renderSnake(pos, facing, frameCol);
          break;
        case 'gibbon':
          this.renderGibbon(pos, facing, frameCol);
          break;
        case 'bear':
          this.renderBear(pos, facing, frameCol);
          break;
      }
      // No doorway-arrival flash: the white materialize square was removed by
      // owner decision 2026-06-13 (it read as a box around the smaller beast
      // sprites). The hunter's kill grace itself still stands — it just
      // materializes as its normal sprite, with no extra cue. The arriving
      // hunter is drawn here like any other enemy, so it's still visible before
      // its grace lapses; checkCollisions enforces the grace (Game.ts).
    });
    this.beastTrack = track;
  }

  // Shared beast-sprite draw: fit the sheet's cell into the per-type
  // AABB-or-floor box (see BEAST_SHEET note), centred in the 32 px cell,
  // then stamp the infected red eyes over the sprite's own eye pixels at
  // the same scale. The 32 px cell remains the positioning unit and the
  // arrow-hit box; nothing here touches collision.
  private drawBeast(
    type: EnemyType,
    pos: Vector2,
    facing: Facing,
    frameCol: number,
  ) {
    const spec = BEAST_SHEET[type];
    const box =
      TILE_SIZE *
      Math.max(ENEMY_AABB_PX[type] / TILE_SIZE, ENEMY_VISUAL_SCALE_FLOOR);
    const k = box / Math.max(spec.cellW, spec.cellH);
    const destW = Math.round(spec.cellW * k);
    const destH = Math.round(spec.cellH * k);
    const dx = pos.x + Math.round((TILE_SIZE - destW) / 2);
    const dy = pos.y + Math.round((TILE_SIZE - destH) / 2);

    this.ctx.drawImage(
      this.beastSprites[type],
      frameCol * spec.cellW,
      SPRITE_DIR_ROW[facing] * spec.cellH,
      spec.cellW,
      spec.cellH,
      dx,
      dy,
      destW,
      destH,
    );

    // Red-eye infection cue (owner decision 2026-06-11) — 2×2 fills on the
    // stand-frame eye positions, scaled with the body. Up-facing shows the
    // back of the head, so no eyes (the cue returns the moment it turns).
    if (facing !== 'up') {
      this.ctx.fillStyle = INFECTED_EYE_RED;
      for (const [ex, ey] of spec.eyes[facing]) {
        this.ctx.fillRect(
          dx + Math.round(ex * k),
          dy + Math.round(ey * k),
          2,
          2,
        );
      }
    }
  }

  // Panther — Time Fantasy sheet; black-panther silhouette, reads at its
  // 21 px AABB box. One method per beast kept for the type dispatch.
  private renderPanther(pos: Vector2, facing: Facing, frameCol: number) {
    this.drawBeast('panther', pos, facing, frameCol);
  }

  // Gibbon — Time Fantasy gorilla sheet: dark, tailless, long-armed primate
  // (closest match for the Hoolock); draws at the 0.5 readability floor.
  private renderGibbon(pos: Vector2, facing: Facing, frameCol: number) {
    this.drawBeast('gibbon', pos, facing, frameCol);
  }

  // Bear — Time Fantasy dark adult bear; biggest of the set at its 34 px box.
  private renderBear(pos: Vector2, facing: Facing, frameCol: number) {
    this.drawBeast('bear', pos, facing, frameCol);
  }

  // Snake — TTH sheet recolored to olive (Indian rat snake). Collision AABB
  // stays a tiny 4 px box (ENEMY_AABB_PX) so many snakes pack/stack per
  // tile; drawn at the 16 px readability floor, and the 32 px cell still
  // drives arrow-hit in Game.ts, so arrows land reliably.
  private renderSnake(pos: Vector2, facing: Facing, frameCol: number) {
    this.drawBeast('snake', pos, facing, frameCol);
  }

  // Family NPCs at N markers — sprite-based (Tier 2 swap, owner-greenlit
  // 2026-06-11). Behavior is still unwired, so each member stands on its
  // down-facing idle frame; kept translucent so passive render-only family
  // still reads as "not yet interactive" until the FamilyMember entity lands.
  renderNpcs(positions: Vector2[]) {
    this.ctx.save();
    this.ctx.globalAlpha = 0.7;
    positions.forEach((pos, i) => {
      const sheet = this.familySprites[i % this.familySprites.length];
      // Native 16x18 cell, horizontally centered and foot-aligned in the
      // 32 px tile (same convention as the player sprite's 16x32 cell).
      this.ctx.drawImage(
        sheet,
        FAMILY_STAND_COL * FAMILY_CELL_W,
        SPRITE_DIR_ROW.down * FAMILY_CELL_H,
        FAMILY_CELL_W,
        FAMILY_CELL_H,
        pos.x + (TILE_SIZE - FAMILY_CELL_W) / 2,
        pos.y + (TILE_SIZE - FAMILY_CELL_H),
        FAMILY_CELL_W,
        FAMILY_CELL_H,
      );
    });
    this.ctx.restore();
  }

  // Placeholder hut marker. Translucent peaked-roof shape.
  renderHuts(positions: Vector2[]) {
    this.ctx.save();
    this.ctx.globalAlpha = 0.7;
    positions.forEach((pos) => {
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
    arrows.forEach((arrow) => {
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
      this.ctx.fillRect(
        -arrowLength / 2,
        -arrowWidth / 2,
        arrowLength - headLength,
        arrowWidth,
      );

      // Arrow head - solid dark brown triangle
      this.ctx.fillStyle = '#4a3c28';
      this.ctx.beginPath();
      this.ctx.moveTo(arrowLength / 2, 0); // Point of arrow
      this.ctx.lineTo(arrowLength / 2 - headLength, -headWidth / 2); // Top of head
      this.ctx.lineTo(arrowLength / 2 - headLength, headWidth / 2); // Bottom of head
      this.ctx.closePath();
      this.ctx.fill();

      // Add arrow fletching for cardinal direction clarity
      this.ctx.fillStyle = '#8B4513';
      this.ctx.fillRect(-arrowLength / 2, -arrowWidth / 4, 4, arrowWidth / 2);

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
