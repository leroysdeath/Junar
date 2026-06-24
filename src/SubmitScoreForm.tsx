import { useEffect, useState } from 'react';
import {
  COMMON_EMAIL_DOMAINS,
  checkTag,
  fetchLeaderboard,
  submitFeedback,
  submitScore,
  type BoardKind,
  type LeaderboardEntry,
} from './leaderboard';

// Mirrors the route/DB tag rule (api/leaderboard.ts TAG_RE): 3–8 chars of
// letters, digits, underscore or hyphen.
const TAG_RE = /^[A-Za-z0-9_-]{3,8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTHER_DOMAIN = '__other__';
const MAX_FEEDBACK = 500;
const CHECK_DEBOUNCE_MS = 400;

// Local copy of App's m:ss formatter for the Time column (kept here so this
// component is self-contained; App.tsx has its own for the end-screen stats).
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

type TagStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';

// Shared submit surface rendered on the Game Over and Victory screens. Holds two
// fully independent areas: the high-score entry (tag + private email, returns
// both board ranks) and an anonymous feedback box.
export function SubmitScoreForm({
  score,
  elapsedMs,
  outcome,
}: {
  score: number;
  elapsedMs: number;
  outcome: 'death' | 'victory';
}) {
  // ── Leaderboard entry ──
  const [tag, setTag] = useState('');
  const [localPart, setLocalPart] = useState('');
  const [domainChoice, setDomainChoice] = useState<string>(
    COMMON_EMAIL_DOMAINS[0],
  );
  const [customDomain, setCustomDomain] = useState('');
  const [tagStatus, setTagStatus] = useState<TagStatus>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    scoreRank: number;
    timeRank: number;
  } | null>(null);

  // ── Feedback (independent of the entry above) ──
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  // Debounced live "is this username free?" check.
  useEffect(() => {
    const trimmed = tag.trim();
    if (!TAG_RE.test(trimmed)) {
      setTagStatus(trimmed.length === 0 ? 'idle' : 'invalid');
      return;
    }
    setTagStatus('checking');
    let cancelled = false;
    const id = setTimeout(() => {
      void checkTag(trimmed).then((available) => {
        if (!cancelled) setTagStatus(available ? 'available' : 'taken');
      });
    }, CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [tag]);

  const domain =
    domainChoice === OTHER_DOMAIN ? customDomain.trim() : domainChoice;
  const email = `${localPart.trim()}@${domain}`;
  const emailValid = EMAIL_RE.test(email);
  const canSubmit =
    TAG_RE.test(tag.trim()) &&
    tagStatus !== 'taken' &&
    tagStatus !== 'invalid' &&
    emailValid &&
    !submitting;

  const onSubmitScore = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    const res = await submitScore({ tag: tag.trim(), email, score, elapsedMs });
    setSubmitting(false);
    if (res.status === 'ok') {
      setResult({ scoreRank: res.scoreRank, timeRank: res.timeRank });
    } else if (res.status === 'tag_taken') {
      setTagStatus('taken');
      setSubmitError("That name's taken — pick another.");
    } else {
      setSubmitError(res.message);
    }
  };

  const onSubmitFeedback = async () => {
    const msg = feedbackText.trim();
    if (msg.length === 0 || feedbackSending) return;
    setFeedbackSending(true);
    const ok = await submitFeedback({
      message: msg,
      score,
      elapsedMs,
      outcome,
    });
    setFeedbackSending(false);
    if (ok) setFeedbackSent(true);
  };

  const inputCls =
    'w-full bg-black/60 border border-amber-500/50 rounded px-2 py-1.5 text-sm text-white placeholder-amber-200/40 focus:outline-none focus:border-amber-400';

  return (
    <div className="mt-6 space-y-3 text-left">
      {/* High-score entry */}
      {result ? (
        <div className="bg-black/60 border border-emerald-500 rounded-lg px-4 py-3 text-center">
          <p className="text-emerald-300 text-sm font-semibold">
            Your high score has been added to the leaderboard.
          </p>
          <p className="text-amber-200 text-sm mt-1">
            You are ranked{' '}
            <span className="font-bold">#{result.scoreRank}</span> on High Score
            and <span className="font-bold">#{result.timeRank}</span> on Time!
          </p>
        </div>
      ) : (
        <div className="bg-black/50 border border-amber-500/60 rounded-lg px-4 py-3 space-y-2">
          <p className="text-amber-300 text-sm font-semibold">
            Submit your score
          </p>

          <div>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              maxLength={8}
              placeholder="Name (3–8 chars)"
              aria-label="Leaderboard name"
              className={inputCls}
            />
            <div className="h-4 text-[11px] mt-0.5">
              {tagStatus === 'checking' && (
                <span className="text-amber-200/60">Checking…</span>
              )}
              {tagStatus === 'available' && (
                <span className="text-emerald-400">✓ available</span>
              )}
              {tagStatus === 'taken' && (
                <span className="text-red-400">✗ taken — pick another</span>
              )}
              {tagStatus === 'invalid' && (
                <span className="text-red-400">
                  3–8 letters, digits, _ or -
                </span>
              )}
            </div>
          </div>

          {/* Split email picker: local-part box, a static @, a domain dropdown. */}
          <div className="flex items-center gap-1">
            <input
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              placeholder="you"
              aria-label="Email name"
              className="flex-1 min-w-0 bg-black/60 border border-amber-500/50 rounded px-2 py-1.5 text-sm text-white placeholder-amber-200/40 focus:outline-none focus:border-amber-400"
            />
            <span className="text-amber-300 text-sm shrink-0">@</span>
            <select
              value={domainChoice}
              onChange={(e) => setDomainChoice(e.target.value)}
              aria-label="Email domain"
              className="bg-black/60 border border-amber-500/50 rounded px-1 py-1.5 text-sm text-white shrink-0 focus:outline-none focus:border-amber-400"
            >
              {COMMON_EMAIL_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              <option value={OTHER_DOMAIN}>Other…</option>
            </select>
          </div>
          {domainChoice === OTHER_DOMAIN && (
            <input
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="yourdomain.com"
              aria-label="Custom email domain"
              className={inputCls}
            />
          )}

          <p className="text-[11px] text-amber-200/50">
            Email is private — used only to keep one entry per player. We never
            email you.
          </p>
          {submitError && (
            <p className="text-[11px] text-red-400">{submitError}</p>
          )}
          <button
            onClick={onSubmitScore}
            disabled={!canSubmit}
            className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 rounded text-sm border border-amber-500 transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit Score'}
          </button>
        </div>
      )}

      {/* Feedback — fully independent of the entry above */}
      {feedbackSent ? (
        <div className="bg-black/60 border border-emerald-500/60 rounded-lg px-4 py-2 text-center">
          <p className="text-emerald-300 text-sm">
            Thank you for your feedback!
          </p>
        </div>
      ) : feedbackOpen ? (
        <div className="bg-black/50 border border-amber-500/60 rounded-lg px-4 py-3 space-y-2">
          <textarea
            value={feedbackText}
            onChange={(e) =>
              setFeedbackText(e.target.value.slice(0, MAX_FEEDBACK))
            }
            maxLength={MAX_FEEDBACK}
            rows={3}
            placeholder="Tell us what you think…"
            aria-label="Feedback"
            className="w-full bg-black/60 border border-amber-500/50 rounded px-2 py-1.5 text-sm text-white placeholder-amber-200/40 focus:outline-none focus:border-amber-400 resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-amber-200/50">
              {feedbackText.length}/{MAX_FEEDBACK}
            </span>
            <button
              onClick={onSubmitFeedback}
              disabled={feedbackText.trim().length === 0 || feedbackSending}
              className="bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-1.5 px-4 rounded text-sm border border-amber-500 transition-colors"
            >
              {feedbackSending ? 'Sending…' : 'Submit'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setFeedbackOpen(true)}
          className="w-full bg-black/40 hover:bg-black/60 border border-amber-500/40 rounded-lg px-4 py-2 text-sm text-amber-300 transition-colors"
        >
          Submit Feedback?
        </button>
      )}
    </div>
  );
}

// Two-tab leaderboard view (High Score / Time), top 20 each. Rendered inside the
// menu's TitleModal shell in App.tsx; fetches on mount and on tab change.
export function LeaderboardBoards() {
  const [tab, setTab] = useState<BoardKind>('score');
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(false);
    fetchLeaderboard(tab)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const tabCls = (active: boolean) =>
    `flex-1 py-1.5 rounded text-sm font-semibold border transition-colors ${
      active
        ? 'bg-amber-600 border-amber-500 text-white'
        : 'bg-black/40 border-amber-500/40 text-amber-300 hover:bg-black/60'
    }`;

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setTab('score')}
          className={tabCls(tab === 'score')}
        >
          High Score
        </button>
        <button
          onClick={() => setTab('time')}
          className={tabCls(tab === 'time')}
        >
          Time
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm">
          Couldn&apos;t load the leaderboard.
        </p>
      )}
      {!error && entries === null && (
        <p className="text-amber-200/60 text-sm">Loading…</p>
      )}
      {!error && entries?.length === 0 && (
        <p className="text-amber-200/60 text-sm">
          No entries yet — be the first!
        </p>
      )}
      {!error && entries && entries.length > 0 && (
        <ol className="space-y-1">
          {entries.map((e, i) => (
            <li
              key={`${e.tag}-${i}`}
              className="flex items-center justify-between text-sm border-b border-amber-500/20 py-1"
            >
              <span className="text-amber-200">
                <span className="inline-block w-7 text-amber-400/70">
                  #{i + 1}
                </span>
                {e.tag}
              </span>
              <span className="text-white font-mono">
                {tab === 'score'
                  ? e.best_score
                  : formatDuration(e.best_elapsed_ms)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
