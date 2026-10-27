import React, { useRef } from 'react';
import { CreatorProfile } from '../../../types/staticCard';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';

interface Props {
  creator: CreatorProfile;
  showCreatorBadge: boolean;
  onToggleBadge: (show: boolean) => void;
  onChange: (updated: Partial<CreatorProfile>) => void;
}

export const CreatorProfileSection: React.FC<Props> = ({
  creator,
  showCreatorBadge,
  onToggleBadge,
  onChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      onChange({ avatarUrl: result });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
          <Icon name="person" size={16} className="text-primary" />
          <span>Creator Profile & Handle</span>
        </label>

        {/* Creator Badge Toggle Button */}
        <Button
          variant={showCreatorBadge ? 'primary' : 'secondary'}
          size="sm"
          icon={showCreatorBadge ? 'visibility' : 'visibility_off'}
          onClick={() => onToggleBadge(!showCreatorBadge)}
          className="text-xs py-1 px-2.5 h-7"
        >
          {showCreatorBadge ? 'Badge Visible' : 'Badge Hidden'}
        </Button>
      </div>

      <div className="flex items-center gap-2.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarFile}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-btn bg-surface hover:bg-surface-2 border border-line text-xs font-semibold text-ink transition-colors cursor-pointer shadow-[var(--shadow-1)] group"
          title="Upload avatar photo"
        >
          <div className="w-5 h-5 rounded-full overflow-hidden bg-primary-soft flex items-center justify-center text-primary font-bold text-[10px] group-hover:ring-1 group-hover:ring-primary">
            {creator.avatarUrl ? (
              <img src={creator.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Icon name="add_a_photo" size={12} />
            )}
          </div>
          <span>Avatar</span>
        </button>

        <div className="flex-1">
          <input
            type="text"
            value={creator.handle}
            onChange={(e) => onChange({ handle: e.target.value })}
            placeholder="@amanshades"
            className="w-full bg-surface border border-line rounded-btn px-3 py-2 text-xs font-medium text-ink placeholder-ink-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all shadow-[var(--shadow-1)]"
          />
        </div>

        <div className="w-32">
          <input
            type="text"
            value={creator.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Creator Name"
            className="w-full bg-surface border border-line rounded-btn px-3 py-2 text-xs font-medium text-ink placeholder-ink-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all shadow-[var(--shadow-1)]"
          />
        </div>
      </div>
    </div>
  );
};
