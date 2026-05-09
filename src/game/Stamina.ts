import {
  STAMINA_MAX,
  STAMINA_LOW_THRESHOLD,
  STAMINA_LOW_PENALTY,
  STAMINA_PER_TILE_MOVED,
  STAMINA_PER_ARROW,
  STAMINA_BURST_COST,
  STAMINA_DASH_COST,
  TILE_SIZE,
  BURST_DURATION_MS,
  BURST_BASE_MULTIPLIER,
  BURST_DECAY_FACTOR,
  BURST_RESET_BREAK_MS,
} from './constants';

// Playthrough-wide stamina pool. Persists across levels; resets only when
// Game.restart() is called. Owns the burst state machine (active flag,
// scheduled end, decay multiplier, reset clock) so Game.ts only needs to
// query state and call drain methods.
//
// Logger-agnostic: Game.ts detects burst/low-stamina state transitions
// each frame and emits 'stamina'-category events itself.
export class Stamina {
  private value = STAMINA_MAX;
  private burstActive = false;
  private burstEndAt: number | null = null;
  // performance.now() of the previous burst's end. null = no burst yet.
  // Drives the 30s decay-vs-reset rule on the next activation.
  private lastBurstEndAt: number | null = null;
  // The multiplier the *next* burst activation will use. Set on activation
  // (decayed or reset). Reads as 1× when burst is inactive so the composed
  // arrow rate multiplier doesn't accidentally multiply by 2× while idle.
  private nextBurstMultiplier = BURST_BASE_MULTIPLIER;

  reset(): void {
    this.value = STAMINA_MAX;
    this.burstActive = false;
    this.burstEndAt = null;
    this.lastBurstEndAt = null;
    this.nextBurstMultiplier = BURST_BASE_MULTIPLIER;
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

  // Composite multiplier auto-fire uses to compute effective cooldown.
  // = burst (1 or active multiplier) × low-stamina (1 or 0.5).
  // Effective cooldown = ARROW_COOLDOWN_MS / this value.
  getArrowRateMultiplier(): number {
    const burst = this.burstActive ? this.nextBurstMultiplier : 1;
    const low = this.isLow() ? STAMINA_LOW_PENALTY : 1;
    return burst * low;
  }

  // Composite multiplier player movement uses. = low-stamina only.
  getMovementSpeedMultiplier(): number {
    return this.isLow() ? STAMINA_LOW_PENALTY : 1;
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

  // Reserved for future dash. No consumer wired today; kept here so the
  // budget lives next to the other costs and Game.ts can add a `dash`
  // action against the same gate without re-plumbing.
  tryConsumeDash(): boolean {
    if (this.value < STAMINA_DASH_COST) return false;
    this.drain(STAMINA_DASH_COST);
    return true;
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

  // Per-frame: end the burst if its scheduled end has passed, recording
  // the end timestamp so the decay-vs-reset rule can compare on the next
  // activation. Real time keeps ticking; the decay clock counts even
  // through Level Complete cards or other non-playing intervals.
  tick(now: number): void {
    if (this.burstActive && this.burstEndAt !== null && now >= this.burstEndAt) {
      this.burstActive = false;
      this.lastBurstEndAt = now;
      this.burstEndAt = null;
    }
  }

  private drain(amount: number): void {
    this.value = Math.max(0, this.value - amount);
  }
}
