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
 * Assembles an alt-text sentence from the words already on the card.
 * It describes the card's text and credits the photo; it cannot see the photo, so the
 * creator still has to check it before pasting.
 */
export function generateAccessibleAltText(state: StaticCardState): string {
  const creator = (state.creator?.name || '').trim();
  const headline = cleanTextForAlt(state.headline);
  const supporting = cleanTextForAlt(state.supportingText);

  // An empty card has nothing to describe; inventing "Content" would put a false alt-text on the post.
  if (!headline && !supporting) return '';

  let prefix = 'Visual social card';
  if (state.format === 'carousel-slide' && state.slides && state.slides.length > 1) {
    prefix = `Visual social carousel slide (${state.slideCurrent || 1} of ${state.slides.length})`;
  } else if (state.format === 'tweet-card') {
    prefix = 'Visual social tweet card';
  } else if (state.format === 'editorial-quote') {
    prefix = 'Visual editorial quote card';
  }

  const attribution = state.photographerAttribution?.name
    ? ` — background photo by ${state.photographerAttribution.name}`
    : '';

  const subject = creator ? `featuring ${creator}` : 'with the text below';
  const words = [headline, supporting].filter(Boolean).map((w) => `"${w}"`).join(' — ');

  return `${prefix} ${subject}: ${words}${attribution}`;
}
