-- KontentOS — Supabase schema
--
-- Paste this whole file into the Supabase SQL Editor and Run. It is idempotent: running it
-- twice is safe.
--
-- Every column here exists because server/db.ts writes or reads it. Nothing is speculative:
-- User.niche / User.locale / User.youtube_channel_id are declared in the types but never
-- persisted, so they have no columns.
--
-- Timestamps are TEXT on purpose. The app writes JavaScript `new Date().toISOString()` values
-- and reads them back with `new Date(...)`. A timestamptz column would return them in Postgres
-- format instead of the string the JSON store uses, and ISO-8601 "Z" strings sort correctly as
-- text, which is what the ORDER BY clauses below rely on.

create table if not exists public.users (
  id text primary key,
  email text not null,
  full_name text not null,
  avatar_url text,
  instagram_token text,
  instagram_user_id text,
  instagram_username text,
  created_at text not null
);

create table if not exists public.videos (
  id text primary key,
  user_id text not null default 'user_default',
  title text not null,
  description text,
  file_name text,
  file_url text not null default '',
  thumbnail_url text,
  duration double precision,
  file_size bigint,
  aspect_ratio text,
  status text not null default 'uploading',
  created_at text not null,
  updated_at text not null
);

-- One subtitle set per video. listSubtitles() calls .maybeSingle() on video_id, so a second
-- row for the same video makes that read fail — the unique index is what saveSubtitles()
-- upserts against, not decoration.
create table if not exists public.subtitles (
  id text primary key,
  video_id text not null,
  srt_content text,
  vtt_content text,
  transcript_text text,
  language text,
  segments jsonb,
  created_at text not null
);
create unique index if not exists subtitles_video_id_key on public.subtitles (video_id);

-- One caption per video per platform, for the same reason: getCaption() filters on
-- (video_id, platform) with .maybeSingle().
create table if not exists public.captions (
  id text primary key,
  video_id text not null,
  platform text not null,
  caption_text text not null default '',
  hashtags jsonb,
  approved boolean not null default false,
  transcript_hash text,
  character_count integer,
  created_at text not null
);
create unique index if not exists captions_video_id_platform_key on public.captions (video_id, platform);

-- Append-only audit trail: every dispatch is a new row, never an update.
create table if not exists public.publishing_history (
  id text primary key,
  video_id text not null,
  platform text not null,
  platform_post_id text,
  url text,
  status text not null,
  error_message text,
  published_at text not null
);

create table if not exists public.scheduled_posts (
  id text primary key,
  user_id text default 'user_default',
  video_id text not null default '',
  video_title text,
  file_url text,
  thumbnail_url text,
  platform text not null default 'instagram',
  caption_text text not null default '',
  hashtags jsonb,
  scheduled_at text not null,
  status text not null default 'scheduled',
  published_at text,
  post_url text,
  cross_post_group_id text,
  created_at text,
  updated_at text
);

create index if not exists videos_user_created_idx on public.videos (user_id, created_at desc);
create index if not exists scheduled_posts_scheduled_at_idx on public.scheduled_posts (scheduled_at);
create index if not exists publishing_history_published_at_idx on public.publishing_history (published_at desc);

-- The app connects with the service role key only, and it never ships that key to the browser.
-- Locking the other roles down means a leaked project URL plus public anon key cannot read
-- or write a creator's library.
alter table public.users enable row level security;
alter table public.videos enable row level security;
alter table public.subtitles enable row level security;
alter table public.captions enable row level security;
alter table public.publishing_history enable row level security;
alter table public.scheduled_posts enable row level security;

revoke all on public.users from anon, authenticated;
revoke all on public.videos from anon, authenticated;
revoke all on public.subtitles from anon, authenticated;
revoke all on public.captions from anon, authenticated;
revoke all on public.publishing_history from anon, authenticated;
revoke all on public.scheduled_posts from anon, authenticated;

grant all on public.users, public.videos, public.subtitles, public.captions,
  public.publishing_history, public.scheduled_posts to service_role;
