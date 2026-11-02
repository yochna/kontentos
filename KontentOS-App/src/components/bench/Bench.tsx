import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { navigate, type ScreenId } from '@/lib/nav';
import { selectCut, useSelectedCutId } from '@/lib/bench';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui';
import type { Theme } from '@/lib/theme';
import { Spine } from './Spine';
import { CutRail } from './CutRail';
import { Inspector } from './Inspector';
import { Dock, type BenchJob } from './Dock';
import { CommandDeck } from './CommandDeck';

// The engines stay lazy: they are the bulk of the bundle and only one is ever open.
const CommandCenter = lazy(() => import('@/screens/CommandCenter'));
const Ideas = lazy(() => import('@/screens/Ideas'));
const RawReel = lazy(() => import('@/screens/RawReel'));
const SmartEditor = lazy(() => import('@/screens/SmartEditor'));
const StaticGenerator = lazy(() => import('@/screens/StaticGenerator'));
const PublishSchedule = lazy(() => import('@/screens/PublishSchedule'));
const ContentLibrary = lazy(() => import('@/screens/ContentLibrary'));
const Calendar = lazy(() => import('@/screens/Calendar'));
const Analytics = lazy(() => import('@/screens/Analytics'));
const BrandKit = lazy(() => import('@/screens/BrandKit'));
const Settings = lazy(() => import('@/screens/Settings'));

const STATIONS: Record<ScreenId, React.ComponentType> = {
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

/** Stations where the cut rail earns its height; the rest read a single number or a profile. */
const RAIL_OFF: ScreenId[] = ['analytics', 'brand-kit', 'settings'];

export function Bench({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const store = useStore();
  const selectedId = useSelectedCutId();
  const [station, setStation] = useState<ScreenId>('home');
  const [deck, setDeck] = useState(false);
  const [jobs, setJobs] = useState<BenchJob[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const intakeRef = useRef<HTMLInputElement>(null);

  const litCut = store.videos.find((v) => v.id === selectedId) ?? null;

  // Engines still call navigate('smart-editor') from inside themselves; the bench listens
  // rather than owning every hop.
  useEffect(() => {
    const onNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const id = typeof detail === 'string' ? detail : detail?.id;
      if (id && STATIONS[id as ScreenId]) setStation(id as ScreenId);
    };
    window.addEventListener('kt:navigate', onNavigate);
    return () => window.removeEventListener('kt:navigate', onNavigate);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setDeck((d) => !d);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The stage scrolls itself now, so a station change resets its own top, not the window's.
  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0 });
  }, [station]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5200);
    return () => window.clearTimeout(t);
  }, [notice]);

  const goTo = useCallback((id: ScreenId, payload?: unknown) => {
    setStation(id);
    if (payload !== undefined) navigate(id, payload);
  }, []);

  const intake = useCallback(
    async (file: File) => {
      const id = `${file.name}-${file.size}-${Date.now()}`;
      setJobs((j) => [...j, { id, label: `intaking ${file.name}`, pct: 0 }]);
      const video = await store.uploadVideo(file, (pct) =>
        setJobs((j) => j.map((x) => (x.id === id ? { ...x, pct } : x)))
      );
      setJobs((j) => j.filter((x) => x.id !== id));
      if (video) {
        selectCut(video.id);
        goTo('raw-reel', { videoId: video.id });
      } else {
        setNotice('Intake failed — the file never reached the workspace.');
      }
    },
    [store, goTo]
  );

  const signOut = useCallback(async () => {
    try {
      await api.signOut();
    } finally {
      // App is watching this event; it drops the session and shows the door again.
      window.dispatchEvent(new Event('kt:signedOut'));
    }
  }, []);

  const Stage = STATIONS[station];
  const railVisible = !RAIL_OFF.includes(station);

  return (
    <div className="flex h-screen overflow-hidden bg-app font-body text-ink">
      <Spine station={station} onStation={goTo} />

      <div className="flex min-w-0 flex-1 flex-col">
        {railVisible && (
          <CutRail
            videos={store.videos}
            scheduled={store.scheduled}
            history={store.history}
            project={store.project}
            selectedId={selectedId}
            onSelect={selectCut}
            onIntake={intake}
            intakeBusy={jobs.length > 0}
            station={station}
            onOpenVault={() => goTo('content-library')}
          />
        )}

        <div className="flex min-h-0 flex-1">
          <main className="relative flex min-w-0 flex-1 flex-col">
            {/* Table the cut sits on: hairline grid, faded so it reads as depth, not decoration. */}
            <span aria-hidden className="kt-graph pointer-events-none absolute inset-0 opacity-60" />
            <div ref={stageRef} className="relative min-w-0 flex-1 overflow-y-auto">
              <Suspense fallback={<StageSkeleton />}>
                {/* Keyed by station: the swap animation replays per hop, once the engine is real. */}
                <div key={station} className="kt-station">
                  <Stage />
                </div>
              </Suspense>
            </div>

            {notice && (
              <div className="kt-shake absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-[6px] border border-danger/40 bg-surface px-3 py-2 shadow-[var(--shadow-2)]">
                <Icon name="error" size={15} className="shrink-0 text-danger" />
                <span className="text-[12px] text-ink">{notice}</span>
              </div>
            )}
          </main>

          <Inspector
            video={litCut}
            scheduled={store.scheduled}
            history={store.history}
            project={store.project}
            savedIdeas={store.savedIdeas.length}
            activeDraft={store.activeDraft}
            station={station}
            onJump={goTo}
          />
        </div>

        <Dock
          jobs={jobs}
          notice={notice}
          online={store.online}
          dbStatus={store.dbStatus}
          station={station}
          onStation={goTo}
          onOpenDeck={() => setDeck(true)}
          theme={theme}
          onToggleTheme={onToggleTheme}
          selectedTitle={litCut?.title ?? null}
        />
      </div>

      <CommandDeck
        open={deck}
        onClose={() => setDeck(false)}
        onStation={(id) => goTo(id)}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onIntake={() => intakeRef.current?.click()}
        onSignOut={signOut}
      />

      <input
        ref={intakeRef}
        type="file"
        accept="video/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) intake(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function StageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-[min(380px,65vw)]" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[128px] rounded-card" />
        ))}
      </div>
    </div>
  );
}
