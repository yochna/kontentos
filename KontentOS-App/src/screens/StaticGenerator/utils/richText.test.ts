// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { htmlToPlainText, isRichHtml, sanitizeRichText } from './richText';

// The canvas text layer is the one place the app puts model- or editor-produced markup into the
// page, so these cases describe what "typography only" means: the words and their emphasis stay,
// anything that could fetch, navigate or run does not.
describe('sanitizeRichText', () => {
  it('keeps the markup the inline editor produces', () => {
    const html = '<b>Hook</b> <i>three</i> <span style="color: rgb(255, 87, 34); font-size: 24px;">beats</span><br>tail';
    const out = sanitizeRichText(html);
    expect(out).toContain('<b>Hook</b>');
    expect(out).toContain('<i>three</i>');
    expect(out).toContain('color: rgb(255, 87, 34)');
    expect(out).toContain('font-size: 24px');
    expect(out).toContain('<br>');
    expect(out).toContain('tail');
  });

  it('drops a style property that is not typography', () => {
    const out = sanitizeRichText('<span style="color: red; position: fixed; background-image: url(http://127.0.0.1:9696/probe)">red</span>');
    expect(out).toContain('color: red');
    expect(out).not.toMatch(/position/i);
    expect(out).not.toMatch(/background-image/i);
    expect(out).not.toContain('127.0.0.1');
  });

  it('unwraps a tag it does not know and keeps the words inside it', () => {
    const out = sanitizeRichText('<a href="javascript:void 0">read this</a>');
    expect(out).toContain('read this');
    expect(out).not.toMatch(/<a\b/i);
    expect(out).not.toMatch(/href/i);
    expect(out).not.toMatch(/javascript/i);
  });

  it('removes an element that has no place in a text layer, and its handlers', () => {
    const out = sanitizeRichText(
      '<div onclick="void 0"><img src="x" onerror="void 0"><script>void 0<\/script><iframe src="https://example.test"></iframe>plain words</div>',
    );
    expect(out).toContain('plain words');
    for (const forbidden of ['onclick', 'onerror', '<img', '<script', '<iframe', 'example.test']) {
      expect(out).not.toContain(forbidden);
    }
  });

  it('is stable when its own output is sanitized again', () => {
    const once = sanitizeRichText('<p class="kt"><span style="font-weight: 700">nested</span></p>');
    expect(sanitizeRichText(once)).toBe(once);
  });

  it('will not let foreign content smuggle a tag back', () => {
    const out = sanitizeRichText('<svg><style><img src="x" onerror="void 0"></style></svg><p>after</p>');
    expect(out).not.toMatch(/<svg|<style|<img/i);
    expect(out).toContain('after');
  });
});

describe('htmlToPlainText', () => {
  it('reads the words a piece of markup says, keeping a line break as a line break', () => {
    expect(htmlToPlainText('<b>Two</b> lines<br>of copy')).toBe('Two lines\nof copy');
  });

  it('leaves plain text alone', () => {
    expect(htmlToPlainText('5 < 7 and no tags at all')).toBe('5 < 7 and no tags at all');
  });

  it('never returns a handler or a URL as content', () => {
    const out = htmlToPlainText('<a href="https://example.test" download="x">link text</a>');
    expect(out).toBe('link text');
  });
});

describe('isRichHtml', () => {
  it('tells markup from text so the editor can escape instead of insert', () => {
    expect(isRichHtml('write 3 < 5 things')).toBe(false);
    expect(isRichHtml('write <b>3</b> things')).toBe(true);
  });
});
