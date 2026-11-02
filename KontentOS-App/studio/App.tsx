import { useCallback, useEffect, useState } from 'react';
import { studioApi, type RepurposeJob, type SessionUser } from './lib/api';
import { AuthScreen } from './screens/Auth';
import { CutScreen } from './screens/Cut';
import { FeedScreen } from './screens/Feed';
import { ShelfScreen } from './screens/Shelf';
import { Button, Mark } from './components/atoms';
import { Toasts } from './components/Toasts';

type Route = { name: 'feed' } | { name: 'cut'; id: string } | { name: 'shelf' };

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  if (clean.startsWith('job/')) return { name: 'cut', id: clean.slice(4) };
  if (clean === 'shelf') return { name: 'shelf' };
  return { name: 'feed' };
}

function useRoute(): [Route, (to: string) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = useCallback((to: string) => {
    window.location.hash = to;
  }, []);
  return [route, go];
}

export function App() {
  const [route, go] = useRoute();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [jobs, setJobs] = useState<RepurposeJob[]>([]);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  // A screen that holds unsaved words says so here, and every in-app link asks before it navigates.
  const navTo = useCallback(
    (to: string) => {
      if (dirtyCount > 0 && to !== window.location.hash) {
        setPendingTo(to);
        return;
      }
      go(to);
    },
    [dirtyCount, go]
  );

  useEffect(() => {
    if (!dirtyCount) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  useEffect(() => {
    let alive = true;
    studioApi
      .me()
      .then((me) => {
        if (!alive) return;
        setUser(me);
        setChecking(false);
      })
      .catch(() => alive && setChecking(false));
    const signedOut = () => setUser(null);
    window.addEventListener('st:signed-out', signedOut);
    return () => {
      alive = false;
      window.removeEventListener('st:signed-out', signedOut);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    studioApi
      .jobs()
      .then(setJobs)
      .catch(() => setJobs([]));
  }, [user]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="meta-label animate-pulse">Opening the studio…</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen mode="signin" onDone={setUser} />;
  }

  const activeJob = route.name === 'cut' ? jobs.find((j) => j.id === route.id) || null : null;

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-3.5 sm:gap-6 sm:px-8">
          <a href="#/" className="flex items-center gap-2.5">
            <Mark />
            <span className="font-display text-[17px] font-semibold tracking-[-0.01em] text-ink">
              KontentOS
            </span>
            <span className="meta-label hidden sm:inline">Studio</span>
          </a>
          <nav className="flex items-center gap-5 text-[14px]">
            <NavLink to="#/" active={route.name === 'feed'} onNavigate={navTo}>
              Feed
            </NavLink>
            <NavLink to="#/shelf" active={route.name === 'shelf'} onNavigate={navTo}>
              Shelf
            </NavLink>
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <a
              className="meta-label hidden text-ink-soft underline-offset-4 hover:text-moss hover:underline sm:inline"
              href="/#/"
              title="The cutting-room bench: timeline, captions, static cards, scheduling"
            >
              Open the bench
            </a>
            {/* One account per session, and at phone width the row has no room left for the name. */}
            <span className="hidden max-w-[16ch] truncate text-[13px] text-ink-soft sm:inline" title={user.email}>
              {user.full_name || user.displayName || user.email}
            </span>
            <Button
              kind="quiet"
              onClick={() => {
                void studioApi.signOut().then(() => setUser(null));
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 pb-24 pt-8 sm:px-8">
        {route.name === 'feed' && (
          <FeedScreen
            jobs={jobs}
            onStarted={(job) => setJobs((prev) => [job, ...prev])}
            onOpen={(id) => navTo(`#/job/${id}`)}
            onRemoved={(id) => setJobs((prev) => prev.filter((j) => j.id !== id))}
          />
        )}
        {route.name === 'cut' && (
          <CutScreen
            job={activeJob}
            jobId={route.id}
            onDirtyChange={setDirtyCount}
            onJob={(next) =>
              setJobs((prev) => {
                const idx = prev.findIndex((j) => j.id === next.id);
                if (idx < 0) return [next, ...prev];
                const copy = [...prev];
                copy[idx] = next;
                return copy;
              })
            }
            onBack={() => navTo('#/')}
          />
        )}
        {route.name === 'shelf' && <ShelfScreen jobs={jobs} onOpen={(id) => navTo(`#/job/${id}`)} />}
      </main>
      <Toasts />

      {pendingTo && (
        <LeavePrompt
          count={dirtyCount}
          onStay={() => setPendingTo(null)}
          onLeave={() => {
            const to = pendingTo;
            setPendingTo(null);
            setDirtyCount(0);
            go(to);
          }}
        />
      )}
    </div>
  );
}

function NavLink({
  to,
  active,
  onNavigate,
  children,
}: {
  to: string;
  active: boolean;
  onNavigate: (to: string) => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={to}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        // Keep the href so a middle click still opens a tab; a left click goes through the guard.
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onNavigate(to);
      }}
      className={`relative py-1 transition-colors duration-200 ${
        active ? 'text-ink' : 'text-ink-soft hover:text-ink'
      }`}
    >
      {children}
      <span
        className={`absolute -bottom-0.5 left-0 right-0 h-[1.5px] origin-left bg-moss transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          active ? 'scale-x-100' : 'scale-x-0'
        }`}
      />
    </a>
  );
}

function LeavePrompt({
  count,
  onLeave,
  onStay,
}: {
  count: number;
  onLeave: () => void;
  onStay: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onStay();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStay]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Unsaved shorts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 px-5 backdrop-blur-[2px]"
      onClick={onStay}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rise-in w-full max-w-[380px] rounded-card border border-rule bg-white p-6 shadow-lift"
      >
        <p className="meta-label">Unsaved</p>
        <h2 className="mt-1.5 font-display text-[22px] leading-snug tracking-[-0.015em] text-ink">
          {count} {count === 1 ? 'short has' : 'shorts have'} changes that are not stored
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          Leaving throws them away. Save first, or drop the changes and go.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button kind="outline" autoFocus onClick={onStay}>
            Stay and save
          </Button>
          <Button kind="quiet" onClick={onLeave}>
            Discard and leave
          </Button>
        </div>
      </div>
    </div>
  );
}
