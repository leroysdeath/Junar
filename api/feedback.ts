// Vercel Edge Function: /api/feedback
//
// Anonymous player feedback sink. Like api/leaderboard.ts, the browser calls
// this same-origin route, which inserts into Supabase with the service_role key.
// No email is collected — feedback is anonymous (email is required ONLY for a
// high-score entry, handled by /api/leaderboard).
//
//   POST /api/feedback  { message, score?, elapsedMs?, outcome? }  -> 200 { ok: true }
//
// Required env vars (shared with /api/leaderboard):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

export const config = { runtime: 'edge' };

const MAX_BODY_BYTES = 4 * 1024;
const MAX_MESSAGE_CHARS = 500;
const MAX_SCORE = 10_000_000;
const MAX_ELAPSED_MS = 24 * 60 * 60 * 1000;

interface IncomingFeedback {
  message?: unknown;
  score?: unknown;
  elapsedMs?: unknown;
  outcome?: unknown;
}

const json = (status: number, payload: unknown) =>
  new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

function optInt(v: unknown, max: number): number | null {
  if (v === undefined || v === null) return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, max);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return json(204, null);
  if (request.method !== 'POST')
    return json(405, { error: 'method not allowed' });

  const baseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) {
    return json(500, { error: 'supabase env not configured' });
  }

  let body: IncomingFeedback;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES)
      return json(413, { error: 'payload too large' });
    body = JSON.parse(raw) as IncomingFeedback;
  } catch {
    return json(400, { error: 'invalid json' });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length === 0 || message.length > MAX_MESSAGE_CHARS) {
    return json(400, { error: 'message must be 1–500 chars' });
  }
  const outcome =
    body.outcome === 'death' || body.outcome === 'victory'
      ? body.outcome
      : null;

  const res = await fetch(`${baseUrl}/rest/v1/feedback`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      message,
      score: optInt(body.score, MAX_SCORE),
      elapsed_ms: optInt(body.elapsedMs, MAX_ELAPSED_MS),
      outcome,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    return json(502, {
      error: 'supabase insert failed',
      detail: detail.slice(0, 300),
    });
  }
  return json(200, { ok: true });
}
