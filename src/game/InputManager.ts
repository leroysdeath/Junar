import { InputState } from './types';

export type InputBlurCallback = (cleared: string[]) => void;
export type Direction = 'up' | 'down' | 'left' | 'right';

export class InputManager {
  private keys: Set<string> = new Set();
  // Virtual input from on-screen mobile controls. OR'd with keyboard so
  // both input paths work simultaneously without conflict.
  private virtual = { up: false, down: false, left: false, right: false };
  private inputState: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
  };
  // Edge-triggered burst flag. Set on Space keydown (de-duped against the
  // existing keys Set so browser auto-repeat doesn't refire) or via mobile
  // setBurstPressed(); cleared by consumeBurstPress() on read.
  private burstPressed = false;
  // Edge-triggered dash flag. Set on Shift or A keydown (same dedup
  // pattern), or via mobile setDashPressed(). KeyA is intentionally
  // dual-purpose: this fires a one-shot dash on press while continuing to
  // register as held-state left movement.
  private dashPressed = false;
  // Edge-triggered win-stub flag (Step 9). Set on V keydown (same dedup
  // pattern). An undocumented desktop DEBUG shortcut for the boss-room win —
  // the real (input-agnostic) trigger is walking into the corrupted growth
  // at the arena center. Both are stubs until boss combat lands (roadmap
  // §5.15); Game only acts on this while in the boss arena.
  private winStubPressed = false;
  private onBlurClear?: InputBlurCallback;

  private readonly handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !this.keys.has('Space')) {
      this.burstPressed = true;
    }
    if (
      (e.code === 'ShiftLeft' && !this.keys.has('ShiftLeft')) ||
      (e.code === 'ShiftRight' && !this.keys.has('ShiftRight')) ||
      (e.code === 'KeyA' && !this.keys.has('KeyA'))
    ) {
      this.dashPressed = true;
    }
    if (e.code === 'KeyV' && !this.keys.has('KeyV')) {
      this.winStubPressed = true;
    }
    this.keys.add(e.code);
    this.updateInputState();
  };

  private readonly handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    this.updateInputState();
  };

  // Releasing a key while the window is unfocused does not fire a keyup
  // (the OS routes the event elsewhere). Without this clear, alt-tabbing
  // with a movement key held leaves the key "pressed" forever in our Set,
  // and the player runs into walls or appears unable to move on one axis.
  private readonly handleBlur = () => {
    // Also clear virtual input — a phone backgrounding the tab while the
    // joystick is held would otherwise leave a direction stuck on.
    const hadVirtual =
      this.virtual.up ||
      this.virtual.down ||
      this.virtual.left ||
      this.virtual.right;
    if (this.keys.size === 0 && !hadVirtual) return;
    const cleared = Array.from(this.keys);
    this.keys.clear();
    this.virtual.up = false;
    this.virtual.down = false;
    this.virtual.left = false;
    this.virtual.right = false;
    this.burstPressed = false;
    this.dashPressed = false;
    this.winStubPressed = false;
    this.updateInputState();
    this.onBlurClear?.(cleared);
  };

  constructor(onBlurClear?: InputBlurCallback) {
    this.onBlurClear = onBlurClear;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  private updateInputState() {
    this.inputState.up =
      this.virtual.up || this.keys.has('KeyW') || this.keys.has('ArrowUp');
    this.inputState.down =
      this.virtual.down || this.keys.has('KeyS') || this.keys.has('ArrowDown');
    // KeyA is intentionally NOT mapped to left — it's the dash key.
    // WSAD-style players use ArrowLeft for left movement.
    this.inputState.left = this.virtual.left || this.keys.has('ArrowLeft');
    this.inputState.right =
      this.virtual.right ||
      this.keys.has('KeyD') ||
      this.keys.has('ArrowRight');
  }

  getInput(): InputState {
    return { ...this.inputState };
  }

  setVirtualInput(direction: Direction, pressed: boolean) {
    this.virtual[direction] = pressed;
    this.updateInputState();
  }

  // Mobile bridge for the B button. Equivalent to a Space keydown edge.
  setBurstPressed() {
    this.burstPressed = true;
  }

  // Read + clear the edge flag. Called once per frame from Game.update().
  consumeBurstPress(): boolean {
    const r = this.burstPressed;
    this.burstPressed = false;
    return r;
  }

  // Mobile bridge for the A button. Equivalent to a Shift/A keydown edge.
  setDashPressed() {
    this.dashPressed = true;
  }

  consumeDashPress(): boolean {
    const r = this.dashPressed;
    this.dashPressed = false;
    return r;
  }

  // Read + clear the win-stub edge flag (V debug shortcut for the boss-room
  // win; the player-facing trigger is the walk-on corrupted growth). Called
  // once per frame from Game.update(); Game only honors it inside the arena.
  consumeWinStubPress(): boolean {
    const r = this.winStubPressed;
    this.winStubPressed = false;
    return r;
  }

  // Drop any pending one-shot edges (burst / dash / win-stub) without touching
  // held-movement state. Game.restart() calls this so an edge pressed on a
  // terminal overlay (e.g. V on the game-over screen, where update() isn't
  // running to consume it) can't carry into the next run.
  clearEdges() {
    this.burstPressed = false;
    this.dashPressed = false;
    this.winStubPressed = false;
  }

  // For diagnostics: lets the logger snapshot the raw key Set, not just
  // the WASD/arrow projection. Surfaces phantom-stuck keys.
  getPressedKeys(): string[] {
    return Array.from(this.keys);
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.keys.clear();
    this.burstPressed = false;
    this.dashPressed = false;
    this.winStubPressed = false;
  }
}
