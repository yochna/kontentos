import type { SlideSceneState } from './canvasScene';
export type {
  CanvasElementId,
  ElementTransform,
  SlideSceneState,
  TransformHandleType,
  CanvasInteractionState,
} from './canvasScene';

export type CardFormat =
  | 'instagram-overlay'
  | 'linkedin-split'
  | 'tweet-card'
  | 'carousel-slide'
  | 'editorial-quote';

export type AspectRatio = '1:1' | '4:5' | '16:9' | '9:16';

export type CardMode = 'dark' | 'light';

export type ColorTheme =
  // Studio Core Series
  | 'sahara-linen'
  | 'midnight-cyan'
  | 'forest-emerald'
  | 'amber-heat'
  | 'monolith-dark'
  | 'terracotta-editorial'
  | 'alabaster-light'
  | 'nordic-cream'
  // Storytold / DeckCraft Creative Suite
  | 'deckcraft-harbor'
  | 'deckcraft-nocturne'
  | 'deckcraft-ember'
  | 'deckcraft-coral-reef'
  | 'deckcraft-paper'
  | 'deckcraft-oasis';

export type FontStyle =
  | 'grotesk'
  | 'editorial'
  | 'mono'
  | 'serif'
  | 'modern-grotesk'
  | 'editorial-serif'
  | 'magazine-luxe'
  | 'punchy-mono'
  | 'neo-brutalist'
  | 'executive-authority'
  | 'classic-literature'
  | 'swiss-tech';

export type TypographyCategory =
  | 'All'
  | 'Modern'
  | 'Editorial'
  | 'Bold & Expressive'
  | 'Technical';

export interface TypographyBundle {
  id: FontStyle;
  label: string;
  category: 'Modern' | 'Editorial' | 'Bold & Expressive' | 'Technical';
  tagline: string;
  description: string;
  headlineFont: string;
  headlineFontFamily: string;
  bodyFont: string;
  bodyFontFamily: string;
  accentFont?: string;
  accentFontFamily?: string;
  headlineWeight: number | string;
  headlineTracking: string;
  headlineLineHeight?: number;
  bodyLineHeight?: number;
  bodyTracking?: string;
  isItalicHeadline?: boolean;
  sampleHeadline: string;
  sampleSubtext: string;
  badges: string[];
}

// --- Non-Destructive CSS Layer Styles & Glows (PhotoCraft inspired) ---
export type GlowIntensity = 'none' | 'subtle' | 'radiant' | 'cyber';
export type ElevationDepth = 'flat' | 'subtle' | 'floating' | 'dramatic';
export type GlassBlur = 'solid' | 'frosted' | 'deep-frosted';
export type TextShadowStyle = 'clean' | 'soft-shadow' | 'neon-glow' | 'letterpress';

export type LayerStylePreset =
  | 'default-glow'      // Standard balanced ambient glow
  | 'cyber-neon'        // Intense accent glow with rim lighting
  | 'frosted-glass'     // Deep backdrop blur with specular glass border
  | 'editorial-depth'   // Multi-tiered diffuse ambient drop shadow
  | 'clean-minimal'     // Flat, crisp 1px border with no glow
  | 'custom';

export interface LayerStyleConfig {
  preset: LayerStylePreset;
  glowIntensity: GlowIntensity;
  elevation: ElevationDepth;
  glassBlur: GlassBlur;
  textEffect: TextShadowStyle;
  borderGlow: boolean;   // Whether border adopts active accent gradient or glow
}

export interface CreatorProfile {
  name: string;
  handle: string;
  avatarUrl: string;
  verified: boolean;
}

export type SlideType = 'standard' | 'stat' | 'hook' | 'quote' | 'list' | 'cta';

export interface CarouselSlide {
  id: number;
  headline: string;
  supportingText: string;
  slideType?: SlideType;
  statValue?: string;
  statLabel?: string;
}

export interface BackgroundPreset {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  url: string;
  thumbUrl: string;
  gradientFallback: string;
}

export interface ThemeConfig {
  id: ColorTheme;
  name: string;
  icon: string;
  mode: CardMode;
  collection?: 'craft' | 'core';
  description?: string;
  accent: string;
  accentGradient: string;
  cardBg: string;
  borderColor: string;
  glowColor: string;
  textColor: string;
  subtextColor: string;
  pillBg: string;
  pillText: string;
}

export interface StaticCardState {
  format: CardFormat;
  aspectRatio: AspectRatio;
  cardMode?: CardMode;
  fontStyle: FontStyle;
  headline: string;
  supportingText: string;
  socialCaption: string;
  creator: CreatorProfile;
  showCreatorBadge: boolean;
  theme: ColorTheme;
  customAccent?: string;
  backgroundUrl: string;
  backgroundCategory: string;
  customBackgroundUrl?: string;
  overlayDarkness: number; // 0.1 to 0.9
  blurAmount: number; // 0 to 20
  showWatermark: boolean;
  slideCurrent: number;
  slideTotal: number;
  slides?: CarouselSlide[];
  slideType?: SlideType;
  statValue?: string;
  textSizeAdjust?: number; // -2 (Compact), -1, 0 (Auto-Fit), +1, +2 (Prominent)
  photographerAttribution?: {
    name: string;
    username?: string;
    profileUrl?: string;
  };
  layerStyles?: LayerStyleConfig;
  sceneOverrides?: Record<number, SlideSceneState>;
}
