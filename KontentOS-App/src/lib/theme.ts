import { useCallback, useEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'kontentos_redesign_theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  // Light is the DEFAULT for the redesign; only honour an explicit saved dark.
  return saved === 'dark' ? 'dark' : 'light';
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const mounted = useRef(false);

  useEffect(() => {
    const apply = () => document.documentElement.setAttribute('data-theme', theme);
    const doc = document as ViewTransitionDocument;
    // Every colour token changes at once, which reads as a hard cut. A view transition
    // cross-fades that paint instead. Not on first mount — that would fade the whole app in.
    if (mounted.current && doc.startViewTransition) doc.startViewTransition(apply);
    else apply();
    mounted.current = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore write failures (private mode, etc.) */
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, setTheme, toggle };
}
