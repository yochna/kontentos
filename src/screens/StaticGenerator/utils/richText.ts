const ALLOWED_TAGS = new Set([
  'SPAN',
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'BR',
  'P',
  'DIV',
  'MARK',
]);

const ALLOWED_STYLE_PROPERTIES = new Set([
  'color',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'background-color',
  'text-shadow',
]);

export function isRichHtml(text: string) {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

/**
 * Defense-in-depth sanitizer for canvas rich text. Removes unsafe tags,
 * event handlers, and any style property that is not typography-related.
 */
export function sanitizeRichText(html: string): string {
  if (!html) return '';
  const container = document.createElement('div');
  container.innerHTML = html;

  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      if (!ALLOWED_TAGS.has(element.tagName)) {
        const parent = element.parentNode;
        if (parent) {
          const children = Array.from(element.childNodes);
          children.forEach((child) => {
            parent.insertBefore(child, element);
            walk(child);
          });
          parent.removeChild(element);
        }
        return;
      }

      Array.from(element.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        if (name.startsWith('on') || name === 'href' || name === 'src') {
          element.removeAttribute(attribute.name);
          return;
        }
        if (name === 'style') {
          const safeStyles: string[] = [];
          const style = element.style;
          for (let i = 0; i < style.length; i += 1) {
            const property = style[i];
            if (ALLOWED_STYLE_PROPERTIES.has(property)) {
              safeStyles.push(`${property}: ${style.getPropertyValue(property)}`);
            }
          }
          element.setAttribute('style', safeStyles.join('; '));
          return;
        }
        if (name !== 'style' && name !== 'class') {
          element.removeAttribute(attribute.name);
        }
      });
    }

    Array.from(node.childNodes).forEach(walk);
  };

  Array.from(container.childNodes).forEach(walk);
  return container.innerHTML;
}

export function htmlToPlainText(html: string) {
  if (!isRichHtml(html)) return html;
  const container = document.createElement('div');
  container.innerHTML = sanitizeRichText(html);
  return container.textContent || '';
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
