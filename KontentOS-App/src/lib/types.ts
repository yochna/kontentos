// Shared backend entity types (mirror the original KontentOS data model).

export type VideoStatus = 'uploading' | 'processing' | 'ready' | 'failed';
export type PublishStatus = 'pending' | 'published' | 'failed' | 'saved';
export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'x'
  | 'threads'
  | 'facebook';
export type ScheduledStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  instagram_token?: string;
  instagram_user_id?: string;
  instagram_username?: string;
  youtube_channel_id?: string;
  tiktok_username?: string;
  niche?: string;
  locale?: string;
  created_at: string;
}

export interface Video {
  id: string;
  user_id: string;
  title: string;
  file_name?: string;
  description?: string;
  file_url: string;
  thumbnail_url?: string;
  duration?: number;
  file_size?: number;
  aspect_ratio?: string;
  status: VideoStatus;
  created_at: string;
  updated_at: string;
}

export interface Caption {
  id: string;
  video_id: string;
  platform: SocialPlatform;
  caption_text: string;
  hashtags: string[];
  approved: boolean;
  character_count?: number;
  created_at: string;
}

export interface PublishingRecord {
  id: string;
  video_id: string;
  platform: SocialPlatform;
  platform_post_id?: string;
  url?: string;
  status: PublishStatus;
  error_message?: string;
  published_at: string;
}

export interface ScheduledPost {
  id: string;
  user_id?: string;
  video_id: string;
  video_title?: string;
  file_url?: string;
  thumbnail_url?: string;
  platform: SocialPlatform;
  caption_text: string;
  hashtags?: string[];
  scheduled_at: string;
  status: ScheduledStatus;
  published_at?: string;
  post_url?: string;
  cross_post_group_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbStatus {
  status: string;
  provider: 'supabase' | 'local_persistent_json';
  connected: boolean;
  isolated?: boolean;
  video_count: number;
}

export interface DraftBeat {
  label: string;
  time: string;
  body: string;
}

export interface ActiveDraft {
  id: string;
  title: string;
  idea?: {
    id: string;
    title: string;
    hook: string;
    format: string;
    why?: string;
    beats: DraftBeat[];
  };
  sourceVideo?: {
    id: string;
    title: string;
    file_url: string;
    thumbnail_url?: string;
    duration?: number;
  };
  presetId?: string;
  project?: import('./timeline').TimelineProject;
  publishing?: {
    caption: string;
    hashtags: string[];
    platforms: SocialPlatform[];
    scheduledAt?: string;
  };
  step: 'idea' | 'raw-reel' | 'smart-editor' | 'publish';
  updatedAt: string;
}

