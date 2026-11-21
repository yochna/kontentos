import { describe, expect, it } from 'vitest';
import { explainFfmpegFailure } from './ffmpegFailureHint';

describe('FFmpeg failure hints', () => {
  it('points codec failures at a re-upload', () => {
    expect(
      explainFfmpegFailure(['[h265 @ 0x1] Could not find codec parameters', 'Invalid data found when processing input']),
    ).toContain('H.264 MP4');
  });

  it('points memory failures at a smaller render', () => {
    expect(explainFfmpegFailure(['ffmpeg: Cannot allocate memory'])).toContain('too large');
  });

  it('points filter failures at the last edit', () => {
    expect(explainFfmpegFailure(['Error initializing complex filters.', 'Invalid argument'])).toContain(
      'last caption style or effect',
    );
  });

  it('points font failures at captions', () => {
    expect(explainFfmpegFailure(['[Parsed_drawtext_4] Cannot open font'])).toContain('bundled font');
  });

  it('stays quiet when the log has no known signature', () => {
    expect(explainFfmpegFailure(['frame= 0 fps=0.0 q=-0.0 Lsize=N/A time=N/A bitrate=N/A'])).toBeNull();
  });
});
