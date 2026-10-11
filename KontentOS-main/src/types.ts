/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VideoStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type PublishStatus = 'pending' | 'published' | 'failed' | 'saved';

export type SocialPlatform = 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'x' | 'threads' | 'facebook';

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  instagram_token?: string;
  instagram_user_id?: string;
  instagram_username?: string;
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
  duration?: number; // duration in seconds
  file_size?: number; // size in bytes
  aspect_ratio?: string; // e.g. "9:16", "16:9"
  status: VideoStatus;
  created_at: string;
  updated_at: string;
}

export interface Subtitle {
  id: string;
  video_id: string;
  srt_content: string;
  vtt_content: string;
  transcript_text: string;
  language?: string;
  segments?: Array<{ id: number; start: string; end: string; text: string }>;
  created_at: string;
}

export interface Caption {
  id: string;
  video_id: string;
  platform: SocialPlatform;
  caption_text: string;
  hashtags: string[];
  approved: boolean;
  transcript_hash?: string;
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

export type ScheduledStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

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
  platform_post_id?: string;
  post_url?: string;
  cross_post_group_id?: string;
  error_message?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
