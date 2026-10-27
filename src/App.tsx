import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { Splash } from '@/components/Splash';
import { useTheme } from '@/lib/theme';
import { StoreProvider } from '@/lib/store';
import type { ScreenId } from '@/lib/nav';

import CommandCenter from '@/screens/CommandCenter';
import Ideas from '@/screens/Ideas';
import RawReel from '@/screens/RawReel';
import SmartEditor from '@/screens/SmartEditor';

import PublishSchedule from '@/screens/PublishSchedule';
import ContentLibrary from '@/screens/ContentLibrary';
import Calendar from '@/screens/Calendar';
import Analytics from '@/screens/Analytics';
import BrandKit from '@/screens/BrandKit';
import Settings from '@/screens/Settings';

const SCREENS: Record<ScreenId, () => React.JSX.Element> = {
  home: CommandCenter,
  ideas: Ideas,
  'raw-reel': RawReel,
  'smart-editor': SmartEditor,

  'publish-schedule': PublishSchedule,
  'content-library': ContentLibrary,
  calendar: Calendar,
  analytics: Analytics,
  'brand-kit': BrandKit,
  settings: Settings,
};

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
            <Screen />
          </main>
        </div>
      </div>
    </StoreProvider>
  );
}
