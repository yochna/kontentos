/**
 * Caption files for one span of a recording.
 *
 * A cut MP4 is only half a short: every platform that indexes speech wants a sidecar. The cues the
 * server already timed for the whole take are the only honest source, so this takes the ones that
 * fall inside the span, clamps them to it and rebases the clock — the file then starts at zero and
 * lines up with the cut, not with the middle of the original take.
 *
 * The Studio's browser export and the server's Press both write these, which is why the arithmetic
 * sits here once rather than in whichever app asked for it first.
 */

import { parseSrtTimeToSeconds } from './timeline';

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

/** WebVTT clock: the same instant with a dot where SRT puts the comma. */
export function vttTimestamp(totalSeconds: number): string {
  return srtTimestamp(totalSeconds).replace(',', '.');
}

/** A cue that has already been re-timed to the span, so its clock starts where the cut does. */
export interface TimedCue {
  start: number;
  end: number;
  text: string;
}

/** The cues that speak inside [start, end], in span time — the one shape both writers share. */
function rebasedCues(cues: CaptionCue[], start: number, end: number): TimedCue[] {
  if (!Array.isArray(cues) || !(end > start)) return [];

  const kept: TimedCue[] = [];
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
    kept.push({ start: a - start, end: b - start, text });
  }
  return kept;
}

/**
 * The cues that speak inside the span, re-timed to it as numbers rather than as a file. This is what
 * gets stored against the cut clip, so its caption track reads from its own zero instead of the
 * middle of the take it came from.
 */
export function spanCues(cues: CaptionCue[], start: number, end: number): TimedCue[] {
  return rebasedCues(cues, start, end);
}

/**
 * Returns '' when the span holds no speech, which the caller must say out loud rather than handing
 * back an empty file a creator only discovers on import.
 */
export function spanCaptions(cues: CaptionCue[], start: number, end: number): string {
  return rebasedCues(cues, start, end)
    .map((cue, i) => `${i + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}\n${cue.text}\n`)
    .join('\n');
}

/** The same cues as a WebVTT file, which is what a browser's <track> element wants. */
export function spanVtt(cues: CaptionCue[], start: number, end: number): string {
  const blocks = rebasedCues(cues, start, end).map(
    (cue, i) => `${i + 1}\n${vttTimestamp(cue.start)} --> ${vttTimestamp(cue.end)}\n${cue.text}`
  );
  // A VTT with no cues is still a parseable file, but not one worth importing, so it is refused the
  // way the SRT is and the caller reports the empty span.
  return blocks.length ? `WEBVTT\n\n${blocks.join('\n\n')}\n` : '';
}
