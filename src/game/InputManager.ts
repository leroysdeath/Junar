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
    right: false
  };
  private onBlurClear?: InputBlurCallback;

  private readonly handleKeyDown = (e: KeyboardEvent) => {
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
    // Also clear virtual input — a phone backgrounding the tab while a
    // D-pad button is held would otherwise leave a direction stuck on.
    const hadVirtual =
      this.virtual.up || this.virtual.down || this.virtual.left || this.virtual.right;
    if (this.keys.size === 0 && !hadVirtual) return;
    const cleared = Array.from(this.keys);
    this.keys.clear();
    this.virtual.up = false;
    this.virtual.down = false;
    this.virtual.left = false;
    this.virtual.right = false;
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
    this.inputState.up = this.virtual.up || this.keys.has('KeyW') || this.keys.has('ArrowUp');
    this.inputState.down = this.virtual.down || this.keys.has('KeyS') || this.keys.has('ArrowDown');
    this.inputState.left = this.virtual.left || this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    this.inputState.right = this.virtual.right || this.keys.has('KeyD') || this.keys.has('ArrowRight');
  }

  getInput(): InputState {
    return { ...this.inputState };
  }

  setVirtualInput(direction: Direction, pressed: boolean) {
    this.virtual[direction] = pressed;
    this.updateInputState();
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
  }
}
