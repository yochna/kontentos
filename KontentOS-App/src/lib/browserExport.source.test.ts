import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportTimeline, SourceUnavailableError } from './browserExport';
import type { TimelineProject, VideoClip } from './timeline';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function clip(): VideoClip {
  return {
    id: 'video_1',
    name: 'Clip',
    type: 'video',
    startOnTimeline: 0,
    duration: 1,
    sourceStartOffset: 0,
    sourceFileId: 'vid_missing',
    sourceUrl: '/uploads/vid_missing.mp4',
    speedMultiplier: 1,
    keyframes: [],
    audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 },
  };
}

function project(): TimelineProject {
  return {
    schemaVersion: '1.0.0',
    projectMetadata: {
      id: 'project_1',
      title: 'Source check',
      targetAspectRatio: '9:16',
      width: 1080,
      height: 1920,
      frameRate: 30,
      totalDuration: 1,
    },
    globalAudioTracks: { bgmVolume: 0.25, duckingEnabled: true },
    tracks: [
      {
        id: 'track-video',
        name: 'Primary Video',
        type: 'video',
        isMuted: false,
        isLocked: false,
        zIndex: 10,
        clips: [clip()],
      },
    ],
  };
}

function respond(status: number) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
  }) as unknown as typeof fetch;
}

describe('export source availability', () => {
  it('marks a 404 source as repairable and keeps the URL for re-attaching', async () => {
    respond(404);

    const failure = await exportTimeline({
      project: project(),
      width: 1080,
      height: 1920,
      fps: 30,
    }, () => {}).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SourceUnavailableError);
    expect(failure).toMatchObject({
      status: 404,
      sourceUrl: '/uploads/vid_missing.mp4',
    });
    expect((failure as Error).message).toContain('Re-attach');
  });

  it('keeps the account-specific message for a forbidden source', async () => {
    respond(403);

    const failure = await exportTimeline({
      project: project(),
      width: 1080,
      height: 1920,
      fps: 30,
    }, () => {}).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SourceUnavailableError);
    expect((failure as Error).message).toContain('not on your account');
  });
});
