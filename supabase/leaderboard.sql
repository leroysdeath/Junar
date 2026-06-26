-- Junar leaderboard + feedback schema (owner-authorized 2026-06-24).
--
-- This file is a checked-in record of the schema; it is applied to the remote
-- Supabase project via the Supabase MCP `apply_migration` (or the dashboard SQL
-- editor). No CLI dependency is introduced by keeping it here.
--
-- Security model: the browser NEVER connects to Postgres. The only client is the
-- Vercel Edge route (api/leaderboard.ts, api/feedback.ts), which uses the
-- service_role key — that role bypasses RLS. Both tables have RLS enabled with
-- NO policies, so without the service key they are completely inaccessible
-- (the anon key is never issued to anyone). Only a one-way HMAC digest of the
-- email is ever stored (email_hash, computed by api/leaderboard.ts) — the
-- plaintext email never reaches the database.

-- ── Leaderboard ──────────────────────────────────────────────────────────────
create table if not exists public.leaderboard (
  id              uuid primary key default gen_random_uuid(),
  email_hash      text not null unique,        -- HMAC-SHA256 of the email; private dedupe key (plaintext never stored)
  tag             text not null,               -- public display name, 3–8 chars
  best_score      integer not null default 0,
  best_elapsed_ms integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Case-insensitive unique username — "Bob" and "bob" cannot coexist. This is the
-- authoritative, race-safe backstop behind the app-level tag-taken check.
create unique index if not exists leaderboard_tag_lower_key
  on public.leaderboard (lower(tag));

-- Lock the table: RLS on + zero policies => only the service_role key reaches it.
alter table public.leaderboard enable row level security;

-- ── Feedback ─────────────────────────────────────────────────────────────────
-- Anonymous (no email column). Optional run context aids triage.
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  message    text not null check (
               char_length(message) <= 500 and char_length(btrim(message)) > 0
             ),
  score      integer,
  elapsed_ms integer,
  outcome    text check (outcome in ('death', 'victory')),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- ── submit_score RPC ─────────────────────────────────────────────────────────
-- One row per player (keyed by the email hash). Keeps the player's best score
-- and best time independently (GREATEST on each axis), enforces a globally
-- unique tag, and returns the player's rank on both boards. Returns
-- tag_taken=true WITHOUT writing when the requested tag is held by a different
-- player (or loses a concurrent race). p_email_hash is the opaque HMAC digest
-- computed by the Edge route — the plaintext email never reaches Postgres.
create or replace function public.submit_score(
  p_tag        text,
  p_email_hash text,
  p_score      integer,
  p_elapsed_ms integer
)
returns table (tag_taken boolean, score_rank integer, time_rank integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag          text    := btrim(p_tag);
  v_email_hash   text    := btrim(p_email_hash);
  v_score        integer := greatest(0, coalesce(p_score, 0));
  v_elapsed      integer := greatest(0, coalesce(p_elapsed_ms, 0));
  v_best_score   integer;
  v_best_elapsed integer;
begin
  -- Defense-in-depth bounds (the Edge route validates first).
  if char_length(v_tag) < 3 or char_length(v_tag) > 8 then
    raise exception 'invalid tag length';
  end if;

  -- Reject a tag already held by a DIFFERENT player (the same player may keep
  -- or change to any free tag).
  if exists (
    select 1 from public.leaderboard
    where lower(tag) = lower(v_tag) and email_hash <> v_email_hash
  ) then
    return query select true, null::integer, null::integer;
    return;
  end if;

  -- Upsert one row per player, keeping the best value on each axis.
  insert into public.leaderboard as l (email_hash, tag, best_score, best_elapsed_ms, updated_at)
  values (v_email_hash, v_tag, v_score, v_elapsed, now())
  on conflict (email_hash) do update
    set tag             = excluded.tag,
        best_score      = greatest(l.best_score, excluded.best_score),
        best_elapsed_ms = greatest(l.best_elapsed_ms, excluded.best_elapsed_ms),
        updated_at      = now()
  returning l.best_score, l.best_elapsed_ms
    into v_best_score, v_best_elapsed;

  -- Rank = 1 + number of rows strictly better on that axis.
  return query
    select
      false,
      (select count(*)::integer from public.leaderboard where best_score > v_best_score) + 1,
      (select count(*)::integer from public.leaderboard where best_elapsed_ms > v_best_elapsed) + 1;

exception
  -- A concurrent insert grabbed the tag between our check and our write.
  when unique_violation then
    return query select true, null::integer, null::integer;
end;
$$;

-- ── tag_available RPC ────────────────────────────────────────────────────────
-- Lightweight, email-agnostic existence check for the live "name available?"
-- hint as the player types. The submit path stays authoritative.
create or replace function public.tag_available(p_tag text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.leaderboard where lower(tag) = lower(btrim(p_tag))
  );
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Only the service_role (the Edge route) may call these. Revoke the default
-- PUBLIC execute grant; anon/authenticated are never used but locked anyway.
revoke all on function public.submit_score(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.submit_score(text, text, integer, integer)
  to service_role;

revoke all on function public.tag_available(text) from public, anon, authenticated;
grant execute on function public.tag_available(text) to service_role;
