import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StationId } from '@/lib/bench';
import { Icon } from '@/lib/icons';
import { TOUR_STEPS, placeCard, type Box, type TourStep } from '@/lib/tour';
import { Button } from '@/components/ui';

export interface TourProps {
  open: boolean;
  /** The station on screen now, so a step that lives on another one can open it first. */
  station: StationId;
  onNavigate: (station: StationId) => void;
  onClose: (reason: 'done' | 'skip') => void;
  /** The last step's main button: close the tour and press the built-in sample clip. */
  onTrySample: () => void;
}

const PAD = 8; // breathing room around the spotlit element
const CARD_W = 340;
const WAIT_FOR_TARGET_MS = 3000;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The first selector whose element is actually drawn: a hidden desktop menu must not be spotlit on a phone. */
function firstVisible(selectors: string[] | undefined): Element | null {
  for (const selector of selectors ?? []) {
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  const left = Math.max(0, r.left - PAD);
  const top = Math.max(0, r.top - PAD);
  const right = Math.min(window.innerWidth, r.right + PAD);
  const bottom = Math.min(window.innerHeight, r.bottom + PAD);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/**
 * A guided walkthrough: a dimmed room with one lit element at a time and a card beside it. The
 * spotlight and the card slide between steps instead of cutting, steps that live on another
 * station open it first, and the whole thing can be driven from the keyboard.
 */
export function Tour({ open, station, onNavigate, onClose, onTrySample }: TourProps) {
  const steps = TOUR_STEPS;
  // `index` is the step being asked for; `shown` is the one on screen. They differ while a step's
  // target is still being found (a lazily loaded station, say): the old card stays up and slides
  // over once the new one is ready, instead of flashing a card with nothing to point at.
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState<{ index: number; target: Element | null }>({ index: 0, target: null });
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(230);
  const [view, setView] = useState({ width: 1280, height: 800 });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const stationRef = useRef(station);
  const direction = useRef<1 | -1>(1);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  stationRef.current = station;
  const target = shown.target;
  const step: TourStep = steps[Math.min(shown.index, steps.length - 1)];
  const last = shown.index === steps.length - 1;

  const close = useCallback(
    (reason: 'done' | 'skip') => {
      onClose(reason);
      returnFocus.current?.focus?.({ preventScroll: true });
    },
    [onClose]
  );

  const go = useCallback(
    (delta: 1 | -1) => {
      direction.current = delta;
      setIndex((i) => Math.min(Math.max(i + delta, 0), steps.length - 1));
    },
    [steps.length]
  );

  // Each time the tour opens it starts from the top and remembers where focus was.
  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setShown({ index: 0, target: null });
    setBox(null);
    direction.current = 1;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  // Find the step's target, opening its station first and waiting for a lazily loaded screen.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const wanted = steps[index];

    (async () => {
      const navigating = !!wanted.station && stationRef.current !== wanted.station;
      if (navigating) onNavigate(wanted.station!);

      let el: Element | null = null;
      if (wanted.targets) {
        // Only a station that was just opened can still be loading. Anywhere else the element is
        // there or it is not, so a missing one is a short look, not a three-second wait.
        const patience = navigating || wanted.station ? WAIT_FOR_TARGET_MS : 250;
        const started = performance.now();
        el = firstVisible(wanted.targets);
        while (!el && performance.now() - started < patience) {
          await new Promise((r) => setTimeout(r, 100));
          if (cancelled) return;
          el = firstVisible(wanted.targets);
        }
        if (cancelled) return;
        if (!el && wanted.optional) {
          // Nothing to point at and no point showing the card alone: move on in the direction of travel.
          if (direction.current === 1 && index < steps.length - 1) go(1);
          else if (direction.current === -1 && index > 0) go(-1);
          return;
        }
      }
      setShown({ index, target: el });
    })();

    return () => {
      cancelled = true;
    };
    // onNavigate is stable enough for this: the step, not the callback, decides when to look again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  // Keep the spotlight on the element as the page moves under it.
  useLayoutEffect(() => {
    if (!open) return;
    setView({ width: window.innerWidth, height: window.innerHeight });
    if (!target) {
      setBox(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      setView({ width: window.innerWidth, height: window.innerHeight });
      setBox(boxOf(target));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    const r = target.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      target.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    measure();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    observer?.observe(target);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [open, shown]);

  // The card places itself by its real height, so a long step does not hang off the screen.
  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;
    const h = cardRef.current.offsetHeight;
    if (h && Math.abs(h - cardH) > 1) setCardH(h);
  });

  // Arrow keys step, Escape skips, and Tab stays inside the card.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close('skip');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (!last) go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'Tab' && cardRef.current) {
        const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
        if (items.length === 0) return;
        const first = items[0];
        const lastItem = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !cardRef.current.contains(active))) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && (active === lastItem || !cardRef.current.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, last, close, go]);

  // Focus lands on the main button of each step, so Enter always means "next".
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      cardRef.current?.querySelector<HTMLElement>('[data-tour-primary]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [open, shown.index]);

  if (!open || typeof document === 'undefined') return null;

  const cardWidth = Math.min(CARD_W, view.width - 24);
  const place = placeCard(box, { width: cardWidth, height: cardH }, view, step.placement ?? 'auto');
  const spot: Box = box ?? { left: view.width / 2, top: view.height / 2, width: 0, height: 0 };
  const motion = reducedMotion() ? 'none' : 'all 360ms cubic-bezier(0.22, 0.8, 0.24, 1)';

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="presentation">
      {/* The dim is the spotlight's own shadow, so the lit window and the dark room move as one. */}
      <div
        aria-hidden
        className="pointer-events-none fixed rounded-[14px]"
        style={{
          left: spot.left,
          top: spot.top,
          width: spot.width,
          height: spot.height,
          boxShadow: '0 0 0 9999px rgba(5, 8, 10, 0.68)',
          outline: box ? '2px solid var(--primary)' : 'none',
          outlineOffset: 2,
          transition: motion,
        }}
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="fixed rounded-card border border-line bg-surface p-5 shadow-[var(--shadow-2)]"
        style={{ left: place.left, top: place.top, width: cardWidth, transition: motion }}
      >
        <div key={step.id} className="kt-tour-in">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
              {shown.index === 0 ? 'Quick tour' : last ? 'All set' : `Step ${shown.index}`}
            </p>
            {!last && (
              <button
                type="button"
                onClick={() => close('skip')}
                className="kt-focus rounded-btn px-2 py-1 text-[12px] text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              >
                Skip tour
              </button>
            )}
          </div>

          <h2 id={titleId} className="mt-2 font-display text-[19px] font-bold leading-tight text-ink">
            {step.title}
          </h2>
          <p id={bodyId} className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
            {step.body}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div aria-hidden className="flex flex-1 items-center gap-1">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === shown.index ? 'w-5 bg-primary' : i < shown.index ? 'w-1.5 bg-primary/60' : 'w-1.5 bg-line-strong'
                }`}
              />
            ))}
          </div>

          {shown.index > 0 && (
            <Button size="sm" variant="secondary" onClick={() => go(-1)}>
              Back
            </Button>
          )}
          {last ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => close('done')}>
                Finish
              </Button>
              <Button size="sm" icon="auto_awesome" data-tour-primary onClick={onTrySample}>
                Try the sample
              </Button>
            </>
          ) : (
            <Button size="sm" data-tour-primary onClick={() => go(1)}>
              {shown.index === 0 ? 'Show me' : 'Next'}
              <Icon name="arrow_forward" size={16} />
            </Button>
          )}
        </div>

        <p className="sr-only" aria-live="polite">
          {`Step ${shown.index + 1} of ${steps.length}: ${step.title}`}
        </p>
      </div>
    </div>,
    document.body
  );
}

export default Tour;
