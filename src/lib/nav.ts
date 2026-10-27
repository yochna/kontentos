
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

