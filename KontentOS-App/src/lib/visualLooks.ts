import type { VisualLook } from './timeline';

/**
 * One source of truth for the exported grade and the preview grade.
 *
 * FFmpeg's `eq` brightness is additive while CSS `brightness()` is multiplicative, so the numbers
 * are deliberately different even though they describe the same look. Keep every entry in sync:
 * if the MP4 gets stronger, the preview must get stronger too. The grades are intentionally light
 * touch — footage should look like it was shot well, not run through a social-media filter.
 */
export const FFMPEG_LOOK_FILTERS: Record<VisualLook, string> = {
  // The manual editor starts here: no grade, no vignette, no invented treatment.
  original: '',
  viral: 'eq=contrast=1.08:brightness=0.006:saturation=1.08,vignette=PI/5.5',
  clean: 'eq=contrast=1.03:brightness=0.004:saturation=1.03',
  cinematic: 'eq=contrast=1.16:brightness=-0.01:saturation=0.88,vignette=PI/4.4',
  bold: 'eq=contrast=1.18:brightness=0.008:saturation=1.2,vignette=PI/5.2',
  warm: 'eq=contrast=1.1:brightness=0.01:saturation=1.12,vignette=PI/5',
};

export const CSS_LOOK_FILTERS: Record<VisualLook, string> = {
  original: '',
  viral: 'contrast(1.08) brightness(1.006) saturate(1.08)',
  clean: 'contrast(1.03) brightness(1.004) saturate(1.03)',
  cinematic: 'contrast(1.16) brightness(0.99) saturate(0.88)',
  bold: 'contrast(1.18) brightness(1.008) saturate(1.2)',
  warm: 'contrast(1.1) brightness(1.01) saturate(1.12)',
};

/** Preview vignette opacity mirrors the FFmpeg `vignette` strength for each look. */
export const LOOK_VIGNETTE_OPACITY: Record<VisualLook, number> = {
  original: 0,
  viral: 0.12,
  clean: 0,
  cinematic: 0.34,
  bold: 0.16,
  warm: 0.18,
};
