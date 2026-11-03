import { useSyncExternalStore } from 'react';
import type { ScreenId } from './nav';
import type { PublishingRecord, ScheduledPost, Video } from './types';
import type { TimelineProject } from './timeline';
import { fmtTime } from './timeline';

/**
 * The bench replaces "pick a room, find the tool". A creator works on one cut at a time and
 * walks it through four phases, so the stations are grouped by what is happening to that cut
 * rather than by which feature was built first. Station ids stay the existing ScreenIds — the
 * engines move in unchanged, and every legacy `navigate('smart-editor')` call still lands.
 */
export type StationId = ScreenId;

export type PhaseId = 'in' | 'cut' | 'out' | 'read';

export interface StationMeta {
  id: StationId;
  /** Machine-shop label: short enough to sit under a 44px key. */
  label: string;
  icon: string;
  /** One line the inspector can show so a station explains itself before it is opened. */
  hint: string;
}

export interface Phase {
  id: PhaseId;
  label: string;
  /** What the creator is doing to the cut in this phase, said plainly. */
  note: string;
  stations: StationMeta[];
}

export const PHASES: Phase[] = [
  {
    id: 'in',
    label: 'In',
    note: 'Find the angle, bring the footage onto the bench.',
    stations: [
      { id: 'ideas', label: 'Seeds', icon: 'auto_awesome', hint: 'Prompts worth shooting.' },
      { id: 'raw-reel', label: 'Intake', icon: 'smart_display', hint: 'Raw footage in, first cut out.' },
    ],
  },
  {
    id: 'cut',
    label: 'Cut',
    note: 'Trim it, caption it, give it a look.',
    stations: [
      { id: 'smart-editor', label: 'Bench', icon: 'content_cut', hint: 'Timeline, keyframes, captions.' },
      { id: 'static-generator', label: 'Card', icon: 'photo_size_select_actual', hint: 'Slide-post studio.' },
    ],
  },
  {
    id: 'out',
    label: 'Out',
    note: 'Write the caption, set the date, let it go.',
    stations: [
      { id: 'publish-schedule', label: 'Ship', icon: 'schedule_send', hint: 'Caption, platform, queue.' },
      { id: 'calendar', label: 'Plan', icon: 'calendar_today', hint: 'The next two weeks.' },
      { id: 'content-library', label: 'Vault', icon: 'grid_view', hint: 'Everything already made.' },
    ],
  },
  {
    id: 'read',
    label: 'Read',
    note: 'What your own workspace has actually done.',
    stations: [{ id: 'analytics', label: 'Pulse', icon: 'equalizer', hint: 'Your own numbers, counted honestly.' }],
  },
];

/** Utility stations live outside the phases — they tune the room, not the cut. */
export const UTILITY_STATIONS: StationMeta[] = [
  { id: 'brand-kit', label: 'Kit', icon: 'palette', hint: 'Fonts, colours, logo lockups.' },
  { id: 'settings', label: 'Room', icon: 'settings', hint: 'Account and workspace.' },
];

export const STATION_BY_ID: Record<string, StationMeta> = Object.fromEntries(
  [...PHASES.flatMap((p) => p.stations), ...UTILITY_STATIONS, { id: 'home' as StationId, label: 'Desk', icon: 'space_dashboard', hint: 'The whole bench at once.' }].map(
    (s) => [s.id, s]
  )
);

/** Where a workflow step (ActiveDraft.step) opens on the bench. */
export const DRAFT_STEP_STATION: Record<'idea' | 'raw-reel' | 'smart-editor' | 'publish', StationId> = {
  idea: 'ideas',
  'raw-reel': 'raw-reel',
  'smart-editor': 'smart-editor',
  publish: 'publish-schedule',
};

// ---------------------------------------------------------------------------
// The selected cut
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'kontentos_bench_cut';

let selectedId: string | null = readStored();
const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode: the selection just won't survive a reload */
  }
}

export function getSelectedCutId(): string | null {
  return selectedId;
}

/**
 * Sign-out removes the stored cut, but this module already read it into `selectedId`, so a second
 * account signing in in the same tab would open on the first one's clip until the page reloads.
 */
export function resetSelectedCut(): void {
  if (selectedId === null) return;
  selectedId = null;
  writeStored(null);
  for (const notify of listeners) notify();
}

/**
 * Selecting a cut is the one piece of state the whole bench reacts to: the rail marks it, the
 * inspector reads its dossier, and stations that take a clip open on it.
 */
export function selectCut(id: string | null): void {
  if (selectedId === id) return;
  selectedId = id;
  writeStored(id);
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useSelectedCutId(): string | null {
  return useSyncExternalStore(subscribe, getSelectedCutId, () => null);
}

// ---------------------------------------------------------------------------
// Cut ledger — which phase this cut has genuinely reached
// ---------------------------------------------------------------------------

export type LedgerState = 'done' | 'now' | 'next';

/** The stage names, in order — the rail filters and the ledger share this so they can't drift. */
export const LEDGER_STAGES = ['Intake', 'Cut', 'Queued', 'Shipped'] as const;

export type LedgerStage = (typeof LEDGER_STAGES)[number];

export interface LedgerStep {
  phase: PhaseId;
  label: LedgerStage;
  state: LedgerState;
  detail: string;
  station: StationId;
}

/**
 * Nothing here is inferred from a status field the creator never set. A step is done only when
 * a row exists that proves it: the clip is on disk, a timeline holds its source, a queue row
 * carries its id, a history row says it shipped.
 */
export function buildLedger(
  video: Video,
  ctx: { scheduled: ScheduledPost[]; history: PublishingRecord[]; project: TimelineProject | null }
): LedgerStep[] {
  const queued = ctx.scheduled.filter((p) => p.video_id === video.id);
  const shipped = ctx.history.filter((h) => h.video_id === video.id && h.status === 'published');
  const onBench = !!ctx.project?.tracks.some(
    (t) => t.type === 'video' && t.clips.some((c) => c.type === 'video' && c.sourceFileId === video.id)
  );

  const raw: LedgerStep[] = [
    {
      phase: 'in',
      label: 'Intake',
      state: 'done',
      detail: video.file_size ? `${(video.file_size / 1048576).toFixed(1)} MB on disk` : 'On the bench',
      station: 'raw-reel',
    },
    {
      phase: 'cut',
      label: 'Cut',
      state: onBench ? 'done' : 'next',
      detail: onBench ? 'Timeline open' : 'No timeline yet',
      station: 'smart-editor',
    },
    {
      phase: 'out',
      label: 'Queued',
      state: queued.length ? 'done' : 'next',
      detail: queued.length
        ? `${queued.length} in the queue · ${new Date(queued[0].scheduled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        : 'Not scheduled',
      station: 'publish-schedule',
    },
    {
      phase: 'out',
      label: 'Shipped',
      state: shipped.length ? 'done' : 'next',
      detail: shipped.length
        ? `${shipped.length} marked published`
        : queued.length
          ? 'Waiting on its date'
          : 'Nothing to ship',
      station: 'publish-schedule',
    },
  ];

  const firstOpen = raw.findIndex((s) => s.state === 'next');
  return raw.map((s, i) => (s.state === 'next' && i === firstOpen ? { ...s, state: 'now' } : s));
}

/** How far along the cut is, for the rail's hairline fill. */
export function ledgerProgress(steps: LedgerStep[]): number {
  const done = steps.filter((s) => s.state === 'done').length;
  return steps.length ? done / steps.length : 0;
}

/** Where a cut currently sits: its first step that isn't provably done. */
export function ledgerStage(steps: LedgerStep[]): LedgerStage | null {
  const open = steps.find((s) => s.state !== 'done');
  return (open ?? steps[steps.length - 1])?.label ?? null;
}

export function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return '--:--.-';
  return fmtTime(sec);
}

// ---------------------------------------------------------------------------
// Last station, per account
// ---------------------------------------------------------------------------

const STATION_KEY = 'kontentos_bench_station';

const stationKey = (account: string) => `${STATION_KEY}:${account}`;

/**
 * A creator who closes the laptop mid-cut expects the bench to be on the same station when they
 * come back. Keyed by account so a second creator signing in here doesn't inherit the first one's
 * last open engine, and validated against the registry so a retired station id can't blank the stage.
 */
export function lastStation(account: string, known: readonly StationId[]): StationId | null {
  try {
    const saved = window.localStorage.getItem(stationKey(account));
    return saved && known.includes(saved as StationId) ? (saved as StationId) : null;
  } catch {
    return null;
  }
}

export function rememberStation(account: string, id: StationId): void {
  try {
    window.localStorage.setItem(stationKey(account), id);
  } catch {
    /* private mode: the bench just always opens on the desk */
  }
}
