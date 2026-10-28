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

export const EditorialQuoteCard: React.FC<Props> = ({ state, onUpdateText }) => {
  const theme = getActiveTheme(state);
  const layerStyles = getCardLayerStyles(state);
  const typography = calculateCardTypography(state);
  const scene = useCanvasInteraction((s) => s.scenes[s.activeSlide] || EMPTY_SCENE);

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
      className={`relative w-full h-full flex flex-col justify-between ${
        isVerticalStory ? 'pt-14 pb-14 px-4 sm:px-6' : 'p-4 sm:p-6 md:p-8'
      } select-none overflow-hidden font-display ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}
    >
      {/* Background with moody gradient */}
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
            ? `radial-gradient(ellipse at center, rgba(255,255,255,${state.overlayDarkness * 0.3}) 0%, rgba(220,230,242,${state.overlayDarkness * 0.9}) 100%)`
            : `radial-gradient(ellipse at center, rgba(15,23,42,${state.overlayDarkness * 0.75}) 0%, rgba(2,6,23,${state.overlayDarkness * 0.95}) 100%)`,
        }}
      />

      {/* Stylized Giant Quotation Graphic */}
      <TransformableElement
        id="quote-mark"
        transform={scene['quote-mark']}
        className="relative z-10 text-4xl sm:text-5xl font-display font-black leading-none select-none opacity-45 shrink-0"
        style={{ color: theme.accent }}
      >
        “
      </TransformableElement>

      {/* Quote Statement & Takeaway with Fluid Auto-Fit & Keyword Highlighting */}
      <div className="relative z-10 my-auto py-1 min-h-0 flex flex-col justify-center">
        <CanvasTextElement
          id="headline"
          as="blockquote"
          text={headline}
          onTextChange={(value) => onUpdateText?.('headline', value)}
          className="tracking-normal"
          style={{
            color: theme.textColor,
            textShadow: layerStyles.headlineTextShadow,
            fontSize: typography.headlineStyle.fontSize,
            lineHeight: typography.headlineStyle.lineHeight,
            marginBottom: typography.headlineStyle.marginBottom,
            fontFamily: typography.headlineStyle.fontFamily,
            fontWeight: typography.headlineStyle.fontWeight,
            fontStyle: typography.headlineStyle.fontStyle || 'italic',
            letterSpacing: typography.headlineStyle.letterSpacing,
          }}
          renderContent={(text) => renderHighlightedText(text, theme.accent, theme.glowColor, isLight)}
        />

        <CanvasTextElement
          id="body"
          as="p"
          text={supporting}
          onTextChange={(value) => onUpdateText?.('supportingText', value)}
          className="font-normal leading-relaxed pl-3.5 border-l-2"
          style={{
            color: theme.subtextColor,
            borderColor: theme.accent,
            fontSize: typography.supportingStyle.fontSize,
            lineHeight: typography.supportingStyle.lineHeight,
            fontFamily: typography.supportingStyle.fontFamily,
            letterSpacing: typography.supportingStyle.letterSpacing,
            opacity: typography.supportingStyle.opacity,
          }}
          renderContent={(text) => renderHighlightedText(text, theme.accent, theme.glowColor, isLight)}
        />
      </div>

      {/* Signature & Author Footer */}
      <TransformableElement
        id="profile"
        transform={scene.profile}
        className={`relative z-10 flex items-center justify-start pt-2.5 shrink-0 font-body mt-1 ${
          isLight ? 'border-t border-black/10' : 'border-t border-white/10'
        }`}
      >
        {state.showCreatorBadge && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-cyan-600/40 text-white font-bold ring-2 ring-white/15">
              {safeAvatar ? (
                <img src={safeAvatar} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
              ) : (
                'A'
              )}
            </div>
            <div>
              <div className={`font-bold text-xs sm:text-sm truncate max-w-[180px] ${isLight ? 'text-slate-900' : 'text-white'}`}>{state.creator.name || 'Your Name'}</div>
              <div className={`text-[10px] truncate max-w-[180px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{state.creator.handle || '@yourhandle'}</div>
            </div>
          </div>
        )}
      </TransformableElement>
    </div>
  );
};
