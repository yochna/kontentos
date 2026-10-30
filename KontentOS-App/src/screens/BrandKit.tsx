import { useState, useEffect } from 'react';
import { Icon } from '@/lib/icons';
import { Badge, Button, Card, PageHeader, PageShell } from '@/components/ui';
import { brandKit as defaultBrandKit } from '@/data/mock';

interface BrandKitData {
  voiceArchetype: string;
  catchphrase: string;
  bannedWords: string;
  tone: string;
  palette: string[];
  fonts: string[];
  hooks: string[];
  avatar: string;
}

const NOT_SET = 'Not set yet';
const filled = (value: string) => (value.trim() ? value : NOT_SET);

export default function BrandKit() {
  const [data, setData] = useState<BrandKitData>(() => {
    try {
      const saved = localStorage.getItem('kontentos_brand_kit');
      return saved ? JSON.parse(saved) : defaultBrandKit;
    } catch {
      return defaultBrandKit;
    }
  });

  const [isEditingVoice, setIsEditingVoice] = useState(false);
  const [newHookText, setNewHookText] = useState('');
  const [isAddingHook, setIsAddingHook] = useState(false);
  const [trainingActive, setTrainingActive] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form states for voice
  const [formVoice, setFormVoice] = useState({
    archetype: data.voiceArchetype,
    catchphrase: data.catchphrase,
    tone: data.tone,
    banned: data.bannedWords,
  });

  useEffect(() => {
    setFormVoice({
      archetype: data.voiceArchetype,
      catchphrase: data.catchphrase,
      tone: data.tone,
      banned: data.bannedWords,
    });
  }, [data]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveVoice = () => {
    const next: BrandKitData = {
      ...data,
      voiceArchetype: formVoice.archetype,
      catchphrase: formVoice.catchphrase,
      tone: formVoice.tone,
      bannedWords: formVoice.banned,
    };
    setData(next);
    localStorage.setItem('kontentos_brand_kit', JSON.stringify(next));
    setIsEditingVoice(false);
    showToast('Brand voice profile saved successfully.');
  };

  const handleAddHook = () => {
    if (!newHookText.trim()) return;
    const next: BrandKitData = {
      ...data,
      hooks: [...data.hooks, newHookText.trim()],
    };
    setData(next);
    localStorage.setItem('kontentos_brand_kit', JSON.stringify(next));
    setNewHookText('');
    setIsAddingHook(false);
    showToast('New hook formula added.');
  };

  const handleRemoveHook = (index: number) => {
    const next: BrandKitData = {
      ...data,
      hooks: data.hooks.filter((_, i) => i !== index),
    };
    setData(next);
    localStorage.setItem('kontentos_brand_kit', JSON.stringify(next));
    showToast('Hook formula removed.');
  };

  const handleColorChange = (index: number, newHex: string) => {
    const nextPalette = [...data.palette];
    nextPalette[index] = newHex;
    const next: BrandKitData = {
      ...data,
      palette: nextPalette,
    };
    setData(next);
    localStorage.setItem('kontentos_brand_kit', JSON.stringify(next));
  };

  const handleRetrain = () => {
    setTrainingActive(true);
    setTimeout(() => {
      setTrainingActive(false);
      showToast('Brand Kit successfully re-calibrated against your latest 24 published reels.');
    }, 2200);
  };

  return (
    <PageShell className="animate-fade-in">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-[calc(100vw-3rem)] bg-ink text-surface px-4 py-2.5 rounded-btn shadow-lg text-[13px] font-medium flex items-center gap-2 animate-scale-up">
          <Icon name="check_circle" size={16} className="text-success" />
          {toastMessage}
        </div>
      )}

      <PageHeader
        eyebrow="Voice & Identity Studio"
        icon="palette"
        title="Brand Kit & Style Codex"
        description="The stylistic DNA KontentOS writes, captions, scores, and formats every draft against."
        actions={
          <Button
            variant="secondary"
            icon={trainingActive ? 'sync' : 'auto_fix_high'}
            disabled={trainingActive}
            onClick={handleRetrain}
          >
            {trainingActive ? 'Analyzing Archive...' : 'Re-train on my archive'}
          </Button>
        }
        className="mb-6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Voice Profile Card */}
        <Card className="p-5 shadow-xs border-line">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-[20px] font-bold text-ink">Voice Profile</h2>
              <span className="text-[12px] text-ink-dim">Active persona and stylistic constraints</span>
            </div>
            <div className="flex items-center gap-2">
              {data.avatar.trim() ? (
                <Badge tone="primary" icon="verified_user">
                  {data.avatar}
                </Badge>
              ) : (
                <Badge tone="neutral" icon="person_add_alt">
                  Voice not claimed yet
                </Badge>
              )}
              <button
                onClick={() => setIsEditingVoice(!isEditingVoice)}
                className="text-[12px] font-semibold text-primary hover:underline px-2 py-1 rounded kt-focus"
              >
                {isEditingVoice ? 'Cancel' : 'Edit'}
              </button>
            </div>
          </div>

          {isEditingVoice ? (
            <div className="space-y-3.5 bg-surface-2/50 p-4 rounded-card border border-line">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                  Archetype
                </label>
                <input
                  value={formVoice.archetype}
                  onChange={(e) => setFormVoice({ ...formVoice, archetype: e.target.value })}
                  className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                  Catchphrase / Signature Opener
                </label>
                <input
                  value={formVoice.catchphrase}
                  onChange={(e) => setFormVoice({ ...formVoice, catchphrase: e.target.value })}
                  className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim block mb-1">
                  Tone &amp; Pacing
                </label>
                <input
                  value={formVoice.tone}
                  onChange={(e) => setFormVoice({ ...formVoice, tone: e.target.value })}
                  className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-danger block mb-1">
                  Banned Buzzwords (Avoid)
                </label>
                <input
                  value={formVoice.banned}
                  onChange={(e) => setFormVoice({ ...formVoice, banned: e.target.value })}
                  className="w-full rounded-btn border border-danger/40 bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-danger"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" variant="ghost" onClick={() => setIsEditingVoice(false)}>
                  Cancel
                </Button>
                <Button size="sm" icon="check" onClick={handleSaveVoice}>
                  Save Profile
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Stat label="Archetype" value={filled(data.voiceArchetype)} icon="psychology" />
              <Stat
                label="Catchphrase"
                value={data.catchphrase.trim() ? `“${data.catchphrase}”` : NOT_SET}
                icon="format_quote"
                accent
              />
              <Stat label="Tone & Pacing" value={filled(data.tone)} icon="tune" />
              <Stat label="Avoid" value={filled(data.bannedWords)} icon="block" danger />
            </div>
          )}
        </Card>

        {/* Signature Hooks */}
        <Card className="p-5 shadow-xs border-line">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-[20px] font-bold text-ink">Signature Hook Formulas</h2>
              <span className="text-[12px] text-ink-dim">Pre-engineered hook patterns for the Idea Engine</span>
            </div>
            <button
              onClick={() => setIsAddingHook(true)}
              className="text-[12.5px] font-semibold text-primary inline-flex items-center gap-1 hover:underline kt-focus"
            >
              <Icon name="add" size={15} /> Add formula
            </button>
          </div>

          <div className="space-y-2.5 max-h-[290px] overflow-y-auto pr-1">
            {data.hooks.map((h, i) => (
              <div
                key={i}
                className="group flex items-start gap-3 rounded-card border border-line p-3 bg-surface hover:border-line-strong transition-colors"
              >
                <span className="grid place-items-center w-7 h-7 rounded-full bg-tertiary-soft text-tertiary text-[12px] font-bold shrink-0">
                  {i + 1}
                </span>
                <p className="text-[13.5px] text-ink leading-snug pt-0.5 flex-1">{h}</p>
                <button
                  onClick={() => handleRemoveHook(i)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-ink-dim hover:text-danger rounded transition-opacity"
                  title="Remove hook formula"
                >
                  <Icon name="delete" size={14} />
                </button>
              </div>
            ))}

            {isAddingHook && (
              <div className="p-3 rounded-card border border-primary/40 bg-primary-soft/30 space-y-2">
                <input
                  value={newHookText}
                  onChange={(e) => setNewHookText(e.target.value)}
                  placeholder="e.g. Curiosity Gap — “Nobody is talking about…”"
                  autoFocus
                  className="w-full rounded-btn border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-primary"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setIsAddingHook(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" icon="check" onClick={handleAddHook}>
                    Save Hook
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Brand Color System */}
        <Card className="p-5 shadow-xs border-line">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-[20px] font-bold text-ink">Color Palette Matrix</h2>
              <span className="text-[12px] text-ink-dim">Linked directly to caption &amp; motion graphics presets</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {data.palette.map((c, idx) => (
              <div key={idx} className="text-center group relative">
                <div
                  className="h-16 rounded-card border border-line shadow-xs cursor-pointer overflow-hidden transition-transform group-hover:scale-105 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]"
                  style={{ background: c }}
                >
                  <input
                    type="color"
                    value={c}
                    onChange={(e) => handleColorChange(idx, e.target.value)}
                    aria-label={`Palette color ${idx + 1}: ${c}`}
                    className="opacity-0 w-full h-full cursor-pointer"
                  />
                </div>
                <div className="text-[10.5px] text-ink-dim mt-1.5 font-mono uppercase font-semibold">
                  {c}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2.5 rounded-btn bg-surface-2 border border-line p-3">
            <Icon name="palette" size={18} className="text-primary shrink-0" />
            <span className="text-[12.5px] text-ink-muted leading-relaxed">
              These swatches feed into the Smart Editor caption highlighter, kinetic overlays, and thumbnail cover templates.
            </span>
          </div>
        </Card>

        {/* Typography Studio */}
        <Card className="p-5 shadow-xs border-line">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-[20px] font-bold text-ink">Typography &amp; Hierarchy</h2>
              <span className="text-[12px] text-ink-dim">Curated editorial and studio display fonts</span>
            </div>
          </div>

          <div className="space-y-3">
            {data.fonts.map((f) => (
              <div
                key={f}
                className="flex items-end justify-between gap-4 p-3.5 rounded-card border border-line bg-surface"
              >
                <div>
                  <div className="text-[11px] uppercase font-bold tracking-wider text-primary">
                    {f === 'Newsreader' ? 'Editorial Serif (Headings & Hooks)' : 'Modern Grotesk (Studio UI & Captions)'}
                  </div>
                  <div
                    className="text-[22px] text-ink mt-0.5"
                    style={{
                      fontFamily: f === 'Newsreader' ? 'var(--font-display)' : 'var(--font-body)',
                    }}
                  >
                    {f} — The quick brown fox jumps over the lazy dog.
                  </div>
                </div>
                <div
                  className="text-[32px] text-ink-dim font-bold shrink-0"
                  style={{
                    fontFamily: f === 'Newsreader' ? 'var(--font-display)' : 'var(--font-body)',
                  }}
                >
                  Ag
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

function Stat({
  label,
  value,
  icon,
  accent,
  danger,
}: {
  label: string;
  value: string;
  icon: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-card border border-line p-3.5 bg-surface hover:border-line-strong transition-all shadow-xs">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-dim mb-1.5">
        <Icon name={icon} size={14} className={danger ? 'text-danger' : 'text-primary'} />
        {label}
      </div>
      <div
        className={`text-[13.5px] font-semibold leading-snug ${
          danger
            ? 'text-danger'
            : accent
            ? 'text-tertiary font-display text-[16px]'
            : 'text-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
