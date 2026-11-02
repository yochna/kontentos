import type { RepurposeClip } from './api';

type Packable = Pick<
  RepurposeClip,
  'startLabel' | 'endLabel' | 'title' | 'hook' | 'cardHeadline' | 'caption'
>;

/**
 * Everything a creator pastes beside the finished cut, in the order the bench plays it. Both the
 * editor and the Shelf hand out the same text, so an unsaved edit and its saved twin cannot drift.
 */
export function packFor(clip: Packable): string {
  return [
    clip.startLabel !== '—:—'
      ? `SPAN  ${clip.startLabel} → ${clip.endLabel}`
      : 'SPAN  no cues — set the span on the bench',
    `TITLE  ${clip.title}`,
    `HOOK  ${clip.hook}`,
    `CARD  ${clip.cardHeadline}`,
    '',
    clip.caption,
  ].join('\n');
}
