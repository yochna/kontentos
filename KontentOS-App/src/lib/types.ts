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
  /** False when the record survived a redeploy but its file on the ephemeral disk did not. */
  media_available?: boolean;
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
  user_id?: string;
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
  provider: 'mongodb' | 'local_persistent_json';
  connected: boolean;
  isolated?: boolean;
  /**
   * Where the clip *bytes* live. A database can hold the row for a file the disk no longer has, so
   * this is reported separately from `provider` and the app must not infer one from the other.
   */
  media?: { provider: 'local' | 'bucket'; durable: boolean; note: string };
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

/** Which cut is lit in the rail, and which station the creator was last standing at. */
export interface WorkspaceBench {
  cutId: string;
  station: string;
}

/**
 * The creator's own desk, one row per account. Everything here used to be a localStorage key on one
 * browser, so clearing site data cost the Room switches, the Brand Kit, the lit cut, the last
 * station, the timeline being edited and the draft in progress.
 *
 * The four content slots stay opaque: a brand kit and a timeline project are the editor's shapes, and
 * copying them into a shared type would only be a place for the client and the stored row to drift.
 */
export interface WorkspaceRow {
  userId: string;
  prefs: Record<string, unknown> | null;
  brandKit: Record<string, unknown> | null;
  bench: WorkspaceBench | null;
  project: Record<string, unknown> | null;
  draft: Record<string, unknown> | null;
  updatedAt: string;
}

export type WorkspaceSlot = 'prefs' | 'brandKit' | 'bench' | 'project' | 'draft';

/** A slot set to null clears it; a slot left out of the patch is not touched. */
export type WorkspacePatch = Partial<Record<WorkspaceSlot, unknown>>;

