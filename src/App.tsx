import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { Play, RotateCcw, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { Game } from './game/Game';
import { GameState, RoomGridCoord } from './game/types';
import { Direction } from './game/InputManager';
import { CANVAS_WIDTH, CANVAS_HEIGHT, STAMINA_MAX } from './game/constants';
import { MobileControls, Action } from './MobileControls';
import {
  SubmitScoreForm,
  LeaderboardBoards,
  PrivacyNoticeBody,
} from './SubmitScoreForm';

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
function orientationApi(): {
  lock?: (o: string) => Promise<void>;
  unlock?: () => void;
} | null {
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

// Centered title-screen pop-up shell shared by How to Play and Credits. Covers
// the menu, dismissed via the header ✕, the "Back to Title" button, a backdrop
// click, or Escape. The body is height-capped and scrolls internally so long
// content never clips on short frames (notably mobile landscape). Mirrors the
// menu's mobile fixed / desktop absolute positioning, one layer above.
function TitleModal({
  title,
  isMobile,
  onClose,
  children,
  centerTitle = false,
}: {
  title: string;
  isMobile: boolean;
  onClose: () => void;
  children: ReactNode;
  centerTitle?: boolean;
}) {
  // Escape-to-close. The listener lives for the modal's lifetime only (it
  // mounts when open, unmounts when closed) so it never swallows keys during
  // play. onClose is read through a ref so the subscription stays mount-once.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className={`${isMobile ? 'fixed inset-0 z-[60]' : 'absolute inset-0 z-20'} bg-black/95 flex items-center justify-center p-4`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full max-w-md max-h-full overflow-hidden bg-black/90 border border-amber-500 rounded-lg text-left shadow-2xl"
      >
        <div
          className={`flex items-center border-b border-amber-500/40 px-6 py-3 shrink-0 ${
            centerTitle ? 'relative justify-center' : 'justify-between'
          }`}
        >
          <h3 className="text-amber-400 font-bold text-lg">{title}</h3>
          <button
            onClick={onClose}
            aria-label={`Close ${title}`}
            className={`text-amber-300 hover:text-amber-100 transition-colors ${
              centerTitle ? 'absolute right-6 top-1/2 -translate-y-1/2' : ''
            }`}
          >
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto text-sm text-amber-100 px-6 py-4">
          {children}
        </div>
        <div className="border-t border-amber-500/40 px-6 py-3 shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-2.5 px-8 rounded-lg transition-all duration-200 text-base border-2 border-amber-500"
          >
            Back to Title
          </button>
        </div>
      </div>
    </div>
  );
}

// Clickable attribution link used in the Credits modal. Opens in a new tab
// with noopener/noreferrer. (When the game is later wrapped in Tauri, external
// links will route through the shell opener instead of a browser tab — a
// post-prototype concern; standard for the current web build.)
function CreditLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-amber-300 underline underline-offset-2 hover:text-amber-100 transition-colors"
    >
      {children}
    </a>
  );
}

// Format a run duration (ms) as m:ss for the Game Over screen.
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
  // Run duration (ms) captured at game over via onRunEnd; shown on the Game
  // Over screen as a m:ss "Time" stat.
  const [runElapsedMs, setRunElapsedMs] = useState(0);
  // Live in-room enemy count from onEnemiesChange. Kept wired (the signal is
  // used elsewhere in the game) but no longer shown in the HUD — only the
  // setter is needed, so the value binding is dropped to satisfy noUnusedLocals.
  const [, setEnemiesRemaining] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [stamina, setStamina] = useState({ value: STAMINA_MAX, isLow: false });
  const [burst, setBurst] = useState({ active: false, multiplier: 1 });
  const [sprint, setSprint] = useState({ active: false, multiplier: 1 });
  // Boss-arena sub-state (Step 9): true while the player is inside anchor 10.
  // Drives the non-blocking "Reached Boss" banner; the game stays in 'playing'.
  const [bossArena, setBossArena] = useState(false);
  const isMobile = useIsMobile();
  const isPortrait = useIsPortrait();
  // Force-landscape: on a touch device held portrait, rotate the whole game 90°
  // via CSS so the fixed-aspect canvas always reads as landscape (the standard
  // web fallback where orientation.lock is rejected). Applied across every
  // state — menu, play, and Game Over / Victory all stay landscape so the
  // orientation never flips between screens.
  const forceLandscape = isMobile && isPortrait;

  // On mobile during play, cap the canvas so the *whole* board fits the
  // landscape frame instead of being sized purely by width (which overflowed
  // the rotated frame's height and clipped the top/bottom of the board). The
  // cap is the smaller of the frame's width and the width implied by fitting
  // the 928×544 board into the frame's height; the two axes swap when we've
  // force-rotated the frame 90°. p-4 (1rem each side) is subtracted so the
  // board clears the root padding.
  const canvasFitStyle = isMobile
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
      gameRef.current?.triggerSprint();
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
        onRunEnd: setRunElapsedMs,
        onEnemiesChange: setEnemiesRemaining,
        onStaminaChange: (value, isLow) => setStamina({ value, isLow }),
        onBurstChange: (active, multiplier) => setBurst({ active, multiplier }),
        onSprintChange: (active, multiplier) =>
          setSprint({ active, multiplier }),
        soundEnabled,
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

  // Return to the title screen via the Game instance so its internal state
  // and the audio scene (menu music) follow; Game echoes the change back
  // through onStateChange. Falls back to a bare state swap pre-init.
  const goToMenu = () => {
    if (gameRef.current) {
      gameRef.current.returnToMenu();
    } else {
      setGameState('menu');
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
    // Energy bar fill — red when low, warm gold while bursting, amber
    // otherwise. Width is rounded so the bar visibly steps as the value
    // crosses each percent boundary. Burst and sprint share this one pool;
    // each shows its own multiplier line below the bar when active.
    const fillPct = Math.max(
      0,
      Math.min(100, (stamina.value / STAMINA_MAX) * 100),
    );
    // Mango overcap: energy can exceed STAMINA_MAX (up to ~125). The bar stays
    // full yellow at/above 100 and the leftmost (value−100) points paint GREEN
    // to signal the surplus (104 → 4% green band). 1 energy point = 1% of the
    // STAMINA_MAX-wide bar, so the surplus maps 1:1 to percent width; clamp to
    // 25 (the 5-mango ceiling) so the band can't overrun the track.
    const overcapPct = Math.max(0, Math.min(25, stamina.value - STAMINA_MAX));
    const fillColor = stamina.isLow
      ? 'bg-red-500'
      : burst.active
        ? 'bg-amber-300'
        : 'bg-amber-500';
    return (
      <div className="flex justify-between items-start text-white font-mono gap-2">
        <div className="bg-black/70 px-2 py-1.5 rounded border border-amber-500">
          <div className="text-xs text-amber-300">
            Room ({roomCoord.col}, {roomCoord.row})
          </div>
          <div className="text-xs text-amber-300 mt-1">Wave: {waveNum}</div>
          <div className="text-xs text-amber-300">Killed: {kills}</div>
        </div>

        <div className="bg-black/70 px-2 py-1 rounded border border-amber-500 min-w-[120px] ml-auto">
          <div className="flex items-center gap-2 text-xs">
            <span>Energy</span>
          </div>
          <div className="relative mt-1 h-1 w-full bg-black/60 rounded overflow-hidden border border-amber-500/40">
            <div
              className={`h-full ${fillColor} transition-[width] duration-100`}
              style={{ width: `${fillPct}%` }}
            />
            {overcapPct > 0 && (
              <div
                className="absolute left-0 top-0 h-full bg-emerald-500 transition-[width] duration-100"
                style={{ width: `${overcapPct}%` }}
              />
            )}
          </div>
          {burst.active && (
            <div className="text-[10px] text-amber-200 mt-1 tabular-nums">
              Burst {burst.multiplier.toFixed(2)}×
            </div>
          )}
          {sprint.active && (
            <div className="text-[10px] text-sky-200 mt-1 tabular-nums">
              Sprint {sprint.multiplier.toFixed(2)}×
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGameOverContent = () => (
    <div className="text-center text-white max-w-md mx-auto px-6 py-3 max-h-full overflow-y-auto opacity-90">
      <h2 className="text-3xl font-bold text-red-400 mb-1 drop-shadow-lg">
        Game Over
      </h2>
      <p className="text-sm text-amber-300 mb-2 drop-shadow">
        Time {formatDuration(runElapsedMs)} · Kills {kills} · Score {score}
      </p>

      <SubmitScoreForm score={score} elapsedMs={runElapsedMs} outcome="death" />

      <div className="space-y-2 mt-3">
        <button
          onClick={restartGame}
          className="w-full bg-gradient-to-r from-red-600/90 to-red-700/90 hover:from-red-500 hover:to-red-600 text-white font-bold py-2.5 px-8 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-base border-2 border-red-500"
        >
          <RotateCcw size={20} />
          Try Again
        </button>

        <button
          onClick={goToMenu}
          className="w-full bg-gradient-to-r from-amber-600/90 to-amber-700/90 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-2 px-8 rounded-lg transition-all duration-200 text-sm border-2 border-amber-500"
        >
          Main Menu
        </button>
      </div>
    </div>
  );

  const renderVictoryContent = () => (
    <div className="text-center text-white max-w-md mx-auto px-6 py-3 max-h-full overflow-y-auto">
      <h2 className="text-3xl font-bold text-yellow-400 mb-1">Victory!</h2>
      <p className="text-sm text-amber-200 mb-0.5">
        You have conquered the jungle!
      </p>
      <p className="text-sm text-yellow-300 mb-2">
        Time {formatDuration(runElapsedMs)} · Kills {kills} · Score {score}
      </p>

      <SubmitScoreForm
        score={score}
        elapsedMs={runElapsedMs}
        outcome="victory"
      />

      <div className="space-y-2 mt-3">
        <button
          onClick={startGame}
          className="w-full bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 text-black font-bold py-2.5 px-8 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-base border-2 border-yellow-500"
        >
          <Play size={20} />
          Play Again
        </button>

        <button
          onClick={goToMenu}
          className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-2 px-8 rounded-lg transition-all duration-200 text-sm border-2 border-amber-500"
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
            on both desktop and mobile. The A/B action buttons sit lower-right
            (MobileControls), so the HUD needs no clearance padding. */}
        {gameState === 'playing' && (
          <div className="absolute top-1 left-1 right-1">{renderHud()}</div>
        )}

        {/* Sound toggle — pinned to the lower-left corner of the board, clear of
            the lower-right A/B action buttons on mobile. */}
        {gameState === 'playing' && (
          <button
            onClick={toggleSound}
            className="absolute bottom-1 left-1 bg-black/70 p-2 rounded border border-amber-500 hover:bg-amber-500/20 transition-colors text-white"
          >
            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        )}

        {/* "Reached Boss" banner (Step 9). Non-blocking placeholder shown on
            both desktop and mobile while the player is in the boss arena. The
            boss fight is deferred (roadmap §5.15); for now walking into the
            corrupted growth at the arena center claims a stub victory — a
            positional trigger, so the same copy works for keyboard, touch,
            and gamepad alike. */}
        {gameState === 'playing' && bossArena && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none z-10">
            <div className="bg-black/80 border-2 border-purple-500 rounded-lg px-6 py-3 text-center shadow-lg">
              <p className="text-purple-300 font-bold text-lg font-mono tracking-wide drop-shadow">
                Reached Boss
              </p>
              <p className="text-purple-200/80 text-xs font-mono mt-1">
                Reach the corrupted growth · boss fight coming soon
              </p>
            </div>
          </div>
        )}

        {/* Main Menu (overlays canvas on both mobile and desktop) */}
        {gameState === 'menu' && (
          <div
            className={`${isMobile ? 'fixed inset-0 z-50' : 'absolute inset-0'} bg-black/90 flex items-center justify-center`}
          >
            <div className="text-center text-white max-w-md mx-auto px-6">
              <h1
                className={`${isMobile ? 'text-4xl mb-6' : 'text-6xl mb-8'} font-bold text-amber-400 font-serif whitespace-nowrap`}
              >
                Jungle X
              </h1>

              <div className="space-y-4">
                <button
                  onClick={startGame}
                  className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 flex items-center justify-center gap-3 text-lg border-2 border-green-500"
                >
                  Start
                </button>

                <button
                  onClick={() => setShowInstructions(true)}
                  className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 text-base border-2 border-amber-500"
                >
                  How to Play
                </button>

                <button
                  onClick={() => setShowLeaderboard(true)}
                  aria-label="Leaderboard"
                  title="Leaderboard"
                  className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 text-base border-2 border-amber-500 flex items-center justify-center"
                >
                  <Trophy size={24} />
                </button>
              </div>
            </div>

            {/* Credits — a small link tucked into the bottom-right corner of
                the menu overlay instead of the main button stack. When the root
                is force-rotated into landscape the menu's "bottom-right" maps to
                the physical bottom-left of the phone, and the landscape's right
                edge lands at the physical bottom where Safari's toolbar / home
                indicator sit — clipping the label to "Cred…". So we inset it the
                same way the in-play A/B buttons do (safe-area + toolbar
                clearance) to keep it fully on-screen. */}
            <div
              className="absolute flex items-center gap-2"
              style={{
                bottom: forceLandscape
                  ? 'calc(env(safe-area-inset-left, 0px) + 0.75rem)'
                  : '0.75rem',
                right: forceLandscape
                  ? 'calc(env(safe-area-inset-bottom, 0px) + 5rem)'
                  : '0.75rem',
              }}
            >
              <button
                onClick={() => setShowPrivacy(true)}
                className="text-xs font-semibold text-amber-300 hover:text-white py-1.5 px-3 rounded-md border border-amber-500 hover:bg-amber-600/80 transition-colors"
              >
                Privacy
              </button>
              <button
                onClick={() => setShowCredits(true)}
                className="text-xs font-semibold text-amber-300 hover:text-white py-1.5 px-3 rounded-md border border-amber-500 hover:bg-amber-600/80 transition-colors"
              >
                Credits
              </button>
            </div>
          </div>
        )}

        {/* How-to-Play modal — opened from the title screen's "How to Play"
            button. See TitleModal for the shared shell + dismissal behavior. */}
        {gameState === 'menu' && showInstructions && (
          <TitleModal
            title="How to Play"
            isMobile={isMobile}
            centerTitle
            onClose={() => setShowInstructions(false)}
          >
            <ul className="space-y-3">
              <li>
                <strong>Movement:</strong>
                <div className="ml-4">Arrow Keys or W/S/D/A (Desktop)</div>
                <div className="ml-4">
                  Touch the left half of the screen (Mobile)
                </div>
              </li>
              <li>
                <strong>Burst Fire:</strong>
                <div className="ml-4">Space (Desktop)</div>
                <div className="ml-4">B button (Mobile)</div>
              </li>
              <li>
                <strong>Sprint:</strong>
                <div className="ml-4">Shift (Desktop)</div>
                <div className="ml-4">A button (Mobile)</div>
              </li>
            </ul>
          </TitleModal>
        )}

        {/* Credits modal — opened from the title screen's "Credits" button.
            Attribution for sourced art and audio. CC-BY entries (NPC
            sprites, snake) are legally required; the "Dark Forest Theme" music
            line is a courtesy credit the author asks be kept; the rest are CC0
            / paid royalty-free, acknowledged here as good practice. Source of
            truth: docs/ART-CREDITS.md and docs/AUDIO-CREDITS.md. */}
        {gameState === 'menu' && showCredits && (
          <TitleModal
            title="Credits"
            isMobile={isMobile}
            onClose={() => setShowCredits(false)}
          >
            <div className="space-y-4">
              <section>
                <h4 className="text-amber-400 font-semibold mb-1">Art</h4>
                <ul className="space-y-2">
                  <li>
                    Player sprite — ArMM1998,{' '}
                    <CreditLink href="https://opengameart.org/content/zelda-like-tilesets-and-sprites">
                      “Zelda-like tilesets and sprites”
                    </CreditLink>{' '}
                    (CC0).
                  </li>
                  <li>
                    NPC sprites — Charles Gabriel (Antifarea), commissioned by{' '}
                    <CreditLink href="https://opengameart.org">
                      OpenGameArt.org
                    </CreditLink>{' '}
                    —{' '}
                    <CreditLink href="https://creativecommons.org/licenses/by/3.0/">
                      CC-BY 3.0
                    </CreditLink>
                    . Recolored and recomposed.
                  </li>
                  <li>
                    Snake —{' '}
                    <CreditLink href="https://thkaspar.itch.io/tth-animals">
                      “Tiny, Tiny Heroes – Animals”
                    </CreditLink>{' '}
                    by Kacper Woźniak (thkaspar) —{' '}
                    <CreditLink href="https://creativecommons.org/licenses/by/4.0/">
                      CC BY 4.0
                    </CreditLink>
                    . Recolored.
                  </li>
                  <li>
                    Panther, bear &amp; gibbon — Time Fantasy by Jason Perry,{' '}
                    <CreditLink href="https://timefantasy.net">
                      timefantasy.net
                    </CreditLink>{' '}
                    (
                    <CreditLink href="https://finalbossblues.itch.io/animals-sprite-pack">
                      pack 1
                    </CreditLink>{' '}
                    ·{' '}
                    <CreditLink href="https://finalbossblues.itch.io/animals-2">
                      pack 2
                    </CreditLink>
                    ).
                  </li>
                </ul>
              </section>
              <section>
                <h4 className="text-amber-400 font-semibold mb-1">Audio</h4>
                <ul className="space-y-2">
                  <li>
                    Boss music —{' '}
                    <CreditLink href="https://opengameart.org/content/dark-forest-theme">
                      “Dark Forest Theme”
                    </CreditLink>{' '}
                    — The Cynic Project /{' '}
                    <CreditLink href="https://cynicmusic.com">
                      cynicmusic.com
                    </CreditLink>{' '}
                    / pixelsphere.org.
                  </li>
                  <li>
                    Menu music — tambura drone by Kaczinski —{' '}
                    <CreditLink href="https://freesound.org/people/Kaczinski/sounds/506312/">
                      Freesound
                    </CreditLink>{' '}
                    (CC0).
                  </li>
                  <li>
                    Ambience —{' '}
                    <CreditLink href="https://freesound.org/people/marc.om/sounds/804838/">
                      marc.om
                    </CreditLink>
                    ,{' '}
                    <CreditLink href="https://freesound.org/people/Resaural/sounds/467026/">
                      Resaural
                    </CreditLink>{' '}
                    (CC0).
                  </li>
                  <li>
                    Sound effects —{' '}
                    <CreditLink href="https://freesound.org/people/arcandio/sounds/347884/">
                      arcandio
                    </CreditLink>
                    ,{' '}
                    <CreditLink href="https://freesound.org/people/Faulkin/sounds/336495/">
                      Faulkin
                    </CreditLink>
                    ,{' '}
                    <CreditLink href="https://freesound.org/people/AudioPapkin/sounds/541029/">
                      AudioPapkin
                    </CreditLink>
                    ,{' '}
                    <CreditLink href="https://freesound.org/people/Rob_Marion/sounds/541985/">
                      Rob_Marion
                    </CreditLink>{' '}
                    (CC0, via Freesound).
                  </li>
                </ul>
              </section>
              <p className="text-xs text-amber-200/70">
                Assets used under CC0, CC-BY, or paid royalty-free licenses. No
                AI generated assets were used in this game.
              </p>
            </div>
          </TitleModal>
        )}

        {/* Privacy modal — opened from the menu's "Privacy" link. Reuses the
            same PrivacyNoticeBody rendered by the submit form's modal so the
            disclosure text lives in one place. */}
        {gameState === 'menu' && showPrivacy && (
          <TitleModal
            title="Privacy"
            isMobile={isMobile}
            centerTitle
            onClose={() => setShowPrivacy(false)}
          >
            <PrivacyNoticeBody />
          </TitleModal>
        )}

        {/* Leaderboard modal — opened from the title screen's "Leaderboard"
            button. Two tabs (High Score / Time), top 20 each, fetched from
            /api/leaderboard. See TitleModal for the shared shell + dismissal. */}
        {gameState === 'menu' && showLeaderboard && (
          <TitleModal
            title="Leaderboard"
            isMobile={isMobile}
            centerTitle
            onClose={() => setShowLeaderboard(false)}
          >
            <LeaderboardBoards />
          </TitleModal>
        )}

        {/* Game Over Screen — overlays the canvas on both desktop and mobile so
            it sits inside the (force-rotated) landscape frame. */}
        {gameState === 'gameOver' && (
          <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
            {renderGameOverContent()}
          </div>
        )}

        {/* Victory Screen — overlays the canvas on both desktop and mobile. */}
        {gameState === 'victory' && (
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
