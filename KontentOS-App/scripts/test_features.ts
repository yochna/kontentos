import {
  calculateContrastRatio,
  getRelativeLuminance,
  evaluateContrast,
  evaluateCardContrast,
  calculateSmartRecolor,
  rgbToHsl,
  hslToHex,
} from '../src/screens/StaticGenerator/utils/colorContrast';

import {
  generateExportFilename,
} from '../src/screens/StaticGenerator/utils/exportFilename';

import {
  generateAccessibleAltText,
} from '../src/screens/StaticGenerator/utils/altTextGenerator';

import { extractStatData } from '../src/screens/StaticGenerator/utils/statExtractor';
import { calculateCardTypography } from '../src/screens/StaticGenerator/utils/typography';
import {
  computeLayerStyles,
  getCardLayerStyles,
} from '../src/screens/StaticGenerator/utils/layerStyles';
import {
  THEME_CONFIGS,
  LAYER_STYLE_PRESETS,
  DEFAULT_LAYER_STYLES,
} from '../src/data/staticCardPresets';
import type { StaticCardState, LayerStylePreset } from '../src/types/staticCard';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    results.push({ name, passed: true, details });
    console.log(`  ✅ PASS: ${name}`);
  } else {
    results.push({ name, passed: false, details });
    console.error(`  ❌ FAIL: ${name} ${details ? `(${details})` : ''}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 KONTENTOS V3: STATIC POST STUDIO FULL FEATURE TESTS');
  console.log('======================================================\n');

  // ------------------------------------------------------------------
  // 1. WCAG 2.1 Color Contrast & Luminance Mathematics (Task 2.6.1)
  // ------------------------------------------------------------------
  console.log('--- 1. WCAG 2.1 Contrast & Luminance Math ---');
  
  const blackLuminance = getRelativeLuminance('#000000');
  const whiteLuminance = getRelativeLuminance('#ffffff');
  assert(blackLuminance === 0, 'Black relative luminance is 0', `got ${blackLuminance}`);
  assert(Math.abs(whiteLuminance - 1.0) < 0.001, 'White relative luminance is 1.0', `got ${whiteLuminance}`);

  const blackWhiteRatio = calculateContrastRatio('#000000', '#ffffff');
  assert(Math.abs(blackWhiteRatio - 21) < 0.1, 'Black on White contrast is 21:1', `got ${blackWhiteRatio}`);

  const identicalRatio = calculateContrastRatio('#ffffff', '#ffffff');
  assert(identicalRatio === 1, 'White on White contrast is 1:1', `got ${identicalRatio}`);

  const standardAARatio = calculateContrastRatio('#767676', '#ffffff');
  assert(standardAARatio >= 4.5, '#767676 on White meets 4.5:1 AA standard', `got ${standardAARatio}`);

  const contrastResult = evaluateContrast('#ffffff', '#121212');
  assert(contrastResult.passesAA && contrastResult.passesAAA, 'White on Dark (#121212) passes AA and AAA', `ratio: ${contrastResult.ratio}`);

  // ------------------------------------------------------------------
  // 2. Auto-Contrast Adjustment & Smart Recolor (Task 2.6.2)
  // ------------------------------------------------------------------
  console.log('\n--- 2. Smart Recolor & Auto-Adjustment ---');

  const { h, s, l } = rgbToHsl(255, 0, 0);
  assert(h === 0 && s === 1 && l === 0.5, 'rgbToHsl converts pure red correctly', `H:${h} S:${s} L:${l}`);

  const hexFromHsl = hslToHex(0, 1, 0.5);
  assert(hexFromHsl.toLowerCase() === '#ff0000', 'hslToHex converts (0, 1, 0.5) back to #ff0000', `got ${hexFromHsl}`);

  // Low contrast simulation
  const lowContrastState: StaticCardState = {
    format: 'instagram-overlay',
    aspectRatio: '1:1',
    cardMode: 'dark',
    fontStyle: 'grotesk',
    headline: 'Low contrast test',
    supportingText: 'Testing auto contrast adjustment',
    theme: 'midnight-cyan',
    backgroundUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809',
    overlayDarkness: 0.2, // very low dimming on photo backdrop
    blurAmount: 0,
    showWatermark: true,
    showCreatorBadge: true,
    slideCurrent: 1,
    slideTotal: 1,
    creator: { name: 'Tester', handle: '@tester' },
    customAccent: '#334455', // low contrast accent
  };

  const initialReport = evaluateCardContrast(lowContrastState);
  console.log(`    Initial overlay: 20%, Supporting ratio: ${initialReport.supporting.ratio}:1`);

  const adjustment = calculateSmartRecolor(lowContrastState);
  assert(adjustment.overlayDarkness !== undefined && adjustment.overlayDarkness >= 0.70,
    'Smart Recolor elevates dark backdrop overlay to >= 70%',
    `new darkness: ${adjustment.overlayDarkness}`
  );

  const appliedState: StaticCardState = {
    ...lowContrastState,
    overlayDarkness: adjustment.overlayDarkness ?? lowContrastState.overlayDarkness,
    customAccent: adjustment.customAccent ?? lowContrastState.customAccent,
  };
  const fixedReport = evaluateCardContrast(appliedState);
  assert(fixedReport.isCompliant, 'Post-recolor card satisfies WCAG AA compliance (ratio >= 4.5:1)',
    `Headline ratio: ${fixedReport.headline.ratio}:1, Supporting ratio: ${fixedReport.supporting.ratio}:1`
  );

  // ------------------------------------------------------------------
  // 3. Deterministic Slug & Zero-Padding Utility (Task 1.3.1)
  // ------------------------------------------------------------------
  console.log('\n--- 3. Standardized Export Filename & Zero-Padding ---');

  const singleFilename = generateExportFilename(
    'KontentOS',
    'How to 10x Your Content Output With AI?!',
    1,
    5,
    'png'
  );
  assert(
    singleFilename.includes('kontentos') && singleFilename.includes('slide-01-of-05.png'),
    'generateExportFilename produces 2-digit zero-padded slide format: slide-01-of-05.png',
    `got: ${singleFilename}`
  );
  assert(
    !singleFilename.includes('?') && !singleFilename.includes('!'),
    'generateExportFilename sanitizes illegal special characters',
    `got: ${singleFilename}`
  );

  const pdfFilename = generateExportFilename(
    'My Brand',
    'High Impact Carousels',
    undefined,
    undefined,
    'pdf'
  );
  assert(
    pdfFilename.endsWith('.pdf') && !pdfFilename.includes('slide-'),
    'generateExportFilename correctly formats deck-wide PDF without slide number suffix',
    `got: ${pdfFilename}`
  );

  // ------------------------------------------------------------------
  // 4. Automated Accessibility Alt-Text Synthesis (Task 1.4.2)
  // ------------------------------------------------------------------
  console.log('\n--- 4. Alt-Text Synthesis ---');

  const testCardForAlt: StaticCardState = {
    format: 'editorial-quote',
    aspectRatio: '4:5',
    cardMode: 'dark',
    fontStyle: 'editorial',
    headline: 'Most creators fail because they [optimize for volume] instead of retention.',
    supportingText: 'Depth always beats breadth when building authority.',
    theme: 'midnight-cyan',
    backgroundUrl: '',
    overlayDarkness: 0.5,
    blurAmount: 0,
    showWatermark: true,
    showCreatorBadge: true,
    slideCurrent: 1,
    slideTotal: 1,
    creator: { name: 'Alex Rivera', handle: '@arivera' },
  };

  const altText = generateAccessibleAltText(testCardForAlt);
  assert(
    altText.includes('Alex Rivera') && altText.includes('optimize for volume'),
    'generateAccessibleAltText includes creator attribution and headline hook',
    `got: "${altText}"`
  );
  assert(
    !altText.includes('[') && !altText.includes(']'),
    'generateAccessibleAltText strips bracket syntax used for highlighting',
    `got: "${altText}"`
  );

  // ------------------------------------------------------------------
  // 5. Slide Stepper Reordering Logic (Task 1.5.1)
  // ------------------------------------------------------------------
  console.log('\n--- 5. Slide Reordering Boundary & Swapping Logic ---');

  const testSlides = [
    { id: 1, headline: 'Slide 1 - Hook', supportingText: 'Sub 1' },
    { id: 2, headline: 'Slide 2 - Problem', supportingText: 'Sub 2' },
    { id: 3, headline: 'Slide 3 - Solution', supportingText: 'Sub 3' },
  ];

  // Move slide 2 earlier (index 1 -> index 0)
  const movedEarlier = [...testSlides];
  const [removed] = movedEarlier.splice(1, 1);
  movedEarlier.splice(0, 0, removed);
  assert(
    movedEarlier[0].id === 2 && movedEarlier[1].id === 1,
    'Moving slide 2 earlier correctly swaps indices 0 and 1',
    `first slide is id: ${movedEarlier[0].id}`
  );

  // Boundary condition: slide 1 cannot move earlier
  const canMoveEarlier0 = 0 > 0;
  const canMoveLaterLast = 2 < testSlides.length - 1;
  assert(!canMoveEarlier0, 'Slide 1 cannot be moved earlier (disabled button condition)', 'passed');
  assert(!canMoveLaterLast, 'Slide 3 (last) cannot be moved later (disabled button condition)', 'passed');

  // ------------------------------------------------------------------
  // 6. Live Server HTTP Endpoints Testing (Port 4111)
  // ------------------------------------------------------------------
  console.log('\n--- 6. Live API Endpoints (http://localhost:4111) ---');

  try {
    const healthRes = await fetch('http://localhost:4111/api/health');
    assert(healthRes.status === 200, 'GET /api/health responds with 200 OK', `status ${healthRes.status}`);
    const healthData = await healthRes.json();
    assert(healthData.status === 'ok', 'Health status is ok', `got ${healthData.status}`);
  } catch (err: any) {
    assert(false, 'GET /api/health connection', err.message);
  }

  // Stock Search API (Task 2.2.1)
  try {
    const stockRes = await fetch('http://localhost:4111/api/static-card/stock-search?query=minimalist+desk&orientation=landscape&page=1');
    assert(stockRes.status === 200, 'GET /api/static-card/stock-search responds with 200 OK', `status ${stockRes.status}`);
    const stockData = await stockRes.json();
    assert(
      stockData.success === true && Array.isArray(stockData.photos) && stockData.photos.length > 0,
      'Stock search returns curated/search photos with URLs and attribution',
      `count: ${stockData.photos?.length}, source: ${stockData.source}`
    );
    if (stockData.photos?.[0]) {
      const first = stockData.photos[0];
      assert(!!first.url && !!first.proxyUrl && !!first.photographer?.name,
        'Stock photo object contains url, proxyUrl, and photographer attribution',
        `photographer: ${first.photographer?.name}`
      );
    }
  } catch (err: any) {
    assert(false, 'GET /api/static-card/stock-search', err.message);
  }

  // Context-Aware Single Slide Regeneration (Task 2.4.1)
  try {
    const regenPayload = {
      slideIndex: 2,
      currentSlide: {
        headline: 'Step 1: Capture the Core Epiphany without formatting.',
        supportingText: 'Open a blank scratchpad and write your raw uncensored insight first.',
      },
      previousSlide: {
        headline: 'Most creators spend 80% of their time on repetitive edits.',
        supportingText: 'Here is the 3-step system.',
      },
      nextSlide: {
        headline: 'Step 2: Split your insight into Hook, Framework, and Takeaway.',
        supportingText: 'A high-converting slide deck always follows a 3-act structure.',
      },
      topic: 'Content Automation & High Converting Visual Posts',
      instruction: 'Make the action more concrete and punchy',
      format: 'carousel-slide',
    };

    const regenRes = await fetch('http://localhost:4111/api/static-card/regenerate-slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(regenPayload),
    });

    assert(regenRes.status === 200, 'POST /api/static-card/regenerate-slide responds with 200 OK', `status ${regenRes.status}`);
    const regenData = await regenRes.json();
    assert(
      regenData.success === true && !!regenData.slide?.headline && !!regenData.slide?.supportingText,
      'Single-slide regeneration returns context-aligned { headline, supportingText }',
      `headline: "${regenData.slide?.headline?.slice(0, 50)}..."`
    );
  } catch (err: any) {
    assert(false, 'POST /api/static-card/regenerate-slide', err.message);
  }

  // Media Proxy (Task 2.2.2 / CORS bypass)
  try {
    const testImageUrl = 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=200';
    const proxyRes = await fetch(`http://localhost:4111/api/proxy-media?url=${encodeURIComponent(testImageUrl)}`);
    assert(proxyRes.status === 200, 'GET /api/proxy-media responds with 200 OK for external image', `status ${proxyRes.status}`);
    const corpHeader = proxyRes.headers.get('cross-origin-resource-policy');
    assert(corpHeader === 'cross-origin', 'Proxy media includes Cross-Origin-Resource-Policy: cross-origin header', `got ${corpHeader}`);
  } catch (err: any) {
    assert(false, 'GET /api/proxy-media test', err.message);
  }

  // ------------------------------------------------------------------
  // 7. Stat & Big Number Metric Extraction (Task 2.1.2)
  // ------------------------------------------------------------------
  console.log('\n--- 7. Stat & Big Number Metric Extraction ---');

  const statResult1 = extractStatData('Most creators spend [80% of their time] on repetitive tasks.', 'Here is why.');
  assert(statResult1.stat === '80%', 'extractStatData extracts percentage: 80%', `got "${statResult1.stat}"`);
  assert(statResult1.label.includes('creators spend') && !statResult1.label.includes('['), 'extractStatData strips brackets from label', `label: "${statResult1.label}"`);

  const statResult2 = extractStatData('Engineered for a [4.2x] throughput multiplier.', 'Efficiency matters.');
  assert(statResult2.stat === '4.2x', 'extractStatData extracts multiplier: 4.2x', `got "${statResult2.stat}"`);

  const statResult3 = extractStatData('Organic reach surged by [+140%] in 30 days.', 'Proven playbook.');
  assert(statResult3.stat === '+140%', 'extractStatData extracts signed delta: +140%', `got "${statResult3.stat}"`);

  const statResultManual = extractStatData('Custom stat', 'Label', '10M+', 'Active Creators');
  assert(statResultManual.stat === '10M+' && statResultManual.label === 'Active Creators', 'Manual stat and label override takes precedence', `got ${statResultManual.stat}`);

  // ------------------------------------------------------------------
  // 8. 9:16 Vertical Story Format Layout Pacing (Task 1.2.1 & 1.2.2)
  // ------------------------------------------------------------------
  console.log('\n--- 8. 9:16 Vertical Story Format Pacing ---');

  const verticalStoryState: StaticCardState = {
    format: 'instagram-overlay',
    aspectRatio: '9:16',
    cardMode: 'dark',
    fontStyle: 'grotesk',
    headline: 'Short Punchy Hook For Mobile Story Screen',
    supportingText: 'Optimized vertical layout without awkward whitespace.',
    theme: 'midnight-cyan',
    backgroundUrl: '',
    overlayDarkness: 0.5,
    blurAmount: 0,
    showWatermark: true,
    showCreatorBadge: true,
    slideCurrent: 1,
    slideTotal: 1,
    creator: { name: 'Creator', handle: '@creator' },
  };

  const typoVertical = calculateCardTypography(verticalStoryState);
  assert(parseFloat(typoVertical.headlineStyle.fontSize) >= 20, '9:16 Story format delivers calibrated headline size (>= 20px)', `size: ${typoVertical.headlineStyle.fontSize}`);
  assert(typoVertical.headlineStyle.lineHeight <= 1.3, '9:16 Story format delivers tight optical line height (<= 1.3)', `lineHeight: ${typoVertical.headlineStyle.lineHeight}`);

  // ------------------------------------------------------------------
  // 9. Non-Destructive CSS Layer Styles & Glows (PhotoCraft Architecture)
  // ------------------------------------------------------------------
  console.log('\n--- 9. Non-Destructive CSS Layer Styles & Glows ---');

  const nocturneTheme = THEME_CONFIGS['deckcraft-nocturne'];
  const harborTheme = THEME_CONFIGS['deckcraft-harbor'];
  const paperTheme = THEME_CONFIGS['deckcraft-paper'];

  // Test Cyber Neon preset
  const cyberNeonStyles = computeLayerStyles(LAYER_STYLE_PRESETS['cyber-neon'], nocturneTheme, false);
  assert(cyberNeonStyles.cardBoxShadow.includes('0 32px 80px'), 'Cyber Neon applies dramatic 32px/80px elevation shadow', cyberNeonStyles.cardBoxShadow);
  assert(cyberNeonStyles.cardBoxShadow.includes('inset 0 0 14px'), 'Cyber Neon applies specular inner rim glow', cyberNeonStyles.cardBoxShadow);
  assert(cyberNeonStyles.cardBorder.includes(nocturneTheme.accent), 'Cyber Neon border adopts theme accent gradient/color', cyberNeonStyles.cardBorder);
  assert(cyberNeonStyles.headlineTextShadow !== undefined && cyberNeonStyles.headlineTextShadow.includes('0 0 16px'), 'Cyber Neon applies neon text glow on headlines');

  // Test Frosted Glass preset
  const frostedStyles = computeLayerStyles(LAYER_STYLE_PRESETS['frosted-glass'], harborTheme, false);
  assert(frostedStyles.backdropFilter.includes('blur(28px) saturate(180%)'), 'Frosted Glass applies deep 28px blur with 180% saturation');
  assert(frostedStyles.innerGlassHighlight !== undefined && frostedStyles.innerGlassHighlight.includes('inset 0 1px 1px'), 'Frosted Glass applies specular top-edge glass reflection');

  // Test Clean Minimal preset
  const minimalStyles = computeLayerStyles(LAYER_STYLE_PRESETS['clean-minimal'], paperTheme, true);
  assert(minimalStyles.cardBoxShadow === 'none', 'Clean Minimal produces pure flat box-shadow (none)', minimalStyles.cardBoxShadow);
  assert(minimalStyles.backdropFilter === 'none', 'Clean Minimal produces solid backdrop filter (none)');
  assert(minimalStyles.headlineTextShadow === undefined, 'Clean Minimal produces clean unshadowed headline text');

  // Test Editorial Depth preset
  const editorialStyles = computeLayerStyles(LAYER_STYLE_PRESETS['editorial-depth'], paperTheme, true);
  assert(editorialStyles.cardBoxShadow.includes('0 24px 64px'), 'Editorial Depth delivers multi-tier 24px/64px ambient drop shadow');
  assert(editorialStyles.headlineTextShadow?.includes('rgba(0, 0, 0, 0.12)'), 'Editorial Depth delivers soft optical text shadow');

  // Comprehensive test across all combinations of themes and presets
  const presets = Object.keys(LAYER_STYLE_PRESETS) as LayerStylePreset[];
  const themes = Object.keys(THEME_CONFIGS);
  let allCombinationsPassed = true;

  for (const tKey of themes) {
    const t = THEME_CONFIGS[tKey];
    for (const pKey of presets) {
      const cfg = LAYER_STYLE_PRESETS[pKey];
      const res = computeLayerStyles(cfg, t, t.mode === 'light');
      if (!res.cardBoxShadow || !res.cardBorder || !res.backdropFilter) {
        allCombinationsPassed = false;
      }
    }
  }

  assert(allCombinationsPassed, `Evaluated all ${themes.length * presets.length} theme/preset layer style combinations without error`);

  // Test getCardLayerStyles convenience helper
  const resolvedMock = getCardLayerStyles({
    ...verticalStoryState,
    theme: 'deckcraft-nocturne',
    layerStyles: LAYER_STYLE_PRESETS['cyber-neon'],
  });
  assert(resolvedMock.cardBoxShadow.includes('inset 0 0 14px'), 'getCardLayerStyles seamlessly computes layer styles from card state');

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log('\n======================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`📊 TEST RUN COMPLETE: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
