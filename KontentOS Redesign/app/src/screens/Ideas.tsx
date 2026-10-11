import { useState } from 'react';
import { Icon } from '@/lib/icons';
import { Badge, Button, Card, Chip, Eyebrow, Thumb } from '@/components/ui';
import { unsplashPhoto } from '@/lib/images';
import { ideas as initialMockIdeas, type Idea } from '@/data/mock';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';

const QUICK_TOPICS = [
  'AI Workflows',
  'Founder Bottlenecks',
  'SaaS Growth',
  'Minimalist Systems',
  'Creator Fatigue',
];

export default function Ideas() {
  const { savedIdeas, saveIdea, removeSavedIdea, isSavedIdea, startProductionFromIdea, videos } = useStore();

  const [ideasList, setIdeasList] = useState<Idea[]>(initialMockIdeas);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<Idea | null>(null);
  const [searchTopic, setSearchTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showTranscriptPicker, setShowTranscriptPicker] = useState(false);

  // Trigger idea generation via API with procedural fallback
  const handleGenerate = async (topicToUse?: string) => {
    const q = topicToUse !== undefined ? topicToUse : searchTopic;
    setGenerating(true);
    try {
      const generated = await api.generateIdeas({ topic: q });
      if (generated && generated.length > 0) {
        setIdeasList(generated);
        if (filter === 'saved') setFilter('all');
      }
    } catch (err) {
      console.error('Error generating ideas:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Filter ideas
  const displayedIdeas = (() => {
    if (filter === 'saved') return savedIdeas;
    if (filter === 'trending') {
      return ideasList.filter(
        (i) => i.category.toLowerCase().includes('trend') || i.blueprint.focus.toLowerCase().includes('trend'),
      );
    }
    if (filter === 'niche') {
      return ideasList.filter(
        (i) =>
          i.category.toLowerCase().includes('niche') ||
          i.category.toLowerCase().includes('saas') ||
          i.category.toLowerCase().includes('studio'),
      );
    }
    if (filter === 'historical') {
      return ideasList.filter(
        (i) =>
          i.category.toLowerCase().includes('bespoke') ||
          i.category.toLowerCase().includes('archive') ||
          i.category.toLowerCase().includes('metric'),
      );
    }
    return ideasList;
  })();

  const filterChips = [
    { id: 'all', label: 'All Ideas', count: ideasList.length, icon: 'auto_awesome' },
    {
      id: 'trending',
      label: 'Trending Wave',
      icon: 'local_fire_department',
      count: ideasList.filter(
        (i) => i.category.toLowerCase().includes('trend') || i.blueprint.focus.toLowerCase().includes('trend'),
      ).length,
    },
    {
      id: 'niche',
      label: 'Your Niche',
      icon: 'target',
      count: ideasList.filter(
        (i) =>
          i.category.toLowerCase().includes('niche') ||
          i.category.toLowerCase().includes('saas') ||
          i.category.toLowerCase().includes('studio'),
      ).length,
    },
    { id: 'saved', label: 'Saved Archetypes', count: savedIdeas.length, icon: 'bookmark' },
    {
      id: 'historical',
      label: 'Transcripts & Archives',
      icon: 'history',
      count: ideasList.filter(
        (i) =>
          i.category.toLowerCase().includes('bespoke') ||
          i.category.toLowerCase().includes('archive') ||
          i.category.toLowerCase().includes('metric'),
      ).length,
    },
  ];

  return (
    <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8 py-8">
      {/* Spark engine banner */}
      <Card className="p-6 sm:p-7 mb-6 overflow-hidden relative">
        <div
          className="absolute -right-10 -top-10 w-64 h-64 rounded-full opacity-[0.14]"
          style={{ background: 'radial-gradient(circle,var(--primary),transparent 70%)' }}
        />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <Eyebrow icon="auto_awesome">Spark Engine · Angle Synthesizer</Eyebrow>
            <h1 className="font-display text-[30px] sm:text-[34px] leading-tight text-ink mt-1">
              What should you create next?
            </h1>
            <p className="text-ink-muted mt-2 text-[14.5px] leading-relaxed">
              KontentOS scans publisher waves, high-signal creator hooks, and your own archives to surface angles with
              guaranteed retention models — then writes the full production blueprint.
            </p>

            {/* Keyword / Topic input */}
            <div className="mt-4 flex flex-wrap sm:flex-nowrap gap-2 items-center">
              <div className="relative flex-1 min-w-[220px]">
                <Icon
                  name="search"
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim pointer-events-none"
                />
                <input
                  type="text"
                  value={searchTopic}
                  onChange={(e) => setSearchTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleGenerate();
                  }}
                  placeholder="Enter a topic, keyword, or audience pain point..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-btn bg-surface-2 border border-line text-sm text-ink placeholder:text-ink-dim/70 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
              <Button
                icon={generating ? 'hourglass_top' : 'auto_fix_high'}
                onClick={() => handleGenerate()}
                disabled={generating}
                className="shrink-0"
              >
                {generating ? 'Synthesizing...' : 'Generate ideas'}
              </Button>
            </div>

            {/* Quick suggestion prompt chips */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] font-semibold text-ink-dim uppercase tracking-wider mr-1">Trending:</span>
              {QUICK_TOPICS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setSearchTopic(tag);
                    handleGenerate(tag);
                  }}
                  className="text-[12px] font-medium text-ink-muted hover:text-primary bg-surface-2 hover:bg-primary-soft border border-line rounded-full px-2.5 py-0.5 transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-2 w-full lg:w-auto shrink-0 self-start lg:self-center">
            <Button
              variant="secondary"
              icon="upload_file"
              onClick={() => setShowTranscriptPicker(true)}
              className="w-full sm:w-auto"
            >
              From your transcript
            </Button>
            <div className="text-[12px] text-ink-dim px-2 text-center lg:text-left flex items-center justify-center lg:justify-start gap-1">
              <Icon name="verified" size={14} className="text-primary" />
              <span>AI Angle Scoring · Offline Resilient</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {filterChips.map((f) => (
            <Chip
              key={f.id}
              icon={f.icon}
              count={f.count}
              active={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Chip>
          ))}
        </div>
        <span className="text-[12px] text-ink-dim font-medium">
          Showing {displayedIdeas.length} {displayedIdeas.length === 1 ? 'angle' : 'angles'}
        </span>
      </div>

      {/* Idea grid */}
      {displayedIdeas.length === 0 ? (
        <Card className="p-12 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-surface-2 grid place-items-center text-ink-dim mb-3">
            <Icon name="bookmark_border" size={24} />
          </div>
          <h3 className="font-display text-[20px] text-ink">No saved archetypes yet</h3>
          <p className="text-ink-muted text-sm max-w-md mt-1 mb-4">
            Click the bookmark icon on any idea card or open the blueprint drawer to save high-performing angles for later.
          </p>
          <Button variant="secondary" onClick={() => setFilter('all')}>
            Browse all ideas
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedIdeas.map((idea) => {
            const saved = isSavedIdea(idea.id);
            return (
              <div
                key={idea.id}
                className="relative group text-left kt-focus flex flex-col rounded-card"
              >
                <Card
                  hover
                  onClick={() => setOpen(idea)}
                  className="h-full flex flex-col overflow-hidden cursor-pointer"
                >
                  <Thumb k={idea.thumb} aspect="aspect-[16/9]">
                    <IdeaImage id={idea.imageId} alt={idea.imageAlt} />
                    <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
                    <span className="absolute top-2 left-2">
                      <Badge tone={idea.categoryTone}>{idea.category}</Badge>
                    </span>
                    <span className="absolute bottom-2 right-2 text-[11px] font-bold text-white/95 bg-black/50 backdrop-blur rounded-full px-2 py-0.5 flex items-center gap-1">
                      <Icon name="bolt" size={12} fill={1} /> {idea.metric}
                    </span>
                  </Thumb>

                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <div className="text-[11px] uppercase tracking-wider text-ink-dim">{idea.format}</div>
                    <h3 className="font-semibold text-[15px] text-ink leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {idea.title}
                    </h3>
                    <p className="text-[12.5px] text-ink-muted leading-snug line-clamp-2">{idea.excerpt}</p>
                    <div className="mt-auto pt-3 flex items-center justify-between border-t border-line/60">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${idea.blueprint.hookScore}%`,
                              backgroundColor:
                                idea.blueprint.hookScore >= 90
                                  ? 'var(--tertiary, #285C4D)'
                                  : 'var(--primary, #3E4A3D)',
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-ink-dim">
                          Hook {idea.blueprint.hookScore}
                        </span>
                      </div>
                      <span className="text-[12px] font-semibold text-primary flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                        Blueprint <Icon name="chevron_right" size={16} />
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Direct quick bookmark button on card corner */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (saved) {
                      removeSavedIdea(idea.id);
                    } else {
                      saveIdea(idea);
                    }
                  }}
                  title={saved ? 'Remove from saved' : 'Save archetype'}
                  aria-label={saved ? 'Remove from saved' : 'Save archetype'}
                  className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur transition-all ${
                    saved
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-black/40 text-white/80 hover:bg-black/60 hover:text-white'
                  }`}
                >
                  <Icon name="bookmark" size={15} fill={saved ? 1 : 0} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-out Blueprint Drawer */}
      {open && (
        <BlueprintDrawer
          idea={open}
          isSaved={isSavedIdea(open.id)}
          onToggleSave={() => {
            if (isSavedIdea(open.id)) {
              removeSavedIdea(open.id);
            } else {
              saveIdea(open);
            }
          }}
          onStartProduction={() => {
            startProductionFromIdea(open);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}

      {/* Transcript / Video Picker Modal */}
      {showTranscriptPicker && (
        <TranscriptPickerModal
          videos={videos}
          onSelect={(videoTitle) => {
            setShowTranscriptPicker(false);
            setSearchTopic(videoTitle);
            handleGenerate(videoTitle);
          }}
          onClose={() => setShowTranscriptPicker(false)}
        />
      )}
    </div>
  );
}

function BlueprintDrawer({
  idea,
  isSaved,
  onToggleSave,
  onStartProduction,
  onClose,
}: {
  idea: Idea;
  isSaved: boolean;
  onToggleSave: () => void;
  onStartProduction: () => void;
  onClose: () => void;
}) {
  const b = idea.blueprint;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[var(--scrim)]" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-[460px] bg-surface border-l border-line shadow-[var(--shadow-2)] flex flex-col animate-[slidein_.25s_ease]">
        <style>{`@keyframes slidein{from{transform:translateX(24px);opacity:.6}to{transform:translateX(0);opacity:1}}`}</style>
        <div className="h-16 px-5 flex items-center justify-between border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center w-8 h-8 rounded-btn bg-primary-soft text-primary">
              <Icon name="architecture" size={18} />
            </span>
            <div>
              <div className="kt-eyebrow">Active Blueprint</div>
              <div className="text-sm font-semibold text-ink">Production Roadmap</div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid place-items-center w-9 h-9 rounded-btn text-ink-muted hover:bg-surface-2 kt-focus"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="relative aspect-[16/9] rounded-card overflow-hidden -mx-5 -mt-5 mb-0">
            <IdeaImage id={idea.imageId} alt={idea.imageAlt} eager />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4">
              <Badge tone={idea.categoryTone}>{b.focus}</Badge>
              <h3 className="font-display text-[21px] sm:text-[23px] leading-snug text-white mt-2 drop-shadow">
                {idea.title}
              </h3>
            </div>
          </div>

          <section>
            <div className="kt-eyebrow mb-1.5">Why this works</div>
            <p className="text-[13.5px] text-ink-muted leading-relaxed bg-surface-2/60 p-3 rounded-btn border border-line">
              {b.why}
            </p>
          </section>

          <section>
            <div className="kt-eyebrow mb-2">Suggested formats</div>
            <div className="flex flex-wrap gap-2">
              {b.formats.map((f) => (
                <span
                  key={f}
                  className="text-[12px] font-medium text-ink bg-surface-2 border border-line rounded-full px-3 py-1 flex items-center gap-1"
                >
                  <Icon name="check" size={13} className="text-primary" /> {f}
                </span>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="kt-eyebrow">Opening hook formula</div>
              <span className="text-[12px] font-bold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded-full">
                Hook score {b.hookScore}/100
              </span>
            </div>
            <div className="rounded-card bg-primary-soft border border-primary/25 p-4 shadow-sm">
              <p className="font-display text-[16.5px] leading-snug text-ink italic">{b.hook}</p>
            </div>
          </section>

          <section>
            <div className="kt-eyebrow mb-2">Beat-by-beat outline</div>
            <div className="space-y-3">
              {b.beats.map((beat, i) => (
                <div key={i} className="flex gap-3 bg-surface-2/40 p-3 rounded-card border border-line/60">
                  <span className="grid place-items-center shrink-0 w-7 h-7 rounded-full bg-primary text-white text-[12px] font-bold">
                    {i + 1}
                  </span>
                  <div className="pt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-ink">{beat.label}</span>
                      <span className="text-[11px] font-mono text-ink-dim bg-surface-3 px-1.5 py-0.5 rounded">
                        {beat.time}
                      </span>
                    </div>
                    <p className="text-[12.5px] text-ink-muted leading-snug mt-1">{beat.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="p-4 border-t border-line shrink-0 flex gap-2 bg-surface">
          <Button
            variant="secondary"
            icon="bookmark"
            onClick={onToggleSave}
            className={`flex-1 ${isSaved ? 'text-primary border-primary/40' : ''}`}
          >
            {isSaved ? 'Saved in library' : 'Save archetype'}
          </Button>
          <Button icon="smart_display" className="flex-1" onClick={onStartProduction}>
            Start production
          </Button>
        </div>
      </aside>
    </>
  );
}

function TranscriptPickerModal({
  videos,
  onSelect,
  onClose,
}: {
  videos: import('@/lib/types').Video[];
  onSelect: (title: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-[var(--scrim)]" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-6 animate-[slidein_.2s_ease]">
          <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-btn bg-primary-soft text-primary grid place-items-center">
                <Icon name="upload_file" size={18} />
              </span>
              <h3 className="font-semibold text-base text-ink">Select Video Transcript</h3>
            </div>
            <button onClick={onClose} className="text-ink-muted hover:text-ink">
              <Icon name="close" size={18} />
            </button>
          </div>
          <p className="text-xs text-ink-muted mb-4">
            Choose an ingested video from your studio library to extract fresh viral angles and hooks from its transcript.
          </p>

          {videos.length === 0 ? (
            <div className="py-6 text-center text-ink-muted text-sm bg-surface-2 rounded-btn">
              No uploaded clips found in library yet. Ingest a raw clip in Raw Studio to extract angles from it!
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {videos.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onSelect(v.title)}
                  className="w-full text-left p-3 rounded-btn border border-line bg-surface hover:bg-surface-2 flex items-center justify-between transition-colors group"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-sm font-medium text-ink truncate group-hover:text-primary">{v.title}</div>
                    <div className="text-[11px] text-ink-dim">Duration: {Math.round(v.duration || 0)}s</div>
                  </div>
                  <Icon name="auto_awesome" size={16} className="text-primary shrink-0" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-line flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function IdeaImage({ id, alt, eager }: { id: string; alt: string; eager?: boolean }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <img
      src={unsplashPhoto(id)}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setOk(false)}
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
    />
  );
}
