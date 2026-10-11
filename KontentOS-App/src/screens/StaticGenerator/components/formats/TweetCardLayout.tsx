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

export const TweetCardLayout: React.FC<Props> = ({ state }) => {
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
      className={`relative w-full h-full flex items-center justify-center ${
        isVerticalStory ? 'p-4 sm:p-5' : 'p-4 sm:p-6 md:p-8'
      } select-none overflow-hidden ${getFontFamily()}`}
    >
      {/* Background with blur and vignette */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: safeBg ? `url("${safeBg}")` : undefined,
          backgroundColor: isLight ? '#f1f5f9' : '#090d16',
          filter: `blur(${state.blurAmount}px)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: isLight
            ? `radial-gradient(circle at center, rgba(255,255,255,${state.overlayDarkness * 0.3}) 0%, rgba(220,230,242,${state.overlayDarkness * 0.9}) 100%)`
            : `radial-gradient(circle at center, rgba(0,0,0,${state.overlayDarkness * 0.5}) 0%, rgba(0,0,0,${state.overlayDarkness * 0.95}) 100%)`,
        }}
      />

      {/* Tweet Frame */}
      <div
        className={`relative z-10 w-full ${
          isLandscape
            ? 'max-w-2xl max-h-[94%]'
            : isVerticalStory
            ? 'max-w-md my-auto max-h-[88%] p-4 sm:p-6'
            : 'max-w-xl max-h-[96%] p-5 sm:p-7'
        } rounded-2xl sm:rounded-3xl backdrop-blur-2xl border shadow-2xl transition-all duration-200 flex flex-col justify-between overflow-hidden`}
        style={{
          backgroundColor: theme.cardBg,
          border: layerStyles.cardBorder,
          boxShadow: layerStyles.cardBoxShadow,
          backdropFilter: layerStyles.backdropFilter,
          WebkitBackdropFilter: layerStyles.backdropFilter,
        }}
      >
        {/* Header: Avatar, Name, Handle, X logo */}
        <div className="flex items-center justify-between mb-3 font-body shrink-0">
          {state.showCreatorBadge ? (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden flex items-center justify-center bg-cyan-600/40 text-cyan-100 font-bold ring-2 ring-white/15 shrink-0">
                {safeAvatar ? (
                  <img src={safeAvatar} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                ) : (
                  'A'
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`font-bold text-xs sm:text-sm truncate max-w-[150px] sm:max-w-[220px] ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {state.creator.name || 'Aman Shades'}
                  </span>
                  {/* Verified Badge */}
                  <svg className="w-3.5 h-3.5 text-cyan-400 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                </div>
                <span className={`text-[11px] block truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {state.creator.handle || '@amanshades'}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className={`text-[11px] font-mono uppercase tracking-widest font-semibold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                Insight Statement
              </span>
            </div>
          )}

          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isLight ? 'bg-black/10 text-slate-800' : 'bg-white/10 text-slate-200'}`}>
            𝕏
          </div>
        </div>

        {/* Tweet Body Content (Headline & Subtext with fluid scaling and keyword highlights) */}
        <div className="my-auto py-1 min-h-0 flex flex-col justify-center space-y-2">
          <p
            className="tracking-tight"
            style={{
              color: theme.textColor,
              textShadow: layerStyles.headlineTextShadow,
              fontSize: typography.headlineStyle.fontSize,
              lineHeight: typography.headlineStyle.lineHeight,
              letterSpacing: typography.headlineStyle.letterSpacing,
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
          </p>

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

        {/* Clean Post Footer */}
        <div className={`pt-2.5 mt-2 shrink-0 font-body flex items-center justify-between text-xs ${isLight ? 'border-t border-black/10 text-slate-500' : 'border-t border-white/10 text-slate-400'}`}>
          <div className="flex items-center gap-2 text-[11px]">
            <span>10:42 AM</span>
            <span>·</span>
            <span className={`font-mono ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Social Card</span>
          </div>
        </div>
      </div>
    </div>
  );
};
