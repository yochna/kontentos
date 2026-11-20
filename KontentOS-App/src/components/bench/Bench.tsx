import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { Icon } from '@/lib/icons';
import { navigate, type ScreenId } from '@/lib/nav';
import { lastStation, rememberStation, selectCut, useSelectedCutId } from '@/lib/bench';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui';
import { notify } from '@/components/ui/toast';
import type { Theme } from '@/lib/theme';
import type { Video } from '@/lib/types';
import { Spine } from './Spine';
import { CutRail } from './CutRail';
import { Inspector } from './Inspector';
import { Dock, type BenchJob } from './Dock';
import { CommandDeck } from './CommandDeck';
import { Tour } from './Tour';
import { TOUR_SAMPLE_KEY, isTourDone, markTourDone } from '@/lib/tour';
import { MAX_PARALLEL_UPLOADS, VIDEO_ACCEPT, uploadFileError } from '@/lib/uploadFile';

// The engines stay lazy: they are the bulk of the bundle and only one is ever open.
const CommandCenter = lazy(() => import('@/screens/CommandCenter'));
const Ideas = lazy(() => import('@/screens/Ideas'));
const RawReel = lazy(() => import('@/screens/RawReel'));
const Press = lazy(() => import('@/screens/Press'));
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
  press: Press,
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

const STATION_IDS = Object.keys(STATIONS) as ScreenId[];

/** Engines that open on a specific clip when the rail hands them one. */
const CLIP_STATIONS: ScreenId[] = ['raw-reel', 'press', 'smart-editor'];

const isFileDrag = (e: ReactDragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

export function Bench({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const store = useStore();
  const selectedId = useSelectedCutId();
  const [station, setStation] = useState<ScreenId>(() => lastStation(STATION_IDS) ?? 'home');
  const [deck, setDeck] = useState(false);
  const [jobs, setJobs] = useState<BenchJob[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  // The details panel is a fifth of the width on every station. It starts open, and a creator who
  // wants the room folds it away; the choice is remembered on this browser.
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kt.inspector.open') !== '0';
    } catch {
      return true;
    }
  });
  const toggleInspector = useCallback(() => {
    setInspectorOpen((was) => {
      const next = !was;
      try {
        localStorage.setItem('kt.inspector.open', next ? '1' : '0');
      } catch {
        // A browser that will not store it just opens the panel again next time.
      }
      return next;
    });
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const intakeRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

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
    rememberStation(station);
  }, [station]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5200);
    return () => window.clearTimeout(t);
  }, [notice]);

  /**
   * One message, two places: the toast is where the app says everything else, and the dock's LED
   * keeps the last thing that went wrong readable after the toast has gone.
   */
  const flag = useCallback((message: string, kind: 'bad' | 'info' = 'bad') => {
    setNotice(message);
    if (kind === 'bad') notify.bad(message);
    else notify.info(message);
  }, []);

  /**
   * Hopping to a clip-shaped station hands it the lit cut, so the rail stays the one place a
   * creator says which cut is being worked on.
   */
  const goTo = useCallback(
    (id: ScreenId, payload?: unknown) => {
      setStation(id);
      const forward = payload ?? (CLIP_STATIONS.includes(id) && selectedId ? { videoId: selectedId } : undefined);
      if (forward !== undefined) navigate(id, forward);
    },
    [selectedId]
  );

  // A first visit opens the walkthrough once the room has settled; after that it only opens when
  // asked (the ? key in the dock, or "Take the tour" in the command deck).
  useEffect(() => {
    if (isTourDone()) return;
    const timer = window.setTimeout(() => setTourOpen(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const closeTour = useCallback(() => {
    markTourDone();
    setTourOpen(false);
  }, []);

  // The tour's last step presses the built-in sample. The Press screen is lazy and may not be
  // mounted yet, so the request is left where it will find it on mount, and announced for the case
  // where it already is.
  const trySampleFromTour = useCallback(() => {
    markTourDone();
    setTourOpen(false);
    try {
      sessionStorage.setItem(TOUR_SAMPLE_KEY, '1');
    } catch {
      // Without session storage the creator just presses the sample button themselves.
    }
    goTo('press');
    window.dispatchEvent(new Event('kt:try-sample'));
  }, [goTo]);

  const intake = useCallback(
    async (file: File) => {
      const problem = uploadFileError(file);
      if (problem) {
        flag(problem);
        return;
      }
      const id = `${file.name}-${file.size}-${Date.now()}`;
      setJobs((j) => [...j, { id, label: `uploading ${file.name}`, pct: 0 }]);
      try {
        const video = await store.uploadVideo(file, (pct) =>
          setJobs((j) =>
            j.map((x) =>
              x.id === id
                ? { ...x, pct, label: pct >= 93 ? `finishing ${file.name}` : `uploading ${file.name}` }
                : x
            )
          )
        );
        if (!video) throw new Error('The upload ended without a clip record.');
        selectCut(video.id);
        goTo('raw-reel', { videoId: video.id });
      } catch (err) {
        flag(err instanceof Error ? err.message : 'Upload failed — the file never reached the workspace.');
      } finally {
        setJobs((j) => j.filter((x) => x.id !== id));
      }
    },
    [store, goTo, flag]
  );

  /** The rail's right-click: light the cut, then hop to the station that works on it. */
  const openIn = useCallback(
    (id: ScreenId, videoId: string) => {
      selectCut(videoId);
      goTo(id, CLIP_STATIONS.includes(id) ? { videoId } : undefined);
    },
    [goTo],
  );

  const deleteCut = useCallback(
    async (video: Video) => {
      const res = await store.deleteVideo(video.id);
      if (res.ok) {
        if (selectedId === video.id) selectCut(null);
        notify.ok(`“${video.title}” is off the bench.`);
      } else {
        flag(res.message ?? 'The cut would not delete.');
      }
      return res.ok;
    },
    [store, selectedId, flag],
  );

  const dropFiles = useCallback(
    (files: File[]) => {
      const clips: File[] = [];
      let firstProblem: string | null = null;
      for (const file of files) {
        const problem = uploadFileError(file);
        if (problem) firstProblem ??= problem;
        else clips.push(file);
      }
      if (firstProblem) flag(firstProblem);
      if (!clips.length) return;
      // The server holds at most three sessions per creator. Starting a fourth would be refused,
      // so the bench queues the rest behind a clear message rather than failing halfway through.
      if (clips.length > MAX_PARALLEL_UPLOADS) {
        flag(`Intaking the first ${MAX_PARALLEL_UPLOADS} of ${clips.length} files.`, 'info');
      }
      clips.slice(0, MAX_PARALLEL_UPLOADS).forEach(intake);
    },
    [intake, flag]
  );

  // The root handles normal drops. This catch-all covers a drop that lands on the window chrome
  // edge or outside the React tree; defaultPrevented means an inner dropzone already owned it.
  useEffect(() => {
    const catchDrop = (e: DragEvent) => {
      if (e.defaultPrevented) return;
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      dropFiles(Array.from(e.dataTransfer.files));
    };
    window.addEventListener('drop', catchDrop);
    return () => window.removeEventListener('drop', catchDrop);
  }, [dropFiles]);

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
    <div
      className="flex h-screen overflow-hidden bg-app font-body text-ink"
      onDragEnter={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDropping(true);
      }}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        if (!isFileDrag(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropping(false);
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDropping(false);
        dropFiles(Array.from(e.dataTransfer.files));
      }}
    >
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
            onOpenIn={openIn}
            onDeleteCut={deleteCut}
          />
        )}

        <div className="flex min-h-0 flex-1">
          <main className="relative flex min-w-0 flex-1 flex-col">
            {/* Table the cut sits on: light from above, so the stage floor reads as a surface. */}
            <span aria-hidden className="kt-graph pointer-events-none absolute inset-0" />
            <div ref={stageRef} className="kt-readable relative min-w-0 flex-1 overflow-y-auto">
              <Suspense fallback={<StageSkeleton />}>
                {/* Keyed by station: the swap animation replays per hop, once the engine is real. */}
                <div key={station} className="kt-station">
                  <Stage />
                </div>
              </Suspense>
            </div>
          </main>

          {inspectorOpen && (
            <Inspector
              video={litCut}
              scheduled={store.scheduled}
              history={store.history}
              project={store.project}
              savedIdeas={store.savedIdeas.length}
              activeDraft={store.activeDraft}
              station={station}
              onJump={goTo}
              onHide={toggleInspector}
            />
          )}
        </div>

        <Dock
          jobs={jobs}
          notice={notice}
          online={store.online}
          station={station}
          onStation={goTo}
          onOpenDeck={() => setDeck(true)}
          inspectorOpen={inspectorOpen}
          onToggleInspector={toggleInspector}
          onTour={() => setTourOpen(true)}
          theme={theme}
          onToggleTheme={onToggleTheme}
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
        onTour={() => setTourOpen(true)}
      />

      <Tour
        open={tourOpen}
        station={station}
        onNavigate={(id) => goTo(id)}
        onClose={closeTour}
        onTrySample={trySampleFromTour}
      />

      <input
        ref={intakeRef}
        type="file"
        accept={VIDEO_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) intake(file);
          e.target.value = '';
        }}
      />

      {dropping && (
        <div
          aria-hidden
          className="kt-drop pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-[var(--scrim)] p-6"
        >
          <div className="kt-drop-card flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-primary/70 bg-surface px-10 py-8 text-center shadow-[var(--shadow-2)]">
            <Icon name="file_upload" size={26} className="text-primary" />
            <p className="font-display text-[18px] font-bold text-ink">Drop the footage on the bench</p>
            <p className="kt-eyebrow">
              Video files only · each one becomes a new cut
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function StageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-[min(320px,60vw)]" />
        <Skeleton className="h-3.5 w-[min(240px,50vw)]" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[128px] rounded-card" />
        ))}
      </div>
    </div>
  );
}
