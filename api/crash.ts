// Vercel Edge Function: /api/crash
//
// Receives a CrashSnapshot from the browser-side CrashLogger and either
// (a) opens a new GitHub issue tagged with a fingerprint, or
// (b) appends a comment to the existing open issue with that fingerprint.
//
// Required env vars (set in Vercel Project Settings):
//   GITHUB_TOKEN  - fine-grained PAT scoped to this repo with issues:write
// Optional:
//   GITHUB_OWNER  - defaults to 'leroysdeath'
//   GITHUB_REPO   - defaults to 'junar'

export const config = { runtime: 'edge' };

const DEFAULT_OWNER = 'leroysdeath';
const DEFAULT_REPO = 'junar';
const MAX_BODY_BYTES = 128 * 1024;

// Phase from the browser-side CrashLogger -> GitHub label.
// Unknown phases fall back to 'crash'.
const PHASE_LABELS: Record<string, string> = {
  gameLoop: 'crash',
  update: 'crash',
  render: 'crash',
  global: 'crash',
  unhandledRejection: 'crash',
  suspicious: 'suspicious-death',
  gameOver: 'death',
};

interface IncomingCrash {
  error?: string;
  stack?: string;
  phase?: string;
  frame?: number;
  uptimeMs?: number;
  state?: Record<string, unknown>;
  events?: Array<{ t: number; cat: string; msg: string; data?: unknown }>;
  userAgent?: string;
  url?: string;
  capturedAt?: string;
}

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return json(204, null);
  if (request.method !== 'POST') return json(405, { error: 'method not allowed' });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return json(500, { error: 'GITHUB_TOKEN not configured' });
  const owner = process.env.GITHUB_OWNER || DEFAULT_OWNER;
  const repo = process.env.GITHUB_REPO || DEFAULT_REPO;

  let crash: IncomingCrash;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'payload too large' });
    crash = JSON.parse(raw) as IncomingCrash;
  } catch {
    return json(400, { error: 'invalid json' });
  }

  if (!crash || typeof crash !== 'object' || !crash.error) {
    return json(400, { error: 'missing error field' });
  }

  const fingerprint = await fingerprintOf(crash);
  const titlePrefix = `[crash:${fingerprint}]`;

  const gh = githubFetch(token);
  const existing = await findOpenIssueByPrefix(gh, owner, repo, titlePrefix);

  if (existing) {
    const commentBody = renderRecurrenceComment(crash);
    const res = await gh(
      `https://api.github.com/repos/${owner}/${repo}/issues/${existing.number}/comments`,
      { method: 'POST', body: JSON.stringify({ body: commentBody }) },
    );
    if (!res.ok) {
      return json(502, { error: 'github comment failed', status: res.status });
    }
    return json(200, {
      ok: true,
      isNew: false,
      issueUrl: existing.html_url,
      fingerprint,
    });
  }

  const title = `${titlePrefix} ${truncate(crash.error || 'unknown error', 100)}`;
  const body = renderIssueBody(crash, fingerprint);
  const label = PHASE_LABELS[crash.phase ?? ''] ?? 'crash';
  const res = await gh(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title, body, labels: [label] }),
  });
  if (!res.ok) {
    const text = await res.text();
    return json(502, { error: 'github create failed', status: res.status, detail: text.slice(0, 500) });
  }
  const created = (await res.json()) as { html_url: string; number: number };
  return json(200, {
    ok: true,
    isNew: true,
    issueUrl: created.html_url,
    fingerprint,
  });
}

function githubFetch(token: string) {
  return (url: string, init: RequestInit = {}) =>
    fetch(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'junar-crash-reporter',
        ...(init.headers ?? {}),
      },
    });
}

async function findOpenIssueByPrefix(
  gh: (url: string, init?: RequestInit) => Promise<Response>,
  owner: string,
  repo: string,
  prefix: string,
): Promise<{ number: number; html_url: string } | null> {
  const q = encodeURIComponent(`repo:${owner}/${repo} is:issue is:open in:title "${prefix}"`);
  const res = await gh(`https://api.github.com/search/issues?q=${q}&per_page=1`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    items?: Array<{ number: number; html_url: string; title: string }>;
  };
  const hit = data.items?.find((i) => i.title.startsWith(prefix));
  return hit ? { number: hit.number, html_url: hit.html_url } : null;
}

async function fingerprintOf(crash: IncomingCrash): Promise<string> {
  const firstStack = (crash.stack ?? '').split('\n').slice(0, 2).join('|');
  const seed = `${crash.error ?? ''}|${firstStack}`;
  const buf = new TextEncoder().encode(seed);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 10);
}

function renderIssueBody(crash: IncomingCrash, fingerprint: string): string {
  const events = crash.events ?? [];
  return [
    `**Fingerprint:** \`${fingerprint}\``,
    `**Phase:** \`${crash.phase ?? 'unknown'}\`  •  **Frame:** ${crash.frame ?? '?'}  •  **Uptime:** ${crash.uptimeMs ?? '?'}ms`,
    `**Captured:** ${crash.capturedAt ?? 'unknown'}`,
    `**URL:** ${crash.url ?? 'unknown'}`,
    `**UA:** \`${truncate(crash.userAgent ?? 'unknown', 200)}\``,
    '',
    '### Error',
    '```',
    truncate(crash.error ?? 'unknown', 500),
    '```',
    '### Stack',
    '```',
    truncate(crash.stack ?? '(no stack)', 4000),
    '```',
    '### State',
    '```json',
    truncate(JSON.stringify(crash.state ?? {}, null, 2), 2000),
    '```',
    `### Recent events (${events.length})`,
    '```',
    truncate(
      events
        .map((e) => `+${e.t}ms [${e.cat}] ${e.msg}${e.data ? ' ' + JSON.stringify(e.data) : ''}`)
        .join('\n'),
      6000,
    ),
    '```',
  ].join('\n');
}

function renderRecurrenceComment(crash: IncomingCrash): string {
  const events = crash.events ?? [];
  return [
    `Recurrence at ${crash.capturedAt ?? 'unknown'}`,
    `Phase=\`${crash.phase ?? '?'}\` Frame=${crash.frame ?? '?'} Uptime=${crash.uptimeMs ?? '?'}ms`,
    `URL: ${crash.url ?? 'unknown'}`,
    '',
    '<details><summary>State</summary>',
    '',
    '```json',
    truncate(JSON.stringify(crash.state ?? {}, null, 2), 2000),
    '```',
    '</details>',
    '',
    `<details><summary>Recent events (${events.length})</summary>`,
    '',
    '```',
    truncate(
      events
        .map((e) => `+${e.t}ms [${e.cat}] ${e.msg}${e.data ? ' ' + JSON.stringify(e.data) : ''}`)
        .join('\n'),
      4000,
    ),
    '```',
    '</details>',
  ].join('\n');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `... (${s.length - max} more chars truncated)`;
}
