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

export const CarouselSlideCard: React.FC<Props> = ({ state, onUpdateText }) => {
  const theme = getActiveTheme(state);
  const layerStyles = getCardLayerStyles(state);
  const typography = calculateCardTypography(state);
  const scene = useCanvasInteraction((s) => s.scenes[s.activeSlide] || EMPTY_SCENE);

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

  const isVerticalStory = state.aspectRatio === '9:16';
  const isLight = theme.mode === 'light';
  const safeBg = getSafeImageUrl(state.backgroundUrl);
  const safeAvatar = getSafeImageUrl(state.creator.avatarUrl);

  const currentNum = state.slideCurrent || 1;
  const totalNum = state.slideTotal || 5;
  const isHookSlide = currentNum === 1;
  const isLastSlide = currentNum === totalNum && totalNum > 1;
  const headline =
    state.headline ||
    'Most creators spend [80% of their time] on repetitive edits instead of high-leverage ideas.';
  const supporting =
    state.supportingText ||
    'Here is the exact 3-step system to turn 1 raw thought into 6 high-converting assets in under 5 minutes.';

  const getSlideBadgeText = () => {
    if (isHookSlide) return `HOOK • 01 / ${String(totalNum).padStart(2, '0')}`;
    if (isLastSlide) return `THE PLAYBOOK & CTA • ${String(currentNum).padStart(2, '0')} / ${String(totalNum).padStart(2, '0')}`;
    return `STEP ${currentNum - 1} • ${String(currentNum).padStart(2, '0')} / ${String(totalNum).padStart(2, '0')}`;
  };

  return (
    <div
      className={`relative w-full h-full flex flex-col justify-between ${
        isVerticalStory ? 'pt-14 pb-14 px-4 sm:px-6' : 'p-4 sm:p-6 md:p-8'
      } select-none overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-slate-950'} ${getFontFamily()}`}
    >
      {/* Background with texture/image */}
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
            ? `linear-gradient(180deg, rgba(255,255,255,${state.overlayDarkness * 0.3}) 0%, rgba(220,230,242,${state.overlayDarkness * 0.9}) 100%)`
            : `linear-gradient(180deg, rgba(10,15,30,${state.overlayDarkness * 0.7}) 0%, rgba(3,7,18,${state.overlayDarkness * 0.95}) 100%)`,
        }}
      />

      {/* Top Bar: Progress & Slide Indicator */}
      <div className="relative z-10 flex items-center justify-between font-body shrink-0 mb-1">
        {state.showCreatorBadge ? (
          <TransformableElement id="profile" transform={scene.profile} className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center bg-cyan-600/40 text-cyan-100 text-[10px] font-bold ring-1 ring-white/20">
              {safeAvatar ? (
                <img src={safeAvatar} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
              ) : (
                'A'
              )}
            </div>
            <span className={`text-xs font-semibold tracking-tight truncate max-w-[150px] ${isLight ? 'text-slate-800' : 'text-white'}`}>
              {state.creator.name || 'Aman Shades'}
            </span>
          </TransformableElement>
        ) : (
          <div />
        )}

        {/* Slide Counter Badge */}
        <div
          className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold tracking-wider border shadow-md"
          style={{
            backgroundColor: theme.pillBg,
            borderColor: theme.borderColor,
            color: theme.pillText,
          }}
        >
          {String(state.slideCurrent || 1).padStart(2, '0')} / {String(state.slideTotal || 5).padStart(2, '0')}
        </div>
      </div>

      {/* Main Content Layout: Standard Carousel Framework */}
      <div className="relative z-10 my-auto py-1 min-h-0 flex flex-col justify-center">
        <TransformableElement
          id="badge"
          transform={scene.badge}
          className="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest mb-2 border font-body self-start"
          style={{
            backgroundColor: theme.pillBg,
            borderColor: theme.borderColor,
            color: theme.accent,
          }}
        >
          {getSlideBadgeText()}
        </TransformableElement>

        <CanvasTextElement
          id="headline"
          as="h2"
          text={headline}
          onTextChange={(value) => onUpdateText?.('headline', value)}
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
          renderContent={(text) => renderHighlightedText(text, theme.accent, theme.glowColor, isLight)}
        />

        <TransformableElement
          id="content-box"
          transform={scene['content-box']}
          className="p-3 sm:p-4 rounded-xl border transition-all"
          style={{
            backgroundColor: theme.cardBg,
            border: layerStyles.cardBorder,
            boxShadow: layerStyles.cardBoxShadow,
            backdropFilter: layerStyles.backdropFilter,
            WebkitBackdropFilter: layerStyles.backdropFilter,
          }}
        >
          <CanvasTextElement
            id="body"
            as="p"
            text={supporting}
            onTextChange={(value) => onUpdateText?.('supportingText', value)}
            className="whitespace-pre-line font-medium"
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
        </TransformableElement>
      </div>

      {/* Bottom Bar: Swipe Prompt vs Final Slide Save Prompt */}
      <TransformableElement
        id="footer"
        transform={scene.footer}
        className={`relative z-10 flex items-center justify-between pt-2.5 font-body shrink-0 mt-1 ${
          isLight ? 'border-t border-black/10' : 'border-t border-white/10'
        }`}
      >
        {isLastSlide ? (
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-bold uppercase tracking-widest ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
              Save & Apply This Playbook
            </span>
            <span className="text-sm" style={{ color: theme.accent }}>🔖</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-bold uppercase tracking-widest ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              Swipe Next
            </span>
            <span className="text-sm animate-pulse" style={{ color: theme.accent }}>➔</span>
          </div>
        )}
      </TransformableElement>
    </div>
  );
};
