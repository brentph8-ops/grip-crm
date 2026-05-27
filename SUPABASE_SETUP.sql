-- ═══════════════════════════════════════════════════════════════
-- GRIP CRM — Supabase Database Schema
-- Paste this entire file into the Supabase SQL Editor and click Run
-- ═══════════════════════════════════════════════════════════════


-- ── Main key-value data store ────────────────────────────────────
-- Each localStorage key becomes one row per user.
-- This lets the app keep working offline with zero schema changes.

create table if not exists grip_data (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  data_key   text not null,
  data_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  unique (user_id, data_key)
);

create or replace function grip_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists grip_data_updated_at on grip_data;
create trigger grip_data_updated_at
  before update on grip_data
  for each row execute function grip_set_updated_at();

alter table grip_data enable row level security;

-- Single-user policy: only bphillips@garlandco.com can read/write data.
-- If you transfer this app to another rep, update the email here and
-- run this block again in the SQL editor.
drop policy if exists "Users own their data" on grip_data;
drop policy if exists "Authorized rep only" on grip_data;
create policy "Authorized rep only"
  on grip_data for all
  using  (auth.uid() = user_id
          AND auth.jwt() ->> 'email' = 'bphillips@garlandco.com')
  with check (auth.uid() = user_id
          AND auth.jwt() ->> 'email' = 'bphillips@garlandco.com');


-- ── Contractor portal tokens ──────────────────────────────────────
-- When a rep clicks "Generate Contractor Link", a row is inserted here.
-- The token is a random URL-safe string — unguessable by design.
-- The full punch list snapshot is stored so contractors can read it
-- without needing their own auth account.

create table if not exists contractor_tokens (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users not null,
  punch_list_id        text not null,
  token                text unique not null
                         default encode(gen_random_bytes(24), 'base64url'),
  contractor_name      text,
  punch_list_snapshot  jsonb,          -- full list data at link-generation time
  expires_at           timestamptz default (now() + interval '60 days'),
  created_at           timestamptz default now()
);

alter table contractor_tokens enable row level security;

drop policy if exists "Reps manage their own tokens" on contractor_tokens;
drop policy if exists "Authorized rep manages tokens" on contractor_tokens;
create policy "Authorized rep manages tokens"
  on contractor_tokens for all
  using  (auth.uid() = user_id
          AND auth.jwt() ->> 'email' = 'bphillips@garlandco.com')
  with check (auth.uid() = user_id
          AND auth.jwt() ->> 'email' = 'bphillips@garlandco.com');

-- Contractors can read a token row by its token value (public portal access)
drop policy if exists "Public can read token by value" on contractor_tokens;
create policy "Public can read token by value"
  on contractor_tokens for select
  using (true);


-- ── Contractor submissions ────────────────────────────────────────
-- Contractors submit their completion notes and photo references here.
-- The rep sees these when they open the punch list detail.

create table if not exists contractor_submissions (
  id                uuid primary key default gen_random_uuid(),
  token             text not null references contractor_tokens(token),
  punch_list_id     text not null,
  items             jsonb not null default '[]'::jsonb,
  contractor_name   text,
  overall_notes     text,
  submitted_at      timestamptz default now()
);

alter table contractor_submissions enable row level security;

-- Anyone with a valid, non-expired token can submit
drop policy if exists "Token holders can submit" on contractor_submissions;
create policy "Token holders can submit"
  on contractor_submissions for insert
  with check (
    exists (
      select 1 from contractor_tokens ct
      where ct.token = contractor_submissions.token
        and (ct.expires_at is null or ct.expires_at > now())
    )
  );

-- Reps can read submissions belonging to their tokens
drop policy if exists "Reps read their submissions" on contractor_submissions;
create policy "Reps read their submissions"
  on contractor_submissions for select
  using (
    exists (
      select 1 from contractor_tokens ct
      where ct.token = contractor_submissions.token
        and ct.user_id = auth.uid()
    )
  );


-- ── Storage bucket ────────────────────────────────────────────────
-- Create this manually in Supabase Dashboard → Storage → New bucket:
--   Name:   grip-attachments
--   Public: false
--
-- Then add these policies in the bucket's Policies tab:
--
--   1. Authenticated users can upload to their own folder:
--      USING: (auth.uid()::text = (storage.foldername(name))[1])
--
--   2. Authenticated users can read from their own folder:
--      USING: (auth.uid()::text = (storage.foldername(name))[1])
--
--   3. Anyone can read contractor submission photos (folder: contractor/):
--      USING: (storage.foldername(name))[1] = 'contractor'
-- ─────────────────────────────────────────────────────────────────
