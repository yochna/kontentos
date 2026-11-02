import { useMemo } from 'react';
import { useStore } from './store';
import type { StationId } from './bench';

export interface Hit {
  key: string;
  kind: 'Idea' | 'Clip' | 'Scheduled' | 'Published';
  icon: string;
  title: string;
  meta: string;
  station: StationId;
  /** Set for rows that represent a cut, so opening a hit also puts it on the bench. */
  videoId?: string;
  payload?: Record<string, string>;
}

/** Search covers the signed-in account's own rows only — never a placeholder result. */
export function useHits(query: string, max = 8): Hit[] {
  const { savedIdeas, videos, scheduled, history } = useStore();
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const titleOf = (videoId: string) => videos.find((v) => v.id === videoId)?.title ?? 'Untitled clip';
    const out: Hit[] = [];

    for (const v of videos) {
      if (`${v.title} ${v.description ?? ''} ${v.file_name ?? ''}`.toLowerCase().includes(q)) {
        out.push({
          key: `clip-${v.id}`,
          kind: 'Clip',
          icon: 'movie',
          title: v.title,
          meta: `clip · ${v.status}`,
          station: 'smart-editor',
          videoId: v.id,
        });
      }
    }
    for (const s of scheduled) {
      const label = s.video_title || titleOf(s.video_id);
      if (`${label} ${s.caption_text} ${s.platform}`.toLowerCase().includes(q)) {
        out.push({
          key: `sched-${s.id}`,
          kind: 'Scheduled',
          icon: 'schedule',
          title: label,
          meta: `queued · ${s.platform} · ${new Date(s.scheduled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
          station: 'publish-schedule',
          videoId: s.video_id,
        });
      }
    }
    for (const h of history) {
      if (`${titleOf(h.video_id)} ${h.platform} ${h.status}`.toLowerCase().includes(q)) {
        out.push({
          key: `hist-${h.id}`,
          kind: 'Published',
          icon: 'cloud_done',
          title: titleOf(h.video_id),
          meta: `shipped · ${h.platform} · ${new Date(h.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
          station: 'analytics',
          videoId: h.video_id,
        });
      }
    }
    for (const i of savedIdeas) {
      if (`${i.title} ${i.excerpt} ${i.category}`.toLowerCase().includes(q)) {
        out.push({ key: `idea-${i.id}`, kind: 'Idea', icon: 'lightbulb', title: i.title, meta: `seed · ${i.category}`, station: 'ideas' });
      }
    }
    return out.slice(0, max);
  }, [query, savedIdeas, videos, scheduled, history, max]);
}
