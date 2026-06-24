// Client-side leaderboard + feedback helper.
//
// Framework-agnostic (no React) so it stays out of src/game/ and parallels how
// api/ is its own layer. The browser only ever talks to our same-origin Edge
// routes (/api/leaderboard, /api/feedback) — it never sees a Supabase URL or
// key. See api/leaderboard.ts and supabase/leaderboard.sql for the backend.

export type BoardKind = 'score' | 'time';

export interface LeaderboardEntry {
  tag: string;
  best_score: number;
  best_elapsed_ms: number;
}

export type SubmitScoreResult =
  | { status: 'ok'; scoreRank: number; timeRank: number }
  | { status: 'tag_taken' }
  | { status: 'error'; message: string };

export interface ScoreSubmission {
  tag: string;
  email: string;
  score: number;
  elapsedMs: number;
}

export interface FeedbackSubmission {
  message: string;
  score?: number;
  elapsedMs?: number;
  outcome?: 'death' | 'victory';
}

// Most common consumer email providers, ordered by popularity. Drives the
// domain dropdown in SubmitScoreForm; a trailing "Other…" lets players type
// any domain. Exported so the picker and any future validation share one list.
export const COMMON_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'proton.me',
  'live.com',
] as const;

const LEADERBOARD_URL = '/api/leaderboard';
const FEEDBACK_URL = '/api/feedback';

export async function submitScore(
  sub: ScoreSubmission,
): Promise<SubmitScoreResult> {
  try {
    const res = await fetch(LEADERBOARD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    if (res.status === 409) return { status: 'tag_taken' };
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      return { status: 'error', message: data?.error ?? 'Submit failed' };
    }
    const data = (await res.json()) as {
      scoreRank: number;
      timeRank: number;
    };
    return {
      status: 'ok',
      scoreRank: data.scoreRank,
      timeRank: data.timeRank,
    };
  } catch {
    return { status: 'error', message: 'Network error' };
  }
}

export async function fetchLeaderboard(
  board: BoardKind,
): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${LEADERBOARD_URL}?board=${board}`);
  if (!res.ok) throw new Error('Failed to load leaderboard');
  const data = (await res.json()) as { entries: LeaderboardEntry[] };
  return data.entries ?? [];
}

// Live "is this username free?" check for the tag field. On any failure it
// returns true (don't wrongly block the player) — the submit path is the
// authoritative gate via the DB's unique index.
export async function checkTag(tag: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${LEADERBOARD_URL}?checkTag=${encodeURIComponent(tag)}`,
    );
    if (!res.ok) return true;
    const data = (await res.json()) as { available: boolean };
    return data.available !== false;
  } catch {
    return true;
  }
}

export async function submitFeedback(
  sub: FeedbackSubmission,
): Promise<boolean> {
  try {
    const res = await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    return res.ok;
  } catch {
    return false;
  }
}
