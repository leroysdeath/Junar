// Vercel Edge Function: /api/leaderboard
//
// The sole gatekeeper between the browser and Supabase. The client never holds
// a Supabase key — it calls this same-origin route, which talks to Supabase with
// the service_role key (server-only secret). Mirrors api/crash.ts.
//
//   GET  /api/leaderboard?board=score|time  -> top 20 rows (tag + metrics, no email)
//   GET  /api/leaderboard?checkTag=<tag>     -> { available: boolean }
//   POST /api/leaderboard  { tag, email, score, elapsedMs }
//        -> 200 { scoreRank, timeRank }  |  409 { error: 'tag_taken' }
//
// Required env vars (set in Vercel Project Settings / .env.local for `vercel dev`):
//   SUPABASE_URL                - e.g. https://abcd.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   - service_role key (bypasses RLS; server-only)

export const config = { runtime: 'edge' };

const MAX_BODY_BYTES = 8 * 1024;
const TAG_RE = /^[A-Za-z0-9_-]{3,8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SCORE = 10_000_000;
const MAX_ELAPSED_MS = 24 * 60 * 60 * 1000; // 24h
const BOARD_LIMIT = 20;

interface IncomingScore {
  tag?: unknown;
  email?: unknown;
  score?: unknown;
  elapsedMs?: unknown;
}

interface PublicEntry {
  tag: string;
  best_score: number;
  best_elapsed_ms: number;
}

const json = (status: number, payload: unknown) =>
  new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

function supabaseFetch(baseUrl: string, key: string) {
  return (path: string, init: RequestInit = {}) =>
    fetch(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
}

function clampInt(v: unknown, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return json(204, null);

  const baseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) {
    return json(500, { error: 'supabase env not configured' });
  }
  const db = supabaseFetch(baseUrl, key);

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const checkTag = url.searchParams.get('checkTag');
    if (checkTag !== null) {
      if (!TAG_RE.test(checkTag.trim())) return json(200, { available: false });
      const res = await db('rpc/tag_available', {
        method: 'POST',
        body: JSON.stringify({ p_tag: checkTag.trim() }),
      });
      if (!res.ok) return json(502, { error: 'supabase check failed' });
      const available = (await res.json()) as boolean;
      return json(200, { available: available === true });
    }

    const board = url.searchParams.get('board') === 'time' ? 'time' : 'score';
    const orderCol = board === 'time' ? 'best_elapsed_ms' : 'best_score';
    const res = await db(
      `leaderboard?select=tag,best_score,best_elapsed_ms&order=${orderCol}.desc&limit=${BOARD_LIMIT}`,
    );
    if (!res.ok) return json(502, { error: 'supabase read failed' });
    const rows = (await res.json()) as PublicEntry[];
    return json(200, { board, entries: rows });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'method not allowed' });
  }

  let body: IncomingScore;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES)
      return json(413, { error: 'payload too large' });
    body = JSON.parse(raw) as IncomingScore;
  } catch {
    return json(400, { error: 'invalid json' });
  }

  const tag = typeof body.tag === 'string' ? body.tag.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!TAG_RE.test(tag)) {
    return json(400, {
      error: 'tag must be 3–8 chars (letters, digits, _ or -)',
    });
  }
  if (!EMAIL_RE.test(email)) {
    return json(400, { error: 'invalid email' });
  }
  const score = clampInt(body.score, MAX_SCORE);
  const elapsedMs = clampInt(body.elapsedMs, MAX_ELAPSED_MS);

  const res = await db('rpc/submit_score', {
    method: 'POST',
    body: JSON.stringify({
      p_tag: tag,
      p_email: email,
      p_score: score,
      p_elapsed_ms: elapsedMs,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return json(502, {
      error: 'supabase submit failed',
      detail: detail.slice(0, 300),
    });
  }
  // submit_score is a table-returning function -> array with a single row.
  const rows = (await res.json()) as Array<{
    tag_taken: boolean;
    score_rank: number | null;
    time_rank: number | null;
  }>;
  const row = rows[0];
  if (!row || row.tag_taken) {
    return json(409, { error: 'tag_taken' });
  }
  return json(200, { scoreRank: row.score_rank, timeRank: row.time_rank });
}
