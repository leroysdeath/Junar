import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, RotateCcw, Volume2, VolumeX, Trophy, Target } from 'lucide-react';
import { Game } from './game/Game';
import { GameState } from './game/types';
import { Direction } from './game/InputManager';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './game/constants';
import { MobileControls } from './MobileControls';

// Detect touch-primary devices via the (pointer: coarse) media query.
// Matches phones and tablets; spares desktop touchscreens (which have a
// fine pointer alongside their touch screen).
function useIsMobile(): boolean {
  const query = '(pointer: coarse)';
  const get = () =>
    typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [isMobile, setIsMobile] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [enemiesRemaining, setEnemiesRemaining] = useState(0);
  const [waveRemaining, setWaveRemaining] = useState<number | null>(null);
  const [levelRemaining, setLevelRemaining] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const isMobile = useIsMobile();

  const handleMobilePress = useCallback((dir: Direction) => {
    gameRef.current?.setVirtualInput(dir, true);
  }, []);
  const handleMobileRelease = useCallback((dir: Direction) => {
    gameRef.current?.setVirtualInput(dir, false);
  }, []);

  const initGame = useCallback(() => {
    if (canvasRef.current && !gameRef.current) {
      gameRef.current = new Game(canvasRef.current, {
        onStateChange: setGameState,
        onLevelChange: (level) => {
          setCurrentLevel(level);
          // Wave/level counters are only emitted on wave-driven levels
          // (1–3). Reset to null on every level change so legacy levels
          // (4–10) hide the rows until/unless Game emits a value.
          setWaveRemaining(null);
          setLevelRemaining(null);
        },
        onScoreChange: setScore,
        onEnemiesChange: setEnemiesRemaining,
        onWaveProgressChange: (wave, level) => {
          setWaveRemaining(wave);
          setLevelRemaining(level);
        },
        soundEnabled
      });
      gameRef.current.start();
    }
  }, [soundEnabled]);

  const startGame = () => {
    if (gameRef.current) {
      gameRef.current.restart();
    } else {
      initGame();
    }
  };

  const restartGame = () => {
    gameRef.current?.restart();
  };

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
    if (gameRef.current) {
      gameRef.current.setSoundEnabled(!soundEnabled);
    }
  };

  // Initialize game when component mounts
  useEffect(() => {
    initGame();
    return () => {
      gameRef.current?.cleanup();
      gameRef.current = null;
    };
  }, [initGame]);

  const renderHud = () => (
    <div className="flex justify-between items-start text-white font-mono gap-2">
      <div className="bg-black/70 px-3 py-2 rounded border border-amber-500">
        <div className="flex items-center gap-2 text-sm">
          <Target size={16} className="text-amber-400" />
          <span>Level {currentLevel}/10</span>
        </div>
        <div className="text-xs text-amber-300 mt-1">
          Enemies: {enemiesRemaining}
        </div>
        {levelRemaining !== null && (
          <div className="text-xs text-amber-300">
            Level remaining: {levelRemaining}
          </div>
        )}
        {waveRemaining !== null && (
          <div className="text-xs text-amber-300">
            Wave remaining: {waveRemaining}
          </div>
        )}
      </div>

      <div className="bg-black/70 px-3 py-2 rounded border border-amber-500">
        <div className="flex items-center gap-2 text-sm">
          <Trophy size={16} className="text-yellow-400" />
          <span>Score: {score}</span>
        </div>
      </div>

      <button
        onClick={toggleSound}
        className="bg-black/70 p-2 rounded border border-amber-500 hover:bg-amber-500/20 transition-colors"
      >
        {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
      </button>
    </div>
  );

  const renderGameOverContent = () => (
    <div className="text-center text-white max-w-md mx-auto px-6 opacity-90">
      <h2 className="text-4xl font-bold text-red-400 mb-4 drop-shadow-lg">Game Over</h2>
      <p className="text-lg text-amber-200 mb-2 drop-shadow">
        You reached Level {currentLevel}
      </p>
      <p className="text-base text-amber-300 mb-8 drop-shadow">
        Final Score: {score}
      </p>

      <div className="space-y-4">
        <button
          onClick={restartGame}
          className="w-full bg-gradient-to-r from-red-600/90 to-red-700/90 hover:from-red-500 hover:to-red-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 flex items-center justify-center gap-3 text-lg border-2 border-red-500"
        >
          <RotateCcw size={24} />
          Try Again
        </button>

        <button
          onClick={() => setGameState('menu')}
          className="w-full bg-gradient-to-r from-amber-600/90 to-amber-700/90 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 text-base border-2 border-amber-500"
        >
          Main Menu
        </button>
      </div>
    </div>
  );

  const renderVictoryContent = () => (
    <div className="text-center text-white max-w-md mx-auto px-6">
      <h2 className="text-4xl font-bold text-yellow-400 mb-4">Victory!</h2>
      <p className="text-lg text-amber-200 mb-2">
        You have conquered the jungle!
      </p>
      <p className="text-base text-yellow-300 mb-8">
        Final Score: {score}
      </p>

      <div className="space-y-4">
        <button
          onClick={startGame}
          className="w-full bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 text-black font-bold py-4 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 flex items-center justify-center gap-3 text-lg border-2 border-yellow-500"
        >
          <Play size={24} />
          Play Again
        </button>

        <button
          onClick={() => setGameState('menu')}
          className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 text-base border-2 border-amber-500"
        >
          Main Menu
        </button>
      </div>
    </div>
  );

  const renderLevelCompleteContent = () => (
    <div className="text-center text-white">
      <h2 className="text-3xl font-bold text-green-400 mb-4">Level Complete!</h2>
      <p className="text-lg text-amber-200">
        Preparing Level {currentLevel + 1}...
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-amber-900 flex flex-col items-center justify-center p-4 gap-4">
      {isMobile && gameState !== 'menu' && (
        <div className="w-full max-w-[936px]">
          {gameState === 'playing' && renderHud()}
          {gameState === 'gameOver' && renderGameOverContent()}
          {gameState === 'victory' && renderVictoryContent()}
          {gameState === 'levelComplete' && renderLevelCompleteContent()}
        </div>
      )}

      <div className="relative bg-black rounded-lg shadow-2xl border-4 border-amber-600 overflow-hidden w-full max-w-[936px]">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block w-full h-auto"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Game UI Overlay (desktop only — mobile renders above the canvas) */}
        {!isMobile && gameState === 'playing' && (
          <div className="absolute top-4 left-4 right-4">
            {renderHud()}
          </div>
        )}

        {/* Main Menu (overlays canvas on both mobile and desktop) */}
        {gameState === 'menu' && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center">
            <div className="text-center text-white max-w-md mx-auto px-6">
              <h1 className="text-6xl font-bold text-amber-400 mb-2 font-serif">
                Jungle Archer
              </h1>
              <p className="text-lg text-amber-200 mb-8 font-mono">
                Survive the Ancient Forest
              </p>

              <div className="space-y-4">
                <button
                  onClick={startGame}
                  className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 flex items-center justify-center gap-3 text-lg border-2 border-green-500"
                >
                  <Play size={24} />
                  Start Adventure
                </button>

                <button
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 text-base border-2 border-amber-500"
                >
                  {showInstructions ? 'Hide Instructions' : 'How to Play'}
                </button>
              </div>

              {showInstructions && (
                <div className="mt-6 bg-black/80 p-6 rounded-lg border border-amber-500 text-left">
                  <h3 className="text-amber-400 font-bold mb-3 text-center">Instructions</h3>
                  <ul className="text-sm space-y-2 text-amber-100">
                    <li>
                      <strong>Movement:</strong>{' '}
                      {isMobile ? 'Use the on-screen D-pad' : 'Use WASD or Arrow Keys'}
                    </li>
                    <li><strong>Combat:</strong> Arrows fire when enemies are in sight</li>
                    <li><strong>Objective:</strong> Eliminate all enemies to advance</li>
                    <li><strong>Strategy:</strong> Position for clear line of sight</li>
                    <li><strong>Warning:</strong> Avoid all enemy contact!</li>
                    <li><strong>Levels:</strong> 9 levels + epic boss battle</li>
                    <li><strong>Victory:</strong> Defeat the Ancient Tree Guardian</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Game Over Screen (desktop only — mobile renders above the canvas) */}
        {!isMobile && gameState === 'gameOver' && (
          <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
            {renderGameOverContent()}
          </div>
        )}

        {/* Victory Screen (desktop only — mobile renders above the canvas) */}
        {!isMobile && gameState === 'victory' && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center">
            {renderVictoryContent()}
          </div>
        )}

        {/* Level Complete Transition (desktop only — mobile renders above the canvas) */}
        {!isMobile && gameState === 'levelComplete' && (
          <div className="absolute inset-0 bg-black/75 flex items-center justify-center">
            {renderLevelCompleteContent()}
          </div>
        )}
      </div>

      {isMobile && (
        <MobileControls
          onPress={handleMobilePress}
          onRelease={handleMobileRelease}
        />
      )}
    </div>
  );
}

export default App;
