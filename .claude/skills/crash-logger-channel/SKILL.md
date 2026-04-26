---
name: crash-logger-channel
description: Junar's structured crash + event logger (src/game/Logger.ts) and its /api/crash Vercel Edge sink. Owns the closed LogCategory and CrashPhase unions, the ring-buffer event log via CrashLogger.log(category, msg, data), suspicious-death classification, the non-halting gameOver auto-report, the halting red canvas crash overlay, and the CrashSnapshot payload that fingerprints into a GitHub issue. Use when adding console.log inside src/game/, adding a LogCategory or CrashPhase variant, changing CrashSnapshot or its fingerprint, editing the crash overlay, or touching Logger.ts / api/crash.ts. Not for UI-facing React callbacks (see react-game-bridge) or general listener cleanup (see game-loop-time-and-cleanup).
---

# Crash logger and event channel

Junar has a structured event log that doubles as a crash reporter. Use it instead of `console.log`, and treat the snapshot shape as a contract with the Vercel Edge function on the other end.

## What's in place

- `src/game/Logger.ts` — `CrashLogger` keeps a 1000-event ring buffer of `LogEvent { t, cat, msg, data? }`, hooks `window.error`, `window.unhandledrejection`, and a `keydown` for the post-crash R-to-reload, and exposes `log()`, `captureCrash()`, `reportNonHalting()`, `renderOverlay()`, `dispose()`.
- `src/game/Game.ts` — owns the logger; calls `log()` at lifecycle moments (`'lifecycle'`, `'level'`, `'state'`, `'fire'`, `'hit'`, `'collision'`, `'input'`, `'wall'`, `'sample'`). The game loop wraps `update`/`render` in `try/catch` and routes errors through `captureCrash`.
- `api/crash.ts` — Vercel Edge function. Hashes `error|stack[0..1]` to a 10-char fingerprint; opens a new GitHub issue tagged `crash` / `death` / `suspicious-death`, or comments on the existing open one with that fingerprint.

Two flavors of report:
- **Halting** — `captureCrash()` paints the red overlay (`renderOverlay`), cancels rAF, and POSTs. Used for real exceptions and "suspicious gameOver" verdicts.
- **Non-halting** — `reportNonHalting()` POSTs every regular `gameOver` so kills are visible in GitHub without interrupting the player.

## Categories

`LogCategory` (`Logger.ts:8`) is a closed union:

```ts
'lifecycle' | 'level' | 'state' | 'fire' | 'hit' | 'collision'
| 'input' | 'sample' | 'wall' | 'warn' | 'error'
```

`CrashPhase` (`Logger.ts:28`) is also closed:

```ts
'gameLoop' | 'update' | 'render' | 'global' | 'unhandledRejection'
| 'gameOver' | 'suspicious'
```

Adding a new category or phase means editing `Logger.ts` (the union) — TypeScript will flag every `log(cat, ...)` call site that needs updating. The `api/crash.ts` `PHASE_LABELS` map maps phases to GitHub labels; new phases default to `'crash'` until you add them there.

## Rules

1. **Use `logger.log(cat, msg, data?)` for game events, not `console.log`.** The logger's events are what flow into the GitHub issue body when something crashes — `console.log` is invisible to the report. `console.warn` / `console.error` are fine for genuinely-unexpected paths the player shouldn't see; the logger's own diagnostic channels (`'warn'`, `'error'`) cover the rest.

2. **Pick from the existing `LogCategory` first.** Most new events fit one (`'state'` for game-state transitions, `'collision'` for kills, `'fire'` for shots, `'hit'` for damage, `'sample'` for periodic telemetry, `'lifecycle'` for cleanup/restart). Add a new category only when it's a genuinely new dimension and update the union deliberately.

3. **`data` should be plain JSON, small, and round-numbered.** The logger does not stringify objects you forgot about; it just passes them through `JSON.stringify` later. The existing helper is `round2(n) = Math.round(n*100)/100` (`Game.ts:29`) — match that. Don't log raw `Vector2`, `Player`, or `Enemy` instances; pull the fields you actually want.

4. **Don't bypass `try/catch` in the game loop.** The `gameLoop` (`Game.ts:139`) calls `captureCrash` on any thrown error inside `update`/`render`. Don't wrap your own `try/catch` that swallows errors silently — let them propagate so the snapshot is built.

5. **The `CrashSnapshot` shape is a contract.** `api/crash.ts` expects `error`, `stack`, `phase`, `frame`, `uptimeMs`, `state`, `events`, `userAgent`, `url`, `capturedAt`. Changing the shape (renaming fields, changing types) means updating both `Logger.ts` and `api/crash.ts` together.

6. **Don't change the fingerprint algorithm casually.** It's `SHA-1(error|stack[0..1])`, 10 hex chars (`api/crash.ts:fingerprintOf`). Changing it splits existing recurrence threads — every crash starts opening fresh issues. If you do change it, accept the disruption deliberately.

7. **Snapshot provider is bounded.** `Game.snapshotState()` (`Game.ts:152`) wraps each field in its own `try/catch` so a broken player or enemy can't break crash reporting. Match that pattern when adding new fields — the snapshot must succeed even when the game is in a bad state.

## Pattern: emitting a new event

```ts
this.logger.log('collision', 'family-death', {
  member: 'wife',
  level: this.currentLevelIndex + 1,
  msSinceLevelStart: Math.round(performance.now() - this.levelStartedAt),
});
```

If the new event should also halt the game (like "suspicious"), follow the `gameOver` pattern: log it, build an `Error`, call `captureCrash` (or throw inside `update` so the loop's `try/catch` catches it).

## Don't

- Don't `console.log` from `src/game/` for diagnostic state. Use the logger.
- Don't add a fetch-based reporting path that bypasses `report()` — keep the single endpoint.
- Don't grow the ring buffer beyond `MAX_EVENT_BUFFER` (1000). Body-size cap is enforced server-side at 128 KB; bigger snapshots will be rejected.
- Don't change `REPORT_ENDPOINT` (`/api/crash`) without confirming the Vercel function path matches.
- Don't remove the `keepalive: true` on the fetch — it's what lets the report finish when the page is reloading after the crash overlay.

## Local testing

`window.__JUNGLE_CRASH__` (`Logger.ts:59`) holds the most recent snapshot in dev. Inspect it in the console after a crash. Press `R` on the crash overlay to reload (`handleReloadKey`).
