import { describe, expect, it } from 'vitest';
import { isSameTakeName, rankReattachCandidates, type ReattachCandidate } from './reattachCandidates';

function take(id: string, title: string, overrides: Partial<ReattachCandidate> = {}): ReattachCandidate {
  return { id, title, file_url: `/uploads/${id}.mp4`, ...overrides };
}

describe('re-attach candidates', () => {
  it('puts the current copy of the same-named take first', () => {
    const ranked = rankReattachCandidates(
      [
        take('other', 'A different take'),
        take('old', '81496-576306063 (1)', { file_url: '/uploads/vanished.mp4' }),
        take('current', '  81496-576306063 (1)  '),
      ],
      '/uploads/vanished.mp4',
      '81496-576306063 (1)',
    );

    expect(ranked.map((video) => video.id)).toEqual(['current', 'other']);
  });

  it('only offers usable raw takes', () => {
    const ranked = rankReattachCandidates(
      [
        take('archived', 'kontentos_finished_reel_123'),
        take('unavailable', 'Broken take', { media_available: false }),
        take('no-file', 'No file', { file_url: undefined }),
        take('gone', 'Old take', { file_url: '/uploads/gone.mp4' }),
        take('good', 'Good take'),
      ],
      '/uploads/gone.mp4',
      'Old take',
    );

    expect(ranked.map((video) => video.id)).toEqual(['good']);
  });

  it('matches names without case or whitespace sensitivity', () => {
    expect(isSameTakeName('  My Take.MP4 ', 'my take.mp4')).toBe(true);
    expect(isSameTakeName('My Take', 'Another Take')).toBe(false);
    expect(isSameTakeName(undefined, 'My Take')).toBe(false);
  });

  it('offers nothing while there is no missing source to repair', () => {
    expect(rankReattachCandidates([take('good', 'Good take')], null, 'Good take')).toEqual([]);
  });
});
