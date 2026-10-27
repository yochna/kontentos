import React from 'react';
import { StaticCardState } from '../../../../types/staticCard';
import { getActiveTheme } from '../../../../data/staticCardPresets';
import { getCardLayerStyles } from '../../utils/layerStyles';
import { getSafeImageUrl } from '@/lib/images';
import { calculateCardTypography } from '../../utils/typography';
import { renderHighlightedText } from '../../utils/textHighlighter';
import { TransformableElement } from '../canvas/TransformableElement';
import { CanvasTextElement } from '../canvas/CanvasTextElement';
import { useCanvasInteraction, EMPTY_SCENE } from '../../hooks/useCanvasInteraction';

interface Props {
  state: StaticCardState;
  onUpdateText?: (field: string, value: string) => void;
}

export const StaticGenerator: React.FC<Props> = ({ state, onUpdateText }) => { 

export const InstagramOverlayCard: React.FC<Props> = ({ state, onUpdateText }) => {
  const theme = getActiveTheme(state);
  const layerStyles = getCardLayerStyles(state);
  const typography = calculateCardTypography(state);
  const scene = useCanvasInteraction((s) => s.scenes[s.activeSlide] || EMPTY_SCENE);

  const getFontFamily = () => {
    switch (state.fontStyle) {
      case 'editorial':
        return 'font-display italic';
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
  const headline =
    state.headline ||
    'Most creators spend [80% of their time] on repetitive edits instead of high-leverage ideas.';
  const supporting =
    state.supportingText ||
    'Here is the exact 3-step system to turn 1 raw thought into 6 high-converting assets in under 5 minutes.';

  return (
    <div
      className={`relative w-full h-full flex flex-col ${
        isVerticalStory
          ? 'justify-center py-12 px-4 sm:px-5'
          : 'justify-end p-4 sm:p-6 md:p-8'
      } select-none overflow-hidden ${getFontFamily()}`}
    >
      {/* Background Image Layer */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-300"
        style={{
          backgroundImage: safeBg ? `url("${safeBg}")` : undefined,
          backgroundColor: isLight ? '#f1f5f9' : '#0f172a',
          filter: `blur(${state.blurAmount}px)`,
          transform: state.blurAmount > 0 ? 'scale(1.05)' : 'none',
        }}
      />

      {/* Dark/Light Vignette Overlay */}
      <div
        className="absolute inset-0 transition-opacity duration-300 pointer-events-none"
        style={{
          background: isLight
            ? `linear-gradient(180deg, rgba(255,255,255,${state.overlayDarkness * 0.2}) 0%, rgba(240,244,248,${state.overlayDarkness * 0.85}) 100%)`
            : `linear-gradient(180deg, rgba(0,0,0,${state.overlayDarkness * 0.35}) 0%, rgba(0,0,0,${state.overlayDarkness * 0.9}) 100%)`,
        }}
      />

      {/* Center/Bottom Glassmorphic Content Card */}
      <TransformableElement
        id="content-box"
        transform={scene['content-box']}
        className={`relative z-10 w-full ${
          isLandscape
            ? 'max-w-3xl my-auto max-h-[94%]'
            : isVerticalStory
            ? 'max-w-md my-auto max-h-[90%]'
            : 'max-h-[96%]'
        } rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-7 backdrop-blur-xl border transition-all duration-200 shadow-2xl flex flex-col justify-between overflow-hidden`}
        style={{
          backgroundColor: theme.cardBg,
          border: layerStyles.cardBorder,
          boxShadow: layerStyles.cardBoxShadow,
          backdropFilter: layerStyles.backdropFilter,
          WebkitBackdropFilter: layerStyles.backdropFilter,
        }}
      >
        {/* Card Header: Creator Badge (if enabled) + Accent Bar */}
        <div className="flex items-center justify-between mb-2 shrink-0">
          {state.showCreatorBadge ? (
            <TransformableElement
              id="profile"
              transform={scene.profile}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-md border shadow-sm ${
                isLight ? 'bg-black/5 border-black/10 text-slate-900' : 'bg-black/60 border-white/15 text-white'
              }`}
            >
              <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-cyan-600/40 text-cyan-200 text-[10px] font-bold ring-1 ring-white/20 shrink-0">
                {safeAvatar ? (
                  <img
                    src={safeAvatar}
                    alt={state.creator.name}
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <span>{state.creator.name ? state.creator.name.charAt(0).toUpperCase() : 'A'}</span>
                )}
              </div>
              <span className={`text-xs font-medium tracking-tight font-body truncate max-w-[180px] ${isLight ? 'text-slate-800' : 'text-white'}`}>
                {state.creator.handle || '@amanshades'}
              </span>
            </TransformableElement>
          ) : (
            <div />
          )}

          {/* Accent Glow Indicator Bar */}
          <TransformableElement
            id="accent-line"
            transform={scene['accent-line']}
            className="w-10 h-1 rounded-full opacity-85"
            style={{ background: theme.accentGradient }}
          >
            <span className="sr-only">Accent line</span>
          </TransformableElement>
        </div>

        {/* Text Content (Headline & Supporting with fluid auto-fit & keyword highlighting) */}
        <div className="my-auto py-1 min-h-0 flex flex-col justify-center">
          <CanvasTextElement
            id="headline"
            as="h2"
            text={headline}
            onTextChange={(value) => onUpdateText?.('headline', value)}
            className="tracking-tight drop-shadow-sm"
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
            renderContent={(text) => renderHighlightedText(text, theme.accent, theme.glowColor, isLight)}
          />

          <CanvasTextElement
            id="body"
            as="p"
            text={supporting}
            onTextChange={(value) => onUpdateText?.('supportingText', value)}
            className="whitespace-pre-line font-normal"
            style={{
              color: theme.subtextColor,
              fontSize: typography.supportingStyle.fontSize,
              lineHeight: typography.supportingStyle.lineHeight,
              opacity: typography.supportingStyle.opacity,
              fontFamily: typography.supportingStyle.fontFamily,
              letterSpacing: typography.supportingStyle.letterSpacing,
            }}
            renderContent={(text) => renderHighlightedText(text, theme.accent, theme.glowColor, isLight)}
          />
        </div>
      </TransformableElement>
    </div>
  );
};

export default StaticGenerator;
