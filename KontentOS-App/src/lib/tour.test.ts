import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATION_BY_ID } from './bench';
import { TOUR_DONE_KEY, TOUR_STEPS, isTourDone, markTourDone, placeCard } from './tour';

const view = { width: 1440, height: 900 };
const card = { width: 340, height: 220 };

describe('the tour steps', () => {
  it('open on a welcome and close on a send-off, neither pointing at anything', () => {
    expect(TOUR_STEPS[0].id).toBe('welcome');
    expect(TOUR_STEPS[0].targets).toBeUndefined();
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].id).toBe('done');
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].targets).toBeUndefined();
  });

  it('have unique ids, real stations and no empty copy', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const step of TOUR_STEPS) {
      expect(step.title.trim().length).toBeGreaterThan(0);
      expect(step.body.trim().length).toBeGreaterThan(20);
      if (step.station) expect(STATION_BY_ID[step.station]).toBeDefined();
    }
  });

  it('keep the Press steps together so the tour opens the station once', () => {
    const stations = TOUR_STEPS.map((s) => s.station ?? null);
    const first = stations.indexOf('press');
    const last = stations.lastIndexOf('press');
    expect(first).toBeGreaterThan(-1);
    expect(stations.slice(first, last + 1).every((s) => s === 'press')).toBe(true);
  });
});

describe('placeCard', () => {
  const target = { left: 600, top: 300, width: 200, height: 100 };

  it('centres the card when there is nothing to point at', () => {
    const p = placeCard(null, card, view);
    expect(p.side).toBeNull();
    expect(p.left).toBe((1440 - 340) / 2);
    expect(p.top).toBe((900 - 220) / 2);
  });

  it('puts the card on the side the step asks for when it fits', () => {
    expect(placeCard(target, card, view, 'right').side).toBe('right');
    expect(placeCard(target, card, view, 'left').side).toBe('left');
    expect(placeCard(target, card, view, 'bottom').side).toBe('bottom');
  });

  it('moves to another side when the preferred one has no room', () => {
    const nearRight = { left: 1300, top: 300, width: 120, height: 100 };
    const p = placeCard(nearRight, card, view, 'right');
    expect(p.side).not.toBe('right');
    expect(p.side).not.toBeNull();
  });

  it('never leaves the card outside the viewport', () => {
    const corners = [
      { left: 0, top: 0, width: 80, height: 60 },
      { left: 1360, top: 840, width: 80, height: 60 },
      { left: 700, top: 0, width: 80, height: 40 },
    ];
    for (const t of corners) {
      for (const pref of ['auto', 'top', 'right', 'bottom', 'left'] as const) {
        const p = placeCard(t, card, view, pref);
        expect(p.left).toBeGreaterThanOrEqual(12);
        expect(p.top).toBeGreaterThanOrEqual(12);
        expect(p.left + card.width).toBeLessThanOrEqual(view.width - 12);
        expect(p.top + card.height).toBeLessThanOrEqual(view.height - 12);
      }
    }
  });

  it('does not sit on top of the target when a side fits', () => {
    const p = placeCard(target, card, view, 'right');
    expect(p.left).toBeGreaterThanOrEqual(target.left + target.width);
  });

  it('falls to the bottom of the screen for a target that fills it', () => {
    const everything = { left: 0, top: 0, width: 1440, height: 900 };
    const p = placeCard(everything, card, view, 'right');
    expect(p.side).toBeNull();
    expect(p.top + card.height).toBeLessThanOrEqual(900 - 12);
  });

  it('fits a phone-width screen', () => {
    const phone = { width: 390, height: 844 };
    const small = { width: 340, height: 230 };
    const p = placeCard({ left: 8, top: 760, width: 374, height: 40 }, small, phone, 'right');
    expect(p.left).toBeGreaterThanOrEqual(12);
    expect(p.left + small.width).toBeLessThanOrEqual(phone.width - 12);
    expect(p.top + small.height).toBeLessThanOrEqual(phone.height - 12);
  });
});

describe('the seen flag', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
    };
  };

  afterEach(() => vi.unstubAllGlobals());

  it('starts unseen and is remembered once marked', () => {
    const store = memory();
    vi.stubGlobal('localStorage', store);
    expect(isTourDone()).toBe(false);
    markTourDone();
    expect(store.getItem(TOUR_DONE_KEY)).toBe('1');
    expect(isTourDone()).toBe(true);
  });

  it('counts a browser that cannot store anything as having seen it, so it never replays on every visit', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: () => {
        throw new Error('storage blocked');
      },
    });
    expect(isTourDone()).toBe(true);
    expect(() => markTourDone()).not.toThrow();
  });
});
