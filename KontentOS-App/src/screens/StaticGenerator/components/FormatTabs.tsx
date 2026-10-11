import React from 'react';
import { CardFormat } from '../../../types/staticCard';
import { Icon } from '@/lib/icons';

interface FormatTabsProps {
  currentFormat: CardFormat;
  onSelectFormat: (format: CardFormat) => void;
}

interface FormatOption {
  id: CardFormat;
  label: string;
  iconName: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  { id: 'instagram-overlay', label: 'Instagram Overlay', iconName: 'photo_camera' },
  { id: 'linkedin-split', label: 'LinkedIn Split', iconName: 'view_column' },
  { id: 'tweet-card', label: '𝕏 Tweet Card', iconName: 'tag' },
  { id: 'carousel-slide', label: 'Carousel Slide', iconName: 'view_carousel' },
  { id: 'editorial-quote', label: 'Editorial Quote', iconName: 'format_quote' },
];

export const FormatTabs: React.FC<FormatTabsProps> = ({ currentFormat, onSelectFormat }) => {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1 scrollbar-none">
      {FORMAT_OPTIONS.map((opt) => {
        const isActive = currentFormat === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelectFormat(opt.id)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-body font-semibold transition-all duration-150 cursor-pointer select-none whitespace-nowrap ${
              isActive
                ? 'bg-primary text-on-primary shadow-[var(--shadow-1)] ring-1 ring-primary/40 scale-[1.01]'
                : 'bg-surface text-ink-muted border border-line hover:text-ink hover:bg-surface-2 hover:border-line-strong'
            }`}
          >
            <Icon name={opt.iconName} size={16} />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};
