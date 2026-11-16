/**
 * The first-run walkthrough: what it says, where its card goes, and whether it has been seen.
 *
 * The component (components/bench/Tour.tsx) only draws; everything that can be wrong without a
 * browser (the copy order, the card placement maths, the remembered flag) lives here so it can be
 * tested without one.
 */

import type { StationId } from './bench';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /**
   * CSS selectors tried in order; the first one that is on screen is spotlit. Several are listed
   * where the target differs by layout (the left menu on a laptop, the dock row on a phone). A step
   * with none on screen is shown centred instead, unless it is `optional`, in which case it is
   * skipped, because pointing at nothing says nothing.
   */
  targets?: string[];
  optional?: boolean;
  placement?: Side | 'auto';
  /** The station to be on before this step is shown (the tour opens it and waits for the target). */
  station?: StationId;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to KontentOS',
    body: 'One clip in. A reel, a carousel and captions out. This quick tour shows you how it works, in about thirty seconds.',
  },
  {
    id: 'stations',
    title: 'The bench, in order',
    body: 'Work moves down this menu: bring footage In, shape it in Cut, send it Out. Each key opens one station.',
    targets: ['[data-tour="spine"]', '[data-tour="dock-stations"]'],
    placement: 'right',
  },
  {
    id: 'press-take',
    title: 'Press: the one-click way',
    body: 'Press does the whole job with one button. It starts here: pick a clip you have uploaded, or try the sample clip.',
    targets: ['[data-tour="press-take"]'],
    placement: 'bottom',
    station: 'press',
  },
  {
    id: 'press-style',
    title: 'Pick a style',
    body: 'Tight hook, Explainer or Story arc decides how long the cut is and how the words are written.',
    targets: ['[data-tour="press-style"]', '[data-tour="press-take"]'],
    placement: 'right',
    station: 'press',
  },
  {
    id: 'press-go',
    title: 'Press once',
    body: 'The reel is cut vertical with the captions on it, and the carousel and post copy are written at the same time. Keep this tab open while the video is made.',
    targets: ['[data-tour="press-go"]'],
    placement: 'right',
    station: 'press',
  },
  {
    id: 'press-results',
    title: 'Everything comes back together',
    body: 'The reel, the caption files, the carousel and the post copy land here. One button saves all of it in a single zip.',
    targets: ['[data-tour="press-results"]'],
    placement: 'left',
    station: 'press',
  },
  {
    id: 'rail',
    title: 'Your clips, always in reach',
    body: 'This bar shows which clip you are working on. Open “all cuts” to switch clips or add more footage.',
    targets: ['[data-tour="rail"]'],
    placement: 'bottom',
  },
  {
    id: 'inspector',
    title: 'Details on the side',
    body: 'This panel shows the clip you are on. Hide it with the panel key at the bottom when you want more room.',
    targets: ['[data-tour="inspector"]'],
    placement: 'left',
    optional: true,
  },
  {
    id: 'done',
    title: 'You are set',
    body: 'No footage handy? Press the built-in sample clip and watch a whole run. You can reopen this tour any time from the ? key at the bottom.',
  },
];

export const TOUR_DONE_KEY = 'kt.tour.done';
/** Set by the tour's last step and read by the Press screen, which may not exist yet when it is set. */
export const TOUR_SAMPLE_KEY = 'kt.tour.sample';

export function isTourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === '1';
  } catch {
    // A browser that cannot store it would otherwise replay the tour on every visit; treat it as seen.
    return true;
  }
}

export function markTourDone(): void {
  try {
    localStorage.setItem(TOUR_DONE_KEY, '1');
  } catch {
    // Nothing to do: the flag only keeps the tour from replaying.
  }
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  /** Which side of the target the card sits on; null when it is centred or has no target. */
  side: Side | null;
}

/**
 * Where the card goes. It prefers the side the step asks for, falls back to whichever side has the
 * most room, and is always clamped inside the viewport; with no target it is centred, and with a
 * target so large that no side fits it sits at the bottom of the screen rather than off it.
 */
export function placeCard(
  target: Box | null,
  card: { width: number; height: number },
  view: { width: number; height: number },
  preferred: Side | 'auto' = 'auto',
  gap = 16,
  margin = 12
): Placement {
  const clampLeft = (x: number) => Math.min(Math.max(x, margin), Math.max(margin, view.width - card.width - margin));
  const clampTop = (y: number) => Math.min(Math.max(y, margin), Math.max(margin, view.height - card.height - margin));

  if (!target) {
    return { left: clampLeft((view.width - card.width) / 2), top: clampTop((view.height - card.height) / 2), side: null };
  }

  const room: Record<Side, number> = {
    right: view.width - (target.left + target.width) - margin,
    left: target.left - margin,
    bottom: view.height - (target.top + target.height) - margin,
    top: target.top - margin,
  };
  const need: Record<Side, number> = {
    right: card.width + gap,
    left: card.width + gap,
    bottom: card.height + gap,
    top: card.height + gap,
  };
  const fits = (s: Side) => room[s] >= need[s];

  const order: Side[] = ['right', 'bottom', 'left', 'top'];
  const side: Side | null =
    preferred !== 'auto' && fits(preferred)
      ? preferred
      : (order.filter(fits).sort((a, b) => room[b] - room[a])[0] ?? null);

  if (!side) {
    return { left: clampLeft((view.width - card.width) / 2), top: clampTop(view.height - card.height - margin), side: null };
  }

  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;
  switch (side) {
    case 'right':
      return { left: clampLeft(target.left + target.width + gap), top: clampTop(cy - card.height / 2), side };
    case 'left':
      return { left: clampLeft(target.left - card.width - gap), top: clampTop(cy - card.height / 2), side };
    case 'bottom':
      return { left: clampLeft(cx - card.width / 2), top: clampTop(target.top + target.height + gap), side };
    default:
      return { left: clampLeft(cx - card.width / 2), top: clampTop(target.top - card.height - gap), side };
  }
}
