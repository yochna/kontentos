import { Suspense, lazy, useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { Splash } from '@/components/Splash';
import { AuthScreen } from '@/components/AuthScreen';
import { Icon } from '@/lib/icons';
import { Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { StoreProvider } from '@/lib/store';
import type { ScreenId } from '@/lib/nav';
import type { User } from '@/lib/types';

import CommandCenter from '@/screens/CommandCenter';
import Ideas from '@/screens/Ideas';

// Everything behind the first screen is loaded on demand: the editor, the card studio and the
// analytics charts are the bulk of the bundle, and the Command Center is what a creator sees first.
const RawReel = lazy(() => import('@/screens/RawReel'));
const SmartEditor = lazy(() => import('@/screens/SmartEditor'));
const StaticGenerator = lazy(() => import('@/screens/StaticGenerator'));
const PublishSchedule = lazy(() => import('@/screens/PublishSchedule'));
const ContentLibrary = lazy(() => import('@/screens/ContentLibrary'));
const Calendar = lazy(() => import('@/screens/Calendar'));
const Analytics = lazy(() => import('@/screens/Analytics'));
const BrandKit = lazy(() => import('@/screens/BrandKit'));
const Settings = lazy(() => import('@/screens/Settings'));

const SCREENS: Record<ScreenId, React.ComponentType> = {
  home: CommandCenter,
  ideas: Ideas,
  'raw-reel': RawReel,
  'smart-editor': SmartEditor,
  'static-generator': StaticGenerator,
  'publish-schedule': PublishSchedule,
  'content-library': ContentLibrary,
  calendar: Calendar,
  analytics: Analytics,
  'brand-kit': BrandKit,
  settings: Settings,
};

function ScreenSkeleton() {
  // Shaped like the screens it stands in for — header, stat row, card grid — so the swap
  // to the real screen reads as the page filling in rather than as a hard cut.
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-[min(420px,70vw)]" />
          <Skeleton className="h-4 w-[min(300px,60vw)]" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[104px] rounded-card" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[150px] rounded-card" />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [screen, setScreen] = useState<ScreenId>('home');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [account, setAccount] = useState<User | null | 'checking'>('checking');

  // The store starts fetching as soon as it mounts, so the session has to be settled first:
  // an anonymous visitor must see the sign-in form, not a wall of failed requests.
  useEffect(() => {
    let cancelled = false;
    api.authMe().then((user) => {
      if (!cancelled) setAccount(user);
    });
    // api.ts raises this when any call comes back 401, i.e. the session ended in this tab.
    const onSignedOut = () => setAccount(null);
    window.addEventListener('kt:signedOut', onSignedOut);
    return () => {
      cancelled = true;
      window.removeEventListener('kt:signedOut', onSignedOut);
    };
  }, []);

  // Allow screens to navigate cross-cutting (e.g. Home cards → workflow screens).
  useEffect(() => {
    const onNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const id = typeof detail === 'string' ? detail : detail?.id;
      if (id && SCREENS[id as ScreenId]) {
        setScreen(id as ScreenId);
        window.scrollTo({ top: 0 });
      }
    };
    window.addEventListener('kt:navigate', onNavigate);
    return () => window.removeEventListener('kt:navigate', onNavigate);
  }, []);

  if (account === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-app font-body text-[13px] text-ink-dim">
        <Icon name="hourglass_top" size={16} className="animate-pulse text-primary" />
        Opening studio…
      </div>
    );
  }

  if (account === null) {
    return <AuthScreen onSignedIn={setAccount} />;
  }

  // Keyed by the account: signing in as someone else in the same tab rebuilds the store from
  // scratch instead of briefly showing the previous creator's clips.
  const Screen = SCREENS[screen];

  return (
    <StoreProvider key={account.id}>
      {showSplash && <Splash onDone={() => setShowSplash(false)} />}
      <div className="flex min-h-screen bg-app text-ink font-body">
        <Sidebar
          active={screen}
          onNavigate={setScreen}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar
            screen={screen}
            theme={theme}
            onToggleTheme={toggle}
            onOpenMobile={() => setMobileOpen(true)}
          />
          <main className="flex-1 min-w-0">
            <Suspense fallback={<ScreenSkeleton />}>
              {/* Keyed by screen: each navigation remounts the wrapper, so the entrance plays
                  once the real screen is on screen (not behind the lazy-loading fallback). */}
              <div key={screen} className="kt-screen-enter">
                <Screen />
              </div>
            </Suspense>
          </main>
        </div>
      </div>
    </StoreProvider>
  );
}
