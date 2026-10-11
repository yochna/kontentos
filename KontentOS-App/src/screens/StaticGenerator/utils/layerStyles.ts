import {
  LayerStyleConfig,
  LayerStylePreset,
  StaticCardState,
  ThemeConfig,
} from '../../../types/staticCard';
import {
  DEFAULT_LAYER_STYLES,
  LAYER_STYLE_PRESETS,
  getActiveTheme,
} from '../../../data/staticCardPresets';

export interface ComputedLayerStyles {
  /** Composite drop shadow + ambient theme glow + inset specular reflection */
  cardBoxShadow: string;
  /** Card outer boundary border (accent-tinted or standard theme border) */
  cardBorder: string;
  /** Backdrop blur filter applied to glassmorphic surfaces */
  backdropFilter: string;
  /** Specular highlight border for glass surfaces */
  innerGlassHighlight?: string;
  /** Optional headline text shadow / glow */
  headlineTextShadow?: string;
  /** Raw accent glow color for auxiliary accents */
  glowColor: string;
}

/**
 * Computes deterministic, non-destructive CSS visual properties for card layers,
 * combining multi-tier elevations, accent glows, glassmorphism, and text effects.
 */
export function computeLayerStyles(
  styleConfig: LayerStyleConfig = DEFAULT_LAYER_STYLES,
  theme: ThemeConfig,
  isLight = theme.mode === 'light'
): ComputedLayerStyles {
  // 1. Resolve Multi-Tier Elevation Contact & Ambient Drop-Shadows
  let elevationShadows = 'none';
  switch (styleConfig.elevation) {
    case 'flat':
      elevationShadows = 'none';
      break;
    case 'subtle':
      elevationShadows = isLight
        ? '0 4px 14px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)'
        : '0 8px 24px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.2)';
      break;
    case 'floating':
      elevationShadows = isLight
        ? '0 14px 34px rgba(0, 0, 0, 0.09), 0 3px 8px rgba(0, 0, 0, 0.04)'
        : '0 20px 50px rgba(0, 0, 0, 0.55), 0 4px 14px rgba(0, 0, 0, 0.3)';
      break;
    case 'dramatic':
      elevationShadows = isLight
        ? '0 24px 64px rgba(0, 0, 0, 0.16), 0 8px 20px rgba(0, 0, 0, 0.08)'
        : '0 32px 80px rgba(0, 0, 0, 0.75), 0 12px 30px rgba(0, 0, 0, 0.45)';
      break;
  }

  // 2. Resolve Theme Accent Glow Shadows
  let glowShadows = '';
  switch (styleConfig.glowIntensity) {
    case 'none':
      glowShadows = '';
      break;
    case 'subtle':
      glowShadows = `, 0 0 22px ${theme.glowColor}`;
      break;
    case 'radiant':
      glowShadows = `, 0 0 38px ${theme.glowColor}, 0 0 16px ${theme.accent}66`;
      break;
    case 'cyber':
      glowShadows = `, 0 0 55px ${theme.glowColor}, 0 0 24px ${theme.accent}88, inset 0 0 14px ${theme.accent}25`;
      break;
  }

  // Combine drop shadow with glow; if elevation is flat and glow is none, cardBoxShadow is 'none'
  let cardBoxShadow = elevationShadows;
  if (glowShadows) {
    if (cardBoxShadow === 'none') {
      // Strip leading comma if elevation was flat
      cardBoxShadow = glowShadows.replace(/^,\s*/, '');
    } else {
      cardBoxShadow = `${cardBoxShadow}${glowShadows}`;
    }
  }

  // 3. Resolve Specular Glass Backdrop Filter
  let backdropFilter = 'none';
  switch (styleConfig.glassBlur) {
    case 'solid':
      backdropFilter = 'none';
      break;
    case 'frosted':
      backdropFilter = 'blur(16px)';
      break;
    case 'deep-frosted':
      backdropFilter = 'blur(28px) saturate(180%)';
      break;
  }

  // 4. Resolve Card Border
  const cardBorder = styleConfig.borderGlow
    ? `1.5px solid ${theme.accent}99`
    : `1px solid ${theme.borderColor}`;

  // 5. Resolve Headline Text Effects
  let headlineTextShadow: string | undefined;
  switch (styleConfig.textEffect) {
    case 'clean':
      headlineTextShadow = undefined;
      break;
    case 'soft-shadow':
      headlineTextShadow = isLight
        ? '0 2px 4px rgba(0, 0, 0, 0.12)'
        : '0 2px 10px rgba(0, 0, 0, 0.7)';
      break;
    case 'neon-glow':
      headlineTextShadow = `0 0 16px ${theme.accent}99, 0 0 32px ${theme.accent}44`;
      break;
    case 'letterpress':
      headlineTextShadow = isLight
        ? '0 1px 1px rgba(255, 255, 255, 0.85)'
        : '0 -1px 1px rgba(0, 0, 0, 0.9)';
      break;
  }

  return {
    cardBoxShadow,
    cardBorder,
    backdropFilter,
    innerGlassHighlight:
      styleConfig.glassBlur !== 'solid'
        ? isLight
          ? 'inset 0 1px 1px rgba(255, 255, 255, 0.6)'
          : 'inset 0 1px 1px rgba(255, 255, 255, 0.12)'
        : undefined,
    headlineTextShadow,
    glowColor: theme.glowColor,
  };
}

/**
 * Convenience helper to compute layer styles directly from the active StaticCardState.
 */
export function getCardLayerStyles(state: StaticCardState): ComputedLayerStyles {
  const theme = getActiveTheme(state);
  const isLight = theme.mode === 'light';
  const config = state.layerStyles || DEFAULT_LAYER_STYLES;
  return computeLayerStyles(config, theme, isLight);
}

/**
 * Retrieves a predefined layer style preset configuration.
 */
export function getLayerStylePresetConfig(preset: LayerStylePreset): LayerStyleConfig {
  return LAYER_STYLE_PRESETS[preset] || DEFAULT_LAYER_STYLES;
}
