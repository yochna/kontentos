import DOMPurify from 'dompurify';

/**
 * The only markup a canvas text layer can hold is typography: a run of letters, a line break,
 * a paragraph. Anything else — a link, an image, a script, an event handler — is not content,
 * so this file hands the work to DOMPurify rather than walking the tree by hand. A hand-rolled
 * parser/serializer pair is how markup mistakes (nested <template>, <svg> foreign content) get
 * re-introduced on the second render; DOMPurify keeps the parse and the serialize in one place.
 */
const ALLOWED_TAGS = ['span', 'b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'mark'];
const ALLOWED_ATTR = ['class', 'style'];

/** Everything a creator can set from the inline editor, and nothing that can fetch or navigate. */
const ALLOWED_STYLE_PROPERTIES = [
  'color',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'background-color',
  'text-shadow',
];

// Installed once, for every sanitize() call in this module.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const element = node as HTMLElement;
  if (element.nodeType !== 1 || !element.hasAttribute('style')) return;
  const kept = ALLOWED_STYLE_PROPERTIES.map((property) => {
    const value = element.style.getPropertyValue(property);
    return value ? `${property}: ${value}` : '';
  }).filter(Boolean);
  if (kept.length) element.setAttribute('style', kept.join('; '));
  else element.removeAttribute('style');
});

export function isRichHtml(text: string) {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

/** Rich text in, rich text out — with only the tags and the styles above surviving. */
export function sanitizeRichText(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    // KEEP_CONTENT: a <a href> loses the anchor and keeps the words inside it.
    KEEP_CONTENT: true,
  });
}

/**
 * The words a piece of markup says, for anything that handles text rather than renders it
 * (drag-preview labels, export fallbacks). Never touches the live document: the fragment is
 * detached, so a stray resource in the markup has nothing to load into.
 */
export function htmlToPlainText(html: string) {
  if (!isRichHtml(html)) return html;
  // A line break is the one tag that carries meaning as text rather than as looks: without this
  // substitution "Two lines<br>of copy" would read back as "Two linesof copy".
  const fragment = DOMPurify.sanitize(html.replace(/<br\s*\/?>/gi, '\n'), {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    RETURN_DOM_FRAGMENT: true,
  }) as unknown as DocumentFragment;
  return (fragment.textContent || '').replace(/\u00a0/g, ' ');
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
