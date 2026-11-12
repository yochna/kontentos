import { describe, expect, it } from 'vitest';
import { crc32, zipBytes } from './zip';

const text = (value: string) => new TextEncoder().encode(value);

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('zipBytes', () => {
  it('frames every file, with a directory that counts them', () => {
    const bytes = zipBytes([
      { name: 'reel.srt', data: text('1\n00:00:00,000 --> 00:00:01,000\nhi\n') },
      { name: 'post.txt', data: text('caption') },
    ]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 8, true)).toBe(2);
    expect(view.getUint16(end + 10, true)).toBe(2);
    // The directory starts where the data stops.
    const directoryStart = view.getUint32(end + 16, true);
    expect(view.getUint32(directoryStart, true)).toBe(0x02014b50);
  });

  it('keeps the file bytes verbatim', () => {
    const payload = text('exactly these bytes');
    const bytes = zipBytes([{ name: 'a.txt', data: payload }]);
    const at = 30 + 'a.txt'.length;
    expect(Array.from(bytes.subarray(at, at + payload.length))).toEqual(Array.from(payload));
  });

  it('refuses names that would escape the archive, and duplicates', () => {
    const bytes = zipBytes([{ name: '../../etc/passwd', data: text('x') }]);
    expect(new TextDecoder().decode(bytes.subarray(30, 30 + 10))).toBe('etc/passwd');
    expect(() => zipBytes([{ name: '', data: text('x') }])).toThrow(/name/);
    expect(() => zipBytes([{ name: 'a', data: text('1') }, { name: 'a', data: text('2') }])).toThrow(/both called/);
    expect(() => zipBytes([])).toThrow(/Nothing/);
  });
});
