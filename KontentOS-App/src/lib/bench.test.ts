import { describe, expect, it } from 'vitest';
import {
  buildLedger,
  DRAFT_STEP_STATION,
  fmtBytes,
  formatDuration,
  lastStation,
  LEDGER_STAGES,
  ledgerProgress,
  ledgerStage,
  PHASES,
  rememberStation,
  STATION_BY_ID,
  UTILITY_STATIONS,
  type StationId,
} from './bench';
import type { PublishingRecord, ScheduledPost, Video } from './types';
import type { TimelineProject } from './timeline';

const CUT_ID = 'vid_1';

const video = (over: Partial<Video> = {}): Video => ({
  id: CUT_ID,
  user_id: 'u1',
  title: 'city-run',
  file_url: '/uploads/city-run.mp4',
  status: 'ready',
  created_at: '2026-11-02T05:00:00.000Z',
  updated_at: '2026-11-02T05:00:00.000Z',
  ...over,
});

const scheduledPost = (over: Partial<ScheduledPost> = {}): ScheduledPost => ({
  id: 'sp1',
  video_id: CUT_ID,
  platform: 'instagram',
  caption_text: ' caption',
  scheduled_at: '2026-11-05T09:00:00.000Z',
  status: 'scheduled',
  ...over,
});

const shipped = (over: Partial<PublishingRecord> = {}): PublishingRecord => ({
  id: 'ph1',
  video_id: CUT_ID,
  platform: 'instagram',
  status: 'published',
  published_at: '2026-11-05T09:05:00.000Z',
  ...over,
});

/** A timeline that holds this cut's source is the only proof the 'cut' step can be done. */
const projectWith = (sourceFileId: string): TimelineProject =>
  ({
    tracks: [{ id: 't1', type: 'video', clips: [{ id: 'c1', type: 'video', sourceFileId }] }],
  }) as unknown as TimelineProject;

const empty = { scheduled: [], history: [], project: null };

describe('cut ledger', () => {
  it('marks intake done and the timeline step as the one open move', () => {
    const steps = buildLedger(video(), empty);
    expect(steps.map((s) => s.state)).toEqual(['done', 'now', 'next', 'next']);
    expect(steps[1].detail).toBe('No timeline yet');
    expect(ledgerProgress(steps)).toBe(0.25);
  });

  it('counts a timeline as a cut only when it holds this cut', () => {
    const mine = buildLedger(video(), { ...empty, project: projectWith(CUT_ID) });
    expect(mine[1].state).toBe('done');
    expect(mine[2].state).toBe('now');

    const someoneElses = buildLedger(video(), { ...empty, project: projectWith('vid_other') });
    expect(someoneElses[1].state).toBe('now');
  });

  it('keeps shipped at "waiting on its date" until a history row proves it went out', () => {
    const queued = buildLedger(video(), { scheduled: [scheduledPost()], history: [], project: projectWith(CUT_ID) });
    expect(queued[2].state).toBe('done');
    expect(queued[3].state).toBe('now');
    expect(queued[3].detail).toBe('Waiting on its date');

    const shippedSteps = buildLedger(video(), {
      scheduled: [scheduledPost()],
      history: [shipped()],
      project: projectWith(CUT_ID),
    });
    expect(shippedSteps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done']);
    expect(ledgerProgress(shippedSteps)).toBe(1);
  });

  it('ignores failed and saved rows when deciding what shipped', () => {
    const steps = buildLedger(video(), {
      scheduled: [],
      history: [shipped({ status: 'failed' }), shipped({ status: 'saved', id: 'ph2' })],
      project: null,
    });
    expect(steps[3].state).not.toBe('done');
  });

  it('reports the queue by the cut that is actually in it', () => {
    const steps = buildLedger(video(), { scheduled: [scheduledPost({ video_id: 'vid_other' })], history: [], project: null });
    expect(steps[2].detail).toBe('Not scheduled');
  });
});

describe('bench station map', () => {
  const ALL_SCREENS = [
    'home',
    'ideas',
    'raw-reel',
    'smart-editor',
    'static-generator',
    'publish-schedule',
    'content-library',
    'calendar',
    'analytics',
    'brand-kit',
    'settings',
  ] as const;

  it('gives every screen a station key, so no navigate() lands on an empty spine', () => {
    for (const id of ALL_SCREENS) {
      expect(STATION_BY_ID[id], `station for ${id}`).toBeTruthy();
    }
    expect(Object.keys(STATION_BY_ID)).toHaveLength(ALL_SCREENS.length);
  });

  it('lists each station once across the phases and the utility rail', () => {
    const ids = [...PHASES.flatMap((p) => p.stations), ...UTILITY_STATIONS].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('routes every workflow step to a station that exists', () => {
    for (const id of Object.values(DRAFT_STEP_STATION)) {
      expect(STATION_BY_ID[id]).toBeTruthy();
    }
  });
});

describe('timecodes', () => {
  it('shows a placeholder rather than zero for a clip the server never measured', () => {
    expect(formatDuration(undefined)).toBe('--:--.-');
    expect(formatDuration(0)).toBe('--:--.-');
    expect(formatDuration(49.62)).toBe('00:49.6');
  });
});

describe('rail filtering', () => {
  it('reports the first step the ledger cannot prove as done', () => {
    expect(ledgerStage(buildLedger(video(), empty))).toBe('Cut');
    expect(ledgerStage(buildLedger(video(), { ...empty, project: projectWith(CUT_ID) }))).toBe('Queued');
    expect(
      ledgerStage(
        buildLedger(video(), { scheduled: [scheduledPost()], history: [shipped()], project: projectWith(CUT_ID) })
      )
    ).toBe('Shipped');
  });

  it('uses only stage names the filter chips know, so a chip can never be dead', () => {
    for (const steps of [
      buildLedger(video(), empty),
      buildLedger(video(), { ...empty, project: projectWith(CUT_ID) }),
      buildLedger(video(), { scheduled: [scheduledPost()], history: [shipped()], project: projectWith(CUT_ID) }),
    ]) {
      for (const step of steps) expect(LEDGER_STAGES).toContain(step.label);
      expect(LEDGER_STAGES).toContain(ledgerStage(steps));
    }
  });

  it('names a stage for every cut the rail can draw', () => {
    expect(ledgerStage(buildLedger(video(), empty))).not.toBeNull();
    expect(ledgerStage([])).toBeNull();
  });
});

describe('byte formatting', () => {
  it('never reports a real file as 0.0 MB', () => {
    // A phone take can be 43 KB: rounding it to megabytes showed "0.0 MB" and made the panel
    // read as broken data.
    expect(fmtBytes(44_000)).toBe('43 KB');
    expect(fmtBytes(4_400)).toBe('4.3 KB');
    expect(fmtBytes(1_500_000)).toBe('1.43 MB');
    expect(fmtBytes(43_000_000)).toBe('41.0 MB');
    expect(fmtBytes(2_400_000_000)).toBe('2.24 GB');
  });

  it('says the bytes are missing instead of inventing a size', () => {
    expect(fmtBytes(undefined)).toBe('not set yet');
    expect(fmtBytes(0)).toBe('not set yet');
  });

  it('puts the same number in the ledger', () => {
    const steps = buildLedger(video({ file_size: 44_000 }), empty);
    expect(steps[0].detail).toBe('43 KB on disk');
    expect(buildLedger(video(), empty)[0].detail).toBe('On the bench');
  });
});

describe('station memory', () => {
  const KNOWN = ['home', 'raw-reel'] as StationId[];

  it('opens on nothing before the account row arrives, and never throws in Node', () => {
    // The workspace cache is empty until hydration, and Node has no window at all: the bench must
    // still open on the desk rather than crash the app.
    expect(lastStation(KNOWN)).toBeNull();
    expect(() => rememberStation('raw-reel')).not.toThrow();
  });

  it('remembers the station the creator left, and drops one the app no longer has', () => {
    expect(lastStation(KNOWN)).toBe('raw-reel');
    rememberStation('smart-editor' as StationId);
    expect(lastStation(KNOWN)).toBeNull();
  });
});
