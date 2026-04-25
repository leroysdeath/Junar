---
name: game-loop-time-and-cleanup
description: Game-loop time sources and cleanup discipline in Junar. Use when adding cooldowns, timers, animations, event listeners, or anything in src/game/ that uses Date.now / performance.now / setTimeout / setInterval / requestAnimationFrame. Game timing flows from the gameLoop's currentTime (a performance.now value passed by rAF); Date.now is for wall-clock things only; every window subscription or timer must be disposable from Game.cleanup().
---

# Game-loop time and cleanup

Two related rules: the time source you read, and the cleanup you owe.

See CLAUDE.md §8 ("Use `Date.now()` only for wall-clock things", "Always clean up listeners and timers").

## Time sources

The game loop is `Game.gameLoop(currentTime)` (`Game.ts:132`), invoked by `requestAnimationFrame`. `currentTime` is a `performance.now()` value that rAF passes in. **That `currentTime`, threaded through `update(deltaTime, currentTime)`, is the canonical clock for in-game timing.**

| Use case | Right source |
|---|---|
| "Has 500 ms passed since the last arrow?" | `currentTime` from the loop |
| "How long has this level been running?" | start time captured from the loop, deltas against `currentTime` |
| "What's the wall-clock time of this crash report?" | `Date.now()` / `new Date().toISOString()` |
| "Stamp a log event with elapsed ms since session start" | `performance.now()` (this is what `CrashLogger` does, `Logger.ts:65`) |

Why it matters: `Date.now()` jumps when the OS clock changes (NTP sync, daylight saving, manual edits). It also doesn't pause cleanly when the loop is paused. Mixing `Date.now()` cooldowns with `currentTime`-driven game state produces pause/resume bugs and intermittent glitches that don't reproduce.

### Known deviations (don't copy these patterns)

- `Enemy.update` (`Enemy.ts:39`) uses `Date.now()` for the 200 ms pathfind repoll. It works today but should drift to `currentTime` when the file is touched. Don't add new `Date.now()` reads in `src/game/` — thread the loop time down instead.
- `Game.levelStartedAt` and `Game.classifyGameOver` use `performance.now()` directly rather than the loop's `currentTime` (`Game.ts:123`, `Game.ts:656`). Same story — works today, but the consistent pattern is to read from the loop.

If you're touching one of these files, prefer migrating to loop time over preserving the deviation.

## Cleanup discipline

`Game.cleanup()` (`Game.ts:732`) is called from `App.tsx`'s `useEffect` return when the React component unmounts. **Anything you add that subscribes to `window`/`document` or schedules a timer must be released here**, or React StrictMode (which mounts twice in dev) will leak listeners and confuse input.

Existing examples to match:

- `InputManager` (`InputManager.ts`) attaches `keydown` / `keyup` / `blur` to `window`, exposes `dispose()`. `Game.cleanup()` calls it.
- `CrashLogger` (`Logger.ts`) attaches `error` / `unhandledrejection` / `keydown` to `window`, exposes `dispose()`. `Game.cleanup()` calls it.
- The level-transition `setTimeout` (`Game.ts:582`) is held in `levelTransitionTimeoutId`; `clearLevelTransitionTimeout()` clears it on restart, gameOver, and cleanup.
- `requestAnimationFrame`'s id is held in `animationId`; `Game.cleanup()` and the crash handler `cancelAnimationFrame` it.

The pattern is: **store the handle, clear/remove it in `cleanup()`/`dispose()`, and route `cleanup()` to call any per-subsystem disposer.**

## Anti-patterns to push back on

- `setInterval(...)` without storing the id. Almost always wrong; use the loop instead, or store the id and clear it in cleanup.
- `window.addEventListener(...)` inside a class without a matching `removeEventListener` in `dispose()`. You need a stored function reference (an arrow-function class field, like `InputManager.handleKeyDown`).
- `setTimeout(() => this.something(), N)` for game logic. Race condition risk on restart/cleanup; if you use it, follow the `levelTransitionTimeoutId` guard pattern: store the id, null it inside the callback, clear on restart and cleanup.
- `Date.now()` for new gameplay timing. Use loop `currentTime`.
- `requestAnimationFrame` outside the single loop in `Game`. There's one rAF; new animation should ride on the existing `update`/`render` cycle.
- Leaving the `try` in `gameLoop` to swallow errors silently. The current pattern routes through `CrashLogger.captureCrash` and halts; don't bypass it (see `crash-logger-channel`).
