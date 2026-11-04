/**
 * The Studio's own thin API client. Deliberately small: it speaks only to the endpoints the Studio
 * uses, so nothing here can drift out of step with the bench's larger client.
 */

export type ClipStatus = 'draft' | 'saved' | 'shipped';

export interface ClipBeat {
  label: string;
  time: string;
  body: string;
}

export interface RepurposeClip {
  id: string;
  start: number;
  end: number;
  startLabel: string;
  endLabel: string;
  spanSeconds: number;
  score: number;
  title: string;
  hook: string;
  excerpt: string;
  beats: ClipBeat[];
  caption: string;
  cardHeadline: string;
  platform: string;
  status: ClipStatus;
}

export interface RepurposeJob {
  id: string;
  title: string;
  sourceKind: 'video' | 'paste';
  videoId: string;
  transcript: string;
  createdAt: string;
  updatedAt: string;
  engineModel: string;
  engineSource: 'engine' | 'local';
  clips: RepurposeClip[];
}

export interface SessionUser {
  id: string;
  email: string;
  full_name?: string;
  displayName?: string;
}

export interface VideoRecord {
  id: string;
  title?: string;
  file_url?: string;
  duration?: number | string;
  status?: string;
  created_at?: string;
  /** Bytes on disk, and whether this container still has them — a cut can only be made from media
   *  that is actually here. */
  file_size?: number;
  media_available?: boolean;
  aspect_ratio?: string;
}

async function json<T>(res: Response): Promise<T> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* HTML from a proxy or a gateway page — treated as an unusable reply below. */
  }
  if (!res.ok) {
    const detail = (data as { error?: string } | null)?.error;
    if (res.status === 401) {
      window.dispatchEvent(new Event('st:signed-out'));
    }
    throw new Error(detail || `The studio could not complete that (${res.status}).`);
  }
  return data as T;
}

async function get<T>(url: string): Promise<T> {
  return json<T>(await fetch(url, { credentials: 'same-origin' }));
}

async function post<T>(url: string, body: unknown): Promise<T> {
  return json<T>(
    await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
  );
}

async function patch<T>(url: string, body: unknown): Promise<T> {
  return json<T>(
    await fetch(url, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
  );
}

async function del<T>(url: string): Promise<T> {
  return json<T>(await fetch(url, { method: 'DELETE', credentials: 'same-origin' }));
}

export const studioApi = {
  async me(): Promise<SessionUser | null> {
    const d = await get<{ data: SessionUser | null }>('/api/auth/me');
    return d.data || null;
  },

  async signIn(email: string, password: string): Promise<SessionUser> {
    const d = await post<{ data: SessionUser }>('/api/auth/login', { email, password });
    return d.data;
  },

  async signUp(fullName: string, email: string, password: string): Promise<SessionUser> {
    const d = await post<{ data: SessionUser }>('/api/auth/signup', {
      full_name: fullName,
      email,
      password,
    });
    return d.data;
  },

  async signOut(): Promise<void> {
    await post('/api/auth/logout', {});
  },

  async listVideos(): Promise<VideoRecord[]> {
    const d = await get<{ data: VideoRecord[] }>('/api/videos');
    return d.data || [];
  },

  async subtitles(videoId: string): Promise<{ transcript: string; segments: unknown[] } | null> {
    try {
      interface SubtitleBody {
        transcript?: string;
        transcript_text?: string;
        segments?: unknown[];
      }
      const d = await get<{ data?: SubtitleBody } & SubtitleBody>(
        `/api/transcribe/${encodeURIComponent(videoId)}`
      );
      const body = d.data || d;
      // The subtitle row the server hands back calls this `transcript_text`; reading only
      // `transcript` made every recorded clip look uncaptioned and blocked the Studio's whole intake.
      const transcript = (body.transcript || body.transcript_text || '').trim();
      if (!transcript && !body.segments?.length) return null;
      return { transcript, segments: body.segments || [] };
    } catch {
      return null;
    }
  },

  async jobs(): Promise<RepurposeJob[]> {
    const d = await get<{ data: RepurposeJob[] }>('/api/repurpose/jobs');
    return d.data || [];
  },

  async job(id: string): Promise<RepurposeJob> {
    const d = await get<{ data: RepurposeJob }>(`/api/repurpose/jobs/${encodeURIComponent(id)}`);
    return d.data;
  },

  async startJob(input: {
    title: string;
    transcript: string;
    videoId?: string;
    sourceKind?: 'video' | 'paste';
    clipCount?: number;
    /** Which composer the shorts are written for; decides the caption shape and its limit. */
    platform?: string;
    tone?: string;
    context?: string;
    temperature?: number;
    model?: string;
  }): Promise<RepurposeJob> {
    const d = await post<{ data: RepurposeJob }>('/api/repurpose/jobs', input);
    return d.data;
  },

  async updateClip(
    jobId: string,
    clipId: string,
    changes: Partial<Pick<RepurposeClip, 'title' | 'hook' | 'caption' | 'cardHeadline' | 'status' | 'platform'>>
  ): Promise<RepurposeClip> {
    const d = await patch<{ data: RepurposeClip }>(
      `/api/repurpose/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(clipId)}`,
      changes
    );
    return d.data;
  },

  async deleteJob(id: string): Promise<void> {
    await del(`/api/repurpose/jobs/${encodeURIComponent(id)}`);
  },

  /**
   * Puts a file produced in the browser — a Studio span cut — into the vault as a real clip, in
   * 5 MB chunks. The direct route is capped at 100 MB of base64 in one JSON body, and a re-encoded
   * short can exceed that, so the chunked path is the only one that never fails at an arbitrary
   * length.
   */
  async uploadClip(
    file: Blob,
    opts: { fileName: string; title: string; duration?: number; aspectRatio?: string },
    onProgress?: (fraction: number) => void
  ): Promise<VideoRecord> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const CHUNK = 5 * 1024 * 1024;
    const totalChunks = Math.max(1, Math.ceil(bytes.length / CHUNK));

    const init = await post<{ success: boolean; uploadId: string }>('/api/upload/init', {
      fileName: opts.fileName,
      totalChunks,
      totalSize: bytes.length,
    });
    if (!init.uploadId) throw new Error('The vault did not open an upload session.');

    for (let i = 0; i < totalChunks; i++) {
      const slice = bytes.subarray(i * CHUNK, (i + 1) * CHUNK);
      await post('/api/upload/chunk', {
        uploadId: init.uploadId,
        chunkIndex: i,
        chunkData: toBase64(slice),
      });
      onProgress?.((i + 1) / totalChunks);
    }

    const done = await post<{ success: boolean; video: VideoRecord }>('/api/upload/complete', {
      uploadId: init.uploadId,
      title: opts.title,
      duration: opts.duration,
      aspectRatio: opts.aspectRatio,
    });
    return done.video;
  },
};

/** String.fromCharCode over 5 MB of arguments would blow the stack, so it goes in 32 KB bites. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}
