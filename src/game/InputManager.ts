import { InputState } from './types';

export class InputManager {
  private keys: Set<string> = new Set();
  private inputState: InputState = {
    up: false,
    down: false,
    left: false,
    right: false
  };

  private readonly handleKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    this.updateInputState();
  };

  private readonly handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    this.updateInputState();
  };

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
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

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.keys.clear();
  }
}
