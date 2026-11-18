import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, assertUploadableFile, isUploadableFile, uploadFileError } from './uploadFile';

const file = (name: string, size = 1024, type = 'video/mp4') => ({ name, size, type });

describe('intake validation', () => {
  it('accepts every format the server can actually store', () => {
    for (const ext of ['mp4', 'mov', 'webm', 'm4v', 'mkv']) {
      expect(isUploadableFile(file(`take.${ext}`))).toBe(true);
    }
  });

  it('refuses an empty file before a row is created', () => {
    expect(uploadFileError(file('empty.mp4', 0))).toMatch(/empty/i);
    expect(() => assertUploadableFile(file('empty.mp4', 0))).toThrow(/empty/i);
  });

  it('refuses formats and audio the server would throw away', () => {
    expect(uploadFileError(file('voice.avi'))).toMatch(/not a video/i);
    expect(uploadFileError(file('song.mp3', 2048, 'audio/mpeg'))).toMatch(/audio only/i);
  });

  it('refuses a file past the 2 GB byte limit', () => {
    expect(uploadFileError(file('huge.mp4', MAX_UPLOAD_BYTES + 1))).toMatch(/2 GB/i);
  });
});
