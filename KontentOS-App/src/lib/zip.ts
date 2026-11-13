/**
 * A store-only ZIP writer — no compression, no dependency.
 *
 * The press hands back an MP4 (already compressed), two caption files, the post copy and a PDF.
 * Deflating those saves nothing on the video and little on the rest, so the archive just frames
 * the bytes: local header, data, central directory, end record. That is enough for every unzip tool
 * and keeps the one-click bundle from pulling a library into the main chunk.
 */

export interface ZipEntry {
  /** Path inside the archive. Forward slashes only; no leading slash, no "..". */
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date/time, which is what the ZIP headers carry. Clamped to the format's 1980 floor. */
function dosStamp(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

function safeName(name: string): string {
  const clean = name
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
  if (!clean) throw new Error('A zip entry needs a name.');
  return clean;
}

const MAX_32 = 0xffffffff;

/** Builds the archive bytes. Throws rather than writing a zip a reader would silently truncate. */
export function zipBytes(entries: ZipEntry[], when: Date = new Date()): Uint8Array {
  if (entries.length === 0) throw new Error('Nothing to put in the zip.');
  if (entries.length > 0xffff) throw new Error('Too many files for one zip.');
  const encoder = new TextEncoder();
  const { time, date } = dosStamp(when);

  const seen = new Set<string>();
  const prepared = entries.map((entry) => {
    const name = safeName(entry.name);
    if (seen.has(name)) throw new Error(`Two files are both called “${name}”.`);
    seen.add(name);
    return { name: encoder.encode(name), data: entry.data, crc: crc32(entry.data) };
  });

  let total = 22;
  for (const item of prepared) total += 30 + item.name.length + item.data.length + 46 + item.name.length;
  // Classic ZIP stops at 4 GiB and 65,535 entries; a bundle that large is not a press.
  if (total > MAX_32) throw new Error('This bundle is too large for a single zip.');

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let at = 0;
  const offsets: number[] = [];

  for (const item of prepared) {
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true);
    view.setUint16(at + 4, 20, true); // version needed
    view.setUint16(at + 6, 0x0800, true); // UTF-8 names
    view.setUint16(at + 8, 0, true); // stored
    view.setUint16(at + 10, time, true);
    view.setUint16(at + 12, date, true);
    view.setUint32(at + 14, item.crc, true);
    view.setUint32(at + 18, item.data.length, true);
    view.setUint32(at + 22, item.data.length, true);
    view.setUint16(at + 26, item.name.length, true);
    view.setUint16(at + 28, 0, true);
    out.set(item.name, at + 30);
    out.set(item.data, at + 30 + item.name.length);
    at += 30 + item.name.length + item.data.length;
  }

  const directoryStart = at;
  prepared.forEach((item, i) => {
    view.setUint32(at, 0x02014b50, true);
    view.setUint16(at + 4, 20, true); // made by
    view.setUint16(at + 6, 20, true); // version needed
    view.setUint16(at + 8, 0x0800, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, time, true);
    view.setUint16(at + 14, date, true);
    view.setUint32(at + 16, item.crc, true);
    view.setUint32(at + 20, item.data.length, true);
    view.setUint32(at + 24, item.data.length, true);
    view.setUint16(at + 28, item.name.length, true);
    view.setUint32(at + 42, offsets[i], true);
    out.set(item.name, at + 46);
    at += 46 + item.name.length;
  });

  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 8, prepared.length, true);
  view.setUint16(at + 10, prepared.length, true);
  view.setUint32(at + 12, at - directoryStart, true);
  view.setUint32(at + 16, directoryStart, true);
  return out;
}

export function makeZip(entries: ZipEntry[], when?: Date): Blob {
  return new Blob([zipBytes(entries, when) as BlobPart], { type: 'application/zip' });
}
