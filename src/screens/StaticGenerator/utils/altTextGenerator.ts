import { StaticCardState } from '../../../types/staticCard';

/**
 * Strips bracket syntax used for keyword accentuation (e.g. "[80% of their time]" -> "80% of their time")
 * and collapses multiple whitespace/newlines into clean single spaces.
 */
export function cleanTextForAlt(text?: string): string {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates an accessible alt-text description for social media posts, screen readers, and SEO indexing.
 * Criteria format: "Visual social card featuring [Creator]: [Headline] - [Supporting Text]"
 *
 * @param state - The current StaticCardState
 * @returns Standardized accessibility description string
 */
export function generateAccessibleAltText(state: StaticCardState): string {
  const creator = (state.creator?.name || '').trim() || 'Creator';
  const headline = cleanTextForAlt(state.headline) || 'Content';
  const supporting = cleanTextForAlt(state.supportingText);

  let prefix = 'Visual social card';
  if (state.format === 'carousel-slide' && state.slides && state.slides.length > 1) {
    prefix = `Visual social carousel slide (${state.slideCurrent || 1} of ${state.slides.length})`;
  } else if (state.format === 'tweet-card') {
    prefix = 'Visual social tweet card';
  } else if (state.format === 'editorial-quote') {
    prefix = 'Visual editorial quote card';
  }

  const attribution = state.photographerAttribution?.name
    ? ` [Background photo: ${state.photographerAttribution.name}]`
    : '';

  if (supporting) {
    return `${prefix} featuring ${creator}: "${headline}" - ${supporting}${attribution}`;
  }

  return `${prefix} featuring ${creator}: "${headline}"${attribution}`;
}
