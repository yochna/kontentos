import React, { useRef } from 'react';
import { THEME_CONFIGS, getActiveTheme } from '../../../data/staticCardPresets';
import { ColorTheme, FontStyle, CardMode } from '../../../types/staticCard';
import { Icon } from '@/lib/icons';
import { Tooltip } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
                  ? 'bg-primary text-on-primary'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <span className="flex items-center gap-1"><Icon name="dark_mode" size={14} /> Dark</span>
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
                  ? 'bg-primary text-on-primary'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <span className="flex items-center gap-1"><Icon name="light_mode" size={14} /> Light</span>
            </button>
          </div>
        )}
      </div>

      {/* Palette Selection Header & Collection Tabs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-ink-muted">Slide themes</span>
          <ToggleGroup
            value={collectionFilter}
            onValueChange={(next) => next && setCollectionFilter(next as typeof collectionFilter)}
            aria-label="Filter the theme list"
            variant="segment"
            className="bg-surface-2/60 text-[11px]"
          >
            <ToggleGroupItem
              value="all"
              variant="segment"
              className="px-2 py-0.5 text-[11px] data-[state=on]:bg-surface"
            >
              <span>
                All ({themeList.filter((t) => (cardMode === 'light' ? t.mode === 'light' : t.mode === 'dark')).length})
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="craft"
              variant="segment"
              className="px-2 py-0.5 text-[11px] data-[state=on]:bg-surface"
              title="Themes built as a matched series"
            >
              <span>Craft Series</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="core"
              variant="segment"
              className="px-2 py-0.5 text-[11px] data-[state=on]:bg-surface"
            >
              <span>Studio Core</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Palette Selection Chips with Rich Previews */}
        <ToggleGroup
          value={currentTheme}
          onValueChange={(next) => next && onSelectTheme(next as ColorTheme)}
          aria-label="Slide theme"
          variant="none"
          className="flex-wrap"
        >
          {filteredThemes.map((t) => (
            <Tooltip key={t.id} content={t.description || t.name}>
              <ToggleGroupItem
                value={t.id}
                variant="none"
                className="group inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-line-strong hover:bg-surface-2 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-on-primary data-[state=on]:shadow-[var(--shadow-1)]"
              >
                {/* Backdrop colour with the accent core in it, so the chip previews the pair */}
                <span
                  className="relative flex h-3.5 w-3.5 items-center justify-center overflow-hidden rounded-full border border-white/20"
                  style={{ backgroundColor: t.cardBg }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: t.accent }}
                  />
                </span>
                <span>{t.name}</span>
              </ToggleGroupItem>
            </Tooltip>
          ))}
        </ToggleGroup>
      </div>

      {/* Custom Accent Color Picker */}
      {onSelectCustomAccent && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-muted font-medium flex items-center gap-1">
              <span>Accent colour</span>
              {customAccent && (
                <span className="font-mono text-primary font-bold text-[11px]">{customAccent}</span>
              )}
            </span>
            {customAccent && (
              <button
                type="button"
                onClick={() => onSelectCustomAccent(undefined)}
                className="text-[11px] text-ink-dim hover:text-danger cursor-pointer transition-colors"
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
                <Tooltip key={swatch.hex} content={swatch.label}>
                  <button
                    type="button"
                    onClick={() => onSelectCustomAccent(swatch.hex)}
                    className={`w-6 h-6 rounded-full border border-line-strong transition-colors cursor-pointer flex items-center justify-center ${
                      isActive ? 'ring-2 ring-primary' : 'hover:border-line-strong'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  >
                    {isActive && <span className="text-[11px] text-black font-bold"><Icon name="check" size={11} className="text-black" /></span>}
                  </button>
                </Tooltip>
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

      {/* Type pairings */}
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
