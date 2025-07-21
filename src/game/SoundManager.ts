export class SoundManager {
  private enabled: boolean;
  private sounds: Map<string, HTMLAudioElement> = new Map();

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
    this.initializeSounds();
  }

  private initializeSounds() {
    // Create simple synthetic sounds
    this.createSound('arrow', 200, 0.1, 'square');
    this.createSound('hit', 400, 0.15, 'square');
    this.createSound('gameOver', 150, 0.5, 'sawtooth');
    this.createSound('victory', 500, 0.8, 'sine');
  }

  private createSound(name: string, frequency: number, duration: number, type: OscillatorType) {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    // Create audio element for consistent interface
    const audio = new Audio();
    audio.play = () => {
      if (this.enabled) {
        const newOscillator = audioContext.createOscillator();
        const newGainNode = audioContext.createGain();
        
        newOscillator.connect(newGainNode);
        newGainNode.connect(audioContext.destination);
        
        newOscillator.type = type;
        newOscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        
        newGainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        newGainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        
        newOscillator.start(audioContext.currentTime);
        newOscillator.stop(audioContext.currentTime + duration);
      }
      return Promise.resolve();
    };
    
    this.sounds.set(name, audio);
  }

  play(soundName: string) {
    const sound = this.sounds.get(soundName);
    if (sound && this.enabled) {
      sound.play().catch(() => {
        // Ignore play errors (often due to browser autoplay policies)
      });
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
}