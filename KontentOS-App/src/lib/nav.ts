
import { useEffect, useState } from 'react';

export type ScreenId =
  | 'home'
  | 'ideas'
  | 'raw-reel'
  | 'smart-editor'
  | 'static-generator'
  | 'publish-schedule'
  | 'content-library'
  | 'calendar'
  | 'analytics'
  | 'brand-kit'
  | 'settings';

export interface NavItem {
  id: ScreenId;
  label: string;
  icon: string; // Material Symbols name
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Persistent left navigation — mirrors the redesign's IA. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Studio',
    items: [{ id: 'home', label: 'Command Center', icon: 'space_dashboard' }],
  },
  {
    title: 'Core Workflow',
    items: [
      { id: 'ideas', label: 'Ideas', icon: 'auto_awesome' },
      { id: 'raw-reel', label: 'Raw → Reel', icon: 'smart_display' },
      { id: 'smart-editor', label: 'Smart Editor', icon: 'content_cut' },
      { id: 'static-generator', label: 'Static Post Studio', icon: 'photo_size_select_actual' },
      { id: 'publish-schedule', label: 'Publish & Schedule', icon: 'schedule_send' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { id: 'content-library', label: 'Content Library', icon: 'grid_view' },
      { id: 'calendar', label: 'Calendar', icon: 'calendar_today' },
      { id: 'analytics', label: 'Analytics', icon: 'equalizer' },
    ],
  },
];

/** Bottom-of-sidebar utility items. */
export const UTILITY_ITEMS: NavItem[] = [
  { id: 'brand-kit', label: 'Brand Kit', icon: 'palette' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export const SCREEN_TITLES: Record<ScreenId, string> = {
  home: 'Command Center',
  ideas: 'Idea Canvas',
  'raw-reel': 'Raw → Reel Studio',
  'smart-editor': 'Smart Editor',
  'static-generator': 'Static Post Studio',
  'publish-schedule': 'Publish & Schedule',
  'content-library': 'Content Library',
  calendar: 'Calendar',
  analytics: 'Analytics',
  'brand-kit': 'Brand Kit',
  settings: 'Settings',
};

/**
 * ActiveDraft.step uses workflow-step ids ('idea', 'publish') that are not ScreenIds, so
 * casting them to ScreenId resolved to an undefined screen and Resume silently did nothing.
 */
export const DRAFT_STEP_SCREEN: Record<'idea' | 'raw-reel' | 'smart-editor' | 'publish', ScreenId> = {
  idea: 'ideas',
  'raw-reel': 'raw-reel',
  'smart-editor': 'smart-editor',
  publish: 'publish-schedule',
};

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

