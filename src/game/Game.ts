import { Player } from './Player';
import { Enemy } from './Enemy';
import { Level } from './Level';
import { InputManager, Direction } from './InputManager';
import { Renderer } from './Renderer';
import { SoundManager } from './SoundManager';
import { CollisionManager } from './CollisionManager';
import { CrashLogger, CrashSnapshot } from './Logger';
import { GlobalWaveScheduler, SpawnRequest } from './WaveScheduler';
import { Stamina } from './Stamina';
import {
  GameState,
  GameCallbacks,
  Vector2,
  EnemyType,
  Facing,
  InputState,
  Edge,
  RoomDef,
  RoomOpening,
  RoomGridCoord,
  RunMap,
  BandSpec,
  LevelData,
} from './types';
import { SNAKE_PANTHER_POOL, SNAKE_PANTHER_BEAR_POOL } from './levels';
import {
  generateRunMap,
  roomAt,
  openingsOnEdge,
  oppositeEdge,
  roomsConnect,
  rangesOverlap,
} from './RoomGrid';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TILE_SIZE,
  PLAYER_SIZE,
  GRID_WIDTH,
  GRID_HEIGHT,
  MAX_DETECTION_RANGE,
  ARROW_SPEED,
  ARROW_COOLDOWN_MS,
  STAMINA_MAX,
  DASH_DISTANCE_PX,
  DEFAULT_INTER_WAVE_LULL_MS,
  CENTER_SPAWN,
} from './constants';

type GameOverReason =
  | { kind: 'overlap'; enemyId: number; enemyType: EnemyType; dx: number; dy: number }
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
// A transition fires only when the player presses outward while pinned to the
// canvas edge; the edge clamp in Player.update lands them exactly on the
// boundary, so this tolerance just absorbs float error.
const EDGE_EPS_PX = 0.5;

const round2 = (n: number) => Math.round(n * 100) / 100;

// Dash teleports the player in the direction opposite to their current
// facing — a back-step / disengage move. Returns a cardinal unit vector.
const dashDirectionFromFacing = (facing: Facing): Vector2 => {
  switch (facing) {
    case 'up':
      return { x: 0, y: 1 };
    case 'down':
      return { x: 0, y: -1 };
    case 'left':
      return { x: 1, y: 0 };
    case 'right':
      return { x: -1, y: 0 };
  }
};

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private player!: Player;
  // Enemies in the CURRENT room. Other rooms' enemies are parked in
  // roomEnemies (no despawn — they wait where the player left them; cross-room
  // hunting arrives in Step 4).
  private enemies: Enemy[] = [];
  private level!: Level;
  private inputManager: InputManager;
  private renderer: Renderer;
  private soundManager: SoundManager;
  private collisionManager: CollisionManager;
  private callbacks: GameCallbacks;
  private logger: CrashLogger;

  private gameState: GameState = 'menu';
  private score = 0;
  private lastTime = 0;
  private animationId: number | null = null;
  private frameCount = 0;
  // Wall-clock-of-the-run start (rAF time), set when a run begins. Drives the
  // suspicious-death heuristics; named *LevelStart in the verdict for crash-log
  // schema stability.
  private levelStartedAt = 0;
  private lastSampleFrame = 0;

  private lastArrowTime = 0;
  private maxDetectionRange = MAX_DETECTION_RANGE;
  private arrows: Array<{ pos: Vector2; dir: Vector2; id: number }> = [];
  private nextArrowId = 0;
  private hasLineOfSight = false; // Track if player has line of sight to any enemy
  // Stamina state. Constructed once; persists across rooms and resets only on
  // Game.restart(). The was* fields drive edge-triggered logging and callback
  // emission for state transitions.
  private stamina = new Stamina();
  private wasBurstActive = false;
  private wasLowStamina = false;
  private wasDepleted = false;
  private lastEmittedStaminaValue = STAMINA_MAX;
  private nextEnemyId = 0;

  // Room grid (Step 3). The run map regenerates each run; the player traverses
  // it room-to-room. One run-long global scheduler drives spawns into the
  // current room.
  private runMap!: RunMap;
  private currentRoomCoord!: RoomGridCoord;
  private roomEnemies = new Map<number, Enemy[]>();
  private globalWaveScheduler: GlobalWaveScheduler | null = null;
  // Boss-arena sub-state (Step 9). True while the player occupies the boss room
  // (anchor 10). It is NOT a separate GameState — the run stays 'playing' so
  // movement, auto-fire, contact-death and (future) cross-room hunters all keep
  // running; only the wave timer is held paused (roadmap §5.4, §5.15). Drives
  // the "Reached Boss" overlay and gates the V win-stub.
  private inBossArena = false;

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

    // Build an initial map so the menu backdrop shows the real anchor-1 room.
    this.regenerateMap();

    this.logger.log('lifecycle', 'game constructed');
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.canvas.addEventListener('click', () => {
      if (this.gameState === 'menu') {
        this.startRun();
      }
    });
  }

  start() {
    this.gameLoop(0);
  }

  restart() {
    // Drop any one-shot input edge (e.g. V pressed on the game-over/victory
    // overlay, which update() never consumed) so it can't leak into the run.
    this.inputManager.clearEdges();
    this.arrows = [];
    this.lastArrowTime = 0;
    this.stamina.reset();
    this.wasBurstActive = false;
    this.wasLowStamina = false;
    this.wasDepleted = false;
    this.lastEmittedStaminaValue = STAMINA_MAX;
    this.callbacks.onStaminaChange?.(STAMINA_MAX, false);
    this.callbacks.onBurstChange?.(false, 1, 0);
    this.logger.log('lifecycle', 'restart');
    // A new run regenerates the whole map (roadmap §5.1).
    this.regenerateMap();
    this.startRun();
  }

  // Build a fresh run map and place the player (stationary) in anchor 1. Used
  // both for the menu backdrop (constructor) and at the start of each run.
  private regenerateMap() {
    this.runMap = generateRunMap();
    this.currentRoomCoord = { ...this.runMap.startCoord };
    this.level = this.levelFromRoom(this.currentRoomDef());
    this.player = new Player({ ...CENTER_SPAWN });
  }

  private startRun() {
    this.gameState = 'playing';
    this.score = 0;
    this.nextEnemyId = 0;
    this.arrows = [];
    this.lastArrowTime = 0;
    this.roomEnemies = new Map();
    this.enemies = [];
    this.hasLineOfSight = false;
    this.globalWaveScheduler = this.createScheduler();
    this.levelStartedAt = performance.now();
    this.lastSampleFrame = this.frameCount;
    // Clear any stale boss-arena state from a prior run (e.g. dying inside the
    // boss room) before re-entering anchor 1. The fresh scheduler is unpaused.
    this.inBossArena = false;
    this.callbacks.onBossArenaChange?.(false);

    // Enter anchor 1 at the centre spawn. enterRoom wires the room's level,
    // wave bands, and HUD signals. Anchor 1 is never the boss room, so this
    // leaves inBossArena false.
    this.enterRoom({ ...this.runMap.startCoord }, { ...CENTER_SPAWN });

    this.callbacks.onStateChange('playing');
    this.callbacks.onScoreChange(this.score);
    this.callbacks.onWaveChange?.(0);
    this.logger.log('level', 'startRun', {
      start: this.runMap.startCoord,
      boss: this.runMap.bossCoord,
      playerSpawn: this.player.getPosition(),
    });
  }

  private createScheduler(): GlobalWaveScheduler {
    return new GlobalWaveScheduler(
      {
        snakePantherPool: SNAKE_PANTHER_POOL,
        snakePantherBearPool: SNAKE_PANTHER_BEAR_POOL,
        interWaveLullMs: DEFAULT_INTER_WAVE_LULL_MS,
      },
      {
        onGraceStart: (durMs) =>
          this.logger.log('level', 'globalGrace', { durationMs: durMs }),
        onWaveStart: (waveNum, triplet, beat) => {
          this.callbacks.onWaveChange?.(waveNum);
          this.logger.log('level', 'globalWaveStart', {
            wave: waveNum,
            triplet,
            beat,
          });
        },
        onInterWaveLull: (durMs) =>
          this.logger.log('level', 'globalLull', { durationMs: durMs }),
        onTripletBreak: (durMs) =>
          this.logger.log('level', 'globalTripletBreak', { durationMs: durMs }),
      },
    );
  }

  private currentRoomDef(): RoomDef {
    return roomAt(this.runMap, this.currentRoomCoord);
  }

  private roomKey(coord: RoomGridCoord): number {
    return coord.row * this.runMap.cols + coord.col;
  }

  // True if `coord` is the boss room (anchor 10). bossCoord is anchor
  // ANCHOR_COUNT-1's placement (see RunMap), set fresh by each regenerateMap().
  private isBossRoom(coord: RoomGridCoord): boolean {
    return (
      coord.col === this.runMap.bossCoord.col &&
      coord.row === this.runMap.bossCoord.row
    );
  }

  // Wrap a room's collision/render data in a Level. Connectors carry no
  // npc/hut markers; anchor rooms keep theirs so the family/hut placeholders
  // still render.
  private levelFromRoom(def: RoomDef): Level {
    const data: LevelData = {
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      walls: def.walls,
      playerSpawn: { ...CENTER_SPAWN },
      enemySpawns: [],
      npcPositions: def.npcPositions,
      hutPositions: def.hutPositions,
    };
    return new Level(data);
  }

  // Per-opening spawn bands (roadmap §5.5). Each opening yields one band sitting
  // one tile outside the canvas along that edge, sized to the opening width.
  private bandsForRoom(def: RoomDef): BandSpec[] {
    return def.openings.map((o) => {
      const span = (o.rangeEnd - o.rangeStart + 1) * TILE_SIZE;
      switch (o.edge) {
        case 'N':
          return {
            rect: { x: o.rangeStart * TILE_SIZE, y: -TILE_SIZE, width: span, height: TILE_SIZE },
            entryDirection: { x: 0, y: 1 },
          };
        case 'S':
          return {
            rect: { x: o.rangeStart * TILE_SIZE, y: CANVAS_HEIGHT, width: span, height: TILE_SIZE },
            entryDirection: { x: 0, y: -1 },
          };
        case 'W':
          return {
            rect: { x: -TILE_SIZE, y: o.rangeStart * TILE_SIZE, width: TILE_SIZE, height: span },
            entryDirection: { x: 1, y: 0 },
          };
        case 'E':
          return {
            rect: { x: CANVAS_WIDTH, y: o.rangeStart * TILE_SIZE, width: TILE_SIZE, height: span },
            entryDirection: { x: -1, y: 0 },
          };
        default: {
          // Exhaustiveness guard: a future Edge member would fail here at
          // compile time rather than silently yielding an undefined band that
          // later throws deep in the wave dripper.
          const exhaustive: never = o.edge;
          throw new Error(`bandsForRoom: unhandled edge ${String(exhaustive)}`);
        }
      }
    });
  }

  // Switch the active room. Loads the room's level, wave bands and parked
  // enemies, drops the player at `entryPos`, and emits HUD signals. Used at run
  // start (entryPos = CENTER_SPAWN) and on every transition.
  private enterRoom(coord: RoomGridCoord, entryPos: Vector2) {
    this.currentRoomCoord = { ...coord };
    const def = this.currentRoomDef();
    this.level = this.levelFromRoom(def);
    this.player.setPosition(entryPos);
    this.enemies = this.roomEnemies.get(this.roomKey(coord)) ?? [];
    this.arrows = []; // arrows don't carry across a hard cut
    this.hasLineOfSight = false;
    this.globalWaveScheduler?.setBands(this.bandsForRoom(def));

    // Boss-arena entry/exit (Step 9). Track + signal only on change so the
    // overlay and log stay edge-driven. The wave-timer pause that must hold for
    // the whole visit is owned by doTransition (it has the rAF `now`).
    const inBoss = this.isBossRoom(coord);
    if (inBoss !== this.inBossArena) {
      this.inBossArena = inBoss;
      this.callbacks.onBossArenaChange?.(inBoss);
      this.logger.log('level', inBoss ? 'bossArenaEnter' : 'bossArenaExit', {
        room: { ...coord },
      });
    }

    this.callbacks.onRoomChange({ ...coord });
    this.callbacks.onEnemiesChange(this.enemies.length);
  }

  // The wave timer pauses while transitioning so its run-long cadence isn't
  // disrupted. For a hard cut start/end share the same frame time, so the pause
  // is effectively zero-length for an ordinary room-to-room move. The boss
  // arena (Step 9) reuses these hooks: doTransition pauses on entry and skips
  // the resume, so the timer stays frozen for the whole boss visit.
  private onRoomTransitionStart(now: number) {
    this.globalWaveScheduler?.pause(now);
  }

  private onRoomTransitionEnd(now: number) {
    this.globalWaveScheduler?.resume(now);
  }

  // If the player is pressing outward while pinned to a room edge inside an
  // opening that connects to a neighbor, return the transition to take.
  private detectTransition(
    input: InputState,
  ): { edge: Edge; dest: RoomGridCoord; entry: Vector2 } | null {
    const pos = this.player.getPosition();
    const maxX = CANVAS_WIDTH - PLAYER_SIZE;
    const maxY = CANVAS_HEIGHT - PLAYER_SIZE;

    let edge: Edge | null = null;
    if (input.right && pos.x >= maxX - EDGE_EPS_PX) edge = 'E';
    else if (input.left && pos.x <= EDGE_EPS_PX) edge = 'W';
    else if (input.up && pos.y <= EDGE_EPS_PX) edge = 'N';
    else if (input.down && pos.y >= maxY - EDGE_EPS_PX) edge = 'S';
    if (!edge) return null;

    const def = this.currentRoomDef();
    // The player must be standing in an opening on that edge (use their centre
    // tile along the edge axis).
    const centerCol = Math.floor((pos.x + PLAYER_SIZE / 2) / TILE_SIZE);
    const centerRow = Math.floor((pos.y + PLAYER_SIZE / 2) / TILE_SIZE);
    const along = edge === 'E' || edge === 'W' ? centerRow : centerCol;
    const opening = openingsOnEdge(def, edge).find(
      (o) => along >= o.rangeStart && along <= o.rangeEnd,
    );
    if (!opening) return null;

    const dest: RoomGridCoord = {
      col: this.currentRoomCoord.col + (edge === 'E' ? 1 : edge === 'W' ? -1 : 0),
      row: this.currentRoomCoord.row + (edge === 'S' ? 1 : edge === 'N' ? -1 : 0),
    };
    if (
      dest.col < 0 ||
      dest.row < 0 ||
      dest.col >= this.runMap.cols ||
      dest.row >= this.runMap.rows
    ) {
      return null;
    }
    const destDef = roomAt(this.runMap, dest);
    if (!roomsConnect(def, edge, destDef)) return null;

    return { edge, dest, entry: this.entryPosition(edge, opening, destDef, pos) };
  }

  // Place the player just inside the destination's opposite edge, preserving
  // their position along the edge (roadmap §5.3) but clamped into the matching
  // destination opening so they land on floor.
  private entryPosition(
    edge: Edge,
    srcOpening: RoomOpening,
    destDef: RoomDef,
    pos: Vector2,
  ): Vector2 {
    const destOpenings = openingsOnEdge(destDef, oppositeEdge(edge));
    const match =
      destOpenings.find((o) =>
        rangesOverlap(o.rangeStart, o.rangeEnd, srcOpening.rangeStart, srcOpening.rangeEnd),
      ) ?? destOpenings[0];
    if (!match) return { ...CENTER_SPAWN };

    const lo = match.rangeStart * TILE_SIZE;
    const hi = (match.rangeEnd + 1) * TILE_SIZE - PLAYER_SIZE;
    if (edge === 'E' || edge === 'W') {
      return {
        x: edge === 'E' ? 0 : CANVAS_WIDTH - PLAYER_SIZE,
        y: Math.max(lo, Math.min(pos.y, hi)),
      };
    }
    return {
      x: Math.max(lo, Math.min(pos.x, hi)),
      y: edge === 'S' ? 0 : CANVAS_HEIGHT - PLAYER_SIZE,
    };
  }

  private doTransition(
    now: number,
    t: { edge: Edge; dest: RoomGridCoord; entry: Vector2 },
  ) {
    this.onRoomTransitionStart(now);
    // Park the current room's enemies (no despawn — they stay put).
    this.roomEnemies.set(this.roomKey(this.currentRoomCoord), this.enemies);
    this.enterRoom(t.dest, t.entry); // sets inBossArena for the destination
    // Resume the wave timer on arrival — UNLESS we just entered the boss arena,
    // where it stays paused for the whole visit (roadmap §5.4). pause() is
    // idempotent and resume() shifts deadlines by the paused span, so leaving
    // the arena (this branch runs) credits back the entire boss-fight duration
    // and the run-long cadence resumes intact.
    if (!this.inBossArena) {
      this.onRoomTransitionEnd(now);
    }
    this.logger.log('level', 'roomTransition', {
      edge: t.edge,
      to: t.dest,
      enemies: this.enemies.length,
      bossArena: this.inBossArena,
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
      room: this.currentRoomCoord
        ? `${this.currentRoomCoord.col},${this.currentRoomCoord.row}`
        : undefined,
      globalWaveNum: this.globalWaveScheduler?.currentWaveNum(),
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
      stamina: round2(this.stamina.getValue()),
      staminaLow: this.stamina.isLow(),
      burstActive: this.stamina.isBurstActive(),
      burstMultiplier: round2(this.stamina.getBurstMultiplier()),
      pressedKeys,
      enemyPositions,
    };
  }

  private handleCrash(snapshot: CrashSnapshot) {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    try {
      this.logger.renderOverlay(this.ctx);
    } catch (e) {
      console.error('[Junar] failed to render crash overlay:', e, snapshot);
    }
  }

  private update(deltaTime: number, currentTime: number) {
    // Apply low-stamina speed penalty before player movement so the
    // multiplier composes against this frame's intended motion.
    this.player.setSpeedMultiplier(this.stamina.getMovementSpeedMultiplier());

    // Update player. Snapshot position pre/post so we can charge stamina
    // for distance traveled this frame. Math.hypot (not Manhattan) so the
    // corner-cut slide that produces simultaneous x+y motion isn't
    // overcharged by ~41%.
    const input = this.inputManager.getInput();
    // Update facing BEFORE the dash check so a same-frame press +
    // dash uses the freshly-set facing (dash inverts whatever facing
    // is current at the moment of activation).
    this.player.updateFacing(input);
    const prePos = this.player.getPosition();
    this.player.update(deltaTime, input, this.level, (rej) => {
      this.logger.log('wall', 'reject', {
        axis: rej.axis,
        from: round2(rej.from),
        to: round2(rej.attempted),
        cells: rej.cells,
        in: input,
      });
    });
    const postPos = this.player.getPosition();
    this.stamina.consumeMovement(
      Math.hypot(postPos.x - prePos.x, postPos.y - prePos.y),
    );

    // Dash — instant blink in the direction OPPOSITE of facing, gated by
    // stamina (0.5/use). Edge-triggered; tryConsumeDash rejects if the
    // pool can't afford the cost. AABB-vs-enemy collision still applies
    // at the post-dash position via the per-frame check below, so a dash
    // that ends inside an enemy still kills the player.
    if (this.inputManager.consumeDashPress()) {
      if (this.stamina.tryConsumeDash()) {
        const dir = dashDirectionFromFacing(this.player.getFacing());
        const preDash = this.player.getPosition();
        const traveled = this.player.dash(dir, DASH_DISTANCE_PX, this.level);
        const postDash = this.player.getPosition();
        this.logger.log('stamina', 'dash', {
          facing: this.player.getFacing(),
          dir,
          traveled: round2(traveled),
          from: { x: round2(preDash.x), y: round2(preDash.y) },
          to: { x: round2(postDash.x), y: round2(postDash.y) },
          value: round2(this.stamina.getValue()),
        });
      } else {
        this.logger.log('stamina', 'dash_rejected', {
          reason: 'no_stamina',
          value: round2(this.stamina.getValue()),
        });
      }
    }

    // Win-condition STUB (Step 9). Boss combat is deferred (roadmap §5.15);
    // until it lands, pressing V inside the boss arena ends the run as a
    // victory so the reach-the-boss loop is playable end to end. Consume the
    // edge every frame (clears a stale press made outside the arena); act only
    // while in the boss room.
    if (this.inputManager.consumeWinStubPress() && this.inBossArena) {
      this.victory();
      return;
    }

    // Room transition (LTTP hard cut). Checked once movement + dash have
    // settled the player's position. On a transition we swap rooms and skip
    // the rest of this frame so the new room simulates cleanly next tick.
    const transition = this.detectTransition(input);
    if (transition) {
      this.doTransition(currentTime, transition);
      return;
    }

    if (this.frameCount - this.lastSampleFrame >= SAMPLE_EVERY_FRAMES) {
      this.lastSampleFrame = this.frameCount;
      this.sampleTick(input, deltaTime);
    }

    // Burst activation — edge-triggered. Stamina gates on cost +
    // already-active; rejected presses don't tick the decay multiplier.
    if (this.inputManager.consumeBurstPress()) {
      this.stamina.tryActivateBurst(currentTime);
    }
    this.stamina.tick(currentTime);

    // Global wave-driven spawns. Each tick may emit zero, one, or many spawn
    // requests — group templates land row-by-row, so a single tick can release
    // multiple enemies. Spawns enter the current room from its per-opening
    // bands.
    if (this.globalWaveScheduler) {
      const requests = this.globalWaveScheduler.tick(currentTime);
      for (const req of requests) {
        const enemy = this.spawnFromRequest(req);
        this.enemies.push(enemy);
        this.logger.log('spawn', 'wave', {
          id: enemy.getId(),
          type: enemy.getType(),
          wave: this.globalWaveScheduler.currentWaveNum(),
          pos: enemy.getPosition(),
        });
      }
      if (requests.length > 0) {
        this.callbacks.onEnemiesChange(this.enemies.length);
      }
    }

    // Pick the nearest enemy with clear LOS at any angle. Drives both
    // auto-fire targeting and the on-screen LOS indicator.
    const visibleTarget = this.findNearestVisibleEnemy();
    this.hasLineOfSight = visibleTarget !== null;

    // Effective cooldown is recomputed each frame from the composed
    // multiplier (burst × low-stamina) — burst can end mid-frame and the
    // cooldown must respond on the very next check.
    const effectiveCooldown =
      ARROW_COOLDOWN_MS / this.stamina.getArrowRateMultiplier();
    if (visibleTarget && currentTime - this.lastArrowTime >= effectiveCooldown) {
      this.fireArrow(visibleTarget);
      this.lastArrowTime = currentTime;
    }

    // Update enemies. Pass the live enemy list so each can enforce
    // enemy-vs-enemy no-overlap at its movement step (Enemy.update).
    this.enemies.forEach(enemy => {
      enemy.update(deltaTime, this.player.getPosition(), this.level, this.enemies);
    });

    // Update arrows
    this.arrows = this.arrows.filter(arrow => {
      arrow.pos.x += arrow.dir.x * ARROW_SPEED * (deltaTime / 1000);
      arrow.pos.y += arrow.dir.y * ARROW_SPEED * (deltaTime / 1000);

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

    this.emitStaminaTransitions();
  }

  // Fire callbacks + log events on stamina/burst state transitions. Edge
  // detection against the was* fields keeps logs to one entry per change
  // and avoids per-frame spam in the React HUD; the value emit is
  // throttled to every 10 frames unless the low-state flips.
  private emitStaminaTransitions() {
    const isBurstActive = this.stamina.isBurstActive();
    if (isBurstActive !== this.wasBurstActive) {
      if (isBurstActive) {
        this.logger.log('stamina', 'burst_start', {
          multiplier: round2(this.stamina.getBurstMultiplier()),
          value: round2(this.stamina.getValue()),
        });
        this.callbacks.onBurstChange?.(
          true,
          this.stamina.getBurstMultiplier(),
          this.stamina.getBurstEndAt() ?? 0,
        );
      } else {
        this.logger.log('stamina', 'burst_end', {
          value: round2(this.stamina.getValue()),
        });
        this.callbacks.onBurstChange?.(false, 1, 0);
      }
      this.wasBurstActive = isBurstActive;
    }

    const isLow = this.stamina.isLow();
    const lowChanged = isLow !== this.wasLowStamina;
    if (lowChanged) {
      this.logger.log('stamina', isLow ? 'low_enter' : 'low_exit', {
        value: round2(this.stamina.getValue()),
      });
      this.wasLowStamina = isLow;
    }

    const v = this.stamina.getValue();
    if (
      lowChanged ||
      (this.frameCount % 10 === 0 && v !== this.lastEmittedStaminaValue)
    ) {
      this.callbacks.onStaminaChange?.(v, isLow);
      this.lastEmittedStaminaValue = v;
    }

    if (v <= 0 && !this.wasDepleted) {
      this.logger.log('stamina', 'depleted', { value: 0 });
      this.wasDepleted = true;
    }
  }

  // Translate a scheduler SpawnRequest into a live Enemy. The scheduler
  // already computes the off-canvas position and entry direction from the
  // chosen band/template/cell, so this is a thin Enemy-construction step.
  private spawnFromRequest(req: SpawnRequest): Enemy {
    return new Enemy(
      { ...req.position },
      req.type,
      this.nextEnemyId++,
      undefined,
      { direction: { ...req.entryDirection } },
    );
  }

  // Scan all enemies and return the nearest one within MAX_DETECTION_RANGE
  // whose center is reachable from the player center by an unobstructed
  // raycast. Single source of truth for both auto-fire targeting and the
  // on-screen LOS indicator.
  private findNearestVisibleEnemy(): Enemy | null {
    if (this.enemies.length === 0) return null;

    const playerPos = this.player.getPosition();
    const playerCenter: Vector2 = {
      x: playerPos.x + TILE_SIZE / 2,
      y: playerPos.y + TILE_SIZE / 2,
    };

    let nearest: Enemy | null = null;
    let nearestDistance = Infinity;

    for (const enemy of this.enemies) {
      const enemyPos = enemy.getPosition();
      const enemyCenter: Vector2 = {
        x: enemyPos.x + TILE_SIZE / 2,
        y: enemyPos.y + TILE_SIZE / 2,
      };

      const dx = enemyCenter.x - playerCenter.x;
      const dy = enemyCenter.y - playerCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > this.maxDetectionRange) continue;
      if (distance >= nearestDistance) continue;
      if (!this.hasDirectLineOfSight(playerCenter, enemyCenter)) continue;

      nearestDistance = distance;
      nearest = enemy;
    }

    return nearest;
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
      const gridX = Math.floor(checkX / TILE_SIZE);
      const gridY = Math.floor(checkY / TILE_SIZE);

      // Check if this point hits a wall
      if (this.level.isWall(gridX, gridY)) {
        return false; // Line of sight blocked by wall
      }
    }

    return true; // Clear line of sight
  }

  private fireArrow(target: Enemy) {
    const playerPos = this.player.getPosition();
    const playerCenterX = playerPos.x + TILE_SIZE / 2;
    const playerCenterY = playerPos.y + TILE_SIZE / 2;

    const enemyPos = target.getPosition();
    const enemyCenterX = enemyPos.x + TILE_SIZE / 2;
    const enemyCenterY = enemyPos.y + TILE_SIZE / 2;

    const dx = enemyCenterX - playerCenterX;
    const dy = enemyCenterY - playerCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return;

    const dir: Vector2 = { x: dx / distance, y: dy / distance };

    this.arrows.push({
      pos: { x: playerCenterX, y: playerCenterY },
      dir,
      id: this.nextArrowId++,
    });
    this.stamina.consumeArrow();

    this.logger.log('fire', 'arrow', { dx: round2(dir.x), dy: round2(dir.y) });
    this.soundManager.play('arrow');
  }

  private checkCollisions() {
    const playerPos = this.player.getPosition();
    const playerCenterX = playerPos.x + TILE_SIZE / 2;
    const playerCenterY = playerPos.y + TILE_SIZE / 2;

    // Pass 1: AABB-overlap kill. Contact-only enemies on top of the player
    // end the run immediately; return on hit so we don't double-report.
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

    // Check arrow-enemy collisions
    this.arrows = this.arrows.filter(arrow => {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const enemy = this.enemies[i];
        if (this.collisionManager.checkCollision(
          { x: arrow.pos.x, y: arrow.pos.y, width: 4, height: 4 },
          { x: enemy.getPosition().x, y: enemy.getPosition().y, width: TILE_SIZE, height: TILE_SIZE }
        )) {
          const enemyType = enemy.getType();
          this.enemies.splice(i, 1);
          this.score += 10;
          this.callbacks.onScoreChange(this.score);
          this.callbacks.onEnemiesChange(this.enemies.length);
          this.logger.log('hit', 'arrow->enemy', {
            type: enemyType,
            remaining: this.enemies.length,
          });
          this.soundManager.play('hit');
          return false; // Remove arrow
        }
      }
      return true; // Keep arrow
    });
  }

  private gameOver(reason: GameOverReason = { kind: 'manual' }) {
    if (this.gameState === 'gameOver') return;
    this.gameState = 'gameOver';
    this.callbacks.onStateChange('gameOver');
    this.soundManager.play('gameOver');

    const verdict = this.classifyGameOver(reason);
    this.logger.log('state', 'gameOver', {
      room: this.currentRoomCoord,
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

  // Win the run. Step 9 reintroduces this (dormant since Step 3 removed the
  // per-level clear flow): today it fires only from the boss-room V win-stub,
  // and later from real boss-defeat logic. Like gameOver it just freezes the
  // sim into a terminal state — the gameLoop stops calling update() once the
  // state leaves 'playing'.
  private victory() {
    if (this.gameState === 'victory') return;
    this.gameState = 'victory';
    this.callbacks.onStateChange('victory');
    this.logger.log('state', 'victory', {
      room: { ...this.currentRoomCoord },
      score: this.score,
    });
    this.soundManager.play('victory');
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

  private render() {
    // Clear canvas with dark green background. The full-canvas clear each
    // frame is what makes a room transition a hard cut — the new room paints
    // straight over the old with no fade.
    this.ctx.fillStyle = '#1a4a3a';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Render the current room only (one canvas, one room).
    if (this.level && this.player) {
      this.renderer.renderLevel(this.level);
      this.renderer.renderHuts(this.level.getHutPositions());
      this.renderer.renderNpcs(this.level.getNpcPositions());
      this.renderer.renderPlayer(this.player, this.stamina.isBurstActive(), this.lastTime);

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

  // Bridge for on-screen mobile controls. Touch handlers in App.tsx call
  // this on pointer down/up to drive movement without keyboard events.
  setVirtualInput(direction: Direction, pressed: boolean) {
    this.inputManager.setVirtualInput(direction, pressed);
  }

  // Bridge for the on-screen mobile B button. Equivalent to a Space
  // keydown — sets the edge-triggered burst flag in InputManager.
  triggerBurst() {
    this.inputManager.setBurstPressed();
  }

  // Bridge for the on-screen mobile A button. Equivalent to a Shift or
  // KeyA keydown — sets the edge-triggered dash flag in InputManager.
  triggerDash() {
    this.inputManager.setDashPressed();
  }

  cleanup() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.inputManager.dispose();
    this.logger.log('lifecycle', 'cleanup');
    this.logger.dispose();
  }
}
