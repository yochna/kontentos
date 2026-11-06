import React, { useState } from 'react';
import { FontStyle, TypographyCategory, TypographyBundle } from '../../../types/staticCard';
import { TYPOGRAPHY_BUNDLES, getTypographyBundle } from '../../../data/staticCardPresets';
import { Icon } from '@/lib/icons';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface Props {
  fontStyle: FontStyle;
  onSelectFont: (font: FontStyle) => void;
  textSizeAdjust?: number;
  onTextSizeAdjustChange?: (adjust: number) => void;
  compact?: boolean;
}

const CATEGORIES: TypographyCategory[] = [
  'All',
  'Modern',
  'Editorial',
  'Bold & Expressive',
  'Technical',
];

export const TypographyPicker: React.FC<Props> = ({
  fontStyle,
  onSelectFont,
  textSizeAdjust = 0,
  onTextSizeAdjustChange,
  compact = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<TypographyCategory>('All');
  const bundleList = Object.values(TYPOGRAPHY_BUNDLES);
  const activeBundle = getTypographyBundle(fontStyle);

  const filteredBundles = bundleList.filter((b) => {
    if (selectedCategory === 'All') return true;
    return b.category === selectedCategory;
  });

  return (
    <div className="space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
          <Icon name="format_size" size={16} className="text-primary" />
          <span>Type pairings</span>
        </label>
        <span className="text-[11px] font-mono text-ink-muted px-2 py-0.5 rounded-full bg-surface-2 border border-line">
          {filteredBundles.length} Pairings
        </span>
      </div>

      {/* Category Pills */}
      <ToggleGroup
        value={selectedCategory}
        onValueChange={(next) => next && setSelectedCategory(next as TypographyCategory)}
        aria-label="Filter the pairings by style"
        variant="none"
        className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-none"
      >
        {CATEGORIES.map((cat) => (
          <ToggleGroupItem
            key={cat}
            value={cat}
            variant="none"
            className="shrink-0 cursor-pointer select-none whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-on-primary"
          >
            <span>{cat}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* Typography Bundles Grid */}
      <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'} gap-2.5 max-h-[360px] overflow-y-auto pr-1`}>
        {filteredBundles.map((b) => {
          const isSelected = activeBundle.id === b.id;

          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelectFont(b.id)}
              className={`p-3 rounded-card border text-left transition-all duration-150 cursor-pointer relative flex flex-col justify-between group ${
                isSelected
                  ? 'bg-primary-soft/40 border-primary ring-2 ring-primary/30'
                  : 'bg-surface hover:bg-surface-2 border-line hover:border-line-strong'
              }`}
            >
              {/* Bundle Header */}
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-bold text-ink truncate leading-tight">
                      {b.label}
                    </span>
                    <span className="text-[11px] font-medium text-primary bg-primary/10 px-1.5 py-0.2 rounded shrink-0">
                      {b.tagline}
                    </span>
                  </div>
                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                      <Icon name="check" size={11} />
                    </div>
                  )}
                </div>

                {/* Typography Specimen Preview */}
                <div className="my-2 p-2 rounded-lg bg-surface-2/70 border border-line/60">
                  <div
                    className="text-sm leading-tight text-ink mb-1 truncate"
                    style={{
                      fontFamily: b.headlineFontFamily,
                      fontWeight: b.headlineWeight,
                      fontStyle: b.isItalicHeadline ? 'italic' : 'normal',
                      letterSpacing: b.headlineTracking,
                    }}
                  >
                    {b.sampleHeadline}
                  </div>
                  <div
                    className="text-[11px] leading-relaxed text-ink-muted line-clamp-2"
                    style={{
                      fontFamily: b.bodyFontFamily,
                      lineHeight: b.bodyLineHeight || 1.45,
                    }}
                  >
                    {b.sampleSubtext}
                  </div>
                </div>
              </div>

              {/* Font Details & Badges Footer */}
              <div className="pt-1.5 border-t border-line/50 flex items-center justify-between gap-2 text-[11px] text-ink-dim">
                <span className="truncate font-mono">
                  {b.headlineFont} + {b.bodyFont}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {b.badges.slice(0, 1).map((badge) => (
                    <span key={badge} className="px-1.5 py-0.2 rounded bg-surface border border-line text-ink-muted">
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Optical Scale / Text Size Adjustment Slider */}
      {onTextSizeAdjustChange && (
        <div className="pt-2 border-t border-line/60">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <label className="font-semibold text-ink flex items-center gap-1.5">
              <Icon name="format_size" size={14} className="text-primary" />
              <span>Optical Scaling Fine-Tune</span>
            </label>
            <span className="font-mono text-xs font-semibold text-primary">
              {textSizeAdjust > 0 ? `+${textSizeAdjust}` : textSizeAdjust}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-ink-dim">-2</span>
            <input
              type="range"
              min="-2"
              max="2"
              step="0.5"
              value={textSizeAdjust}
              onChange={(e) => onTextSizeAdjustChange(parseFloat(e.target.value))}
              className="flex-1 accent-primary cursor-pointer h-1.5 bg-surface-3 rounded-lg"
            />
            <span className="text-[11px] font-mono text-ink-dim">+2</span>
          </div>
        </div>
      )}
    </div>
  );
};
