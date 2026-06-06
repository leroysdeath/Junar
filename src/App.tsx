import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, RotateCcw, Volume2, VolumeX, Target, Zap } from 'lucide-react';
import { Game } from './game/Game';
import { GameState, RoomGridCoord } from './game/types';
import { Direction } from './game/InputManager';
import { CANVAS_WIDTH, CANVAS_HEIGHT, STAMINA_MAX } from './game/constants';
import { MobileControls, Action } from './MobileControls';

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

// Track portrait orientation so we can force the canvas into landscape via a CSS
// rotation when the device is held portrait and the real orientation lock is
// unavailable (e.g. iOS Safari, which rejects screen.orientation.lock).
function useIsPortrait(): boolean {
  const query = '(orientation: portrait)';
  const get = () =>
    typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [isPortrait, setIsPortrait] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    // Re-read the media query rather than trusting the change event's payload:
    // iOS Safari has historically fired stale/no MediaQueryList change events on
    // rotation, which left the old "rotate your device" prompt stuck on screen
    // after the user turned the phone. Listening to resize/orientationchange as
    // well and recomputing from matchMedia keeps the flag honest everywhere.
    const sync = () => setIsPortrait(get());
    mql.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      mql.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  return isPortrait;
}

// --- Immersive-mode helpers (mobile landscape) --------------------------------
// Fullscreen + orientation lock are best-effort: feature-detected and wrapped in
// try/catch so SSR/desktop and browsers that reject them (notably iOS Safari,
// which supports neither element fullscreen nor orientation.lock) degrade to a
// no-op. Each must be invoked from inside the user gesture or the browser
// rejects it. When the lock is unavailable (iOS Safari), the CSS force-rotate
// driven by useIsPortrait keeps the game in landscape regardless.
async function enterFullscreen(el: Element): Promise<void> {
  try {
    if (
      typeof el.requestFullscreen === 'function' &&
      !document.fullscreenElement
    ) {
      await el.requestFullscreen();
    }
  } catch {
    // Rejected (no gesture / unsupported) — stay windowed.
  }
}

async function exitFullscreen(): Promise<void> {
  try {
    if (
      typeof document !== 'undefined' &&
      document.fullscreenElement &&
      typeof document.exitFullscreen === 'function'
    ) {
      await document.exitFullscreen();
    }
  } catch {
    // Nothing actionable if the browser refuses to exit.
  }
}

// screen.orientation.lock/unlock are non-standard and absent from the DOM
// typings, so reach them through a narrow structural cast rather than `any`.
function orientationApi():
  | { lock?: (o: string) => Promise<void>; unlock?: () => void }
  | null {
  if (typeof screen === 'undefined' || !screen.orientation) return null;
  return screen.orientation as unknown as {
    lock?: (o: string) => Promise<void>;
    unlock?: () => void;
  };
}

async function lockLandscape(): Promise<void> {
  try {
    const o = orientationApi();
    if (o && typeof o.lock === 'function') {
      await o.lock('landscape');
    }
  } catch {
    // iOS Safari/desktop reject — the CSS force-rotate covers this case.
  }
}

function unlockOrientation(): void {
  try {
    orientationApi()?.unlock?.();
  } catch {
    // No-op if unsupported.
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  // Root container — the fullscreen target on mobile (Task 1).
  const rootRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [roomCoord, setRoomCoord] = useState<RoomGridCoord>({ col: 0, row: 0 });
  const [waveNum, setWaveNum] = useState(0);
  const [score, setScore] = useState(0);
  const [kills, setKills] = useState(0);
  // Live in-room enemy count from onEnemiesChange. Kept wired (the signal is
  // used elsewhere in the game) but no longer shown in the HUD — only the
  // setter is needed, so the value binding is dropped to satisfy noUnusedLocals.
  const [, setEnemiesRemaining] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const [stamina, setStamina] = useState({ value: STAMINA_MAX, isLow: false });
  const [burst, setBurst] = useState({ active: false, multiplier: 1 });
  // Boss-arena sub-state (Step 9): true while the player is inside anchor 10.
  // Drives the non-blocking "Reached Boss" banner; the game stays in 'playing'.
  const [bossArena, setBossArena] = useState(false);
  const isMobile = useIsMobile();
  const isPortrait = useIsPortrait();
  // Force-landscape: on a touch device held portrait during live play, rotate
  // the whole game 90° via CSS so the fixed-aspect canvas always reads as
  // landscape (the standard web fallback where orientation.lock is rejected).
  // Gated to 'playing' — the menu and Game Over / Victory screens are portrait-
  // friendly decision menus and stay upright.
  const forceLandscape = isMobile && isPortrait && gameState === 'playing';

  // On mobile during play, cap the canvas so the *whole* board fits the
  // landscape frame instead of being sized purely by width (which overflowed
  // the rotated frame's height and clipped the top/bottom of the board). The
  // cap is the smaller of the frame's width and the width implied by fitting
  // the 928×544 board into the frame's height; the two axes swap when we've
  // force-rotated the frame 90°. p-4 (1rem each side) is subtracted so the
  // board clears the root padding.
  const canvasFitStyle =
    isMobile && gameState === 'playing'
      ? {
          maxWidth: forceLandscape
            ? 'min(calc(100vh - 2rem), calc((100vw - 2rem) * 928 / 544))'
            : 'min(calc(100vw - 2rem), calc((100vh - 2rem) * 928 / 544))',
        }
      : undefined;

  const handleMobilePress = useCallback((dir: Direction) => {
    gameRef.current?.setVirtualInput(dir, true);
  }, []);
  const handleMobileRelease = useCallback((dir: Direction) => {
    gameRef.current?.setVirtualInput(dir, false);
  }, []);
  const handleActionPress = useCallback((action: Action) => {
    if (action === 'b') {
      gameRef.current?.triggerBurst();
    } else if (action === 'a') {
      gameRef.current?.triggerDash();
    }
  }, []);

  // Task 1: on touch devices, request fullscreen on the root container and lock
  // to landscape. Must run inside the start/restart gesture (browsers reject
  // these outside a user gesture); both are best-effort no-ops elsewhere.
  // Desktop keeps its current windowed behavior.
  const enterImmersive = useCallback(() => {
    if (!isMobile) return;
    const el = rootRef.current;
    // Enter fullscreen first, then lock the orientation: several browsers
    // (e.g. Chrome on Android) reject orientation.lock unless the document is
    // already fullscreen. enterFullscreen never rejects (it swallows its own
    // errors), so the lock is always attempted; both are best-effort no-ops
    // where unsupported. Still kicked off from inside the gesture handler.
    const fullscreen = el ? enterFullscreen(el) : Promise.resolve();
    void fullscreen.then(() => lockLandscape());
  }, [isMobile]);

  const initGame = useCallback(() => {
    if (canvasRef.current && !gameRef.current) {
      gameRef.current = new Game(canvasRef.current, {
        onStateChange: setGameState,
        onRoomChange: (coord) => setRoomCoord(coord),
        onWaveChange: (n) => setWaveNum(n),
        onBossArenaChange: (active) => setBossArena(active),
        onScoreChange: setScore,
        onKillsChange: setKills,
        onEnemiesChange: setEnemiesRemaining,
        onStaminaChange: (value, isLow) => setStamina({ value, isLow }),
        onBurstChange: (active, multiplier) => setBurst({ active, multiplier }),
        soundEnabled
      });
      gameRef.current.start();
    }
  }, [soundEnabled]);

  const startGame = () => {
    enterImmersive();
    if (gameRef.current) {
      gameRef.current.restart();
    } else {
      initGame();
    }
  };

  const restartGame = () => {
    enterImmersive();
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

  // Task 1: leave fullscreen and release the orientation lock whenever we return
  // to the menu, and on unmount — so the app never gets stuck in forced landscape
  // fullscreen. Both calls are no-ops when nothing is locked / fullscreen.
  useEffect(() => {
    if (gameState === 'menu') {
      void exitFullscreen();
      unlockOrientation();
    }
  }, [gameState]);

  useEffect(() => {
    return () => {
      void exitFullscreen();
      unlockOrientation();
    };
  }, []);

  // While force-rotated, the root is anchored off-screen pre-transform; pin the
  // document so that overflow never shows up as a stray scrollbar. Restored when
  // we leave forced landscape (rotate back, return to menu, or unmount).
  useEffect(() => {
    if (typeof document === 'undefined' || !forceLandscape) return;
    const root = document.documentElement;
    const prevRoot = root.style.overflow;
    const prevBody = document.body.style.overflow;
    root.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      root.style.overflow = prevRoot;
      document.body.style.overflow = prevBody;
    };
  }, [forceLandscape]);

  const renderHud = () => {
    // Stamina bar fill — red when low, warm gold while bursting, amber
    // otherwise. Width is rounded so the bar visibly steps as the value
    // crosses each percent boundary.
    const fillPct = Math.max(0, Math.min(100, (stamina.value / STAMINA_MAX) * 100));
    const fillColor = stamina.isLow
      ? 'bg-red-500'
      : burst.active
        ? 'bg-amber-300'
        : 'bg-amber-500';
    return (
      <div className="flex justify-between items-start text-white font-mono gap-2">
        <div className="bg-black/70 px-3 py-2 rounded border border-amber-500">
          <div className="flex items-center gap-2 text-sm">
            <Target size={16} className="text-amber-400" />
            <span>Room ({roomCoord.col}, {roomCoord.row})</span>
          </div>
          <div className="text-xs text-amber-300 mt-1">
            Wave: {waveNum}
          </div>
          <div className="text-xs text-amber-300">
            Killed: {kills}
          </div>
        </div>

        <div className="bg-black/70 px-3 py-2 rounded border border-amber-500 min-w-[180px]">
          <div className="flex items-center gap-2 text-xs">
            <Zap
              size={14}
              className={
                burst.active
                  ? 'text-amber-300'
                  : stamina.isLow
                    ? 'text-red-400'
                    : 'text-amber-400'
              }
            />
            <span>Stamina</span>
            <span className="ml-auto tabular-nums">
              {Math.floor(stamina.value)}/{STAMINA_MAX}
            </span>
          </div>
          <div className="mt-1 h-2 w-full bg-black/60 rounded overflow-hidden border border-amber-500/40">
            <div
              className={`h-full ${fillColor} transition-[width] duration-100`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          {burst.active && (
            <div className="text-[10px] text-amber-200 mt-1 tabular-nums">
              Burst {burst.multiplier.toFixed(2)}×
            </div>
          )}
        </div>

        <button
          onClick={toggleSound}
          className="bg-black/70 p-2 rounded border border-amber-500 hover:bg-amber-500/20 transition-colors"
        >
          {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
      </div>
    );
  };

  const renderGameOverContent = () => (
    <div className="text-center text-white max-w-md mx-auto px-6 opacity-90">
      <h2 className="text-4xl font-bold text-red-400 mb-4 drop-shadow-lg">Game Over</h2>
      <p className="text-lg text-amber-200 mb-2 drop-shadow">
        You reached room ({roomCoord.col}, {roomCoord.row})
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

  return (
    <div
      ref={rootRef}
      className={`bg-gradient-to-br from-green-900 via-green-800 to-amber-900 flex flex-col items-center justify-center p-4 gap-4 ${
        forceLandscape ? 'overflow-hidden' : 'min-h-screen'
      }`}
      // Force-landscape transform: anchor the root off the right edge, give it
      // the viewport's swapped dimensions (100vh wide × 100vw tall), then rotate
      // 90° clockwise about the top-left so it fills the portrait screen as a
      // landscape frame. `fixed` descendants (the mobile joystick + action
      // buttons) re-anchor to this transformed root and rotate along with it.
      style={
        forceLandscape
          ? {
              position: 'fixed',
              top: 0,
              left: '100vw',
              width: '100vh',
              height: '100vw',
              transformOrigin: 'top left',
              transform: 'rotate(90deg)',
            }
          : undefined
      }
    >
      {/* Game Over / Victory are portrait-friendly decision menus and stay as a
          block above the canvas on mobile. The playing HUD is NOT here anymore —
          it's a semi-transparent overlay on the canvas (below), so it no longer
          steals layout height and break the landscape frame. */}
      {isMobile && (gameState === 'gameOver' || gameState === 'victory') && (
        <div className="w-full max-w-[936px]">
          {gameState === 'gameOver' && renderGameOverContent()}
          {gameState === 'victory' && renderVictoryContent()}
        </div>
      )}

      <div
        className="relative bg-black rounded-lg shadow-2xl border-4 border-amber-600 overflow-hidden w-full max-w-[936px]"
        style={canvasFitStyle}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block w-full h-auto"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* Game UI Overlay — semi-transparent stats drawn on top of the canvas,
            on both desktop and mobile. On mobile the extra right padding keeps
            the stamina/sound cluster clear of the A/B action buttons pinned
            top-right. */}
        {gameState === 'playing' && (
          <div className={`absolute top-4 left-4 right-4 ${isMobile ? 'pr-32' : ''}`}>
            {renderHud()}
          </div>
        )}

        {/* "Reached Boss" banner (Step 9). Non-blocking placeholder shown on
            both desktop and mobile while the player is in the boss arena. The
            boss fight + real win condition are deferred (roadmap §5.15); for
            now V claims a stub victory. */}
        {gameState === 'playing' && bossArena && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none z-10">
            <div className="bg-black/80 border-2 border-purple-500 rounded-lg px-6 py-3 text-center shadow-lg">
              <p className="text-purple-300 font-bold text-lg font-mono tracking-wide drop-shadow">
                Reached Boss
              </p>
              <p className="text-purple-200/80 text-xs font-mono mt-1">
                {/* The V win-stub is keyboard-only (desktop); mobile has no
                    bind, so don't tell touch players to press it. */}
                {isMobile
                  ? 'Boss fight coming soon'
                  : 'Press V to claim victory · boss fight coming soon'}
              </p>
            </div>
          </div>
        )}

        {/* Main Menu (overlays canvas on both mobile and desktop) */}
        {gameState === 'menu' && (
          <div className={`${isMobile ? 'fixed inset-0 z-50' : 'absolute inset-0'} bg-black/90 flex items-center justify-center`}>
            <div className="text-center text-white max-w-md mx-auto px-6">
              <h1 className={`${isMobile ? 'text-4xl' : 'text-6xl'} font-bold text-amber-400 mb-2 font-serif`}>
                Jungle Archer
              </h1>
              <p className={`text-lg text-amber-200 ${isMobile ? 'mb-4' : 'mb-8'} font-mono`}>
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
                      {isMobile ? 'Use the on-screen D-pad' : 'Arrow Keys (or W/S/D — A is dash)'}
                    </li>
                    <li><strong>Combat:</strong> Arrows fire when enemies are in sight</li>
                    <li>
                      <strong>Burst:</strong>{' '}
                      {isMobile ? 'Tap B for 5s rapid-fire' : 'Press Space for 5s rapid-fire'}
                      {' '}(costs stamina; spam loses bonus)
                    </li>
                    <li>
                      <strong>Dash:</strong>{' '}
                      {isMobile ? 'Tap A to blink backward' : 'Shift or A to blink backward'}
                      {' '}(opposite of facing, walls block)
                    </li>
                    <li><strong>Stamina:</strong> One bar for the whole run — no regen</li>
                    <li><strong>Strategy:</strong> Position for clear line of sight</li>
                    <li><strong>Warning:</strong> Avoid all enemy contact!</li>
                    <li><strong>Objective:</strong> Travel room to room toward the boss</li>
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
      </div>

      {isMobile && gameState === 'playing' && (
        <MobileControls
          onPress={handleMobilePress}
          onRelease={handleMobileRelease}
          onActionPress={handleActionPress}
          forceLandscape={forceLandscape}
        />
      )}
    </div>
  );
}

export default App;
