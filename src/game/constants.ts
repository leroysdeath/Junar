export const CANVAS_WIDTH = 928;
export const CANVAS_HEIGHT = 544;
export const TILE_SIZE = 32;
export const PLAYER_SIZE = 32;
export const GRID_WIDTH = 29;
export const GRID_HEIGHT = 17;
// Real-world scale: 1 tile (32 px) ≈ 5.5 ft (adult male archer height)
export const FEET_PER_TILE = 5.5;
export const MAP_WIDTH_FEET = GRID_WIDTH * FEET_PER_TILE;   // 159.5 ft
export const MAP_HEIGHT_FEET = GRID_HEIGHT * FEET_PER_TILE; // 93.5 ft
// 360-degree LOS detection range (auto-fire and contact-death share this radius).
export const MAX_DETECTION_RANGE = 450;
export const ARROW_SPEED = 400; // pixels per second
export const ARROW_COOLDOWN_MS = 500;

// Player movement. Promoted from Player.ts so the stamina low-penalty and
// any future buffs can compose against a single source of truth.
export const PLAYER_SPEED = 150; // pixels per second

// Stamina pool — playthrough-wide, no regen, persists across all levels in
// a run. Resets to STAMINA_MAX only on Game.restart().
export const STAMINA_MAX = 100;
export const STAMINA_LOW_THRESHOLD = 10;
export const STAMINA_LOW_PENALTY = 0.5; // multiplier on speed + arrow rate when low

export const STAMINA_PER_TILE_MOVED = 0.001; // per TILE_SIZE px traveled
export const STAMINA_PER_ARROW = 0.001;
export const STAMINA_BURST_COST = 5;
export const STAMINA_DASH_COST = 0.5; // reserved; no consumer wired yet

// Burst rapid-fire. Multiplier applied as: effective_cooldown =
// ARROW_COOLDOWN_MS / (burstMultiplier * lowStaminaMultiplier). Decay is
// compounding with no floor — players who spam burst eventually drop below
// 1× and burst becomes a self-debuff (intentional self-limiting tuning).
export const BURST_DURATION_MS = 5_000;
export const BURST_BASE_MULTIPLIER = 2.0;
export const BURST_DECAY_FACTOR = 0.75;
export const BURST_RESET_BREAK_MS = 15_000;

// Wave scheduler defaults. Per-level/per-wave overrides live in levels.ts.
export const DEFAULT_INTER_WAVE_LULL_MS = 3000;
export const DEFAULT_SPAWN_INTERVAL_MS = 1500;
