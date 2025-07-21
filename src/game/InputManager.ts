import { InputState } from './types';

export class InputManager {
  private keys: Set<string> = new Set();
  private inputState: InputState = {
    up: false,
    down: false,
    left: false,
    right: false
  };

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      this.updateInputState();
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.updateInputState();
    });
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
}