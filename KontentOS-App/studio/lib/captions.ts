/**
 * Caption files for one Studio short.
 *
 * A cut MP4 is only half a short: every platform that indexes speech wants a sidecar, and the
 * creator who rendered a span here has no way to get the words of that span out of the app. The
 * cues the server already timed for the recording are the only honest source — this takes the ones
 * that fall inside the span, clamps them to it and rebases the clock so the file starts at zero and
 * lines up with the cut, not with the middle of the original take.
 */

import { parseSrtTimeToSeconds } from '@/lib/timeline';

export interface CaptionCue {
  start: string | number;
  end: string | number;
  text: string;
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

/** SRT clock: HH:MM:SS,mmm. */
export function srtTimestamp(totalSeconds: number): string {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor((ms % 3_600_000) / 60_000))}:${pad(
    Math.floor((ms % 60_000) / 1000)
  )},${pad(ms % 1000, 3)}`;
}

/**
 * The cues that speak inside [start, end], rewritten for a file that begins at zero.
 * Returns '' when the span holds no speech, which the caller must say out loud rather than
 * handing back an empty file a creator only discovers on import.
 */
export function spanCaptions(cues: CaptionCue[], start: number, end: number): string {
  if (!Array.isArray(cues) || !(end > start)) return '';

  const lines: string[] = [];
  let index = 0;
  for (const cue of cues) {
    const text = (cue?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const from = parseSrtTimeToSeconds(cue.start);
    const to = parseSrtTimeToSeconds(cue.end);
    if (!(to > from)) continue;
    // Clamped, so no caption can run past the frame the cut actually ends on.
    const a = Math.max(start, from);
    const b = Math.min(end, to);
    if (b <= a) continue;
    index += 1;
    lines.push(`${index}\n${srtTimestamp(a - start)} --> ${srtTimestamp(b - start)}\n${text}\n`);
  }

  return lines.join('\n');
}

/**
 * Save a caption file the way the browser saves anything else. The anchor is dropped straight
 * after, or the object URL outlives the click in some engines and the file never appears.
 */
export function downloadTextFile(text: string, fileName: string, mimeType = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
