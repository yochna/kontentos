import type { VisualLook } from './timeline';

/**
 * One source of truth for the exported grade and the preview grade.
 *
 * FFmpeg's `eq` brightness is additive while CSS `brightness()` is multiplicative, so the numbers
 * are deliberately different even though they describe the same look. Keep every entry in sync:
 * if the MP4 gets stronger, the preview must get stronger too.
 */
export const FFMPEG_LOOK_FILTERS: Record<VisualLook, string> = {
  viral: 'eq=contrast=1.32:brightness=0.035:saturation=1.55,vignette=PI/3.8',
  clean: 'eq=contrast=1.14:brightness=0.02:saturation=1.14',
  cinematic: 'eq=contrast=1.40:brightness=-0.02:saturation=0.80,vignette=PI/3.2',
  bold: 'eq=contrast=1.48:brightness=0.03:saturation=1.72,vignette=PI/3.5',
  warm: 'eq=contrast=1.22:brightness=0.035:saturation=1.38,vignette=PI/4.0',
};

export const CSS_LOOK_FILTERS: Record<VisualLook, string> = {
  viral: 'contrast(1.32) brightness(1.035) saturate(1.55)',
  clean: 'contrast(1.14) brightness(1.02) saturate(1.14)',
  cinematic: 'contrast(1.40) brightness(0.98) saturate(0.80)',
  bold: 'contrast(1.48) brightness(1.03) saturate(1.72)',
  warm: 'contrast(1.22) brightness(1.035) saturate(1.38)',
};

/** Preview vignette opacity mirrors the FFmpeg `vignette` strength for each look. */
export const LOOK_VIGNETTE_OPACITY: Record<VisualLook, number> = {
  viral: 0.55,
  clean: 0,
  cinematic: 0.62,
  bold: 0.58,
  warm: 0.48,
};
