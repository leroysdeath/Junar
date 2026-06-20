import {
  STAMINA_MAX,
  STAMINA_LOW_THRESHOLD,
  STAMINA_LOW_PENALTY,
  STAMINA_PER_TILE_MOVED,
  STAMINA_PER_ARROW,
  STAMINA_BURST_COST,
  STAMINA_SPRINT_COST,
  TILE_SIZE,
  BURST_DURATION_MS,
  BURST_BASE_MULTIPLIER,
  BURST_DECAY_FACTOR,
  BURST_RESET_BREAK_MS,
  SPRINT_DURATION_MS,
  SPRINT_BASE_MULTIPLIER,
  SPRINT_DECAY_FACTOR,
  SPRINT_RESET_BREAK_MS,
} from './constants';

// Playthrough-wide stamina pool (shown in the HUD as "Energy"). Persists
// across levels; resets only when Game.restart() is called. Owns two twin
// state machines — burst (arrow fire-rate) and sprint (movement speed) — each
// with an active flag, scheduled end, decay multiplier, and reset clock, so
// Game.ts only needs to query state and call drain methods.
//
// Logger-agnostic: Game.ts detects burst/sprint/low-stamina state transitions
// each frame and emits 'stamina'-category events itself.
export class Stamina {
  private value = STAMINA_MAX;
  private burstActive = false;
  private burstEndAt: number | null = null;
  // performance.now() of the previous burst's end. null = no burst yet.
  // Drives the BURST_RESET_BREAK_MS decay-vs-reset rule on the next activation.
  private lastBurstEndAt: number | null = null;
  // The multiplier the *next* burst activation will use. Set on activation
  // (decayed or reset). Reads as 1× when burst is inactive so the composed
  // arrow rate multiplier doesn't accidentally multiply by 2× while idle.
  private nextBurstMultiplier = BURST_BASE_MULTIPLIER;

  // Sprint twin of the burst fields above — a timed movement-speed boost with
  // the same decay-vs-reset rule (see SPRINT_* in constants). Independent of
  // burst: both can run at once.
  private sprintActive = false;
  private sprintEndAt: number | null = null;
  private lastSprintEndAt: number | null = null;
  private nextSprintMultiplier = SPRINT_BASE_MULTIPLIER;

  reset(): void {
    this.value = STAMINA_MAX;
    this.burstActive = false;
    this.burstEndAt = null;
    this.lastBurstEndAt = null;
    this.nextBurstMultiplier = BURST_BASE_MULTIPLIER;
    this.sprintActive = false;
    this.sprintEndAt = null;
    this.lastSprintEndAt = null;
    this.nextSprintMultiplier = SPRINT_BASE_MULTIPLIER;
  }

  getValue(): number {
    return this.value;
  }

  isLow(): boolean {
    return this.value < STAMINA_LOW_THRESHOLD;
  }

  isBurstActive(): boolean {
    return this.burstActive;
  }

  getBurstEndAt(): number | null {
    return this.burstEndAt;
  }

  // The multiplier currently affecting fire rate. 1 when burst is
  // inactive; otherwise the value chosen at activation (post-decay).
  getBurstMultiplier(): number {
    return this.burstActive ? this.nextBurstMultiplier : 1;
  }

  isSprintActive(): boolean {
    return this.sprintActive;
  }

  getSprintEndAt(): number | null {
    return this.sprintEndAt;
  }

  // The multiplier currently affecting movement speed. 1 when sprint is
  // inactive; otherwise the value chosen at activation (post-decay).
  getSprintMultiplier(): number {
    return this.sprintActive ? this.nextSprintMultiplier : 1;
  }

  // Composite multiplier auto-fire uses to compute effective cooldown.
  // = burst (1 or active multiplier) × low-stamina (1 or 0.5).
  // Effective cooldown = ARROW_COOLDOWN_MS / this value.
  getArrowRateMultiplier(): number {
    const burst = this.burstActive ? this.nextBurstMultiplier : 1;
    const low = this.isLow() ? STAMINA_LOW_PENALTY : 1;
    return burst * low;
  }

  // Composite multiplier player movement uses.
  // = sprint (1 or active multiplier) × low-energy (1 or 0.5).
  // Mirrors getArrowRateMultiplier's burst × low composition: a player who
  // sprints while low on energy gets 1.5× × 0.5 = 0.75× (the penalty still
  // bites, just softened), exactly as bursting while low does for fire rate.
  getMovementSpeedMultiplier(): number {
    const sprint = this.sprintActive ? this.nextSprintMultiplier : 1;
    const low = this.isLow() ? STAMINA_LOW_PENALTY : 1;
    return sprint * low;
  }

  // Drain by movement distance. distancePx is the cumulative pixels
  // travelled this frame (Math.hypot of pre/post deltas). Cost scales
  // by TILE_SIZE so a full tile (32 px) charges STAMINA_PER_TILE_MOVED.
  consumeMovement(distancePx: number): void {
    if (distancePx <= 0) return;
    this.drain((distancePx / TILE_SIZE) * STAMINA_PER_TILE_MOVED);
  }

  consumeArrow(): void {
    this.drain(STAMINA_PER_ARROW);
  }

  // Restore energy, allowing OVERCAP above STAMINA_MAX (owner 2026-06-19, for
  // the mango pickup). Unlike drain() (which floors at 0), this has no upper
  // clamp: a mango at 99 energy → 104. The natural ceiling is enforced by the
  // gameplay 5-mango cap (max 125), not here. The HUD paints the surplus
  // (value − STAMINA_MAX) as a green band; everything else (isLow, the
  // multipliers) only cares about the low threshold, so >100 is safe.
  addEnergy(amount: number): void {
    if (amount <= 0) return;
    this.value = this.value + amount;
  }

  // Activate burst at `now` (performance.now() ms). Returns true if it
  // actually started. Rejected (no decay tick, no cost) when:
  //   - value < STAMINA_BURST_COST
  //   - burst is already active (matches "spammed sequentially")
  // On success: applies the decay rule, drains 5 stamina, schedules end.
  tryActivateBurst(now: number): boolean {
    if (this.burstActive) return false;
    if (this.value < STAMINA_BURST_COST) return false;

    if (
      this.lastBurstEndAt !== null &&
      now - this.lastBurstEndAt < BURST_RESET_BREAK_MS
    ) {
      this.nextBurstMultiplier *= BURST_DECAY_FACTOR;
    } else {
      this.nextBurstMultiplier = BURST_BASE_MULTIPLIER;
    }

    this.drain(STAMINA_BURST_COST);
    this.burstActive = true;
    this.burstEndAt = now + BURST_DURATION_MS;
    return true;
  }

  // Activate sprint at `now` (performance.now() ms). The movement-speed twin
  // of tryActivateBurst — same gating (rejected when already active or value <
  // STAMINA_SPRINT_COST), same decay-vs-reset rule, same cost. On success:
  // applies the decay rule, drains the cost, schedules the end.
  tryActivateSprint(now: number): boolean {
    if (this.sprintActive) return false;
    if (this.value < STAMINA_SPRINT_COST) return false;

    if (
      this.lastSprintEndAt !== null &&
      now - this.lastSprintEndAt < SPRINT_RESET_BREAK_MS
    ) {
      this.nextSprintMultiplier *= SPRINT_DECAY_FACTOR;
    } else {
      this.nextSprintMultiplier = SPRINT_BASE_MULTIPLIER;
    }

    this.drain(STAMINA_SPRINT_COST);
    this.sprintActive = true;
    this.sprintEndAt = now + SPRINT_DURATION_MS;
    return true;
  }

  // Per-frame: end burst and/or sprint if their scheduled end has passed,
  // recording the end timestamp so the decay-vs-reset rule can compare on the
  // next activation. Real time keeps ticking; the decay clock counts even
  // through Level Complete cards or other non-playing intervals.
  tick(now: number): void {
    if (
      this.burstActive &&
      this.burstEndAt !== null &&
      now >= this.burstEndAt
    ) {
      this.burstActive = false;
      this.lastBurstEndAt = now;
      this.burstEndAt = null;
    }
    if (
      this.sprintActive &&
      this.sprintEndAt !== null &&
      now >= this.sprintEndAt
    ) {
      this.sprintActive = false;
      this.lastSprintEndAt = now;
      this.sprintEndAt = null;
    }
  }

  private drain(amount: number): void {
    this.value = Math.max(0, this.value - amount);
  }
}
