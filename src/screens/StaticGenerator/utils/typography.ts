import { StaticCardState, TypographyBundle } from '../../../types/staticCard';
import { getTypographyBundle } from '../../../data/staticCardPresets';

export interface CardTypographyConfig {
  headlineStyle: {
    fontSize: string;
    lineHeight: number;
    letterSpacing: string;
    marginBottom: string;
    fontFamily: string;
    fontWeight: number | string;
    fontStyle?: 'normal' | 'italic';
  };
  supportingStyle: {
    fontSize: string;
    lineHeight: number;
    opacity: number;
    fontFamily: string;
    letterSpacing?: string;
  };
  badgeStyle: {
    fontFamily: string;
    letterSpacing: string;
  };
  containerPaddingClass: string;
  bundle: TypographyBundle;
}

/**
 * Calculates responsive, container-proportional font sizes for static cards
 * to prevent DOM scrollbars and eliminate text clipping during high-res 300 DPI exports.
 */
export function calculateCardTypography(state: StaticCardState): CardTypographyConfig {
  const { format, aspectRatio, headline = '', supportingText = '', textSizeAdjust = 0 } = state;
  const hLen = headline.trim().length || 40;
  const sLen = supportingText.trim().length || 60;
  const totalLen = hLen + sLen;

  const isLandscape = aspectRatio === '16:9';
  const isPortrait = aspectRatio === '4:5';
  const isVerticalStory = aspectRatio === '9:16';

  // Base headline size in pixels
  let hBase = 24;
  let sBase = 14;
  let hLineHeight = 1.25;
  let sLineHeight = 1.45;
  let marginBottom = '12px';

  if (isLandscape) {
    // 16:9 has constrained vertical height (~290-340px)
    if (format === 'linkedin-split') {
      if (totalLen > 220) {
        hBase = 15;
        sBase = 11;
        marginBottom = '6px';
      } else if (totalLen > 140) {
        hBase = 17;
        sBase = 12;
        marginBottom = '8px';
      } else {
        hBase = 20;
        sBase = 13;
        marginBottom = '10px';
      }
    } else if (format === 'tweet-card') {
      if (totalLen > 220) {
        hBase = 14.5;
        sBase = 11;
        marginBottom = '6px';
      } else if (totalLen > 130) {
        hBase = 16.5;
        sBase = 12;
        marginBottom = '8px';
      } else {
        hBase = 19;
        sBase = 13;
        marginBottom = '10px';
      }
    } else {
      if (totalLen > 240) {
        hBase = 16;
        sBase = 11.5;
        marginBottom = '6px';
      } else if (totalLen > 150) {
        hBase = 18.5;
        sBase = 12.5;
        marginBottom = '8px';
      } else {
        hBase = 22;
        sBase = 13.5;
        marginBottom = '10px';
      }
    }
  } else if (isVerticalStory) {
    // 9:16 Story / Mobile: Tall vertical canvas (~670px) with narrower width (~380px)
    if (totalLen > 240) {
      hBase = 20;
      sBase = 12.5;
      marginBottom = '12px';
    } else if (totalLen > 150) {
      hBase = 23;
      sBase = 13.5;
      marginBottom = '14px';
    } else if (totalLen > 80) {
      hBase = 26;
      sBase = 14.5;
      marginBottom = '16px';
    } else {
      hBase = 30;
      sBase = 15.5;
      marginBottom = '18px';
    }
  } else if (isPortrait) {
    // 4:5 has generous vertical height (~550px)
    if (totalLen > 250) {
      hBase = 21;
      sBase = 13;
      marginBottom = '10px';
    } else if (totalLen > 160) {
      hBase = 24;
      sBase = 14;
      marginBottom = '12px';
    } else if (totalLen > 90) {
      hBase = 28;
      sBase = 15;
      marginBottom = '14px';
    } else {
      hBase = 32;
      sBase = 16;
      marginBottom = '16px';
    }
  } else {
    // 1:1 Square (balanced, 520px)
    if (format === 'linkedin-split') {
      if (totalLen > 220) {
        hBase = 17;
        sBase = 11.5;
        marginBottom = '8px';
      } else if (totalLen > 140) {
        hBase = 19.5;
        sBase = 12.5;
        marginBottom = '10px';
      } else {
        hBase = 23;
        sBase = 13.5;
        marginBottom = '12px';
      }
    } else {
      if (totalLen > 250) {
        hBase = 18;
        sBase = 12;
        marginBottom = '8px';
      } else if (totalLen > 170) {
        hBase = 21;
        sBase = 13;
        marginBottom = '10px';
      } else if (totalLen > 100) {
        hBase = 25;
        sBase = 14;
        marginBottom = '12px';
      } else {
        hBase = 29;
        sBase = 15;
        marginBottom = '14px';
      }
    }
  }

  // Apply optional fine-tune adjustment (-2 to +2)
  const adjustedHeadline = Math.max(12, Math.min(36, hBase + textSizeAdjust * 1.5));
  const adjustedSupporting = Math.max(10, Math.min(20, sBase + textSizeAdjust * 0.75));

  if (adjustedHeadline >= 26) {
    hLineHeight = 1.18;
  } else if (adjustedHeadline >= 20) {
    hLineHeight = 1.24;
  } else {
    hLineHeight = 1.3;
  }

  const bundle = getTypographyBundle(state.fontStyle);
  const headlineTracking = bundle.headlineTracking || (adjustedHeadline >= 22 ? '-0.025em' : '-0.015em');
  const resolvedHLineHeight = bundle.headlineLineHeight ? Math.min(bundle.headlineLineHeight, hLineHeight) : hLineHeight;
  const resolvedSLineHeight = bundle.bodyLineHeight || sLineHeight;

  return {
    headlineStyle: {
      fontSize: `${adjustedHeadline.toFixed(1)}px`,
      lineHeight: resolvedHLineHeight,
      letterSpacing: headlineTracking,
      marginBottom,
      fontFamily: bundle.headlineFontFamily,
      fontWeight: bundle.headlineWeight,
      fontStyle: bundle.isItalicHeadline ? 'italic' : 'normal',
    },
    supportingStyle: {
      fontSize: `${adjustedSupporting.toFixed(1)}px`,
      lineHeight: resolvedSLineHeight,
      opacity: 0.92,
      fontFamily: bundle.bodyFontFamily,
      letterSpacing: bundle.bodyTracking || 'normal',
    },
    badgeStyle: {
      fontFamily: bundle.accentFontFamily || bundle.headlineFontFamily,
      letterSpacing: '0.05em',
    },
    containerPaddingClass: isLandscape ? 'p-4 sm:p-5' : isVerticalStory ? 'p-4 sm:p-6' : 'p-5 sm:p-7',
    bundle,
  };
}
