-- ==============================================================================
-- KontentOS - Production Supabase PostgreSQL Schema
-- Run this in your Supabase Project's SQL Editor (https://app.supabase.com)
-- ==============================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  instagram_token TEXT,
  instagram_user_id TEXT,
  instagram_username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default user if not exists
INSERT INTO public.users (id, email, full_name, avatar_url)
VALUES (
  'user_default',
  'creator@kontentos.ai',
  'KontentOS Creator',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
)
ON CONFLICT (id) DO NOTHING;

-- 2. VIDEOS TABLE
CREATE TABLE IF NOT EXISTS public.videos (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'user_default',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  file_url TEXT DEFAULT '',
  thumbnail_url TEXT DEFAULT '',
  duration NUMERIC DEFAULT 0,
  file_size BIGINT DEFAULT 0,
  aspect_ratio TEXT DEFAULT '9:16',
  status TEXT DEFAULT 'uploading',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_user_id ON public.videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON public.videos(created_at DESC);

-- 3. SUBTITLES TABLE
CREATE TABLE IF NOT EXISTS public.subtitles (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  srt_content TEXT DEFAULT '',
  vtt_content TEXT DEFAULT '',
  transcript_text TEXT DEFAULT '',
  language TEXT DEFAULT 'en',
  segments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subtitles_video_id ON public.subtitles(video_id);

-- 4. CAPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.captions (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  platform TEXT DEFAULT 'instagram',
  caption_text TEXT DEFAULT '',
  hashtags TEXT[] DEFAULT '{}',
  approved BOOLEAN DEFAULT FALSE,
  transcript_hash TEXT DEFAULT '',
  character_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_captions_video_id ON public.captions(video_id);

-- 5. PUBLISHING HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.publishing_history (
  id TEXT PRIMARY KEY,
  video_id TEXT,
  platform TEXT NOT NULL,
  platform_post_id TEXT DEFAULT '',
  url TEXT DEFAULT '',
  status TEXT NOT NULL,
  error_message TEXT DEFAULT '',
  published_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publishing_history_published_at ON public.publishing_history(published_at DESC);

-- 6. SCHEDULED POSTS TABLE
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'user_default',
  video_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  caption_text TEXT DEFAULT '',
  hashtags TEXT[] DEFAULT '{}',
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'scheduled',
  published_at TIMESTAMPTZ,
  platform_post_id TEXT DEFAULT '',
  post_url TEXT DEFAULT '',
  error_message TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_at ON public.scheduled_posts(scheduled_at ASC);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON public.scheduled_posts(status);

-- 7. SUPABASE STORAGE BUCKET setup for videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to objects in videos bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public Access to Videos Bucket'
  ) THEN
    CREATE POLICY "Public Access to Videos Bucket" ON storage.objects
      FOR ALL USING (bucket_id = 'videos') WITH CHECK (bucket_id = 'videos');
  END IF;
END
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtitles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishing_history ENABLE ROW LEVEL SECURITY;

-- Allow read/write for authenticated and anon roles with API keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Allow all access to users'
  ) THEN
    CREATE POLICY "Allow all access to users" ON public.users FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'videos' AND policyname = 'Allow all access to videos'
  ) THEN
    CREATE POLICY "Allow all access to videos" ON public.videos FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subtitles' AND policyname = 'Allow all access to subtitles'
  ) THEN
    CREATE POLICY "Allow all access to subtitles" ON public.subtitles FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'captions' AND policyname = 'Allow all access to captions'
  ) THEN
    CREATE POLICY "Allow all access to captions" ON public.captions FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'publishing_history' AND policyname = 'Allow all access to publishing_history'
  ) THEN
    CREATE POLICY "Allow all access to publishing_history" ON public.publishing_history FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
