import React from 'react';
import { CardFormat } from '../../../types/staticCard';
import { Icon } from '@/lib/icons';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export const FORMAT_OPTIONS: { id: CardFormat; label: string; iconName: string }[] = [
  { id: 'instagram-overlay', label: 'Instagram Overlay', iconName: 'photo_camera' },
  { id: 'linkedin-split', label: 'LinkedIn Split', iconName: 'view_column' },
  { id: 'tweet-card', label: 'Tweet Card', iconName: 'tag' },
  { id: 'carousel-slide', label: 'Carousel Slide', iconName: 'view_carousel' },
  { id: 'editorial-quote', label: 'Editorial Quote', iconName: 'format_quote' },
];

/** The format id is a storage key; this is the words a creator reads instead. */
export function formatLabel(format: CardFormat): string {
  return FORMAT_OPTIONS.find((opt) => opt.id === format)?.label ?? format;
}

interface FormatTabsProps {
  currentFormat: CardFormat;
  onSelectFormat: (format: CardFormat) => void;
}

export const FormatTabs: React.FC<FormatTabsProps> = ({ currentFormat, onSelectFormat }) => {
  return (
    <ToggleGroup
      value={currentFormat}
      onValueChange={(next) => next && onSelectFormat(next as CardFormat)}
      aria-label="Card format"
      variant="none"
      className="flex-wrap gap-1.5 overflow-x-auto px-1 py-1 scrollbar-none"
    >
      {FORMAT_OPTIONS.map((opt) => (
        <ToggleGroupItem
          key={opt.id}
          value={opt.id}
          variant="none"
          className="gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted hover:border-line-strong hover:text-ink data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-on-primary"
        >
          <Icon name={opt.iconName} size={15} />
          <span>{opt.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
};
