import React from 'react';
import { AspectRatio } from '../../../types/staticCard';
import { Icon } from '@/lib/icons';

interface Props {
  currentRatio: AspectRatio;
  onSelectRatio: (ratio: AspectRatio) => void;
}

const RATIOS: { id: AspectRatio; label: string; sub: string; icon: string }[] = [
  { id: '1:1', label: '1:1 Square', sub: 'Instagram Feed', icon: 'crop_square' },
  { id: '4:5', label: '4:5 Portrait', sub: 'Carousel / Pin', icon: 'crop_portrait' },
  { id: '9:16', label: '9:16 Story', sub: 'Story / TikTok', icon: 'stay_current_portrait' },
  { id: '16:9', label: '16:9 Landscape', sub: '𝕏 / LinkedIn', icon: 'crop_landscape' },
];

export const AspectRatioSelector: React.FC<Props> = ({ currentRatio, onSelectRatio }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
          <Icon name="aspect_ratio" size={16} className="text-primary" />
          <span>Aspect Ratio</span>
        </label>
        <span className="text-[11px] text-ink-dim">
          Multi-channel dimensions
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {RATIOS.map((item) => {
          const isSelected = currentRatio === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectRatio(item.id)}
              className={`py-2 px-2 rounded-btn text-center border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                isSelected
                  ? 'bg-primary text-on-primary border-primary font-bold shadow-[var(--shadow-1)] ring-1 ring-primary/40'
                  : 'bg-surface hover:bg-surface-2 text-ink border-line hover:border-line-strong font-medium'
              }`}
            >
              <div className="text-xs font-semibold">{item.label}</div>
              <div className={`text-[10px] ${isSelected ? 'text-on-primary/80' : 'text-ink-dim'}`}>
                {item.sub}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
