import { describe, expect, it } from 'vitest';
import {
  aspectGeometry,
  findArchivedVideo,
  inferExportAspect,
  suggestedWordsPerCue,
} from './mediaPlan';

describe('mediaPlan', () => {
  it('uses the source pixel shape instead of forcing every reel vertical', () => {
    expect(inferExportAspect('1920x1080')).toBe('16:9');
    expect(inferExportAspect('1080:1920')).toBe('9:16');
    expect(inferExportAspect('4:5')).toBe('4:5');
    expect(inferExportAspect('square')).toBe('9:16');
  });

  it('maps each supported aspect to real export pixels', () => {
    expect(aspectGeometry('16:9')).toEqual({ width: 1920, height: 1080 });
    expect(aspectGeometry('4:5')).toEqual({ width: 1080, height: 1350 });
  });

  it('shortens caption groups only for genuinely short or long takes', () => {
    expect(suggestedWordsPerCue(6, 5)).toBe(4);
    expect(suggestedWordsPerCue(30, 5)).toBe(5);
    expect(suggestedWordsPerCue(120, 4)).toBe(6);
  });

  it('finds the real archived render before inventing a source record', () => {
    const clips = [
      { id: 'raw', title: 'Camera take', file_url: '/uploads/raw.mp4' },
      { id: 'render', title: 'Finished reel', file_url: '/uploads/render.mp4' },
    ];
    expect(findArchivedVideo(clips, '/uploads/render.mp4')?.id).toBe('render');
    expect(findArchivedVideo(clips, '/uploads/missing.mp4')).toBeNull();
    expect(findArchivedVideo(clips, undefined)).toBeNull();
  });
});
