import { InputState } from './types';

export type InputBlurCallback = (cleared: string[]) => void;

export class InputManager {
  private keys: Set<string> = new Set();
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
    if (this.keys.size === 0) return;
    const cleared = Array.from(this.keys);
    this.keys.clear();
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
    this.inputState.up = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    this.inputState.down = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    this.inputState.left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    this.inputState.right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
  }

  getInput(): InputState {
    return { ...this.inputState };
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
