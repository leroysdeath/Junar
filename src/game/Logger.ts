import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

const MAX_EVENT_BUFFER = 200;
const OVERLAY_PADDING = 16;
const REPORT_ENDPOINT = '/api/crash';
const REPORT_TIMEOUT_MS = 5000;

export type LogCategory =
  | 'lifecycle'
  | 'level'
  | 'state'
  | 'fire'
  | 'hit'
  | 'collision'
  | 'warn'
  | 'error';

export interface LogEvent {
  t: number;
  cat: LogCategory;
  msg: string;
  data?: Record<string, unknown>;
}

export type CrashPhase =
  | 'gameLoop'
  | 'update'
  | 'render'
  | 'global'
  | 'unhandledRejection';

export interface CrashSnapshot {
  error: string;
  stack: string;
  phase: CrashPhase;
  frame: number;
  uptimeMs: number;
  state?: Record<string, unknown>;
  events: LogEvent[];
  userAgent: string;
  url: string;
  capturedAt: string;
}

export interface CrashLoggerOptions {
  snapshotProvider?: () => Record<string, unknown> | undefined;
  frameProvider?: () => number;
  onCrash?: (snapshot: CrashSnapshot) => void;
  reportEndpoint?: string | null;
}

declare global {
  interface Window {
    __JUNGLE_CRASH__?: CrashSnapshot;
  }
}

export class CrashLogger {
  private events: LogEvent[] = [];
  private startedAt = performance.now();
  private crash: CrashSnapshot | null = null;
  private snapshotProvider?: () => Record<string, unknown> | undefined;
  private frameProvider?: () => number;
  private onCrash?: (snapshot: CrashSnapshot) => void;
  private reportEndpoint: string | null;

  private readonly handleError = (e: ErrorEvent) => {
    if (this.crash) return;
    const err = e.error instanceof Error ? e.error : new Error(e.message || 'window error');
    this.captureCrash('global', err);
  };

  private readonly handleRejection = (e: PromiseRejectionEvent) => {
    if (this.crash) return;
    const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason ?? 'unhandled rejection'));
    this.captureCrash('unhandledRejection', err);
  };

  constructor(opts: CrashLoggerOptions = {}) {
    this.snapshotProvider = opts.snapshotProvider;
    this.frameProvider = opts.frameProvider;
    this.onCrash = opts.onCrash;
    this.reportEndpoint = opts.reportEndpoint === undefined ? REPORT_ENDPOINT : opts.reportEndpoint;
    window.addEventListener('error', this.handleError);
    window.addEventListener('unhandledrejection', this.handleRejection);
  }

  log(cat: LogCategory, msg: string, data?: Record<string, unknown>) {
    this.events.push({
      t: Math.round(performance.now() - this.startedAt),
      cat,
      msg,
      data,
    });
    if (this.events.length > MAX_EVENT_BUFFER) {
      this.events.shift();
    }
  }

  captureCrash(
    phase: CrashPhase,
    error: unknown,
    extraState?: Record<string, unknown>,
  ): CrashSnapshot {
    if (this.crash) return this.crash;

    const err = error instanceof Error ? error : new Error(String(error));
    const providerState = this.snapshotProvider?.();
    const merged: Record<string, unknown> | undefined =
      providerState || extraState
        ? { ...(providerState ?? {}), ...(extraState ?? {}) }
        : undefined;

    const snapshot: CrashSnapshot = {
      error: err.message || String(err),
      stack: err.stack ?? '(no stack available)',
      phase,
      frame: this.frameProvider?.() ?? 0,
      uptimeMs: Math.round(performance.now() - this.startedAt),
      state: merged,
      events: [...this.events],
      userAgent: navigator.userAgent,
      url: window.location.href,
      capturedAt: new Date().toISOString(),
    };

    this.crash = snapshot;
    window.__JUNGLE_CRASH__ = snapshot;
    console.error('[Junar] crash captured:', snapshot);

    this.report(snapshot);
    this.onCrash?.(snapshot);
    return snapshot;
  }

  hasCrashed(): boolean {
    return this.crash !== null;
  }

  getCrash(): CrashSnapshot | null {
    return this.crash;
  }

  renderOverlay(ctx: CanvasRenderingContext2D) {
    if (!this.crash) return;
    const c = this.crash;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = '#FF3B30';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, CANVAS_WIDTH - 4, CANVAS_HEIGHT - 4);

    ctx.textBaseline = 'top';
    let y = OVERLAY_PADDING;

    ctx.fillStyle = '#FF3B30';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('CRASH', OVERLAY_PADDING, y);
    y += 24;

    ctx.fillStyle = '#FFD7D5';
    ctx.font = '12px monospace';
    ctx.fillText(
      `phase=${c.phase}  frame=${c.frame}  uptime=${c.uptimeMs}ms`,
      OVERLAY_PADDING,
      y,
    );
    y += 18;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px monospace';
    y = this.wrapText(ctx, c.error, OVERLAY_PADDING, y, CANVAS_WIDTH - OVERLAY_PADDING * 2, 16);
    y += 4;

    ctx.fillStyle = '#FF8B85';
    ctx.font = '11px monospace';
    const stackLines = c.stack.split('\n').slice(0, 5);
    for (const line of stackLines) {
      y = this.wrapText(
        ctx,
        line.trim(),
        OVERLAY_PADDING,
        y,
        CANVAS_WIDTH - OVERLAY_PADDING * 2,
        13,
      );
    }
    y += 6;

    if (c.state) {
      ctx.fillStyle = '#A0E0FF';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('state:', OVERLAY_PADDING, y);
      y += 14;
      ctx.font = '11px monospace';
      ctx.fillStyle = '#D0F0FF';
      y = this.wrapText(
        ctx,
        JSON.stringify(c.state),
        OVERLAY_PADDING,
        y,
        CANVAS_WIDTH - OVERLAY_PADDING * 2,
        13,
      );
      y += 4;
    }

    ctx.fillStyle = '#FFE066';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`recent events (${c.events.length}):`, OVERLAY_PADDING, y);
    y += 14;

    ctx.font = '11px monospace';
    ctx.fillStyle = '#F0E090';
    const lineHeight = 13;
    const footerY = CANVAS_HEIGHT - OVERLAY_PADDING - 14;
    const fits = Math.max(0, Math.floor((footerY - y) / lineHeight));
    const tail = c.events.slice(-fits);
    for (const ev of tail) {
      const data = ev.data ? ' ' + JSON.stringify(ev.data) : '';
      const line = `+${ev.t}ms [${ev.cat}] ${ev.msg}${data}`;
      const trimmed = line.length > 110 ? line.slice(0, 107) + '...' : line;
      ctx.fillText(trimmed, OVERLAY_PADDING, y);
      y += lineHeight;
      if (y > footerY) break;
    }

    ctx.fillStyle = '#888888';
    ctx.font = '10px monospace';
    ctx.fillText(
      'Auto-reported. window.__JUNGLE_CRASH__ has the full snapshot. Reload to recover.',
      OVERLAY_PADDING,
      CANVAS_HEIGHT - OVERLAY_PADDING - 2,
    );

    ctx.restore();
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ): number {
    let line = '';
    let cy = y;
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line.length > 0) {
        ctx.fillText(line, x, cy);
        cy += lineHeight;
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, cy);
      cy += lineHeight;
    }
    return cy;
  }

  private report(snapshot: CrashSnapshot) {
    if (!this.reportEndpoint) return;
    // Fire-and-forget; failures are silent so the overlay still renders.
    const ctrl =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = ctrl
      ? window.setTimeout(() => ctrl.abort(), REPORT_TIMEOUT_MS)
      : null;
    fetch(this.reportEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
      signal: ctrl?.signal,
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok) {
          console.warn('[Junar] crash report rejected:', res.status);
        }
      })
      .catch((e) => {
        console.warn('[Junar] crash report failed:', e);
      })
      .finally(() => {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
      });
  }

  dispose() {
    window.removeEventListener('error', this.handleError);
    window.removeEventListener('unhandledrejection', this.handleRejection);
    this.events = [];
  }
}
