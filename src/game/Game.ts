import { Player } from './Player';
import { Enemy } from './Enemy';
import { Level } from './Level';
import { InputManager, Direction } from './InputManager';
import { Renderer } from './Renderer';
import { SoundManager } from './SoundManager';
import { CollisionManager } from './CollisionManager';
import { CrashLogger, CrashSnapshot } from './Logger';
import { GlobalWaveScheduler, SpawnRequest } from './WaveScheduler';
import { Hunt } from './Hunt';
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
  StaticCandidateKind,
} from './types';
import { WAVE_POOL_EARLY, WAVE_POOL_MID, WAVE_POOL_LATE } from './levels';
import {
  generateRunMap,
  roomAt,
  openingsOnEdge,
  oppositeEdge,
  roomsConnect,
  rangesOverlap,
  findPath,
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
  CENTER_SPAWN,
  EXIT_APPROACH_RANGE_PX,
  EXIT_DEPART_GRACE_MS,
  STATIC_BASE_DENSITY,
  BOSS_HALO_RADIUS,
  WAVE_PER_C_INCREMENT,
  STATIC_SMALL_SNAKE_WEIGHT,
  ENTRY_BAND_GRACE_MIN_MS,
  ENTRY_BAND_GRACE_MAX_MS,
  BOSS_GROWTH_CENTER,
  BOSS_GROWTH_TRIGGER_PX,
  PLAYER_HURTBOX_PX,
  ARRIVAL_KILL_GRACE_MS,
  ARRIVAL_GRACE_REARM_MS,
  HUNTER_ARRIVAL_GRACE_MS,
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

// Room-grid step directions (edge + grid delta), used by the de-aggro
// settlement BFS to walk outward through connected rooms. Mirrors RoomGrid's
// internal DIRS, kept local because that one isn't exported.
const ROOM_DIRS: ReadonlyArray<readonly [Edge, number, number]> = [
  ['N', 0, -1],
  ['S', 0, 1],
  ['W', -1, 0],
  ['E', 1, 0],
];

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private player!: Player;
  // Enemies in the CURRENT room (all 'active'). Other rooms' enemies are parked
  // in roomEnemies — 'dormant'/'activating' sitters wait, and 'hunting' enemies
  // are walked across rooms toward the player each frame (Step 4, updateHunters).
  // No despawn: an enemy only leaves the world by being killed (roadmap §5.13).
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
  // Total enemies killed this run. Distinct from onEnemiesChange's live in-room
  // count: this is a monotonic run tally (HUD "Killed"), reset only on a new run
  // (startRun), mirroring score. Surfaced via onKillsChange.
  private enemiesKilled = 0;
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
  // movement, auto-fire, contact-death and cross-room hunters (Step 4) all keep
  // running; only the wave timer is held paused (roadmap §5.4, §5.15). Drives
  // the "Reached Boss" overlay and gates the V win-stub.
  private inBossArena = false;
  // Hunt 4-state machine (Step 4, roadmap §5.12). Stateless across runs (the
  // activation clock lives on each Enemy; it owns no listeners/timers), so it's
  // built once and needs no disposal or per-run reset.
  private hunt = new Hunt();
  // Lazily-built Level wrappers for parked rooms, so hunting enemies in other
  // rooms get wall collision without rebuilding a Level every frame. Keyed by
  // roomKey; cleared whenever the map regenerates.
  private roomLevels = new Map<number, Level>();
  // Room keys whose per-run statics have already been rolled (§5.10). First
  // entry rolls + locks them; revisits never re-roll (§5.13). Reset each run.
  private enteredRooms = new Set<number>();
  // Player-side doorway kill grace (owner-approved 2026-06-10): gameLoop-
  // currentTime deadline before which the contact-kill pass is held, stamped
  // by doTransition on room entry. NOT general i-frames — auto-fire,
  // movement, and arrow hits keep running; see ARRIVAL_KILL_GRACE_MS.
  // arrivalGraceArmedAt records when the window was last granted: a new one
  // is armed only after ARRIVAL_GRACE_REARM_MS, so doorway ping-pong can't
  // chain windows into sustained immunity (0 = never armed this run).
  private arrivalKillGraceUntil = 0;
  private arrivalGraceArmedAt = 0;

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

    // Replace Hunt's settle-in-place stub with the map-wide BFS placement
    // (Steps 5+6, §5.13). Registered once; Hunt holds the reference for the
    // life of the Game instance (no per-run reset — Hunt is stateless across runs).
    this.hunt.registerSettlementCallback((enemy) => this.settleDeaggroedHunter(enemy));

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
    this.roomLevels.clear(); // parked-room Levels belong to the old map
    this.level = this.levelFromRoom(this.currentRoomDef());
    this.player = new Player({ ...CENTER_SPAWN });
  }

  private startRun() {
    this.gameState = 'playing';
    this.score = 0;
    this.enemiesKilled = 0;
    this.nextEnemyId = 0;
    this.arrows = [];
    this.lastArrowTime = 0;
    this.roomEnemies = new Map();
    this.enteredRooms = new Set();
    this.enemies = [];
    this.hasLineOfSight = false;
    // Drop any doorway kill grace left over from the previous run (e.g. dying
    // right after a transition, then restarting within the window).
    this.arrivalKillGraceUntil = 0;
    this.arrivalGraceArmedAt = 0;
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
    this.callbacks.onKillsChange(this.enemiesKilled);
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
        earlyPool: WAVE_POOL_EARLY,
        midPool: WAVE_POOL_MID,
        latePool: WAVE_POOL_LATE,
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

  // Push the player off any enemy occupying their landing position. Steps inward
  // along the entry axis (away from the edge they arrived at) to the first tile
  // that clears every enemy and isn't a wall; bails (keeps the original landing)
  // if none is found within the room — vanishingly unlikely.
  // Overlap is tested with the exact AABB kill rule checkCollisions uses
  // (enemyTouchesPlayer), so a cleared tile is genuinely non-lethal this frame.
  // The post-transition ARRIVAL_KILL_GRACE_MS window overlaps this, but the
  // nudge still matters: it moves the player OUT of a lethal overlap instead of
  // letting the grace lapse with them still inside an enemy's box.
  private clearLandingZone(entryPos: Vector2): void {
    if (this.enemies.length === 0) return;
    const overlapsEnemy = (p: Vector2): boolean => {
      for (const e of this.enemies) {
        if (this.enemyTouchesPlayer(e, p)) return true;
      }
      return false;
    };
    if (!overlapsEnemy(entryPos)) return;

    // Inward normal from the edge the player landed flush against (mirrors
    // bandsForRoom's entryDirection). No flush edge (e.g. CENTER_SPAWN) → no
    // inward axis to walk, so leave the player put.
    let dx = 0;
    let dy = 0;
    if (entryPos.x <= 0) dx = 1;
    else if (entryPos.x >= CANVAS_WIDTH - PLAYER_SIZE) dx = -1;
    else if (entryPos.y <= 0) dy = 1;
    else if (entryPos.y >= CANVAS_HEIGHT - PLAYER_SIZE) dy = -1;
    if (dx === 0 && dy === 0) return;

    const col0 = Math.floor((entryPos.x + TILE_SIZE / 2) / TILE_SIZE);
    const row0 = Math.floor((entryPos.y + TILE_SIZE / 2) / TILE_SIZE);
    for (let step = 1; step < GRID_WIDTH; step++) {
      const col = col0 + dx * step;
      const row = row0 + dy * step;
      if (col < 0 || row < 0 || col >= GRID_WIDTH || row >= GRID_HEIGHT) break;
      if (this.level.isWall(col, row)) break;
      const candidate = { x: col * TILE_SIZE, y: row * TILE_SIZE };
      if (!overlapsEnemy(candidate)) {
        this.player.setPosition(candidate);
        this.logger.log('level', 'landingNudge', {
          from: { x: round2(entryPos.x), y: round2(entryPos.y) },
          to: candidate,
        });
        return;
      }
    }
    // Nothing clear inward — leave the player at the doorway (unchanged).
  }

  // Switch the active room. Loads the room's level, wave bands and parked
  // enemies, drops the player at `entryPos`, and emits HUD signals. Used at run
  // start (entryPos = CENTER_SPAWN) and on every transition.
  private enterRoom(coord: RoomGridCoord, entryPos: Vector2) {
    this.currentRoomCoord = { ...coord };
    const def = this.currentRoomDef();
    this.level = this.levelFromRoom(def);
    this.player.setPosition(entryPos);

    // First entry rolls this room's per-run statics from the template
    // candidates (§5.10) and buckets them as dormant sitters; locked thereafter
    // (no re-roll on revisit, §5.13). The doTransition caller then runs
    // Hunt.onPlayerEnteredRoom, which starts each sitter's 1 s aggro delay and
    // flips any parked hunter back to active.
    // Anchors (incl. the boss arena) carry no candidates, so this is a no-op there.
    const key = this.roomKey(coord);
    if (!this.enteredRooms.has(key)) {
      this.enteredRooms.add(key);
      const statics = this.rollRoomStatics(coord, def);
      // MERGE into any bucket already parked here — never replace it. A cross-
      // room hunter (settleHunterIntoRoom) or a de-aggroed settler
      // (rebucketSettledEnemy) can occupy a room BEFORE the player first enters
      // it, and neither path touches enteredRooms; overwriting the bucket would
      // silently despawn that enemy (violates §5.13, no-despawn).
      if (statics.length > 0) {
        const bucket = this.roomEnemies.get(key);
        if (bucket) bucket.push(...statics);
        else this.roomEnemies.set(key, statics);
      }
    }
    this.enemies = this.roomEnemies.get(key) ?? [];
    // Landing safety: if the player materializes on top of an enemy already
    // parked at the entry opening (a dormant static rolled onto the doorway, or
    // a hunter parked there), nudge the PLAYER one tile inward to the first
    // clear floor tile. Covers the "walked in and instantly touched a sitter"
    // death that the entry-band grace (fresh spawns only) can't. No enemy is
    // moved/despawned and no i-frames are granted, so the contact-death
    // contract is untouched. No-op at run start (empty room) and clear doorways.
    this.clearLandingZone(entryPos);
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

  // Select the edge the player is pressing outward toward while within `margin`
  // px of it, plus the opening on that edge their centre tile sits inside and
  // that opening's band index. bandsForRoom emits one band per opening in
  // def.openings order, so an opening's index in def.openings IS its band index.
  // Shared by detectTransition (margin = EDGE_EPS_PX — pinned to the boundary)
  // and applyExitBandGrace (margin = EXIT_APPROACH_RANGE_PX — still approaching).
  // Returns null unless the player is pressing into a near edge inside one of its
  // openings; matching on edge AND the centre-tile range resolves the correct
  // opening (and band) when an edge carries several.
  private approachedOpening(
    input: InputState,
    margin: number,
  ): { edge: Edge; opening: RoomOpening; bandIndex: number } | null {
    const pos = this.player.getPosition();
    const maxX = CANVAS_WIDTH - PLAYER_SIZE;
    const maxY = CANVAS_HEIGHT - PLAYER_SIZE;

    let edge: Edge | null = null;
    if (input.right && pos.x >= maxX - margin) edge = 'E';
    else if (input.left && pos.x <= margin) edge = 'W';
    else if (input.up && pos.y <= margin) edge = 'N';
    else if (input.down && pos.y >= maxY - margin) edge = 'S';
    if (!edge) return null;

    const def = this.currentRoomDef();
    // The player must be standing in an opening on that edge (use their centre
    // tile along the edge axis).
    const centerCol = Math.floor((pos.x + PLAYER_SIZE / 2) / TILE_SIZE);
    const centerRow = Math.floor((pos.y + PLAYER_SIZE / 2) / TILE_SIZE);
    const along = edge === 'E' || edge === 'W' ? centerRow : centerCol;
    const bandIndex = def.openings.findIndex(
      (o) => o.edge === edge && along >= o.rangeStart && along <= o.rangeEnd,
    );
    if (bandIndex < 0) return null;
    return { edge, opening: def.openings[bandIndex], bandIndex };
  }

  // If the player is pressing outward while pinned to a room edge inside an
  // opening that connects to a neighbor, return the transition to take.
  private detectTransition(
    input: InputState,
  ): { edge: Edge; dest: RoomGridCoord; entry: Vector2 } | null {
    const found = this.approachedOpening(input, EDGE_EPS_PX);
    if (!found) return null;
    const { edge, opening } = found;
    const pos = this.player.getPosition();
    const def = this.currentRoomDef();

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

  // Departure-side spawn grace — the counterpart to an arrival-side entry-band
  // grace (the sibling room-entry change wires that into doTransition; it is not
  // present on this branch). When the player is approaching an exit (within
  // EXIT_APPROACH_RANGE_PX of an edge opening AND pressing outward toward it),
  // hold that ONE opening's spawn band for a short rolling EXIT_DEPART_GRACE_MS
  // so a wave can't drip into the doorway in their face as they leave. It's a
  // delay, never a cancel: the wave budget is untouched and it still arrives via
  // the room's other openings, so camping an exit gains nothing. Re-applied every
  // frame the player keeps approaching — delayBands clamps with Math.max so it
  // never accumulates, and it lapses once they stop. No-op in the boss arena,
  // where spawns are already frozen for the whole visit.
  private applyExitBandGrace(input: InputState, now: number): void {
    if (this.inBossArena) return;
    const found = this.approachedOpening(input, EXIT_APPROACH_RANGE_PX);
    if (!found) return;
    this.globalWaveScheduler?.delayBands([found.bandIndex], now + EXIT_DEPART_GRACE_MS);
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
    // The player is leaving: active enemies in this room become cross-room
    // hunters (Step 4). Then park them (no despawn — they keep their position
    // and now chase across rooms via updateHunters).
    this.hunt.onPlayerLeftRoom(this.enemies);
    this.roomEnemies.set(this.roomKey(this.currentRoomCoord), this.enemies);
    this.enterRoom(t.dest, t.entry); // sets inBossArena for the destination
    // Player-side doorway kill grace (owner-approved 2026-06-10): hold the
    // contact-kill pass briefly after the hard cut. The landing nudge in
    // enterRoom only clears an exact same-tick overlap — a fast chaser parked
    // just inside the door could otherwise kill ~2-3 frames after the cut,
    // an effectively invisible death. Applies in the boss arena too (contact
    // death is live there). Re-arm gated: the hard cut lands the player flush
    // on the destination edge still inside the opening, so the return
    // transition re-fires within a frame — an unconditional stamp would let
    // doorway ping-pong chain windows into sustained contact-kill immunity
    // (input-renewable i-frames). Grant a fresh window only when the last one
    // was armed ≥ ARRIVAL_GRACE_REARM_MS ago; an immediate hop back through
    // the same door goes ungraced, where the threats were already on screen.
    if (
      this.arrivalGraceArmedAt === 0 ||
      now - this.arrivalGraceArmedAt >= ARRIVAL_GRACE_REARM_MS
    ) {
      this.arrivalKillGraceUntil = now + ARRIVAL_KILL_GRACE_MS;
      this.arrivalGraceArmedAt = now;
    }
    // Entering the destination: hunters that already reached it rejoin the
    // in-room pursuit (active), and dormant sitters begin their aggro delay
    // (Step 4). For the boss room this.enemies is empty, so it's a no-op there.
    this.hunt.onPlayerEnteredRoom(this.enemies, now);
    // Resume the wave timer on arrival — UNLESS we just entered the boss arena,
    // where it stays paused for the whole visit (roadmap §5.4). pause() is
    // idempotent and resume() shifts deadlines by the paused span, so leaving
    // the arena (this branch runs) credits back the entire boss-fight duration
    // and the run-long cadence resumes intact.
    if (!this.inBossArena) {
      this.onRoomTransitionEnd(now);
      // Spawn grace for the opening the player just walked through. The wave
      // timer resumes on the same frame as the hard cut, so without this a wave
      // could drip into the entry band right on top of the arriving player
      // (unfair death). Hold only the entry-edge band(s) for a fresh 3-5 s roll
      // each transition; the room's other openings stay live. Skipped for the
      // boss arena, where spawns are already frozen for the whole visit.
      const entryEdge = oppositeEdge(t.edge);
      const entryBandIndices: number[] = [];
      this.currentRoomDef().openings.forEach((o, i) => {
        if (o.edge === entryEdge) entryBandIndices.push(i);
      });
      if (entryBandIndices.length > 0) {
        const graceMs =
          ENTRY_BAND_GRACE_MIN_MS +
          Math.random() * (ENTRY_BAND_GRACE_MAX_MS - ENTRY_BAND_GRACE_MIN_MS);
        this.globalWaveScheduler?.delayBands(entryBandIndices, now + graceMs);
      }
    }
    this.logger.log('level', 'roomTransition', {
      edge: t.edge,
      to: t.dest,
      enemies: this.enemies.length,
      bossArena: this.inBossArena,
    });
  }

  // ── Hunt: cross-room hunters (Step 4, roadmap §5.12) ──────────────────────

  // All enemies the Hunt machine should evaluate this frame: the current
  // room's (for activating→active) plus every parked room's (for hunting
  // de-aggro). The current room key is excluded from the parked sweep because
  // a revisited room's bucket is the very same array as this.enemies
  // (enterRoom aliases it), which would otherwise double-count those enemies.
  private managedEnemies(): Enemy[] {
    const out: Enemy[] = [...this.enemies];
    const curKey = this.roomKey(this.currentRoomCoord);
    for (const [key, list] of this.roomEnemies) {
      if (key === curKey) continue;
      for (const enemy of list) out.push(enemy);
    }
    return out;
  }

  // Inverse of roomKey: decode a room bucket key back to its grid coordinate.
  private roomFromKey(key: number): RoomGridCoord {
    return { col: key % this.runMap.cols, row: Math.floor(key / this.runMap.cols) };
  }

  // Lazily build + cache a Level for a parked room so hunters crossing it get
  // wall collision without rebuilding a Level every frame. Cleared on map
  // regeneration (regenerateMap).
  private levelForRoomKey(key: number): Level {
    let level = this.roomLevels.get(key);
    if (!level) {
      level = this.levelFromRoom(roomAt(this.runMap, this.roomFromKey(key)));
      this.roomLevels.set(key, level);
    }
    return level;
  }

  // Walk every parked 'hunting' enemy toward the player through room openings,
  // crossing room boundaries as they reach doors. The current room is skipped
  // (its enemies are 'active', updated by the main loop). At most one room
  // crossing per enemy per frame — far less than an enemy traverses a room in.
  private updateHunters(deltaTime: number, now: number) {
    const curKey = this.roomKey(this.currentRoomCoord);
    const crossings: Array<{
      enemy: Enemy;
      fromKey: number;
      dest: RoomGridCoord;
      edge: Edge;
      opening: RoomOpening;
    }> = [];
    // The player's room is fixed for this frame, so every hunter in a given
    // room routes the same way. Memoize findPath by hunter-room key so a packed
    // room costs one BFS, not one per enemy (the result is shared, read-only).
    const pathCache = new Map<number, RoomGridCoord[] | null>();

    for (const [key, list] of this.roomEnemies) {
      if (key === curKey) continue;
      const room = this.roomFromKey(key);
      const level = this.levelForRoomKey(key);
      for (const enemy of list) {
        if (enemy.getHuntState() !== 'hunting') continue;
        const step = this.hunterDoorStep(room, key, this.currentRoomCoord, enemy, pathCache);
        if (!step) continue; // no route this frame — hold
        enemy.update(deltaTime, step.doorTarget, level, list);
        if (this.hunterAtDoor(enemy, step.edge, step.opening)) {
          crossings.push({
            enemy,
            fromKey: key,
            dest: step.dest,
            edge: step.edge,
            opening: step.opening,
          });
        }
      }
    }

    // Apply crossings after the read pass so we never splice a room's list (or
    // add a Map key) while iterating the Map.
    let enteredCurrent = false;
    for (const c of crossings) {
      const src = this.roomEnemies.get(c.fromKey);
      if (src) {
        const i = src.indexOf(c.enemy);
        if (i >= 0) src.splice(i, 1);
      }
      if (this.settleHunterIntoRoom(c.enemy, c.dest, c.edge, c.opening, now)) {
        enteredCurrent = true;
      }
    }
    if (enteredCurrent) this.callbacks.onEnemiesChange(this.enemies.length);
  }

  // Pick the next room a hunter should step toward and the door (opening +
  // target cell) to walk to. Uses the room-grid BFS (findPath) so a hunter
  // never stalls in a dead-end — it routes toward the player through connected
  // openings. Returns null only if the player's room is unreachable, in which
  // case the hunter holds this frame.
  private hunterDoorStep(
    hunterRoom: RoomGridCoord,
    hunterRoomKey: number,
    playerRoom: RoomGridCoord,
    enemy: Enemy,
    pathCache: Map<number, RoomGridCoord[] | null>,
  ): { edge: Edge; dest: RoomGridCoord; opening: RoomOpening; doorTarget: Vector2 } | null {
    // One BFS per hunter-room per frame (playerRoom is fixed across the frame),
    // shared by every hunter in that room via the caller's pathCache.
    let path = pathCache.get(hunterRoomKey);
    if (path === undefined) {
      path = findPath(this.runMap.cells, hunterRoom, playerRoom);
      pathCache.set(hunterRoomKey, path);
    }
    if (!path || path.length < 2) return null;
    const next = path[1];
    const dc = next.col - hunterRoom.col;
    const dr = next.row - hunterRoom.row;
    const edge: Edge = dc === 1 ? 'E' : dc === -1 ? 'W' : dr === 1 ? 'S' : 'N';

    const def = roomAt(this.runMap, hunterRoom);
    const destDef = roomAt(this.runMap, next);
    const destOpenings = openingsOnEdge(destDef, oppositeEdge(edge));
    // Openings on `edge` that actually connect to the next room (overlap a
    // dest opening). findPath guarantees at least one — the rooms connect.
    const passable = openingsOnEdge(def, edge).filter((o) =>
      destOpenings.some((d) =>
        rangesOverlap(o.rangeStart, o.rangeEnd, d.rangeStart, d.rangeEnd),
      ),
    );
    if (passable.length === 0) return null;

    // Aim for the connecting opening nearest the hunter's position along the
    // edge axis, so it doesn't cross the room to a far door when a near one works.
    const pos = enemy.getPosition();
    const along =
      edge === 'E' || edge === 'W'
        ? (pos.y + TILE_SIZE / 2) / TILE_SIZE
        : (pos.x + TILE_SIZE / 2) / TILE_SIZE;
    let opening = passable[0];
    let bestDist = Infinity;
    for (const o of passable) {
      const center = (o.rangeStart + o.rangeEnd) / 2;
      const d = Math.abs(center - along);
      if (d < bestDist) {
        bestDist = d;
        opening = o;
      }
    }

    return { edge, dest: next, opening, doorTarget: this.doorTargetCell(edge, opening) };
  }

  // The cell top-left a hunter walks to in order to exit through `opening`: the
  // edge cell at the opening's mid-tile.
  private doorTargetCell(edge: Edge, opening: RoomOpening): Vector2 {
    const mid = Math.floor((opening.rangeStart + opening.rangeEnd) / 2);
    switch (edge) {
      case 'N':
        return { x: mid * TILE_SIZE, y: 0 };
      case 'S':
        return { x: mid * TILE_SIZE, y: (GRID_HEIGHT - 1) * TILE_SIZE };
      case 'W':
        return { x: 0, y: mid * TILE_SIZE };
      case 'E':
        return { x: (GRID_WIDTH - 1) * TILE_SIZE, y: mid * TILE_SIZE };
      default: {
        const exhaustive: never = edge;
        throw new Error(`doorTargetCell: unhandled edge ${String(exhaustive)}`);
      }
    }
  }

  // True once the hunter has reached the edge cell of `opening` it's heading
  // for — ready to cross into the next room.
  private hunterAtDoor(enemy: Enemy, edge: Edge, opening: RoomOpening): boolean {
    const pos = enemy.getPosition();
    const col = Math.floor((pos.x + TILE_SIZE / 2) / TILE_SIZE);
    const row = Math.floor((pos.y + TILE_SIZE / 2) / TILE_SIZE);
    const inSpan = (v: number) => v >= opening.rangeStart && v <= opening.rangeEnd;
    switch (edge) {
      case 'N':
        return row <= 0 && inSpan(col);
      case 'S':
        return row >= GRID_HEIGHT - 1 && inSpan(col);
      case 'W':
        return col <= 0 && inSpan(row);
      case 'E':
        return col >= GRID_WIDTH - 1 && inSpan(row);
      default: {
        const exhaustive: never = edge;
        throw new Error(`hunterAtDoor: unhandled edge ${String(exhaustive)}`);
      }
    }
  }

  // Move a hunter that reached a door into the next room: drop it at the
  // destination's matching opening, update its room, and re-bucket it. Returns
  // true if it landed in the player's current room (rejoining live pursuit as
  // 'active'); otherwise it stays a parked hunter.
  private settleHunterIntoRoom(
    enemy: Enemy,
    dest: RoomGridCoord,
    exitEdge: Edge,
    srcOpening: RoomOpening,
    now: number,
  ): boolean {
    const destDef = roomAt(this.runMap, dest);
    enemy.setPosition(
      this.hunterEntryPosition(exitEdge, srcOpening, destDef, enemy.getPosition()),
    );
    enemy.setCurrentRoom(dest);
    // Just teleported across a room border: drop the stale cached door target
    // so the hunter re-targets toward the player in the new room next frame.
    enemy.resetPathfinding();
    const destKey = this.roomKey(dest);
    if (destKey === this.roomKey(this.currentRoomCoord)) {
      enemy.setHuntState('active');
      // The hunter materializes at the entry opening mid-tick (parked-room
      // enemies are never drawn) and checkCollisions runs later this same
      // tick — without a grace it could contact-kill a player loitering in
      // that doorway with zero rendered frames of it first. Stamp the
      // doorway-arrival kill grace (checkCollisions skips it; the renderer
      // flashes it) so the player gets a readable beat to react.
      // Owner-approved 2026-06-10; resolves the former KNOWN EDGE here.
      enemy.setArrivalGraceUntil(now + HUNTER_ARRIVAL_GRACE_MS);
      this.enemies.push(enemy);
      return true;
    }
    const list = this.roomEnemies.get(destKey);
    if (list) list.push(enemy);
    else this.roomEnemies.set(destKey, [enemy]);
    return false;
  }

  // Enemy analogue of entryPosition: place a crossing hunter just inside the
  // destination's opposite edge, aligned to the matching opening so it lands on
  // floor. PLAYER_SIZE === TILE_SIZE, so this mirrors the player's transition
  // landing math with the enemy's 32 px cell.
  private hunterEntryPosition(
    exitEdge: Edge,
    srcOpening: RoomOpening,
    destDef: RoomDef,
    pos: Vector2,
  ): Vector2 {
    const destOpenings = openingsOnEdge(destDef, oppositeEdge(exitEdge));
    const match =
      destOpenings.find((o) =>
        rangesOverlap(o.rangeStart, o.rangeEnd, srcOpening.rangeStart, srcOpening.rangeEnd),
      ) ?? destOpenings[0];
    if (!match) return { ...CENTER_SPAWN };

    const lo = match.rangeStart * TILE_SIZE;
    const hi = (match.rangeEnd + 1) * TILE_SIZE - TILE_SIZE;
    if (exitEdge === 'E' || exitEdge === 'W') {
      return {
        x: exitEdge === 'E' ? 0 : CANVAS_WIDTH - TILE_SIZE,
        y: Math.max(lo, Math.min(pos.y, hi)),
      };
    }
    return {
      x: Math.max(lo, Math.min(pos.x, hi)),
      y: exitEdge === 'S' ? 0 : CANVAS_HEIGHT - TILE_SIZE,
    };
  }

  // ── Static spawning + de-aggro settlement (Steps 5+6, roadmap §5.9–5.13) ──

  // Roll a connector room's per-run statics on first entry (§5.10). Picks
  // `actual` candidate tiles uniformly at random and rolls a type for each,
  // returning dormant Enemies stamped with this room. Empty when the room has
  // no candidates (anchors, including the boss arena — which never gains
  // statics, since the boss is the whole encounter).
  private rollRoomStatics(coord: RoomGridCoord, def: RoomDef): Enemy[] {
    const candidates = def.candidates;
    if (candidates.length === 0) return [];

    // B+C density (§5.10). bossDist drives the proximity halo (B); the global
    // wave number drives the run-progress ramp (C). STATIC_BASE_DENSITY carries
    // the §5.10 base-vs-cap reconciliation (candidate_count is the per-room cap).
    const bossDist =
      Math.abs(coord.col - this.runMap.bossCoord.col) +
      Math.abs(coord.row - this.runMap.bossCoord.row);
    const waveNum = this.globalWaveScheduler?.currentWaveNum() ?? 0;
    const bMod = Math.max(0, BOSS_HALO_RADIUS - bossDist);
    const cMod = Math.floor(waveNum / WAVE_PER_C_INCREMENT);
    const target = STATIC_BASE_DENSITY + bMod + cMod;
    const actual = Math.min(target, candidates.length);

    // Uniform random pick of `actual` candidates: a partial Fisher–Yates over a
    // shallow copy, then take the first `actual`. Math.random is spawn-placement
    // randomness, not simulation timing, so Invariant 8 (no Date.now in the sim)
    // doesn't apply — same rationale as Enemy.jitter's shuffle.
    const pool = candidates.slice();
    for (let i = 0; i < actual; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const statics: Enemy[] = [];
    for (let i = 0; i < actual; i++) {
      const cand = pool[i];
      const enemy = new Enemy(
        { ...cand.tile },
        this.rollStaticType(cand.kind),
        this.nextEnemyId++,
      );
      enemy.setHuntState('dormant');
      enemy.setCurrentRoom(coord);
      statics.push(enemy);
    }

    this.logger.log('spawn', 'statics', {
      room: { ...coord },
      bossDist,
      waveNum,
      candidates: candidates.length,
      rolled: actual,
    });
    return statics;
  }

  // Roll a static's type from its candidate kind (§5.9). 's' (small) favours
  // snakes over gibbons 80/20; 'S' (any 1-tile type) is snake/gibbon/panther
  // uniform. Bears (34 px) are never placed statically — they exceed a tile and
  // come only from waves.
  private rollStaticType(kind: StaticCandidateKind): EnemyType {
    if (kind === 'small') {
      return Math.random() < STATIC_SMALL_SNAKE_WEIGHT ? 'snake' : 'gibbon';
    }
    const roll = Math.floor(Math.random() * 3);
    return roll === 0 ? 'snake' : roll === 1 ? 'gibbon' : 'panther';
  }

  // Settlement resolver for a de-aggroing hunter (registered with Hunt,
  // replacing its settle-in-place stub). Per §5.13: take the nearest
  // AABB-compatible open tile in the hunter's current room; if none fits there,
  // BFS outward through connected rooms (the same overlap adjacency the player's
  // transitions use) and accept the first room with a fit. Re-buckets the enemy
  // + syncs its currentRoom when it lands in a different room — Hunt only writes
  // the returned position and flips the state to dormant afterward. No despawn:
  // if nothing fits anywhere reachable it holds in place (§5.13).
  private settleDeaggroedHunter(enemy: Enemy): Vector2 {
    const startRoom = enemy.getCurrentRoom();
    const startKey = this.roomKey(startRoom);
    const curKey = this.roomKey(this.currentRoomCoord);

    const seen = new Set<number>([startKey]);
    const queue: RoomGridCoord[] = [{ ...startRoom }];
    let head = 0;
    while (head < queue.length) {
      const room = queue[head++];
      const key = this.roomKey(room);
      // Never settle into the room the player currently occupies. That room is
      // "live" — its enemies are active and aliased by this.enemies, not parked
      // in roomEnemies — so dropping a de-aggroed (dormant) hunter there would
      // both strand a frozen, never-waking sitter in the player's lap and desync
      // the obstacle list findFreeTileInRoom reads. The hunter de-aggroed because
      // it is far from the player (startRoom is Manhattan > HUNT_RANGE away), so
      // it rests away from them; we still traverse THROUGH the current room to
      // reach rooms beyond it. (Only reachable under impossible full saturation.)
      if (key !== curKey) {
        const spot = this.findFreeTileInRoom(enemy, key);
        if (spot) {
          if (key !== startKey) this.rebucketSettledEnemy(enemy, startKey, key, room);
          // Just teleported: drop the stale pursuit target so it re-paths cleanly
          // if it ever re-aggros.
          enemy.resetPathfinding();
          return spot;
        }
      }
      const def = roomAt(this.runMap, room);
      for (const [edge, dc, dr] of ROOM_DIRS) {
        const nc = room.col + dc;
        const nr = room.row + dr;
        if (nc < 0 || nr < 0 || nc >= this.runMap.cols || nr >= this.runMap.rows) {
          continue;
        }
        const next: RoomGridCoord = { col: nc, row: nr };
        const nk = this.roomKey(next);
        if (seen.has(nk)) continue;
        if (!roomsConnect(def, edge, roomAt(this.runMap, next))) continue;
        seen.add(nk);
        queue.push(next);
      }
    }

    // Unreachable in practice (a room holds ~200 floor tiles and a snake is
    // 4 px), but never despawn (§5.13): leave the hunter exactly where it is.
    return enemy.getPosition();
  }

  // Nearest open tile (cell top-left) in the room keyed by `key` whose centred
  // AABB fits `enemy` clear of walls and of that room's other enemies
  // (snake-snake exempt), ranked by squared pixel distance from the enemy's
  // current position. null if the room offers no fit. The enemy may itself be
  // parked in this room's bucket — canSettleAt's overlap test skips self by
  // identity, so it never blocks itself.
  // Precondition: `key` is never the player's CURRENT room (settleDeaggroedHunter
  // skips it). That matters because a statics-free current room isn't bucketed in
  // roomEnemies — its live enemies are aliased by this.enemies (see managedEnemies)
  // — so roomEnemies.get(key) is the authoritative obstacle list only for the
  // parked / unvisited rooms this is actually called on.
  private findFreeTileInRoom(enemy: Enemy, key: number): Vector2 | null {
    const level = this.levelForRoomKey(key);
    const others = this.roomEnemies.get(key) ?? [];
    const from = enemy.getPosition();

    let best: Vector2 | null = null;
    let bestDist = Infinity;
    for (let row = 0; row < GRID_HEIGHT; row++) {
      for (let col = 0; col < GRID_WIDTH; col++) {
        if (level.isWall(col, row)) continue;
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        const d = (x - from.x) ** 2 + (y - from.y) ** 2;
        if (d >= bestDist) continue;
        if (!enemy.canSettleAt(x, y, level, others)) continue;
        bestDist = d;
        best = { x, y };
      }
    }
    return best;
  }

  // Move a settled hunter out of its old room bucket and into `toRoom`'s,
  // syncing its currentRoom. Settlement never targets the player's current room
  // (settleDeaggroedHunter skips it), so toRoom is always a parked room — the
  // enemy goes into that room's bucket (created if it's the first occupant).
  // Only invoked when settlement relocates the enemy across rooms (the common
  // in-place settle never re-buckets).
  private rebucketSettledEnemy(
    enemy: Enemy,
    fromKey: number,
    toKey: number,
    toRoom: RoomGridCoord,
  ): void {
    const fromList = this.roomEnemies.get(fromKey);
    if (fromList) {
      const i = fromList.indexOf(enemy);
      if (i >= 0) fromList.splice(i, 1);
    }
    enemy.setCurrentRoom(toRoom);
    const toList = this.roomEnemies.get(toKey);
    if (toList) toList.push(enemy);
    else this.roomEnemies.set(toKey, [enemy]);
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
    // until it lands, walking into the corrupted growth's heart at the arena
    // center ends the run as a victory. The trigger is positional so it is
    // input-agnostic — keyboard, touch joystick, and any future gamepad all
    // reach it by movement alone (V remains an undocumented desktop debug
    // shortcut). Checked after movement + dash have settled the position, and
    // BEFORE checkCollisions below — touching the heart and an enemy on the
    // same frame resolves as a win, not an unfair last-instant death.
    // Consume the key edge every frame (clears a stale press made outside the
    // arena); both paths act only while in the boss room.
    const winStubPressed = this.inputManager.consumeWinStubPress();
    if (this.inBossArena) {
      if (winStubPressed) {
        this.victory('debug-key');
        return;
      }
      if (this.isTouchingGrowthHeart()) {
        this.victory('walk-on');
        return;
      }
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

    // Exit-band grace: if the player is approaching a room exit, hold that
    // opening's spawn band so a wave can't drip into the doorway as they leave
    // (the departure counterpart to the arrival-side entry-band grace that lands
    // on the sibling room-entry branch). Runs after
    // detectTransition — a transition short-circuits the frame before here — and
    // just before the scheduler tick so the hold is in place for this tick's
    // draw. Rolling clamp; lapses on its own once they stop approaching.
    this.applyExitBandGrace(input, currentTime);

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

    // Update the current room's enemies (all 'active'). Pass the live enemy
    // list so each can enforce enemy-vs-enemy no-overlap at its movement step.
    this.enemies.forEach(enemy => {
      enemy.update(deltaTime, this.player.getPosition(), this.level, this.enemies);
    });

    // Hunt machine (Step 4, roadmap §5.12). tick() advances activation timers
    // and de-aggros hunters whose room is now out of range; then updateHunters
    // walks the remaining cross-room hunters toward the player through the
    // room openings. De-aggro runs before movement so an out-of-range hunter
    // settles instead of getting one more free step toward the player.
    this.hunt.tick(currentTime, this.managedEnemies(), this.currentRoomCoord);
    this.updateHunters(deltaTime, currentTime);

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
    this.checkCollisions(currentTime);

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
    const enemy = new Enemy(
      { ...req.position },
      req.type,
      this.nextEnemyId++,
      undefined,
      { direction: { ...req.entryDirection } },
    );
    // Wave spawns are born in (and into) the player's current room and pursue
    // immediately — huntState defaults to 'active'; stamp the room so the Hunt
    // machine can track it once the player moves on.
    enemy.setCurrentRoom(this.currentRoomCoord);
    return enemy;
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

  // True if the enemy's per-type AABB (ENEMY_AABB_PX, centred in its cell)
  // overlaps the player's PLAYER_HURTBOX_PX kill box (centred in the player's
  // cell) — the contact-kill test, owner-approved 2026-06-10. Unlike wall
  // collision (full PLAYER_SIZE cell) and arrow hits (full enemy cell), the
  // kill test uses the true footprints: a bear's bulk reaches farther than a
  // snake's sliver. Shared by checkCollisions and clearLandingZone so a
  // "cleared" landing is genuinely non-lethal under the same rule.
  private enemyTouchesPlayer(enemy: Enemy, playerPos: Vector2): boolean {
    const off = (PLAYER_SIZE - PLAYER_HURTBOX_PX) / 2;
    return this.collisionManager.checkCollision(
      {
        x: playerPos.x + off,
        y: playerPos.y + off,
        width: PLAYER_HURTBOX_PX,
        height: PLAYER_HURTBOX_PX,
      },
      enemy.getAABB(),
    );
  }

  private checkCollisions(now: number) {
    const playerPos = this.player.getPosition();
    const playerCenterX = playerPos.x + TILE_SIZE / 2;
    const playerCenterY = playerPos.y + TILE_SIZE / 2;

    // Pass 1: AABB-overlap kill (enemyTouchesPlayer — per-type footprint vs
    // the player hurtbox). Contact-only enemies on top of the player end the
    // run immediately; return on hit so we don't double-report. Two narrow
    // doorway graces hold this pass only (arrows below still hit): the
    // player-side post-transition window, and per-enemy windows on hunters
    // that just materialized in this room (owner-approved 2026-06-10).
    if (now >= this.arrivalKillGraceUntil) {
      for (const enemy of this.enemies) {
        if (now < enemy.getArrivalGraceUntil()) continue;
        if (this.enemyTouchesPlayer(enemy, playerPos)) {
          const enemyPos = enemy.getPosition();
          const dx = enemyPos.x + TILE_SIZE / 2 - playerCenterX;
          const dy = enemyPos.y + TILE_SIZE / 2 - playerCenterY;
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
          this.enemiesKilled += 1;
          this.callbacks.onScoreChange(this.score);
          this.callbacks.onKillsChange(this.enemiesKilled);
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

  // True when the player's 32 px AABB overlaps the corrupted growth's heart
  // (BOSS_GROWTH_TRIGGER_PX box centred on BOSS_GROWTH_CENTER). Standard AABB
  // overlap expressed as a center-distance test. Deliberately uses the full
  // PLAYER_SIZE cell — a walk-on win trigger should be generous; the
  // contact-kill check is the one that uses the smaller PLAYER_HURTBOX_PX
  // core (enemyTouchesPlayer). Only meaningful inside the boss arena — the
  // caller gates on inBossArena.
  private isTouchingGrowthHeart(): boolean {
    const p = this.player.getPosition();
    const reach = (PLAYER_SIZE + BOSS_GROWTH_TRIGGER_PX) / 2;
    return (
      Math.abs(p.x + PLAYER_SIZE / 2 - BOSS_GROWTH_CENTER.x) < reach &&
      Math.abs(p.y + PLAYER_SIZE / 2 - BOSS_GROWTH_CENTER.y) < reach
    );
  }

  // Win the run. Step 9 reintroduces this (dormant since Step 3 removed the
  // per-level clear flow): today it fires from the boss-room walk-on growth
  // trigger (or the V debug shortcut), and later from real boss-defeat logic.
  // Like gameOver it just freezes the sim into a terminal state — the
  // gameLoop stops calling update() once the state leaves 'playing'.
  private victory(trigger: 'walk-on' | 'debug-key') {
    if (this.gameState === 'victory') return;
    this.gameState = 'victory';
    this.callbacks.onStateChange('victory');
    this.logger.log('state', 'victory', {
      trigger,
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
      // Corrupted growth (boss-arena stub win trigger). A ground feature, so
      // it draws under the player — the player visibly steps ONTO it to win.
      if (this.inBossArena) {
        this.renderer.renderCorruptedGrowth(this.lastTime);
      }
      this.renderer.renderPlayer(this.player, this.stamina.isBurstActive(), this.lastTime);

      if (this.enemies.length > 0) {
        // lastTime drives the doorway-arrival materialize flash on hunters
        // that just crossed into this room (same clock as the player sprite).
        this.renderer.renderEnemies(this.enemies, this.lastTime);
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
