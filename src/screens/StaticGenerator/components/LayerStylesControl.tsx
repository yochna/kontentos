import React from 'react';
import {
  LayerStyleConfig,
  LayerStylePreset,
  GlowIntensity,
  ElevationDepth,
  GlassBlur,
  TextShadowStyle,
} from '../../../types/staticCard';
import {
  DEFAULT_LAYER_STYLES,
  LAYER_STYLE_PRESETS,
  LAYER_STYLE_PRESET_META,
} from '../../../data/staticCardPresets';
import { Icon } from '@/lib/icons';

interface Props {
  layerStyles?: LayerStyleConfig;
  activeAccent: string;
  onChange: (styles: LayerStyleConfig) => void;
}

export const LayerStylesControl: React.FC<Props> = ({
  layerStyles = DEFAULT_LAYER_STYLES,
  activeAccent,
  onChange,
}) => {
  const currentPreset = layerStyles.preset;

  const handleSelectPreset = (preset: LayerStylePreset) => {
    if (preset === 'custom') return;
    onChange({ ...LAYER_STYLE_PRESETS[preset] });
  };

  const handleUpdate = <K extends keyof LayerStyleConfig>(
    key: K,
    value: LayerStyleConfig[K]
  ) => {
    onChange({
      ...layerStyles,
      [key]: value,
      preset: 'custom', // Any manual adjustment shifts to custom
    });
  };

  const glowOptions: { id: GlowIntensity; label: string; icon: string }[] = [
    { id: 'none', label: 'Off', icon: 'visibility_off' },
    { id: 'subtle', label: 'Subtle', icon: 'flare' },
    { id: 'radiant', label: 'Radiant', icon: 'wb_sunny' },
    { id: 'cyber', label: 'Cyber Neon', icon: 'electric_bolt' },
  ];

  const elevationOptions: { id: ElevationDepth; label: string }[] = [
    { id: 'flat', label: 'Flat' },
    { id: 'subtle', label: 'Subtle' },
    { id: 'floating', label: 'Floating' },
    { id: 'dramatic', label: 'Dramatic' },
  ];

  const glassOptions: { id: GlassBlur; label: string }[] = [
    { id: 'solid', label: 'Solid' },
    { id: 'frosted', label: 'Frosted' },
    { id: 'deep-frosted', label: 'Deep Glass' },
  ];

  const textOptions: { id: TextShadowStyle; label: string }[] = [
    { id: 'clean', label: 'Clean' },
    { id: 'soft-shadow', label: 'Soft Shadow' },
    { id: 'neon-glow', label: 'Neon Glow' },
    { id: 'letterpress', label: 'Letterpress' },
  ];

  const presetList: LayerStylePreset[] = [
    'default-glow',
    'cyber-neon',
    'frosted-glass',
    'editorial-depth',
    'clean-minimal',
  ];

  return (
    <div className="space-y-3.5 p-3.5 bg-surface rounded-xl border border-line/80 shadow-xs">
      {/* Header with Title and Reset */}
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
          <Icon name="layers" size={16} className="text-primary" />
          <span>Layer Styles & Glows</span>
          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-bold">
            PhotoCraft
          </span>
        </label>

        {currentPreset === 'custom' && (
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_LAYER_STYLES })}
            className="text-[10px] text-ink-muted hover:text-primary transition-colors cursor-pointer flex items-center gap-1"
          >
            <Icon name="restart_alt" size={13} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Preset Quick-Picks */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-ink-muted font-medium">
          <span>Style Presets</span>
          {currentPreset === 'custom' && (
            <span className="text-[10px] text-primary font-semibold">Custom Configured</span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {presetList.map((p) => {
            const meta = LAYER_STYLE_PRESET_META[p];
            const isSelected = currentPreset === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => handleSelectPreset(p)}
                title={meta.description}
                className={`py-1.5 px-2 rounded-btn text-left border transition-all cursor-pointer flex flex-col gap-0.5 ${
                  isSelected
                    ? 'bg-primary text-on-primary border-primary shadow-xs ring-1 ring-primary/40 font-bold'
                    : 'bg-surface-2 hover:bg-surface text-ink border-line hover:border-line-strong'
                }`}
              >
                <div className="flex items-center gap-1 text-[11px]">
                  <span>{meta.icon}</span>
                  <span className="truncate">{meta.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Granular Sliders & Toggles */}
      <div className="space-y-3 pt-2 border-t border-line/60">
        {/* Glow Intensity Segment */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-ink-muted font-medium flex items-center gap-1">
              <Icon name="flare" size={13} className="text-primary" />
              <span>Accent Glow Intensity</span>
            </span>
            <span className="text-[10px] font-mono text-ink-dim capitalize">
              {layerStyles.glowIntensity}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 bg-surface-2 p-0.5 rounded-btn border border-line">
            {glowOptions.map((opt) => {
              const active = layerStyles.glowIntensity === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleUpdate('glowIntensity', opt.id)}
                  className={`py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    active
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Elevation Depth Segment */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-ink-muted font-medium flex items-center gap-1">
              <Icon name="layers" size={13} className="text-primary" />
              <span>Shadow Elevation</span>
            </span>
            <span className="text-[10px] font-mono text-ink-dim capitalize">
              {layerStyles.elevation}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 bg-surface-2 p-0.5 rounded-btn border border-line">
            {elevationOptions.map((opt) => {
              const active = layerStyles.elevation === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleUpdate('elevation', opt.id)}
                  className={`py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center ${
                    active
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Glassmorphic Backdrop Blur */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-ink-muted font-medium flex items-center gap-1">
              <Icon name="blur_on" size={13} className="text-primary" />
              <span>Glassmorphism Blur</span>
            </span>
            <span className="text-[10px] font-mono text-ink-dim capitalize">
              {layerStyles.glassBlur}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 bg-surface-2 p-0.5 rounded-btn border border-line">
            {glassOptions.map((opt) => {
              const active = layerStyles.glassBlur === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleUpdate('glassBlur', opt.id)}
                  className={`py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center ${
                    active
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Headline Typography Text Effect */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-ink-muted font-medium flex items-center gap-1">
              <Icon name="format_size" size={13} className="text-primary" />
              <span>Headline Text Effect</span>
            </span>
            <span className="text-[10px] font-mono text-ink-dim capitalize">
              {layerStyles.textEffect}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 bg-surface-2 p-0.5 rounded-btn border border-line">
            {textOptions.map((opt) => {
              const active = layerStyles.textEffect === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleUpdate('textEffect', opt.id)}
                  className={`py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center ${
                    active
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent Border Glow Toggle */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shadow-inner"
              style={{ backgroundColor: activeAccent }}
            />
            <span className="text-[11px] text-ink font-medium">Radiant Accent Border Rim</span>
          </div>
          <button
            type="button"
            onClick={() => handleUpdate('borderGlow', !layerStyles.borderGlow)}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer border ${
              layerStyles.borderGlow
                ? 'bg-primary border-primary'
                : 'bg-surface-2 border-line'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-white shadow-xs transition-transform ${
                layerStyles.borderGlow ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
