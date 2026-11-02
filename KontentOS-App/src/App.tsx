import { useEffect, useState } from 'react';
import { Bench } from '@/components/bench/Bench';
import { Splash } from '@/components/Splash';
import { AuthScreen } from '@/components/AuthScreen';
import { Icon } from '@/lib/icons';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { StoreProvider } from '@/lib/store';
import type { User } from '@/lib/types';

export default function App() {
  const { theme, toggle } = useTheme();
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
      <Bench theme={theme} onToggleTheme={toggle} />
    </StoreProvider>
  );
}
