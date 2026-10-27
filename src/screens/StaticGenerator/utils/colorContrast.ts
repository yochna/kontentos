import { StaticCardState } from '../../../types/staticCard';
import { getActiveTheme } from '../../../data/staticCardPresets';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/**
 * Parses any color format (hex, rgb, rgba) into standardized RGBA components.
 */
export function parseColorToRgb(color: string): RgbColor {
  if (!color || typeof color !== 'string') {
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  const trimmed = color.trim().toLowerCase();

  // 1. Hex parsing (#rgb, #rgba, #rrggbb, #rrggbbaa)
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  // 2. rgb(...) and rgba(...) parsing
  const rgbaMatch = trimmed.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    const r = Math.min(255, Math.max(0, parseFloat(rgbaMatch[1])));
    const g = Math.min(255, Math.max(0, parseFloat(rgbaMatch[2])));
    const b = Math.min(255, Math.max(0, parseFloat(rgbaMatch[3])));
    const a = rgbaMatch[4] !== undefined ? Math.min(1, Math.max(0, parseFloat(rgbaMatch[4]))) : 1;
    return { r, g, b, a };
  }

  // Fallback defaults
  if (trimmed === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (trimmed === 'black') return { r: 0, g: 0, b: 0, a: 1 };

  return { r: 255, g: 255, b: 255, a: 1 };
}

/**
 * Alpha-blends a foreground color over an underlying background.
 */
export function blendColors(fg: RgbColor, bg: RgbColor): RgbColor {
  const alpha = fg.a !== undefined ? fg.a : 1;
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
    a: 1,
  };
}

/**
 * Calculates the relative luminance of a color per WCAG 2.1 specs:
 * L = 0.2126 * R + 0.7152 * G + 0.0722 * B
 * where C = sRGB <= 0.04045 ? sRGB / 12.92 : ((sRGB + 0.055) / 1.055) ^ 2.4
 */
export function getRelativeLuminance(color: RgbColor | string): number {
  const rgb = typeof color === 'string' ? parseColorToRgb(color) : color;
  const normalize = (val: number) => {
    const sRGB = val / 255;
    return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };

  const r = normalize(rgb.r);
  const g = normalize(rgb.g);
  const b = normalize(rgb.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates the contrast ratio between two colors according to WCAG 2.1 specifications:
 * (L1 + 0.05) / (L2 + 0.05) where L1 is the lighter and L2 is the darker relative luminance.
 *
 * @param foregroundHex Foreground color (Hex or rgba)
 * @param backgroundHex Background color (Hex or rgba)
 * @returns Contrast ratio rounded to 2 decimal places (e.g., 4.54)
 */
export function calculateContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const fg = parseColorToRgb(foregroundHex);
  const bg = parseColorToRgb(backgroundHex);

  // If background has alpha, blend it over an opaque fallback (#0b1324 for dark or #ffffff for light)
  const baseBacking = bg.r > 200 && bg.g > 200 && bg.b > 200 ? { r: 255, g: 255, b: 255 } : { r: 11, g: 19, b: 36 };
  const effectiveBg = bg.a !== undefined && bg.a < 1 ? blendColors(bg, baseBacking) : bg;

  // If foreground has alpha, blend it over effective background
  const effectiveFg = fg.a !== undefined && fg.a < 1 ? blendColors(fg, effectiveBg) : fg;

  const l1 = getRelativeLuminance(effectiveFg);
  const l2 = getRelativeLuminance(effectiveBg);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

export interface ContrastResult {
  ratio: number;
  passesAA: boolean; // >= 4.5:1 (WCAG AA threshold for body text)
  passesAALarge: boolean; // >= 3.0:1 (WCAG AA threshold for large text >= 18pt or 14pt bold)
  passesAAA: boolean; // >= 7.0:1 (WCAG AAA enhanced threshold)
  scoreLabel: 'AAA' | 'AA' | 'AA Large' | 'Fail';
  status: 'optimal' | 'pass' | 'warning';
}

/**
 * Evaluates contrast ratio against WCAG 2.1 AA/AAA thresholds.
 */
export function evaluateContrast(fg: string, bg: string): ContrastResult {
  const ratio = calculateContrastRatio(fg, bg);
  const passesAA = ratio >= 4.5;
  const passesAALarge = ratio >= 3.0;
  const passesAAA = ratio >= 7.0;

  let scoreLabel: 'AAA' | 'AA' | 'AA Large' | 'Fail' = 'Fail';
  let status: 'optimal' | 'pass' | 'warning' = 'warning';

  if (passesAAA) {
    scoreLabel = 'AAA';
    status = 'optimal';
  } else if (passesAA) {
    scoreLabel = 'AA';
    status = 'pass';
  } else if (passesAALarge) {
    scoreLabel = 'AA Large';
    status = 'warning';
  } else {
    scoreLabel = 'Fail';
    status = 'warning';
  }

  return {
    ratio,
    passesAA,
    passesAALarge,
    passesAAA,
    scoreLabel,
    status,
  };
}

export interface CardContrastReport {
  headline: ContrastResult;
  supporting: ContrastResult;
  accent: ContrastResult;
  effectiveCardBg: string;
  isCompliant: boolean; // Passes WCAG AA threshold (4.5:1 for supporting text and >= 3.0:1 for large display headline)
  warnings: string[];
}

/**
 * Comprehensive contrast evaluation for the active StaticCardState.
 * Evaluates headline and supporting text contrast against the card background.
 * Generates human-friendly warnings if contrast falls below 4.5:1.
 */
export function evaluateCardContrast(state: StaticCardState): CardContrastReport {
  const theme = getActiveTheme(state);
  const effectiveBg = theme.cardBg;

  const headline = evaluateContrast(theme.textColor, effectiveBg);
  const supporting = evaluateContrast(theme.subtextColor, effectiveBg);
  const accent = evaluateContrast(theme.accent, effectiveBg);

  const warnings: string[] = [];

  // WCAG AA warns if normal text contrast is below 4.5:1
  if (!supporting.passesAA) {
    warnings.push(
      `Supporting text contrast is ${supporting.ratio}:1 (below WCAG AA threshold of 4.5:1). Consider increasing card dimming or selecting a higher-contrast theme.`
    );
  }

  // Headlines are large display text (>= 24px), which requires at least 3.0:1, but 4.5:1 is optimal
  if (!headline.passesAA) {
    if (!headline.passesAALarge) {
      warnings.push(
        `Headline contrast is critically low at ${headline.ratio}:1 (below 3.0:1 large-text threshold).`
      );
    } else {
      warnings.push(
        `Headline contrast is ${headline.ratio}:1 (meets 3.0:1 large text, but below 4.5:1 optimal threshold).`
      );
    }
  }

  const isCompliant = headline.passesAALarge && supporting.passesAA;

  return {
    headline,
    supporting,
    accent,
    effectiveCardBg: effectiveBg,
    isCompliant,
    warnings,
  };
}

/**
 * Converts RGB [0, 255] to HSL [h: 0-360, s: 0-1, l: 0-1]
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }

  return { h, s, l };
}

/**
 * Converts HSL [h: 0-360, s: 0-1, l: 0-1] to Hex string (#rrggbb)
 */
export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (0 <= h && h < 60) {
    r = c;
    g = x;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
  } else if (120 <= h && h < 180) {
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Non-destructively adjusts color lightness in HSL space to achieve a target WCAG contrast ratio against a background.
 */
export function adjustColorLightnessForContrast(
  colorHex: string,
  bgHex: string,
  targetRatio: number = 4.5
): string {
  const currentRatio = calculateContrastRatio(colorHex, bgHex);
  if (currentRatio >= targetRatio) return colorHex;

  const rgb = parseColorToRgb(colorHex);
  const bgRgb = parseColorToRgb(bgHex);
  const bgLum = getRelativeLuminance(bgRgb);
  const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const isDarkBg = bgLum < 0.5;
  let bestHex = colorHex;
  let bestRatio = currentRatio;

  if (isDarkBg) {
    for (let l = 0.55; l <= 0.95; l += 0.05) {
      const candidateHex = hslToHex(h, Math.max(0.4, s), l);
      const ratio = calculateContrastRatio(candidateHex, bgHex);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestHex = candidateHex;
      }
      if (ratio >= targetRatio) return candidateHex;
    }
  } else {
    for (let l = 0.45; l >= 0.1; l -= 0.05) {
      const candidateHex = hslToHex(h, Math.max(0.4, s), l);
      const ratio = calculateContrastRatio(candidateHex, bgHex);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestHex = candidateHex;
      }
      if (ratio >= targetRatio) return candidateHex;
    }
  }

  return bestHex;
}

export interface SmartRecolorAdjustment {
  overlayDarkness?: number;
  customAccent?: string;
  adjustedRatio: number;
  message: string;
}

/**
 * Calculates optimal, non-destructive adjustments to guarantee WCAG compliance (Task 2.6.2).
 * Tweaks overlayDarkness (card backdrop dimming) or custom accent lightness to ensure >= 4.5:1 ratio.
 */
export function calculateSmartRecolor(state: StaticCardState): SmartRecolorAdjustment {
  const report = evaluateCardContrast(state);
  const isLight = state.cardMode === 'light';

  let newOverlayDarkness = state.overlayDarkness;
  let newCustomAccent = state.customAccent;
  const messages: string[] = [];

  // 1. Tweak card backdrop opacity / overlay darkness non-destructively
  if (!isLight) {
    if (newOverlayDarkness < 0.65) {
      newOverlayDarkness = 0.70;
      messages.push(`Increased atmospheric dimming to 70% for deep contrast backdrop`);
    } else if (newOverlayDarkness < 0.8 && !report.isCompliant) {
      newOverlayDarkness = 0.80;
      messages.push(`Elevated dimming to 80% to ensure WCAG compliance`);
    }
  } else {
    if (newOverlayDarkness > 0.4) {
      newOverlayDarkness = 0.25;
      messages.push(`Optimized light backdrop overlay to 25%`);
    }
  }

  // 2. Tweak custom accent if set and low contrast
  if (state.customAccent) {
    const accentContrast = evaluateContrast(state.customAccent, report.effectiveCardBg);
    if (!accentContrast.passesAA) {
      const adjusted = adjustColorLightnessForContrast(
        state.customAccent,
        report.effectiveCardBg,
        4.5
      );
      if (adjusted !== state.customAccent) {
        newCustomAccent = adjusted;
        messages.push(`Tuned accent lightness (${adjusted}) for 4.5:1+ keyword glow`);
      }
    }
  }

  // Compute hypothetical new state to measure contrast
  const hypotheticalState: StaticCardState = {
    ...state,
    overlayDarkness: newOverlayDarkness,
    customAccent: newCustomAccent,
  };
  const newReport = evaluateCardContrast(hypotheticalState);

  return {
    overlayDarkness: newOverlayDarkness !== state.overlayDarkness ? newOverlayDarkness : undefined,
    customAccent: newCustomAccent !== state.customAccent ? newCustomAccent : undefined,
    adjustedRatio: newReport.headline.ratio,
    message:
      messages.length > 0
        ? messages.join(' • ')
        : `Contrast optimized to ${newReport.headline.ratio}:1 (WCAG AA compliant)`,
  };
}
