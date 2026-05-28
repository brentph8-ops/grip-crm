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

-- Multi-user policy: any @garlandco.com Google account can sign in.
-- Each rep gets their own isolated data silo (user_id scoped).
-- To restrict to a single email, replace the LIKE check with = 'email@domain.com'.
drop policy if exists "Users own their data" on grip_data;
drop policy if exists "Authorized rep only" on grip_data;
drop policy if exists "Garland reps own their data" on grip_data;
create policy "Garland reps own their data"
  on grip_data for all
  using  (auth.uid() = user_id
          AND auth.jwt() ->> 'email' LIKE '%@garlandco.com')
  with check (auth.uid() = user_id
          AND auth.jwt() ->> 'email' LIKE '%@garlandco.com');


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
drop policy if exists "Garland reps manage tokens" on contractor_tokens;
create policy "Garland reps manage tokens"
  on contractor_tokens for all
  using  (auth.uid() = user_id
          AND auth.jwt() ->> 'email' LIKE '%@garlandco.com')
  with check (auth.uid() = user_id
          AND auth.jwt() ->> 'email' LIKE '%@garlandco.com');

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
-- Stores punch list photos and proposal attachments as real files
-- instead of base64 dataURLs in localStorage (much better for mobile).

-- 1. Create the bucket (run this once; safe to re-run)
insert into storage.buckets (id, name, public)
values ('grip-attachments', 'grip-attachments', true)
on conflict (id) do nothing;

-- 2. Reps can upload files into their own user-id folder
drop policy if exists "Reps upload own files" on storage.objects;
create policy "Reps upload own files"
  on storage.objects for insert
  with check (
    bucket_id = 'grip-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
    and auth.jwt() ->> 'email' LIKE '%@garlandco.com'
  );

-- 3. Reps can read their own files (and update/delete them)
drop policy if exists "Reps read own files" on storage.objects;
create policy "Reps read own files"
  on storage.objects for select
  using (
    bucket_id = 'grip-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Reps delete own files" on storage.objects;
create policy "Reps delete own files"
  on storage.objects for delete
  using (
    bucket_id = 'grip-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. Since the bucket is public, the getPublicUrl() in the app returns
--    a URL readable by anyone (including contractor portal).
--    No extra anon policy needed for public buckets.


-- ── Realtime ──────────────────────────────────────────────────────
-- Enable Realtime on grip_data so that a second device receives
-- changes without a page reload.

alter publication supabase_realtime add table grip_data;

-- Row-level filter is enforced in the JS subscription (user_id=eq.<uid>).
-- The RLS policy above already restricts what each user can see.


-- ── Diagnostics helper (optional) ────────────────────────────────
-- Returns the number of rows and last updated_at for a given user.
-- Useful for debugging sync issues from the Supabase SQL editor.
--
-- SELECT data_key, updated_at
-- FROM grip_data
-- WHERE user_id = '<paste-your-user-id-here>'
-- ORDER BY updated_at DESC;
-- ─────────────────────────────────────────────────────────────────
