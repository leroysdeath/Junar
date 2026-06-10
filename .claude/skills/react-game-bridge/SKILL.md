---
name: react-game-bridge
description: The React ↔ game-state seam in Junar. UI state (menus, DOM overlays in App.tsx) lives in React; game state lives in plain TS classes in src/game/; the only bridge is the GameCallbacks object passed to Game's constructor. Use when adding React/DOM HUD overlays, wiring new game→UI signals via GameCallbacks, hoisting game state into React context/providers/stores, fixing useEffect / hook-lifecycle issues in App.tsx around the Game instance, or whenever a request would pull React/hooks into src/game/ or introduce a state library (Redux/Zustand/Jotai/MobX/Recoil/etc.). Not for canvas-drawn HUD elements (health bars, damage numbers, on-canvas score) — those belong to procedural-rendering.
---

# React ↔ game-state bridge

Junar has two universes:

- **UI** — React 18 + Tailwind, lives in `src/App.tsx`, `src/MobileControls.tsx` (floating joystick + A/B buttons on touch devices), and `src/main.tsx`. Renders menus, HUD overlays, game-over and victory screens.
- **Game** — plain TypeScript classes under `src/game/`, mutated in place. Owns the canvas, the game loop, the world.

They communicate through one narrow seam: the `GameCallbacks` object (`src/game/types.ts`) passed into `new Game(canvas, callbacks)`.

See CLAUDE.md §9, Guardrails for Claude ("Don't introduce a state library", "The callback bridge in App.tsx is the contract — extend it, don't replace it").

## How the bridge works today

The `initGame` `useCallback` in `src/App.tsx` (around `App.tsx:201-217`), invoked from the mount `useEffect`, constructs the game once per mount (the effect re-runs if `initGame`'s `soundEnabled` dependency changes, recreating the instance):

```ts
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
```

Each callback is a `useState` setter or a thin arrow wrapping one. The `Game` calls them at meaningful transitions (`Game.startRun`, `Game.gameOver`, `Game.victory`; `Game.enterRoom` for `onRoomChange`/`onBossArenaChange`; the wave-scheduler hooks for `onWaveChange`; plus every score, kill, enemy-count, stamina, and burst change). React re-renders; nothing else needs to know.

The cleanup contract: the mount `useEffect` return in `App.tsx` (around `App.tsx:241-247`) calls `gameRef.current?.cleanup()`. Anything new in `Game` that subscribes to `window` or schedules a timer must be released from `Game.cleanup()` (see `game-loop-time-and-cleanup`).

## Rules

1. **Don't import React or hooks from `src/game/`.** The game classes must run without React. Anything with `useEffect`, `useState`, `useRef`, JSX, or `react` in an import path doesn't belong under `src/game/`.

2. **Don't move game state into React.** Player position, enemy list, arrows, level data, animation frames — these live as plain class fields on `Game`/`Player`/`Enemy`/`Level` and are mutated in place every frame. Re-rendering React 60 times a second is the wrong tool.

3. **Don't add a state library.** Redux, Zustand, Jotai, MobX, Recoil, XState, etc. CLAUDE.md §9 forbids them. UI state stays in React's `useState`; game state stays in TS classes.

4. **Extend the bridge, don't replace it.** New game→UI signals (e.g., "family member died", "boss phase changed", "kill streak hit 5") should be added as new callback fields on `GameCallbacks` and called from `Game` at the right moment. The React side wires up a `useState` (or whatever local UI shape it needs) and reads it.

5. **UI→game inputs go through methods on the `Game` instance.** Current examples are `setSoundEnabled` and the mobile controls' path into the game: `setVirtualInput`, `triggerBurst`, `triggerDash`. For things like "pause when the menu opens" or "toggle a debug mode", add an instance method and call it from `App.tsx`. Don't reach into `Game`'s internals from React.

6. **Keyboard input is owned by `InputManager`, not by React handlers.** `InputManager` attaches listeners to `window`. Don't add `onKeyDown` to the canvas or to a React element to drive gameplay. The one sanctioned touch exception: the React pointer handlers in `MobileControls.tsx` funnel through `Game.setVirtualInput` / `triggerBurst` / `triggerDash` into `InputManager`, so the game loop sees one unified `InputState`. Don't add a second React input path outside that funnel.

## Adding a new game→UI signal — the pattern

1. Add the field to `GameCallbacks` in `src/game/types.ts`.
2. Wire a `useState` (or a more specific UI state) in `App.tsx` and pass the setter as the callback.
3. Call the callback from `Game` at the moment the value should change. Keep the callback signature minimal — pass the value, not internal objects.
4. If the new state needs to render in the canvas overlay, add the conditional JSX block in `App.tsx` next to the existing `gameState === 'playing'` (HUD, plus the `bossArena` "Reached Boss" banner) / `'menu'` / `'gameOver'` / `'victory'` branches. (The `GameState` union no longer has a `'levelComplete'` member.)

## Smells to push back on

- "Use a context provider so any component can read the player's position." → No; player position lives in `Player`, the canvas reads it directly.
- "Wrap `Game` in a React hook so we can use it like state." → No; `Game` is constructed once per mount via a `useEffect` + `useRef` and never re-rendered.
- "Add Redux/Zustand for game state." → No; CLAUDE.md §9.
- "Convert the entities to React components." → No; canvas-2d procedural rendering is the chosen art direction (see `procedural-rendering`).
- "Read `gameRef.current.player.position` directly in a render path." → No; if React needs it, expose it through the callback bridge.
