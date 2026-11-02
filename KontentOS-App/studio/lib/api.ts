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
      const d = await get<{
        data?: { transcript?: string; segments?: unknown[] };
        transcript?: string;
        segments?: unknown[];
      }>(`/api/transcribe/${encodeURIComponent(videoId)}`);
      const body = d.data || d;
      const transcript = (body.transcript || '').trim();
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
};
