import { describe, expect, it } from 'vitest';
import { spanCaptions, srtTimestamp } from './captions';

const cue = (start: string, end: string, text: string) => ({ start, end, text });

describe('srtTimestamp', () => {
  it('writes the SRT clock at millisecond precision', () => {
    expect(srtTimestamp(0)).toBe('00:00:00,000');
    expect(srtTimestamp(1.5)).toBe('00:00:01,500');
    expect(srtTimestamp(72.25)).toBe('00:01:12,250');
    expect(srtTimestamp(3661.004)).toBe('01:01:01,004');
  });

  it('never writes a negative time', () => {
    expect(srtTimestamp(-5)).toBe('00:00:00,000');
  });
});

describe('spanCaptions', () => {
  it('rebases the cues it keeps so the file starts at zero', () => {
    const srt = spanCaptions(
      [
        cue('00:01:05,000', '00:01:07,500', 'the first line of the span'),
        cue('00:01:07,500', '00:01:10,000', 'the second  one'),
      ],
      65,
      70
    );
    expect(srt).toBe(
      '1\n00:00:00,000 --> 00:00:02,500\nthe first line of the span\n\n' +
        '2\n00:00:02,500 --> 00:00:05,000\nthe second one\n'
    );
  });

  it('drops what the cut does not contain and renumbers what it does', () => {
    const srt = spanCaptions(
      [
        cue('00:00:00,000', '00:00:04,000', 'before the short'),
        cue('00:00:04,000', '00:00:09,000', 'inside it'),
        cue('00:00:09,000', '00:00:14,000', 'after it'),
      ],
      4,
      9
    );
    expect(srt).toContain('inside it');
    expect(srt).not.toContain('before the short');
    expect(srt).not.toContain('after it');
    expect(srt.startsWith('1\n')).toBe(true);
  });

  it('clamps a cue that runs past the last frame', () => {
    const srt = spanCaptions([cue('00:00:05,000', '00:00:20,000', 'one long thought')], 0, 8);
    expect(srt).toContain('00:00:05,000 --> 00:00:08,000');
  });

  it('reads numeric cue times, which is what the live transcriber stores', () => {
    const srt = spanCaptions([{ start: 2, end: 4.5, text: 'spoken here' }], 2, 5);
    expect(srt).toContain('00:00:00,000 --> 00:00:02,500');
  });

  it('says nothing when the span holds no speech', () => {
    expect(spanCaptions([], 0, 30)).toBe('');
    expect(spanCaptions([cue('00:00:40,000', '00:00:44,000', 'outside')], 0, 30)).toBe('');
    expect(spanCaptions([cue('00:00:01,000', '00:00:01,000', 'zero length')], 0, 30)).toBe('');
    expect(spanCaptions([cue('00:00:02,000', '00:00:09,000', '   ')], 0, 30)).toBe('');
    expect(spanCaptions([cue('00:00:02,000', '00:00:09,000', 'word')], 9, 30)).toBe('');
  });
});
