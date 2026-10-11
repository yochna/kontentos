import React from 'react';
import { StaticCardState } from '../../../../types/staticCard';
import { getActiveTheme } from '../../../../data/staticCardPresets';
import { getCardLayerStyles } from '../../utils/layerStyles';
import { WatermarkBadge } from '../WatermarkBadge';
import { getSafeImageUrl } from '@/lib/images';
import { calculateCardTypography } from '../../utils/typography';
import { renderHighlightedText } from '../../utils/textHighlighter';

interface Props {
  state: StaticCardState;
}

export const LinkedInSplitCard: React.FC<Props> = ({ state }) => {
  const theme = getActiveTheme(state);
  const layerStyles = getCardLayerStyles(state);
  const typography = calculateCardTypography(state);

  const getFontFamily = () => {
    switch (state.fontStyle) {
      case 'editorial':
        return 'font-display';
      case 'mono':
        return 'font-mono';
      case 'grotesk':
      default:
        return 'font-body';
    }
  };

  const isLandscape = state.aspectRatio === '16:9';
  const isVerticalStory = state.aspectRatio === '9:16';
  const isLight = theme.mode === 'light';
  const safeBg = getSafeImageUrl(state.backgroundUrl);
  const safeAvatar = getSafeImageUrl(state.creator.avatarUrl);

  return (
    <div
      className={`relative w-full h-full flex ${
        isVerticalStory ? 'flex-col' : 'flex-row'
      } select-none overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-slate-950'} ${getFontFamily()}`}
    >
      {/* Visual Panel (Top in 9:16, Left in standard) */}
      <div
        className={`relative ${
          isVerticalStory
            ? 'w-full h-[36%]'
            : isLandscape
            ? 'w-[38%] h-full'
            : 'w-[40%] h-full'
        } overflow-hidden flex flex-col justify-between p-4 sm:p-5 shrink-0`}
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: safeBg ? `url("${safeBg}")` : undefined,
            backgroundColor: isLight ? '#f1f5f9' : '#0f172a',
            filter: `blur(${state.blurAmount}px)`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: isLight
              ? `linear-gradient(135deg, rgba(255,255,255,${state.overlayDarkness * 0.2}) 0%, rgba(220,228,238,${state.overlayDarkness * 0.85}) 100%)`
              : `linear-gradient(135deg, rgba(0,0,0,${state.overlayDarkness * 0.3}) 0%, rgba(0,0,0,${state.overlayDarkness * 0.9}) 100%)`,
          }}
        />

        {/* Creator Identity (if enabled) */}
        <div className="relative z-10">
          {state.showCreatorBadge ? (
            <div
              className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full backdrop-blur-md border ${
                isLight ? 'bg-black/5 border-black/10 text-slate-900' : 'bg-black/60 border-white/20 text-white'
              }`}
            >
              <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-cyan-600/40 text-cyan-200 text-[10px] font-bold">
                {safeAvatar ? (
                  <img src={safeAvatar} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                ) : (
                  'A'
                )}
              </div>
              <span className={`text-xs font-semibold font-body truncate max-w-[120px] ${isLight ? 'text-slate-800' : 'text-white'}`}>
                {state.creator.name || 'Aman Shades'}
              </span>
            </div>
          ) : null}
        </div>

        {/* Format Tag */}
        <div className="relative z-10">
          <span
            className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded backdrop-blur-sm border ${
              isLight ? 'bg-white/80 border-black/10' : 'bg-black/50 border-white/10'
            }`}
            style={{ color: theme.accent }}
          >
            Framework
          </span>
        </div>
      </div>

      {/* Content Panel (Bottom in 9:16, Right in standard) */}
      <div
        className={`relative flex-1 ${
          isVerticalStory ? 'w-full border-t border-l-0' : 'h-full border-l'
        } p-4 sm:p-6 md:p-7 flex flex-col justify-between overflow-hidden ${
          isLight ? 'border-black/10' : 'border-white/10'
        }`}
        style={{
          backgroundColor: theme.cardBg,
          backdropFilter: layerStyles.backdropFilter,
          WebkitBackdropFilter: layerStyles.backdropFilter,
        }}
      >
        <div className="my-auto py-1 min-h-0 flex flex-col justify-center">
          {/* Accent Line */}
          <div
            className="w-10 h-1 rounded-full mb-3 shrink-0"
            style={{ background: theme.accentGradient }}
          />

          {/* Headline with Keyword Highlighting */}
          <h1
            className="tracking-tight"
            style={{
              color: theme.textColor,
              textShadow: layerStyles.headlineTextShadow,
              fontSize: typography.headlineStyle.fontSize,
              lineHeight: typography.headlineStyle.lineHeight,
              letterSpacing: typography.headlineStyle.letterSpacing,
              marginBottom: typography.headlineStyle.marginBottom,
              fontFamily: typography.headlineStyle.fontFamily,
              fontWeight: typography.headlineStyle.fontWeight,
              fontStyle: typography.headlineStyle.fontStyle,
            }}
          >
            {renderHighlightedText(
              state.headline || 'Most creators spend [80% of their time] on repetitive edits instead of high-leverage ideas.',
              theme.accent,
              theme.glowColor,
              isLight
            )}
          </h1>

          {/* Supporting Takeaway with Keyword Highlighting */}
          <p
            className="whitespace-pre-line font-normal"
            style={{
              color: theme.subtextColor,
              fontSize: typography.supportingStyle.fontSize,
              lineHeight: typography.supportingStyle.lineHeight,
              opacity: typography.supportingStyle.opacity,
              fontFamily: typography.supportingStyle.fontFamily,
              letterSpacing: typography.supportingStyle.letterSpacing,
            }}
          >
            {renderHighlightedText(
              state.supportingText || 'Here is the exact 3-step system to turn 1 raw thought into 6 high-converting assets in under 5 minutes.',
              theme.accent,
              theme.glowColor,
              isLight
            )}
          </p>
        </div>

        {/* Footer */}
        {state.showCreatorBadge && (
          <div className={`pt-2 mt-1 flex items-center justify-start shrink-0 ${isLight ? 'border-t border-black/10' : 'border-t border-white/10'}`}>
            <span className={`text-xs font-medium font-body truncate max-w-[180px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {state.creator.handle || '@amanshades'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
