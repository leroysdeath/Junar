import { Vector2, InputState, Facing } from './types';
import { Level } from './Level';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TILE_SIZE,
  PLAYER_SPEED,
} from './constants';

export interface WallRejection {
  axis: 'x' | 'y';
  from: number;
  attempted: number;
  cells: Array<{ x: number; y: number }>;
}

export class Player {
  private position: Vector2;
  private baseSpeed = PLAYER_SPEED;
  private speedMultiplier = 1;
  private size = 32;
  // Cardinal facing — sticky on the most recent direction press. Default
  // 'down' so a freshly-spawned player who hasn't pressed anything still
  // has a valid render variant.
  private facing: Facing = 'down';
  private prevInput: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  constructor(startPosition: Vector2) {
    this.position = { ...startPosition };
  }

  // Set by Game each frame from stamina state. Composes against baseSpeed:
  // 1 = normal, 0.5 = low-energy penalty, 1.5 = sprinting, 0.75 = sprinting
  // while low (the two compose — see Stamina.getMovementSpeedMultiplier).
  setSpeedMultiplier(m: number) {
    this.speedMultiplier = m;
  }

  getFacing(): Facing {
    return this.facing;
  }

  // True if the player is actively pressing a direction this frame
  // (pressing into a wall still counts — the walk animation should play
  // while attempting to move, even if position is blocked).
  isMoving(): boolean {
    return (
      this.prevInput.up ||
      this.prevInput.down ||
      this.prevInput.left ||
      this.prevInput.right
    );
  }

  // Update facing from this frame's input. Two rules combined:
  //   1. Any new press (false→true edge) wins — the most recent direction
  //      the player asked for becomes the facing.
  //   2. If no new press but the current facing direction was released and
  //      another direction is still held, fall back to the held direction
  //      so a continuously-walking player visually faces where they go.
  // Sticky otherwise — facing persists when nothing is held.
  updateFacing(input: InputState) {
    const newPress: Facing | null =
      input.up && !this.prevInput.up
        ? 'up'
        : input.down && !this.prevInput.down
          ? 'down'
          : input.left && !this.prevInput.left
            ? 'left'
            : input.right && !this.prevInput.right
              ? 'right'
              : null;

    if (newPress) {
      this.facing = newPress;
    } else if (!input[this.facing]) {
      if (input.up) this.facing = 'up';
      else if (input.down) this.facing = 'down';
      else if (input.left) this.facing = 'left';
      else if (input.right) this.facing = 'right';
    }

    this.prevInput = { ...input };
  }

  update(
    deltaTime: number,
    input: InputState,
    level: Level,
    onWallReject?: (rej: WallRejection) => void,
  ) {
    const moveDistance =
      this.baseSpeed * this.speedMultiplier * (deltaTime / 1000);
    let newX = this.position.x;
    let newY = this.position.y;

    if (input.left) newX -= moveDistance;
    if (input.right) newX += moveDistance;
    if (input.up) newY -= moveDistance;
    if (input.down) newY += moveDistance;

    newX = Math.max(0, Math.min(newX, CANVAS_WIDTH - this.size));
    newY = Math.max(0, Math.min(newY, CANVAS_HEIGHT - this.size));

    const wantedX = newX !== this.position.x;
    const wantedY = newY !== this.position.y;

    const gridX = Math.floor(newX / TILE_SIZE);
    const gridY = Math.floor(newY / TILE_SIZE);
    const gridX2 = Math.floor((newX + this.size - 1) / TILE_SIZE);
    const gridY2 = Math.floor((newY + this.size - 1) / TILE_SIZE);
    const curRowTop = Math.floor(this.position.y / TILE_SIZE);
    const curRowBot = Math.floor((this.position.y + this.size - 1) / TILE_SIZE);
    const curColLeft = Math.floor(this.position.x / TILE_SIZE);
    const curColRight = Math.floor(
      (this.position.x + this.size - 1) / TILE_SIZE,
    );

    const horizCells = [
      { x: gridX, y: curRowTop },
      { x: gridX2, y: curRowTop },
      { x: gridX, y: curRowBot },
      { x: gridX2, y: curRowBot },
    ];
    const horizBlocked = horizCells.some((c) => level.isWall(c.x, c.y));

    if (!horizBlocked) {
      this.position.x = newX;
    } else if (wantedX) {
      // Corner-cut: if only one of the two rows the player straddles is
      // blocking, nudge vertically (up to one frame of movement) to clear
      // it, then take the horizontal step. Lets the player slide into a
      // 1-tile-wide horizontal corridor without being grid-aligned.
      const topBlocked =
        level.isWall(gridX, curRowTop) || level.isWall(gridX2, curRowTop);
      const botBlocked =
        level.isWall(gridX, curRowBot) || level.isWall(gridX2, curRowBot);
      const straddling = curRowTop !== curRowBot;

      let slideY: number | null = null;
      if (straddling && topBlocked && !botBlocked) {
        const target = (curRowTop + 1) * TILE_SIZE;
        slideY = Math.min(target, this.position.y + moveDistance);
      } else if (straddling && botBlocked && !topBlocked) {
        const target = curRowTop * TILE_SIZE;
        slideY = Math.max(target, this.position.y - moveDistance);
      }

      let slid = false;
      if (slideY !== null) {
        const sy = Math.max(0, Math.min(slideY, CANVAS_HEIGHT - this.size));
        const slideRowTop = Math.floor(sy / TILE_SIZE);
        const slideRowBot = Math.floor((sy + this.size - 1) / TILE_SIZE);
        const clear =
          !level.isWall(gridX, slideRowTop) &&
          !level.isWall(gridX2, slideRowTop) &&
          !level.isWall(gridX, slideRowBot) &&
          !level.isWall(gridX2, slideRowBot);
        if (clear) {
          this.position.x = newX;
          this.position.y = sy;
          slid = true;
        }
      }
      if (!slid && onWallReject) {
        onWallReject({
          axis: 'x',
          from: this.position.x,
          attempted: newX,
          cells: horizCells.filter((c) => level.isWall(c.x, c.y)),
        });
      }
    }

    const vertCells = [
      { x: curColLeft, y: gridY },
      { x: curColRight, y: gridY },
      { x: curColLeft, y: gridY2 },
      { x: curColRight, y: gridY2 },
    ];
    const vertBlocked = vertCells.some((c) => level.isWall(c.x, c.y));

    if (!vertBlocked) {
      this.position.y = newY;
    } else if (wantedY) {
      // Mirror of the horizontal case: nudge sideways to clear a
      // straddled column so the player can descend/ascend a 1-tile-wide
      // vertical corridor. This is the bug shown by the wall-reject log
      // pattern at playerX=346.57 hitting cell (10, 10).
      const leftBlocked =
        level.isWall(curColLeft, gridY) || level.isWall(curColLeft, gridY2);
      const rightBlocked =
        level.isWall(curColRight, gridY) || level.isWall(curColRight, gridY2);
      const straddling = curColLeft !== curColRight;

      let slideX: number | null = null;
      if (straddling && leftBlocked && !rightBlocked) {
        const target = (curColLeft + 1) * TILE_SIZE;
        slideX = Math.min(target, this.position.x + moveDistance);
      } else if (straddling && rightBlocked && !leftBlocked) {
        const target = curColLeft * TILE_SIZE;
        slideX = Math.max(target, this.position.x - moveDistance);
      }

      let slid = false;
      if (slideX !== null) {
        const sx = Math.max(0, Math.min(slideX, CANVAS_WIDTH - this.size));
        const slideColLeft = Math.floor(sx / TILE_SIZE);
        const slideColRight = Math.floor((sx + this.size - 1) / TILE_SIZE);
        const clear =
          !level.isWall(slideColLeft, gridY) &&
          !level.isWall(slideColRight, gridY) &&
          !level.isWall(slideColLeft, gridY2) &&
          !level.isWall(slideColRight, gridY2);
        if (clear) {
          this.position.x = sx;
          this.position.y = newY;
          slid = true;
        }
      }
      if (!slid && onWallReject) {
        onWallReject({
          axis: 'y',
          from: this.position.y,
          attempted: newY,
          cells: vertCells.filter((c) => level.isWall(c.x, c.y)),
        });
      }
    }
  }

  getPosition(): Vector2 {
    return { ...this.position };
  }

  // Hard-set the position. Used by room transitions (Step 3) to drop the
  // player at the opposite edge of the destination room. Caller is
  // responsible for choosing a wall-free landing spot.
  setPosition(pos: Vector2) {
    this.position = { ...pos };
  }
}
