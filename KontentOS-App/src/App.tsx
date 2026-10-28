import { Suspense, lazy, useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { Splash } from '@/components/Splash';
import { Icon } from '@/lib/icons';
import { useTheme } from '@/lib/theme';
import { StoreProvider } from '@/lib/store';
import type { ScreenId } from '@/lib/nav';

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
  return (
    <div className="flex items-center gap-2 px-6 py-16 text-[13px] text-ink-muted">
      <Icon name="hourglass_top" size={16} className="text-primary animate-pulse" />
      Loading screen…
    </div>
  );
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [screen, setScreen] = useState<ScreenId>('home');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

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

  const Screen = SCREENS[screen];

  return (
    <StoreProvider>
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
              <Screen />
            </Suspense>
          </main>
        </div>
      </div>
    </StoreProvider>
  );
}
