import { Vector2, EnemyType, Rectangle } from './types';
import { Level } from './Level';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TILE_SIZE,
  ENEMY_AABB_PX,
} from './constants';

export class Enemy {
  private position: Vector2;
  private type: EnemyType;
  private id: number;
  private speed: number;
  // Collision AABB extent (px), per type from ENEMY_AABB_PX. The box is
  // centred inside the 32 px cell (see aabbAt); `position` remains the cell
  // top-left so the enemy centre stays position + TILE_SIZE/2.
  private size: number;
  private lastPathfindTime = 0;
  private targetPosition: Vector2;
  // While entering from outside the canvas, the AABB straddles an OOB
  // grid row (which counts as wall) and normal collision blocks all
  // movement. We bypass collision until the enemy is fully inside.
  private entering: boolean;
  private entryDirection: Vector2;

  constructor(
    startPosition: Vector2,
    type: EnemyType,
    id: number,
    level?: Level,
    entry?: { direction: Vector2 },
  ) {
    this.type = type;
    this.id = id;
    // Per-type collision AABB extent (px), centred inside the 32 px cell.
    this.size = ENEMY_AABB_PX[type];

    // Entering enemies spawn at world coords outside the canvas; they
    // shouldn't be snapped to a "safe" tile. Skip findSafeSpawnPosition.
    if (entry) {
      this.position = { ...startPosition };
    } else if (level) {
      // Spawn-safety nudge works on the 32 px cell footprint (the
      // positioning unit), independent of the per-type AABB.
      this.position = level.findSafeSpawnPosition(startPosition, TILE_SIZE);
    } else {
      this.position = { ...startPosition };
    }
    this.targetPosition = { ...startPosition };
    this.entering = !!entry;
    this.entryDirection = entry?.direction ?? { x: 0, y: 0 };

    // Speeds in px/s. Calibrated relative to player at 150 px/s:
    //   panther ~2.6x player, bear ~1.45x, snake ~0.45x, gibbon ~0.23x.
    // Panthers and bears outrun the player in open space; snakes and
    // gibbons are easy to outpace. Combat depends on chokepoints.
    switch (type) {
      case 'panther':
        this.speed = 395;
        break;
      case 'bear':
        this.speed = 218;
        break;
      case 'snake':
        this.speed = 68;
        break;
      case 'gibbon':
        this.speed = 34;
        break;
    }
  }

  // "Fully inside" is measured against the 32 px render cell (the
  // positioning unit), not the per-type AABB — so the handoff from
  // free-entry movement to grid collision is identical for every type.
  isFullyInside(): boolean {
    return (
      this.position.x >= 0 &&
      this.position.x + TILE_SIZE <= CANVAS_WIDTH &&
      this.position.y >= 0 &&
      this.position.y + TILE_SIZE <= CANVAS_HEIGHT
    );
  }

  update(
    deltaTime: number,
    currentTime: number,
    playerPosition: Vector2,
    level: Level,
    others: Enemy[] = [],
  ) {
    if (this.entering) {
      // Free movement along the entry vector while the cell straddles OOB.
      const dist = this.speed * (deltaTime / 1000);
      this.position.x += this.entryDirection.x * dist;
      this.position.y += this.entryDirection.y * dist;
      if (this.isFullyInside()) {
        // Snap the 32 px cell to the canvas edge for a clean handoff into
        // grid collision.
        if (this.entryDirection.y > 0 && this.position.y < 0) this.position.y = 0;
        if (this.entryDirection.x > 0 && this.position.x < 0) this.position.x = 0;
        if (this.entryDirection.y < 0 && this.position.y + TILE_SIZE > CANVAS_HEIGHT) this.position.y = CANVAS_HEIGHT - TILE_SIZE;
        if (this.entryDirection.x < 0 && this.position.x + TILE_SIZE > CANVAS_WIDTH) this.position.x = CANVAS_WIDTH - TILE_SIZE;
        this.entering = false;
      }
      return;
    }

    // Pathfinding repolls every 200 ms, timed off the gameLoop currentTime
    // (the rAF clock threaded through update) — never Date.now (Invariant 8),
    // so the repoll cadence stays correct across pause/resume.
    if (currentTime - this.lastPathfindTime > 200) {
      this.targetPosition = this.findPathToPlayer(playerPosition, level);
      this.lastPathfindTime = currentTime;
    }

    // Move towards target
    const dx = this.targetPosition.x - this.position.x;
    const dy = this.targetPosition.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const moveDistance = this.speed * (deltaTime / 1000);

    if (distance > 5) {
      const newX = this.position.x + (dx / distance) * moveDistance;
      const newY = this.position.y + (dy / distance) * moveDistance;

      // Resolve walls per-axis so the enemy still slides along a wall: try
      // X against the current Y, then Y against the resolved X. The centred
      // AABB (per-type `size`) is what's tested — a 34 px bear straddles two
      // columns and so is blocked from 1-tile corridors.
      let candX = this.position.x;
      let candY = this.position.y;
      if (!this.collidesWall(newX, this.position.y, level)) candX = newX;
      if (!this.collidesWall(candX, newY, level)) candY = newY;

      if (candX === this.position.x && candY === this.position.y) {
        // Per-axis wall resolution produced ZERO motion while still
        // off-target — the freeze mode for an over-tile enemy. A 34 px bear's
        // centred AABB overhangs its cell by 1 px, so when it sits in a
        // corridor's edge column the box clips the adjacent wall column on
        // every attempted move and both axes stay blocked forever. Jitter to
        // a clear cardinal so it slides off the wall toward the open centre
        // column (§5.8 jitter-then-hold). For enemies that fit inside their
        // cell this branch only triggers in a genuine dead end, where
        // jitter-then-hold is the intended behavior anyway.
        this.jitter(moveDistance, level, others);
      } else if (!this.overlapsEnemy(candX, candY, others)) {
        // Enemy-vs-enemy no-overlap (snake-snake exempt, §5.8): commit the
        // wall-resolved step only if it doesn't land on another enemy;
        // otherwise jitter to a random clear cardinal, or hold if none clears.
        this.position.x = candX;
        this.position.y = candY;
      } else {
        this.jitter(moveDistance, level, others);
      }
    } else if (this.overlapsEnemy(this.position.x, this.position.y, others)) {
      // Settled at the target (distance ≤ 5) but overlapping another enemy:
      // the movement branch above is skipped, so without this two enemies
      // that converged on the same spot would freeze permanently in overlap.
      // Nudge apart (snake-snake is already exempt inside overlapsEnemy).
      this.jitter(moveDistance, level, others);
    }
  }

  // World-space collision AABB: the per-type box (`size`) centred inside the
  // 32 px cell at `position`. The centre stays at position + TILE_SIZE/2, so
  // Game.ts targeting/contact/arrow math (which assumes that centre) is
  // unaffected by the variable size.
  getAABB(): Rectangle {
    return this.aabbAt(this.position.x, this.position.y);
  }

  private aabbAt(cellX: number, cellY: number): Rectangle {
    const offset = (TILE_SIZE - this.size) / 2;
    return {
      x: cellX + offset,
      y: cellY + offset,
      width: this.size,
      height: this.size,
    };
  }

  // True if the centred AABB at the given cell top-left overlaps any wall
  // tile. Scans every grid cell the AABB touches — correct for sizes both
  // under one tile (snake) and over (a 34 px bear straddles two columns, so
  // it cannot fit a 1-tile corridor).
  private collidesWall(cellX: number, cellY: number, level: Level): boolean {
    const box = this.aabbAt(cellX, cellY);
    const gx1 = Math.floor(box.x / TILE_SIZE);
    const gy1 = Math.floor(box.y / TILE_SIZE);
    const gx2 = Math.floor((box.x + box.width - 1) / TILE_SIZE);
    const gy2 = Math.floor((box.y + box.height - 1) / TILE_SIZE);
    for (let gy = gy1; gy <= gy2; gy++) {
      for (let gx = gx1; gx <= gx2; gx++) {
        if (level.isWall(gx, gy)) return true;
      }
    }
    return false;
  }

  // True if the centred AABB at the given cell top-left overlaps another
  // enemy. Snake-vs-snake overlap is allowed (writhing pile / pack, §5.8);
  // still-entering enemies are off-canvas and excluded as obstacles.
  private overlapsEnemy(cellX: number, cellY: number, others: Enemy[]): boolean {
    const box = this.aabbAt(cellX, cellY);
    for (const other of others) {
      if (other === this) continue;
      if (other.entering) continue;
      if (this.type === 'snake' && other.type === 'snake') continue;
      const o = other.getAABB();
      if (
        box.x < o.x + o.width &&
        box.x + box.width > o.x &&
        box.y < o.y + o.height &&
        box.y + box.height > o.y
      ) {
        return true;
      }
    }
    return false;
  }

  // Reject-and-jitter (§5.8): try a random clear cardinal nudge of the same
  // step magnitude; take the first that clears both walls and other enemies.
  // If none is clear, hold position this tick.
  private jitter(moveDistance: number, level: Level, others: Enemy[]) {
    const dirs = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];
    // Fisher–Yates shuffle. Math.random is fine here — it's not simulation
    // timing, so Invariant 8 (no Date.now in sim) doesn't apply.
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const d of dirs) {
      const jx = this.position.x + d.x * moveDistance;
      const jy = this.position.y + d.y * moveDistance;
      if (!this.collidesWall(jx, jy, level) && !this.overlapsEnemy(jx, jy, others)) {
        this.position.x = jx;
        this.position.y = jy;
        return;
      }
    }
    // Fully blocked → hold position this tick.
  }

  private findPathToPlayer(playerPosition: Vector2, level: Level): Vector2 {
    // Simple direct pathfinding - move towards player. Tile-only and
    // enemy-agnostic by design; transient enemy blocks are handled by the
    // jitter in update(), not here.
    const dx = playerPosition.x - this.position.x;
    const dy = playerPosition.y - this.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return this.position;

    // Check if direct path is clear (sample every half-tile).
    const steps = Math.ceil(distance / (TILE_SIZE / 2));
    const stepX = dx / steps;
    const stepY = dy / steps;

    for (let i = 1; i <= steps; i++) {
      const checkX = this.position.x + stepX * i;
      const checkY = this.position.y + stepY * i;
      const gridX = Math.floor(checkX / TILE_SIZE);
      const gridY = Math.floor(checkY / TILE_SIZE);

      if (level.isWall(gridX, gridY)) {
        // Path blocked, try alternative routes
        return this.findAlternativePath(playerPosition, level);
      }
    }

    return playerPosition;
  }

  private findAlternativePath(playerPosition: Vector2, level: Level): Vector2 {
    // Try moving in cardinal directions to find a clear path
    const directions = [
      { x: 0, y: -TILE_SIZE }, // Up
      { x: TILE_SIZE, y: 0 }, // Right
      { x: 0, y: TILE_SIZE }, // Down
      { x: -TILE_SIZE, y: 0 }, // Left
    ];

    let bestDirection = { x: 0, y: 0 };
    let bestScore = Infinity;

    directions.forEach((dir) => {
      const newX = this.position.x + dir.x;
      const newY = this.position.y + dir.y;
      const gridX = Math.floor(newX / TILE_SIZE);
      const gridY = Math.floor(newY / TILE_SIZE);

      if (
        !level.isWall(gridX, gridY) &&
        newX >= 0 &&
        newX < CANVAS_WIDTH &&
        newY >= 0 &&
        newY < CANVAS_HEIGHT
      ) {
        const distanceToPlayer = Math.sqrt(
          Math.pow(newX - playerPosition.x, 2) +
            Math.pow(newY - playerPosition.y, 2),
        );

        if (distanceToPlayer < bestScore) {
          bestScore = distanceToPlayer;
          bestDirection = { x: newX, y: newY };
        }
      }
    });

    return bestDirection.x === 0 && bestDirection.y === 0
      ? this.position
      : bestDirection;
  }

  getPosition(): Vector2 {
    return { ...this.position };
  }

  getType(): EnemyType {
    return this.type;
  }

  getId(): number {
    return this.id;
  }
}
