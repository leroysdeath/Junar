# Junar — Invariants

**Status:** Hard rules that must hold after any commit. Mechanically checkable by an evaluator agent; a small number of items requiring prose / copy review are explicitly tagged "Manual review required."

**Purpose:** Gate feature commits. An evaluator applies each "Verify" step and rejects any PR that violates a rule.

**Source:** Consolidated from `README.md` (Pillars, Guardrails), `CLAUDE.md` (Pillars §3, Guardrails §9, Distribution §8), and verified against `src/game/`, `package.json`, and `tsconfig.app.json`.

---

## Format

Each invariant is phrased as a **violation predicate** — an evaluator answers "did this PR violate it? yes/no."

- **Rule:** the violation predicate
- **Verify:** concrete check — file path + grep pattern / function name / test command, or explicit "Manual review required"
- **Source:** doc + section

---

## Invariants

### 1. Auto-fire only — no manual aim or click-to-fire
**Rule:** Arrows fire automatically at the nearest visible enemy. No `click` / `mousedown` listener may trigger firing. No UI for target selection. No angle-snapping or lane-snapping in the fire path.
**Verify:**
- `grep -n "addEventListener.*click" src/game/Game.ts` — hits must be for menu-state transitions only, never fire.
- `grep -rn "click\|mousedown" src/game/*.ts | grep -iE "fire|shoot|aim"` returns no hits.
- `grep -rEn "angle.*snap|snap.*angle|lane.*snap" src/game/` returns no hits.
**Source:** CLAUDE.md §3 Pillars "Tactical positioning over twitch"; §9 Guardrails "Don't break the 360-LOS auto-fire contract"

### 2. No ranged enemy attacks
**Rule:** Enemies threaten by AABB contact only. No projectile fired by an enemy, no AoE damage, no ranged hit.
**Verify:**
- `grep -rEn "fireProjectile|spawnProjectile|enemyBullet|enemyArrow|rangeAttack|aoeDamage" src/game/Enemy.ts` returns no hits.
- No method on `Enemy` produces an arrow / projectile / damage event at a distance.
- When a boss class is added, the same rule applies to it.
**Source:** CLAUDE.md §5 Mechanics "No ranged attacks"; §9 Guardrails

### 3. Approved enemy types only
**Rule:** `EnemyType` in `src/game/types.ts` is exactly the union `'panther' | 'snake' | 'gibbon' | 'bear'`. No additional types without owner approval.
**Verify:**
- `grep -A2 "type EnemyType" src/game/types.ts` shows exactly those four members.
- `grep -rEi "tiger|crocodile|jackal|wolf|hyena|leopard" src/game/` returns no hits (only acceptable in CLAUDE.md / README guardrails as "not approved" examples).
**Source:** CLAUDE.md §5 Mechanics; §9 Guardrails "No new enemy type may be added without explicit owner approval"

### 4. Player is the only sprite-asset entity
**Rule:** Only the player-rendering code path imports / uses a sprite image. Enemies, NPCs, huts, arrows, walls, HUD, and FX render via procedural Canvas 2D fills.
**Verify:**
- `grep -rEn "import.*from.*assets|\\.png|\\.jpg|\\.webp" src/game/` returns only the player-sprite import in `Renderer.ts`.
- `Renderer.renderEnemies`, `Renderer.renderNpcs`, `Renderer.renderHuts`, `Renderer.renderArrows` use only `ctx.fillRect`, `ctx.fill`, `ctx.stroke`, `ctx.beginPath` — never `ctx.drawImage`.
- `Renderer.renderPlayer` is the sole `ctx.drawImage` call site.
**Source:** CLAUDE.md §3 Pillars "Readable at a glance"; §9 Guardrails "Player is the only entity allowed to use a real sprite asset"

### 5. No state library; plain TS mutation only
**Rule:** UI state lives in React; game state lives in plain TS classes mutated in place. No Redux, Zustand, Jotai, MobX, Recoil, or equivalent.
**Verify:**
- `grep -iE "redux|zustand|jotai|mobx|recoil" package.json` returns no hits.
- `grep -rEi "redux|zustand|jotai|mobx|recoil" src/` returns no hits.
- `grep -rEn "\\.dispatch\\(|useAtom|useSelector|useStore" src/` returns no hits.
**Source:** CLAUDE.md §9 Guardrails "Don't introduce a state library"

### 6. No engine migration; Canvas 2D only
**Rule:** The game runs on `CanvasRenderingContext2D`. No Phaser, Pixi, Three.js, Babylon, Excalibur. No WebGL.
**Verify:**
- `grep -iE "phaser|pixi|three|babylon|excalibur" package.json src/` returns no hits.
- `grep -En "webgl|WebGL|WebGL2" src/game/` returns no hits.
- `Renderer` constructor signature accepts `CanvasRenderingContext2D` only.
**Source:** CLAUDE.md §3 Pillars; §9 Guardrails "Don't migrate to a game engine"

### 7. Magic numbers live only in `src/game/constants.ts`
**Rule:** The literals `928`, `544`, `400`, `450`, `500`, and `32`/`16` (when used as canvas / tile geometry) appear only in `src/game/constants.ts`. Other modules import the named constant.
**Verify:**
- `grep -rEn "\\b(928|544|400|450|500)\\b" src/game/*.ts | grep -v "constants.ts"` returns no hits.
- `grep -rEn "\\b(32|16)\\b" src/game/*.ts | grep -v -E "constants.ts|TILE_SIZE|PLAYER_SIZE|HALF_TILE"` — remaining hits must be unrelated to canvas / tile geometry (e.g., array math, byte sizes, animation frame indices). Inspect any remaining hit.
**Source:** CLAUDE.md §9 Guardrails "Pull magic numbers into named constants"

### 8. Game timing uses `gameLoop` `currentTime`, never `Date.now()` in simulation code
**Rule:** All game-simulation timing (loop tick, enemy AI, projectile motion, pathfinding intervals, cooldowns, stamina decay) uses `currentTime` — a `performance.now()` value passed from `requestAnimationFrame` through `gameLoop` into each update method. `Date.now()` is permitted **only** in `src/game/Logger.ts` for wall-clock UI timestamps on the crash overlay.
**Verify:**
- `grep -rn "Date.now()" src/game/ | grep -v "Logger.ts"` returns no hits. Any hit elsewhere is a violation regardless of how it is used; migrate the call site to take `currentTime` as a parameter.
- `gameLoop` in `Game.ts` reads `currentTime` from the `requestAnimationFrame` callback parameter and passes it to every `update(deltaTime, currentTime)` call.
- New modules added to `src/game/` that need time-based logic accept `currentTime` as a parameter — never call `Date.now()` directly.
**Source:** CLAUDE.md §9 Guardrails "Use Date.now() only for wall-clock things"; `game-loop-time-and-cleanup` skill

### 9. Dependency allow-list
**Rule:** `package.json` `dependencies` contains exactly `react`, `react-dom`, `lucide-react`. `devDependencies` contains the Vite / TypeScript / Tailwind / ESLint toolchain only. No runtime utility libraries (axios, lodash, date-fns, i18n, etc.).
**Verify:**
- `jq -r '.dependencies | keys[]' package.json` returns exactly `lucide-react`, `react`, `react-dom` (order-insensitive).
- `jq -r '.devDependencies | keys[]' package.json` is a subset of: `@eslint/js`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `autoprefixer`, `eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `postcss`, `tailwindcss`, `typescript`, `typescript-eslint`, `vite`. Any addition requires owner approval cited in the PR.
**Source:** CLAUDE.md §9 Guardrails "Don't add dependencies without asking"

### 10. Lint is clean
**Rule:** `npm run lint` exits with status 0 and no error count > 0.
**Verify:** `npm install && npm run lint` — exit code 0; no `error` lines in output.
**Source:** CLAUDE.md §9 Guardrails "Lint and typecheck before declaring done"

### 11. TypeScript type check is clean
**Rule:** `npm run typecheck` (tsc `--noEmit` over tsconfig.app.json, tsconfig.node.json, and tsconfig.api.json — covering `src/`, `vite.config.ts`, and `api/`) exits with status 0 and emits no `error TS` messages.
**Verify:** `npm install && npm run typecheck` — exit code 0; no `error TS` lines.
**Source:** CLAUDE.md §9 Guardrails "Lint and typecheck before declaring done"

### 12. Tauri compatibility — no browser-only escape hatches
**Rule:** No service workers, no Web Bluetooth, no popup windows. APIs without a Tauri equivalent are forbidden.
**Verify:**
- `grep -rEn "navigator\\.serviceWorker|navigator\\.bluetooth|window\\.open\\(" src/` returns no hits.
- No `serviceWorker.register(...)` call site in `src/main.tsx` or anywhere under `src/`.
**Source:** CLAUDE.md §8 Distribution; §9 Guardrails "Stay Tauri-compatible"

### 13. No written dialogue or character voice lines
**Rule:** Story is told through visuals, mechanics, and level design. No written dialogue, spoken lines, or voice-line stand-ins. Text bubbles are allowed only as "…" placeholders. No scripts, captions, or character speech.
**Verify:**
- **Manual review required.** Brittle grep produces false positives on button labels, error messages, JSDoc, etc. Instead: read the PR diff for any new string literal in `src/App.tsx`, `src/game/Renderer.ts`, or any cut-scene module, and reject anything that reads as character speech (e.g., "Father, watch out!"). "…" bubbles are acceptable.
- Reject any new module named `dialogue.ts`, `cutscene.ts`, `script.ts`, `voiceOver.ts`, or similar without owner approval cited in the PR.
**Source:** CLAUDE.md §2 Prototype goals; §3 Pillars; §9 Guardrails "No written dialogue or VO"

### 14. Cultural representation: no feathered headdresses, no *Jungle Book* character references
**Rule:** Protagonist and family are Adivasi/tribal-Indian. No feathered-headdress imagery, no "tribal" stereotype cues, no *Jungle Book* character references (Mowgli, Bagheera, Shere Khan, Baloo, Kaa, Akela, Raksha).
**Verify:**
- `grep -rEi "feather|headdress|Mowgli|Bagheera|Shere ?Khan|Baloo|\\bKaa\\b|Akela|Raksha" src/ docs/` returns no hits in code or in committed copy (acceptable only in `CLAUDE.md` as guardrails-quoted examples).
- Any new sprite asset or `Renderer.renderPlayer` / `Renderer.renderNpcs` visual change is reviewed against the `protagonist-and-family-tone` skill.
**Source:** CLAUDE.md §6 World & tone; §9 Guardrails "Cultural representation matters"

### 15. Crash logger is always present and running
**Rule:** `src/game/Logger.ts` exists, `CrashLogger` is instantiated in `Game`, and it is not removed, gated, or disabled.
**Verify:**
- `src/game/Logger.ts` file exists.
- `grep -En "new CrashLogger|this\\.logger ?=" src/game/Game.ts` returns at least one hit.
- `Game.cleanup()` disposes the logger (`this.logger.dispose()` or equivalent).
- No comment `// disabled` / `// removed` near logger references.
**Source:** CLAUDE.md §9 Guardrails "Crash logger is always running"

### 16. All listeners and timers are disposed in `Game.cleanup()`
**Rule:** Any `addEventListener`, `setTimeout`, `setInterval`, or `requestAnimationFrame` registration in `src/game/` has a matching tear-down reachable from `Game.cleanup()` (directly or via an owned module's `dispose()`).
**Verify:**
- Enumerate registrations: `grep -rEn "addEventListener|setTimeout|setInterval|requestAnimationFrame" src/game/`.
- For each hit, find the corresponding `removeEventListener` / `clearTimeout` / `clearInterval` / `cancelAnimationFrame` and confirm it is called from `Game.cleanup()` or a method `Game.cleanup()` invokes.
- Standard tear-downs: `Game.cleanup()` calls `inputManager.dispose()`, `logger.dispose()`, `cancelAnimationFrame(animationId)`, and `clearTimeout(levelTransitionTimeoutId)`.
**Source:** CLAUDE.md §9 Guardrails "Always clean up listeners and timers"

---

## Not Included as Invariants

The following are firm guidance but are design / tuning parameters rather than hard rules. They are documented elsewhere; the evaluator does not gate on them:

- Wave-scheduler tuning (group templates, inter-wave lulls) — `src/game/WaveScheduler.ts`, design decision per level
- Enemy speed ratios (panther 395, bear 218, snake 68, gibbon 34 px/s) — `src/game/Enemy.ts`, balance choice
- Stamina drain rates and burst-multiplier decay — `src/game/Stamina.ts`, balance choice
- Sprite walk-frame timing — `src/game/Renderer.ts`, animation tuning
- Level 10 boss arena layout — out of scope until implementation
- Multiple-endings system structure — documented direction, no invariant until committed to a build tier

---

## Related Docs

- `README.md` — Pillars, Guardrails (canonical source)
- `CLAUDE.md` — Working knowledge base (§3 Pillars, §8 Distribution, §9 Guardrails)
- `src/game/constants.ts` — All named magic-number constants
- `src/game/types.ts` — `EnemyType` union (invariant 3 source of truth)
- `src/game/Logger.ts` — Crash logger (invariant 15)
- `package.json` — Dependency allow-list (invariant 9)
