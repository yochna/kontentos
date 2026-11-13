import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { getFontEmbedCSS, toPng } from 'html-to-image';
import type { jsPDF } from 'jspdf';
import { plainHighlights, splitHighlights, type PressDeck as PressDeckData } from '@/lib/press';
import { Button } from '@/components/ui';
import { notify } from '@/components/ui/toast';

export interface PressDeckProps {
  deck: PressDeckData;
  title: string;
  /**
   * Filled with a function that renders the whole carousel to a PDF and hands back the bytes, so the
   * Press can put it in the one-click bundle. It runs the same guarded export as the Download PDF
   * button — a deck whose copy does not fit refuses here too, instead of shipping a cut-off page.
   */
  exportPdfRef?: MutableRefObject<(() => Promise<Blob>) | null>;
  /**
   * When given, the creator can edit a card's words. Receives every card, in order, and resolves
   * once the server has saved them; a rejection keeps the editor open with what they typed.
   */
  onSaveSlides?: (slides: { headline: string; supportingText: string }[]) => Promise<void>;
}

const WIDTH = 1080;
const HEIGHT = 1350;
const BACKGROUND = '#15191d';
const BODY_FONT = '"Hanken Grotesk", sans-serif';
const DISPLAY_FONT = '"Syne", "Hanken Grotesk", sans-serif';
const MONO_FONT = '"JetBrains Mono", monospace';
const ACCENT = '#f0a33c';

/** Deck copy with the engine's [bracketed] words lit instead of printed with their brackets. */
function Lit({ text }: { text: string }) {
  return (
    <>
      {splitHighlights(text).map((run, i) =>
        run.hot ? (
          <span key={i} style={{ color: ACCENT }}>{run.text}</span>
        ) : (
          <Fragment key={i}>{run.text}</Fragment>
        )
      )}
    </>
  );
}

function copyFits(card: HTMLElement) {
  const copy = card.querySelector<HTMLElement>('[data-press-copy]')!;
  const bounds = copy.parentElement!;
  return copy.scrollHeight <= bounds.clientHeight && copy.scrollWidth <= bounds.clientWidth;
}

export default function PressDeck({ deck, title, exportPdfRef, onSaveSlides }: PressDeckProps) {
  const { slides } = deck;
  const viewport = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLElement | null)[]>([]);
  const revision = useRef(0);
  const exporting = useRef(false);
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(0);
  const [fits, setFits] = useState<boolean[] | null>(null);
  const [fontError, setFontError] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ headline: string; supportingText: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = draft !== null;
  const current = Math.min(index, Math.max(0, slides.length - 1));

  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const resize = () => setScale(node.clientWidth / WIDTH);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [slides.length]);

  useLayoutEffect(() => {
    const version = ++revision.current;
    exporting.current = false;
    setProgress(null);
    setIndex((i) => Math.min(i, Math.max(0, slides.length - 1)));
    setFits(null);
    setFontError(false);
    const nodes = cards.current.slice(0, slides.length).filter((node): node is HTMLElement => !!node);

    async function prepare() {
      try {
        await Promise.all([
          document.fonts.load('700 88px "Syne"', slides.map((slide) => slide.headline).join(' ')),
          document.fonts.load('400 44px "Hanken Grotesk"', slides.map((slide) => slide.supportingText).join(' ')),
          document.fonts.load('400 26px "JetBrains Mono"', 'CAROUSEL 0123456789 /'),
        ]);
        await document.fonts.ready;
        if (revision.current !== version) return;
        // Fit every slide at one shared type size, never below a readable export size.
        for (let size = 44; size >= 24; size -= 2) {
          nodes.forEach((node) => {
            node.querySelector<HTMLElement>('[data-press-copy]')!.style.fontSize = `${size}px`;
          });
          const result = nodes.map(copyFits);
          if (result.every(Boolean) || size === 24) {
            setFits(result);
            break;
          }
        }
      } catch {
        if (revision.current !== version) return;
        setFontError(true);
        setFits(slides.map(() => false));
      }
    }
    void prepare();
    return () => { revision.current += 1; };
  }, [slides, title]);

  const baseName = () =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80).replace(/^-+|-+$/g, '') || 'press';

  /**
   * One guarded pass over the cards: refuses a deck whose copy does not fit, embeds the local fonts
   * once, and rasterizes each requested slide at 1080 × 1350. What happens to each image is the
   * caller's business, so the PNG button, the PDF button and the bundle cannot render differently.
   */
  async function renderSlides(indices: number[], onImage: (image: string, page: number) => void) {
    if (!fits || !slides.length) throw new Error('The carousel is still preparing. Try again in a moment.');
    if (indices.some((i) => !fits[i])) throw new Error('Some slide copy does not fit. Shorten it before exporting.');
    const version = revision.current;
    const nodes = indices.map((i) => cards.current[i]);
    const assertCurrent = () => {
      if (revision.current !== version) throw new Error('The deck changed during export.');
    };

    await document.fonts.ready;
    assertCurrent();
    if (nodes.some((node) => !node || !copyFits(node))) {
      throw new Error('Slide copy no longer fits. Reload the preview before exporting.');
    }
    // All local faces are WOFF2; format filtering drops alternating faces in html-to-image.
    const fontEmbedCSS = await getFontEmbedCSS(nodes[0]!);
    assertCurrent();

    for (let page = 0; page < nodes.length; page += 1) {
      assertCurrent();
      setProgress(`Rendering slide ${indices[page] + 1} of ${slides.length}…`);
      const image = await toPng(nodes[page]!, {
        width: WIDTH, height: HEIGHT, canvasWidth: WIDTH, canvasHeight: HEIGHT,
        pixelRatio: 1, skipAutoScale: true, backgroundColor: BACKGROUND, fontEmbedCSS,
      });
      assertCurrent();
      onImage(image, page);
    }
  }

  async function renderPdf(): Promise<jsPDF> {
    const pdf = new (await import('jspdf')).jsPDF({
      orientation: 'portrait', unit: 'px', format: [WIDTH, HEIGHT], hotfixes: ['px_scaling'],
    });
    await renderSlides(slides.map((_, i) => i), (image, page) => {
      if (page > 0) pdf.addPage([WIDTH, HEIGHT], 'portrait');
      pdf.addImage(image, 'PNG', 0, 0, WIDTH, HEIGHT, undefined, 'FAST');
    });
    return pdf;
  }

  // Re-registered on every commit so the exporter always closes over the current deck and fit state.
  useLayoutEffect(() => {
    if (!exportPdfRef) return;
    exportPdfRef.current = async () => {
      if (exporting.current) throw new Error('The carousel is already being exported.');
      const version = revision.current;
      exporting.current = true;
      setProgress('Preparing the carousel PDF…');
      try {
        return (await renderPdf()).output('blob');
      } finally {
        if (revision.current === version) {
          exporting.current = false;
          setProgress(null);
        }
      }
    };
    return () => {
      exportPdfRef.current = null;
    };
  });

  async function saveDraft() {
    if (!onSaveSlides || !draft || saving) return;
    const next = slides.map((slide, i) =>
      i === current
        ? { headline: draft.headline.trim(), supportingText: draft.supportingText.trim() }
        : { headline: slide.headline, supportingText: slide.supportingText }
    );
    if (!next[current].headline) {
      notify.bad('A card needs a headline.');
      return;
    }
    setSaving(true);
    try {
      await onSaveSlides(next);
      setDraft(null);
      notify.ok(`Card ${current + 1} saved.`);
    } catch (error) {
      notify.bad(error instanceof Error ? error.message : 'The card could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function download(format: 'png' | 'pdf') {
    if (exporting.current || !fits || !slides.length) return;
    const version = revision.current;
    exporting.current = true;
    setProgress('Preparing download…');

    try {
      const base = baseName();
      if (format === 'pdf') {
        const pdf = await renderPdf();
        await pdf.save(`${base}-carousel.pdf`, { returnPromise: true });
      } else {
        await renderSlides([current], (image) => {
          const link = document.createElement('a');
          link.href = image;
          link.download = `${base}-slide-${String(current + 1).padStart(2, '0')}.png`;
          document.body.appendChild(link);
          link.click();
          link.remove();
        });
      }
      if (revision.current !== version) throw new Error('The deck changed during export.');
      notify.ok(format === 'pdf' ? `PDF download started: ${slides.length} pages.` : 'PNG download started: 1080 × 1350.');
    } catch (error) {
      if (revision.current === version) {
        notify.bad(error instanceof Error ? error.message : 'The carousel could not be exported. Try again.');
      }
    } finally {
      if (revision.current === version) {
        exporting.current = false;
        setProgress(null);
      }
    }
  }

  if (!slides.length) return <p className="text-sm text-ink-muted">No carousel slides yet.</p>;
  const blocked = fits !== null && !fits[current];

  return (
    <section aria-label={`${title || 'Press'} carousel`} aria-busy={!!progress} className="min-w-0 space-y-3">
      <div
        ref={viewport}
        className="relative mx-auto w-full overflow-hidden rounded-btn border border-line"
        style={{ maxWidth: 480, aspectRatio: '4 / 5', background: BACKGROUND }}
        role="group"
        aria-roledescription="carousel"
        aria-label="Slide preview"
      >
        <div style={{ width: WIDTH, height: HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {slides.map((slide, i) => (
            // Inactive slides stay measurable; only the unscaled article is rasterized.
            <div
              key={i}
              aria-hidden={i !== current || !fits?.[i]}
              style={{ position: 'absolute', top: 0, left: i === current && fits?.[i] ? 0 : -WIDTH * 2 }}
            >
              <article
                ref={(node) => { cards.current[i] = node; }}
                aria-label={`Slide ${i + 1} of ${slides.length}`}
                style={{
                  width: WIDTH, height: HEIGHT, boxSizing: 'border-box', padding: 80,
                  display: 'flex', flexDirection: 'column', background: BACKGROUND, color: '#e9e4d9',
                  fontFamily: BODY_FONT, textAlign: 'left',
                }}
              >
                <div style={{
                  flexShrink: 0, paddingBottom: 28, marginBottom: 64, borderBottom: '1px solid #3b4750',
                  fontFamily: MONO_FONT, fontSize: 26, lineHeight: 1.4, letterSpacing: '0.12em', color: '#f0a33c',
                }}>CAROUSEL</div>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center' }}>
                  <div data-press-copy style={{
                    width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.8em',
                    fontSize: 44, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                  }}>
                    {slide.headline && <h3 style={{
                      margin: 0, fontFamily: DISPLAY_FONT, fontSize: '2em', fontWeight: 700,
                      lineHeight: 1.08, letterSpacing: '-0.035em', color: '#e9e4d9',
                    }}><Lit text={slide.headline} /></h3>}
                    {slide.supportingText && <p style={{
                      margin: 0, fontFamily: BODY_FONT, fontSize: '1em', fontWeight: 400,
                      lineHeight: 1.45, letterSpacing: 0, color: '#bbc3c8',
                    }}><Lit text={slide.supportingText} /></p>}
                  </div>
                </div>
                <div style={{
                  flexShrink: 0, paddingTop: 28, marginTop: 64, borderTop: '1px solid #3b4750',
                  fontFamily: MONO_FONT, fontSize: 26, lineHeight: 1.4, color: '#9ba6ad',
                }}>{String(i + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</div>
              </article>
            </div>
          ))}
        </div>
        {(!fits || blocked) && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm" style={{ color: '#e9e4d9' }}>
            {!fits ? 'Preparing preview…' : 'Preview unavailable. Full slide text is below.'}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" size="sm" disabled={!!progress || editing || current === 0} onClick={() => setIndex(current - 1)}>Previous</Button>
        <span className="text-sm text-ink-muted" aria-live="polite">Slide {current + 1} of {slides.length}</span>
        <Button variant="secondary" size="sm" disabled={!!progress || editing || current === slides.length - 1} onClick={() => setIndex(current + 1)}>Next</Button>
      </div>
      {onSaveSlides && (
        <div className="text-left">
          {!editing ? (
            <div className="flex justify-center">
              <Button
                size="sm"
                variant="secondary"
                disabled={!!progress}
                onClick={() => setDraft({ headline: slides[current].headline, supportingText: slides[current].supportingText })}
              >
                Edit card {current + 1}
              </Button>
            </div>
          ) : (
            <div className="space-y-2 rounded-card border border-line bg-surface-2/50 p-3">
              <label className="block text-[12px] font-semibold text-ink" htmlFor="press-card-headline">Headline</label>
              <textarea
                id="press-card-headline"
                rows={2}
                value={draft.headline}
                maxLength={220}
                onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
                className="kt-focus w-full rounded-btn border border-line bg-surface-2 p-3 text-[13px] text-ink"
              />
              <label className="block text-[12px] font-semibold text-ink" htmlFor="press-card-body">Text under it</label>
              <textarea
                id="press-card-body"
                rows={4}
                value={draft.supportingText}
                maxLength={600}
                onChange={(e) => setDraft({ ...draft, supportingText: e.target.value })}
                className="kt-focus w-full rounded-btn border border-line bg-surface-2 p-3 text-[13px] text-ink"
              />
              <p className="text-[11px] text-ink-muted">Put [square brackets] around the words you want lit. The brackets themselves are not shown on the card.</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={saving} onClick={() => void saveDraft()}>{saving ? 'Saving…' : 'Save card'}</Button>
                <Button size="sm" variant="secondary" disabled={saving} onClick={() => setDraft(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
      {blocked && (
        <div className="space-y-2 text-sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          <p role="alert" className="text-danger-ink">{fontError
            ? 'Local fonts could not load. Downloads are unavailable; reload to retry.'
            : 'This slide is too long to fit legibly. Shorten the copy before exporting; nothing has been cut.'}</p>
          <p className="font-semibold text-ink">{plainHighlights(slides[current].headline)}</p>
          <p className="text-ink-muted">{plainHighlights(slides[current].supportingText)}</p>
        </div>
      )}
      {fits?.some((fit) => !fit) && <p className="text-sm text-danger-ink">PDF unavailable: check slides {fits.flatMap((fit, i) => fit ? [] : [i + 1]).join(', ')}.</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="secondary" disabled={!!progress || !fits?.[current]} onClick={() => void download('png')}>Download PNG</Button>
        <Button size="sm" variant="secondary" disabled={!!progress || !fits?.every(Boolean)} onClick={() => void download('pdf')}>Download PDF</Button>
      </div>
      <p role="status" className="text-center text-xs text-ink-muted">{progress || '1080 × 1350 · PNG: current slide · PDF: whole carousel'}</p>
    </section>
  );
}
