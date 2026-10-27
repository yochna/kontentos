import React, { useRef } from 'react';
import { THEME_CONFIGS, getActiveTheme } from '../../../data/staticCardPresets';
import { ColorTheme, FontStyle, CardMode } from '../../../types/staticCard';
import { Icon } from '@/lib/icons';
import { TypographyPicker } from './TypographyPicker';

interface Props {
  currentTheme: ColorTheme;
  fontStyle: FontStyle;
  cardMode?: CardMode;
  customAccent?: string;
  onSelectTheme: (theme: ColorTheme) => void;
  onSelectFont: (font: FontStyle) => void;
  onSelectMode?: (mode: CardMode) => void;
  onSelectCustomAccent?: (accent: string | undefined) => void;
}

const POPULAR_ACCENTS = [
  { label: 'Cyan (Tech)', hex: '#00e5ff' },
  { label: 'Harbor Sky (DeckCraft)', hex: '#38bdf8' },
  { label: 'Nocturne Violet (DeckCraft)', hex: '#a855f7' },
  { label: 'Coral Reef (DeckCraft)', hex: '#fb7185' },
  { label: 'Ember Crimson (DeckCraft)', hex: '#ef4444' },
  { label: 'Forest Emerald', hex: '#10b981' },
  { label: 'Sahara Amber', hex: '#f59e0b' },
  { label: 'Oasis Marine (DeckCraft)', hex: '#0d9488' },
  { label: 'Monolith Silver', hex: '#cbd5e1' },
];

export const ThemePicker: React.FC<Props> = ({
  currentTheme,
  fontStyle,
  cardMode = 'dark',
  customAccent,
  onSelectTheme,
  onSelectFont,
  onSelectMode,
  onSelectCustomAccent,
}) => {
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [collectionFilter, setCollectionFilter] = React.useState<'all' | 'craft' | 'core'>('all');
  const themeList = Object.values(THEME_CONFIGS);

  const filteredThemes = themeList
    .filter((t) => (cardMode === 'light' ? t.mode === 'light' : t.mode === 'dark'))
    .filter((t) => (collectionFilter === 'all' ? true : t.collection === collectionFilter));

  return (
    <div className="space-y-3.5">
      {/* Header with Dark / Light Mode Switch */}
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
          <Icon name="palette" size={16} className="text-primary" />
          <span>Color & Theme Aesthetics</span>
        </label>

        {onSelectMode && (
          <div className="inline-flex items-center gap-1 bg-surface-2 p-0.5 rounded-btn border border-line">
            <button
              type="button"
              onClick={() => {
                onSelectMode('dark');
                if (THEME_CONFIGS[currentTheme]?.mode === 'light') {
                  onSelectTheme('deckcraft-harbor');
                }
              }}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                cardMode === 'dark'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <span>🌙 Dark</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onSelectMode('light');
                if (THEME_CONFIGS[currentTheme]?.mode === 'dark') {
                  onSelectTheme('deckcraft-paper');
                }
              }}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                cardMode === 'light'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <span>☀️ Light</span>
            </button>
          </div>
        )}
      </div>

      {/* Palette Selection Header & Collection Tabs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-ink-muted font-medium">Curated Slide Themes</span>
          <div className="inline-flex items-center gap-1 bg-surface-2/60 p-0.5 rounded-md border border-line/60 text-[10px]">
            <button
              type="button"
              onClick={() => setCollectionFilter('all')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer font-medium ${
                collectionFilter === 'all'
                  ? 'bg-surface text-ink font-semibold shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              All ({themeList.filter((t) => (cardMode === 'light' ? t.mode === 'light' : t.mode === 'dark')).length})
            </button>
            <button
              type="button"
              onClick={() => setCollectionFilter('craft')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer font-medium flex items-center gap-1 ${
                collectionFilter === 'craft'
                  ? 'bg-primary text-on-primary font-semibold shadow-xs'
                  : 'text-primary hover:text-primary-hover'
              }`}
              title="Curated themes inspired by Storytold / DeckCraft"
            >
              <span>Craft Series</span>
              <span className="text-[9px] px-1 py-0.2 rounded-full bg-white/20 font-bold">New</span>
            </button>
            <button
              type="button"
              onClick={() => setCollectionFilter('core')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer font-medium ${
                collectionFilter === 'core'
                  ? 'bg-surface text-ink font-semibold shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Studio Core
            </button>
          </div>
        </div>

        {/* Palette Selection Chips with Rich Previews */}
        <div className="flex flex-wrap gap-1.5">
          {filteredThemes.map((t) => {
            const isSelected = currentTheme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTheme(t.id as ColorTheme)}
                title={t.description || t.name}
                className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-primary text-on-primary border-primary shadow-[var(--shadow-1)] ring-1 ring-primary/40 font-bold'
                    : 'bg-surface hover:bg-surface-2 text-ink border-line hover:border-line-strong'
                }`}
              >
                {/* Mini Color Swatch with Backdrop & Accent Core */}
                <span
                  className="relative w-3.5 h-3.5 rounded-full border border-white/20 shadow-inner flex items-center justify-center overflow-hidden"
                  style={{ backgroundColor: t.cardBg }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shadow-xs"
                    style={{ backgroundColor: t.accent }}
                  />
                </span>
                <span>{t.name}</span>
                {t.collection === 'craft' && !isSelected && (
                  <span className="text-[9px] text-primary font-bold px-1 py-0.2 bg-primary/10 rounded-full">
                    Craft
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Accent Color Picker */}
      {onSelectCustomAccent && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-muted font-medium flex items-center gap-1">
              <span>Custom Accent & Keyword Glow:</span>
              {customAccent && (
                <span className="font-mono text-primary font-bold text-[10px]">{customAccent}</span>
              )}
            </span>
            {customAccent && (
              <button
                type="button"
                onClick={() => onSelectCustomAccent(undefined)}
                className="text-[10px] text-ink-dim hover:text-danger cursor-pointer transition-colors"
              >
                Reset to Default
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Quick swatches */}
            {POPULAR_ACCENTS.map((swatch) => {
              const isActive = customAccent === swatch.hex;
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  onClick={() => onSelectCustomAccent(swatch.hex)}
                  title={swatch.label}
                  className={`w-6 h-6 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                    isActive ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'border-white/20 hover:scale-105'
                  }`}
                  style={{ backgroundColor: swatch.hex }}
                >
                  {isActive && <span className="text-[10px] text-black font-bold">✓</span>}
                </button>
              );
            })}

            {/* Custom Hex Picker Input */}
            <input
              ref={colorInputRef}
              type="color"
              value={customAccent || '#00e5ff'}
              onChange={(e) => onSelectCustomAccent(e.target.value)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => colorInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface border border-line text-[11px] font-semibold text-ink hover:bg-surface-2 transition-all cursor-pointer"
            >
              <Icon name="colorize" size={13} className="text-primary" />
              <span>Custom Color</span>
            </button>
          </div>
        </div>
      )}

      {/* Curated Typography Bundles */}
      <div className="pt-2 border-t border-line/60">
        <TypographyPicker
          fontStyle={fontStyle}
          onSelectFont={onSelectFont}
          compact={true}
        />
      </div>
    </div>
  );
};
