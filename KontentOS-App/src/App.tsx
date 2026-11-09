import { useEffect, useState } from 'react';
import { Bench } from '@/components/bench/Bench';
import { Splash } from '@/components/Splash';
import { AuthScreen } from '@/components/AuthScreen';
import { Icon } from '@/lib/icons';
import { api } from '@/lib/api';
import { useTheme, type Theme } from '@/lib/theme';
import { StoreProvider, clearBenchWorkspace } from '@/lib/store';
import { useWorkspaceLifecycle, useWorkspaceReady } from '@/lib/workspace';
import type { User } from '@/lib/types';

/**
 * The bench is not drawn until the account's workspace row is in the cache.
 *
 * Room switches, the Brand Kit, the lit cut and the last station are all read synchronously by the
 * engines that use them, so a station mounted a beat early would open on defaults and then write
 * those defaults back over what the creator actually saved. One gate here covers every reader,
 * instead of a wait in each.
 */
function BenchGate({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const ready = useWorkspaceReady();
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-app font-body text-[13px] text-ink-dim">
        <Icon name="hourglass_top" size={16} className="animate-pulse text-primary" />
        Reading your desk…
      </div>
    );
  }
  return <Bench theme={theme} onToggleTheme={onToggleTheme} />;
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [showSplash, setShowSplash] = useState(true);
  const [account, setAccount] = useState<User | null | 'checking'>('checking');
  useWorkspaceLifecycle();

  // The store starts fetching as soon as it mounts, so the session has to be settled first:
  // an anonymous visitor must see the sign-in form, not a wall of failed requests.
  useEffect(() => {
    let cancelled = false;
    api.authMe().then((user) => {
      if (!cancelled) setAccount(user);
    });
    // api.ts raises this when any call comes back 401, i.e. the session ended in this tab.
    const onSignedOut = () => {
      clearBenchWorkspace();
      setAccount(null);
    };
    window.addEventListener('kt:signedOut', onSignedOut);
    return () => {
      cancelled = true;
      window.removeEventListener('kt:signedOut', onSignedOut);
    };
  }, []);

  if (account === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-app font-body text-[13px] text-ink-dim">
        <Icon name="hourglass_top" size={16} className="animate-pulse text-primary" />
        Opening the room…
      </div>
    );
  }

  if (account === null) {
    return <AuthScreen onSignedIn={setAccount} />;
  }

  // Keyed by the account: signing in as someone else in the same tab rebuilds the bench from
  // scratch instead of briefly showing the previous creator's cuts.
  return (
    <StoreProvider key={account.id}>
      {showSplash && <Splash onDone={() => setShowSplash(false)} />}
      <BenchGate theme={theme} onToggleTheme={toggle} />
    </StoreProvider>
  );
}
