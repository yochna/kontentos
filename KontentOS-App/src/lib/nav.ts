
import { useEffect, useState } from 'react';

export type ScreenId =
  | 'home'
  | 'ideas'
  | 'raw-reel'
  | 'press'
  | 'smart-editor'
  | 'static-generator'
  | 'publish-schedule'
  | 'content-library'
  | 'calendar'
  | 'analytics'
  | 'brand-kit'
  | 'settings';

let lastNav: { id: ScreenId; payload: any } | null = null;
const navSubscribers = new Set<() => void>();

if (typeof window !== 'undefined') {
  // Records every navigation — including raw 'kt:navigate' dispatches — before React swaps the
  // screen, so the target can read its payload on the render that the event itself caused.
  window.addEventListener('kt:navigate', (e) => {
    const detail = (e as CustomEvent).detail;
    const id: ScreenId | undefined = typeof detail === 'string' ? (detail as ScreenId) : detail?.id;
    if (!id) return;
    lastNav = { id, payload: typeof detail === 'string' ? undefined : detail?.payload };
    for (const notify of navSubscribers) notify();
  });
}

/**
 * Dispatches a typed navigation event across the app.
 * Supports both string id and payload passing.
 */
export function navigate(id: ScreenId, payload?: any) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('kt:navigate', {
        detail: payload !== undefined ? { id, payload } : id,
      })
    );
  }
}

/** Reads the pending navigation for `screenId` without consuming it (safe under StrictMode). */
function peekNavPayload<T>(screenId: ScreenId): T | undefined {
  return lastNav && lastNav.id === screenId ? (lastNav.payload as T) : undefined;
}

function consumeNavPayload(screenId: ScreenId) {
  if (lastNav && lastNav.id === screenId) lastNav = null;
}

/**
 * Payload of the navigation that opened this screen. Consumed on mount, so coming back to a
 * screen later never re-applies a stale deep link over the creator's own selections.
 */
export function useNavPayload<T = any>(screenId: ScreenId): T | undefined {
  const [payload, setPayload] = useState<T | undefined>(() => peekNavPayload<T>(screenId));

  useEffect(() => {
    consumeNavPayload(screenId);
    const onNav = () => {
      const next = peekNavPayload<T>(screenId);
      if (next !== undefined) {
        consumeNavPayload(screenId);
        setPayload(next);
      }
    };
    navSubscribers.add(onNav);
    return () => {
      navSubscribers.delete(onNav);
    };
  }, [screenId]);

  return payload;
}

