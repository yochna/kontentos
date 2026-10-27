/**
 * Sanitizes a string into a clean, filesystem-safe and social-scheduler friendly slug.
 * Removes bracket markup, strips illegal characters, collapses hyphens, and truncates to maxLength.
 */
export function sanitizeSlug(input: string, maxLength: number = 35): string {
  if (!input) return '';

  // Strip bracket markup if present (e.g. from keyword accentuation [highlighted])
  const textWithoutBrackets = input.replace(/\[([^\]]+)\]/g, '$1');

  const slug = textWithoutBrackets
    .toLowerCase()
    .trim()
    // Replace non-alphanumeric characters with hyphens
    .replace(/[^a-z0-9_-]+/g, '-')
    // Collapse consecutive hyphens/underscores
    .replace(/[-_]+/g, '-')
    // Trim leading and trailing hyphens
    .replace(/^-+|-+$/g, '');

  if (slug.length <= maxLength) {
    return slug;
  }

  // Truncate cleanly at maxLength and avoid trailing hyphens
  return slug.slice(0, maxLength).replace(/-+$/, '');
}

/**
 * Generates deterministic, zero-padded export filenames for single static graphics and multi-slide decks.
 * Standard format: {brand}_{topic_slug}_slide-{01-of-05}.{png|pdf}
 *
 * @param brand - Brand or creator name (defaults to 'kontentos')
 * @param topic - Headline or topic string to slugify (defaults to 'post')
 * @param slideNum - Current 1-based slide index (optional)
 * @param totalSlides - Total slide count in carousel (optional)
 * @param ext - File extension ('png' | 'pdf', defaults to 'png')
 */
export function generateExportFilename(
  brand?: string,
  topic?: string,
  slideNum?: number,
  totalSlides?: number,
  ext: string = 'png'
): string {
  const cleanBrand = sanitizeSlug(brand || '', 25) || 'kontentos';
  const cleanTopic = sanitizeSlug(topic || '', 35) || 'post';

  let slideSuffix = '';
  if (slideNum !== undefined && totalSlides !== undefined && totalSlides > 0) {
    const pad = (n: number) => String(Math.max(1, n)).padStart(2, '0');
    slideSuffix = `_slide-${pad(slideNum)}-of-${pad(totalSlides)}`;
  } else if (slideNum !== undefined) {
    const pad = (n: number) => String(Math.max(1, n)).padStart(2, '0');
    slideSuffix = `_slide-${pad(slideNum)}`;
  }

  const cleanExt = ext.replace(/^\.+/, '').toLowerCase() || 'png';

  return `${cleanBrand}_${cleanTopic}${slideSuffix}.${cleanExt}`;
}
