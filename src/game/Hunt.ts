// Hunt — the 4-state enemy-AI machine for the traversable-maps refactor
// (Step 4). See docs/ROADMAP-traversable-maps.md §5.11 (static aggro) and
// §5.12 (the state machine). It is pure logic, driven entirely by the gameLoop
// `currentTime` (never Date.now — Invariant 8) and by room-grid position. It
// holds no listeners, no timers, and no per-run enemy registry — the per-enemy
// activation clock lives on each Enemy — so it needs no disposal and no reset
// between runs.
//
// State flow (the per-enemy `huntState` is the single source of truth; this
// class only drives the transitions):
//
//   dormant    --player enters its room-->        activating   (startActivating)
//   activating --STATIC_AGGRO_DELAY_MS elapsed-->  active       (tick)
//   active     --player leaves the room-->         hunting      (onPlayerLeftRoom)
//   hunting    --player re-enters its room-->       active       (onPlayerEnteredRoom)
//   hunting    --room Manhattan > HUNT_RANGE-->     dormant      (tick → settle)
//
// Wave-spawned enemies are born 'active' and never pass through dormant /
// activating; only placed statics (Step 5+6) do. Cross-room *movement* of a
// 'hunting' enemy (walking it through room openings toward the player) is the
// orchestrator's job in Game.ts — this machine only owns the state, the
// activation clock, and the de-aggro decision.

import { Vector2, RoomGridCoord } from './types';
import { STATIC_AGGRO_DELAY_MS, HUNT_RANGE } from './constants';
import type { Enemy } from './Enemy';

// Manhattan distance in room-grid coordinates (rooms, not tiles).
function roomManhattan(a: RoomGridCoord, b: RoomGridCoord): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function sameRoom(a: RoomGridCoord, b: RoomGridCoord): boolean {
  return a.col === b.col && a.row === b.row;
}

// Resolves WHERE a de-aggroing hunter settles, returning the pixel position
// (cell top-left) it should occupy. Step 4 ships the stub below (settle in
// place, no relocation); Step 5+6 replaces it via registerSettlementCallback
// with a map-wide BFS that finds the nearest AABB-compatible open tile, and is
// responsible for keeping the enemy's currentRoom + room bucket in sync if it
// relocates the enemy (roadmap §5.13).
export type SettlementResolver = (enemy: Enemy) => Vector2;

export class Hunt {
  // Default stub settlement: keep the hunter exactly where it is (no BFS), so
  // Step 4 is independently testable. Step 5+6 overrides this.
  private settle: SettlementResolver = (enemy) => enemy.getPosition();

  // Step 5+6 registers the real BFS placement here. The contract: given a
  // de-aggroing hunter, return the pixel position it should settle at.
  registerSettlementCallback(resolver: SettlementResolver): void {
    this.settle = resolver;
  }

  // dormant → activating. Records the activation start so tick() can promote
  // the enemy to 'active' once STATIC_AGGRO_DELAY_MS has elapsed. Called when
  // the player enters a room containing this dormant sitter.
  startActivating(enemy: Enemy, currentTime: number): void {
    enemy.setHuntState('activating');
    enemy.setActivatingSince(currentTime);
  }

  // Player left a room: every still-active enemy in it becomes a cross-room
  // hunter. Dormant / activating sitters that never woke are left untouched
  // (they keep waiting / counting down).
  onPlayerLeftRoom(enemies: Enemy[]): void {
    for (const enemy of enemies) {
      if (enemy.getHuntState() === 'active') enemy.setHuntState('hunting');
    }
  }

  // Player entered a room: hunters that have arrived here rejoin the in-room
  // pursuit (active again — they're co-located with the player now); dormant
  // sitters begin their aggro delay.
  onPlayerEnteredRoom(enemies: Enemy[], currentTime: number): void {
    for (const enemy of enemies) {
      const state = enemy.getHuntState();
      if (state === 'hunting') enemy.setHuntState('active');
      else if (state === 'dormant') this.startActivating(enemy, currentTime);
    }
  }

  // Per-frame machine update over the full managed population (the current
  // room's enemies plus every parked room's enemies). Two transitions:
  //   • activating → active once the aggro delay has elapsed; and
  //   • hunting → dormant (de-aggro + settle) once the player's room is more
  //     than HUNT_RANGE Manhattan rooms from the hunter's room.
  // 'dormant' and 'active' have no time- or distance-driven transition here
  // (dormant wakes via onPlayerEnteredRoom; active flips via onPlayerLeftRoom).
  tick(currentTime: number, enemies: Enemy[], playerRoom: RoomGridCoord): void {
    for (const enemy of enemies) {
      switch (enemy.getHuntState()) {
        case 'activating':
          if (
            currentTime - enemy.getActivatingSince() >=
            STATIC_AGGRO_DELAY_MS
          ) {
            // Wake complete. If the player is still in this enemy's room it
            // pursues in-room ('active'); if the player already left during the
            // 1 s delay it commits straight to the cross-room hunt (mirroring
            // onPlayerLeftRoom). Without this room check a static the player
            // briefly poked then walked away from before 1 s would strand as a
            // frozen parked 'active' — never hunting — until the player
            // happened to return. (Resolves the §5.12 "wake while player
            // absent" race the roadmap table leaves unspecified.)
            enemy.setHuntState(
              sameRoom(enemy.getCurrentRoom(), playerRoom)
                ? 'active'
                : 'hunting',
            );
          }
          break;
        case 'hunting':
          if (roomManhattan(enemy.getCurrentRoom(), playerRoom) > HUNT_RANGE) {
            this.deaggro(enemy);
          }
          break;
      }
    }
  }

  // De-aggro: ask the resolver where to settle, move the enemy there, and drop
  // it back to a dormant static. The stub settles in place; a relocating
  // resolver (Step 5+6) owns updating currentRoom + re-bucketing the enemy.
  private deaggro(enemy: Enemy): void {
    enemy.setPosition(this.settle(enemy));
    enemy.setHuntState('dormant');
  }
}
