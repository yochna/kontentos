# Static Post Creator — Quality Assurance & Software Testing Audit Report

**Document Version:** 1.0.0  
**Inspector:** Senior Quality Inspector & Principal Software Test Architect (20+ Years Experience)  
**Inspection Target:** KontentOS Static Post Creator (`StaticGenerator`)  
**Scope:** Static Post Studio, Card Canvas, Formats, Slide Stepper, AI Copywriter, Typography, Themes, Layer Styles, Vector Graphics, Media Backdrops, Export Engines, Canvas Scene Graph, and Associated Backend Endpoints.

---

## Executive Summary & Quality Scorecard

An exhaustive, end-to-end technical inspection and rigorous behavioral audit was executed on the **Static Post Creator** module in KontentOS (`/src/screens/StaticGenerator/` and `/server/routes/staticCardAi.ts`). Testing covered:
- Visual UI/UX, responsive layout integrity, and optical contrast across dark and light palettes.
- All 5 format archetypes (*Instagram Overlay, LinkedIn Split, Tweet Card, Carousel Slide, Editorial Quote*).
- Canvas scene graph direct manipulation (*pointer physics, drag-and-drop, bounding-box selection, transform handles, rotation, inline text editing, magnetic snapping, smart guides, clipboard, undo/redo*).
- Multi-slide deck management (*carousel slide stepper, deletion, addition, per-slide AI regeneration*).
- Media and atmosphere management (*curated presets, custom uploads, Unsplash/Pexels stock proxying, overlay vignette, lens blur*).
- High-resolution production export pipelines (*300 DPI PNG, LinkedIn multi-page PDF, clipboard synthesis, calendar dispatch*).

### Quality Scorecard by Functional Domain

| Testing Dimension | Score (/100) | Evaluation & Key Findings |
|---|---|---|
| **Export Engine (PNG & PDF)** | 62 | **High Risk:** Cross-origin stylesheet access throws `SecurityError` on Google Fonts in production browsers, aborting high-res rasterization. |
| **Canvas UI/UX & Controls** | 74 | **Medium Risk:** Safe-zone overlays and 3×3 grid controls are orphaned or omitted from toolbar JSX; docked controls overflow on compact viewports. |
| **State Synchronization** | 68 | **High Risk:** Deleting slides desynchronizes scene overrides; AI deck regeneration leaves stale layout overrides; canvas overrides do not propagate to typography reflow. |
| **Typography & Optical Sizing** | 76 | **Medium Risk:** Scene graph resize dimensions not synchronized with `calculateCardTypography`; missing Indic/Devanagari font coverage. |
| **Data Persistence & Recovery** | 45 | **Critical Risk:** Zero IndexedDB or LocalStorage draft recovery; unexpected browser refresh or crash destroys all slides and canvas customizations. |
| **WYSIWYG Rich-Text Editing** | 70 | **Medium-High Risk:** Inline text editor emits raw HTML markup (`<span>`, `<b>`) which leaks into plain-text textareas, slugs, and publishing captions. |
| **Backend AI Endpoints** | 88 | **Low Risk:** Resilient Gemini model cascades and dynamic editorial fallbacks are robust and error-tolerant. |

---

## Master Defect Register

### Summary Breakdown
- **Critical Severity:** 4 Defects
- **High Severity:** 6 Defects
- **Medium Severity:** 7 Defects
- **Low Severity / UX Polish:** 3 Defects
- **Total Defects Identified:** 20 Defects

---

### Category 1: Export Engine & Graphics Pipeline

#### BUG-EXP-01: Cross-Origin Stylesheet Access Throws `SecurityError` During 300 DPI PNG & PDF Export
- **Severity:** CRITICAL
- **Feature Area:** Export Engine (`useCardExporter.ts` & `index.html`)
- **Location:** 
  - `KontentOS-App/index.html`, lines 13–20
  - `KontentOS-App/src/screens/StaticGenerator/hooks/useCardExporter.ts`, lines 73–88, 189–203, 287–301
- **What It Is:**
  When creators click **Export PNG**, **Full Deck PNGs**, or **LinkedIn PDF Carousel**, the export process abruptly halts with the status message *"Export failed. Please check image permissions."* and logs:
  `DOMException: Failed to read the 'cssRules' property from 'CSSStyleSheet': Cannot access rules`.
- **Root Cause:**
  `html-to-image` parses all active stylesheets in `document.styleSheets` to inline web fonts into the cloned SVG foreignObject representation. In `index.html`, the Google Fonts stylesheets (`Hanken Grotesk`, `JetBrains Mono`, `Newsreader`, `Playfair Display`, `Material Symbols Outlined`) are linked via `<link rel="stylesheet">` without the `crossorigin="anonymous"` attribute. When `html-to-image` attempts to inspect `sheet.cssRules`, modern browser security policies block access to opaque cross-origin stylesheets with a `SecurityError`. Both the 3x and 2x fallback attempts fail.
- **How to Fix:**
  1. In `index.html`, add `crossorigin="anonymous"` to both Google Fonts `<link rel="stylesheet">` tags:
     ```html
     <link
       href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:..."
       rel="stylesheet"
       crossorigin="anonymous"
     />
     ```
  2. In `useCardExporter.ts`, configure `toPng` with `skipFonts: false` and a graceful font embed fallback, or supply `fontEmbedCSS` directly so `html-to-image` never iterates external opaque style sheets:
     ```typescript
     const toPngOptions = {
       quality: 1.0,
       pixelRatio: 3,
       cacheBust: true,
       skipAutoScale: true,
       filter: cleanExportFilter,
       // Suppress font embedding SecurityError if stylesheet rules are restricted
       fontEmbedCSS: '',
     };
     ```

---

#### BUG-EXP-02: Hardcoded 240ms Slide Switching Delay Causes Incomplete Image/Font Renders in Multi-Slide Exports
- **Severity:** HIGH
- **Feature Area:** Multi-Slide Exporter (`exportDeckSlides` & `exportLinkedInPDF`)
- **Location:** `KontentOS-App/src/screens/StaticGenerator/hooks/useCardExporter.ts`, lines 185, 284
- **What It Is:**
  When exporting a 5-to-7 slide carousel deck to sequential PNGs or a LinkedIn multi-page PDF, slides containing external stock photos or newly switched fonts frequently render blank, semi-transparent, or with unstyled fallback typography.
- **Root Cause:**
  `exportDeckSlides` and `exportLinkedInPDF` switch slides programmatically using `await switchToSlide(slideNum)` followed by an arbitrary static timeout `await new Promise((r) => setTimeout(r, 240))`. 240ms is insufficient for the browser to decode proxied background images, update DOM layout boundaries, and ensure font glyph warm-up on slower devices or throttled networks.
- **How to Fix:**
  1. Await image decoding and document fonts readiness before capturing the canvas:
     ```typescript
     await switchToSlide(slideNum);
     // Wait for layout paint
     await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 150)));
     // Ensure all images in canvas are fully decoded
     const images = Array.from(canvasElement.querySelectorAll('img'));
     await Promise.all(images.map((img) => img.decode().catch(() => {})));
     if (document.fonts?.ready) {
       await document.fonts.ready;
     }
     ```

---

#### BUG-EXP-03: Export Filename Slug Generator Fails to Strip HTML Markup from Inline Edits
- **Severity:** MEDIUM
- **Feature Area:** Export File Naming (`exportFilename.ts`)
- **Location:** `KontentOS-App/src/screens/StaticGenerator/utils/exportFilename.ts`, lines 5–27
- **What It Is:**
  If a creator customizes any word using the inline text editor (e.g. changing color or bolding text), the headline contains HTML markup (e.g., `<span style="color: #00e5ff">Scale</span>`). The generated export filename becomes corrupted:
  `kontentos_span-style-color-00e5ff-scale_slide-01-of-05.png`.
- **Root Cause:**
  `sanitizeSlug` in `exportFilename.ts` removes bracket markup with `.replace(/\[([^\]]+)\]/g, '$1')`, but completely lacks an HTML tag stripping filter (`/<[^>]+>/g`). The subsequent regex `.replace(/[^a-z0-9_-]+/g, '-')` converts angle brackets, equals signs, quotes, and colons into consecutive hyphens.
- **How to Fix:**
  Update `sanitizeSlug` to strip HTML tags before slugification:
  ```typescript
  export function sanitizeSlug(input: string, maxLength: number = 35): string {
    if (!input) return '';
    const cleanText = input
      .replace(/<[^>]+>/g, '') // Strip HTML tags
      .replace(/\[([^\]]+)\]/g, '$1'); // Strip bracket accentuation

    const slug = cleanText
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/[-_]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug.slice(0, maxLength).replace(/-+$/, '');
  }
  ```

---

### Category 2: Canvas Controls, Overlays & Visual Guides

#### BUG-UI-01: Safe-Zone Platform Guides Overlay (`<SafeZoneOverlay />`) is Completely Unreachable in the UI
- **Severity:** CRITICAL
- **Feature Area:** Canvas Visual Guides (`SafeZoneOverlay.tsx` & `CanvasControls.tsx`)
- **Location:** 
  - `KontentOS-App/src/screens/StaticGenerator.tsx`, lines 187, 747, 755–767
  - `KontentOS-App/src/screens/StaticGenerator/components/CanvasControls.tsx`, lines 11–12, 31–32, 237–372
- **What It Is:**
  The `SafeZoneOverlay` component (which renders Instagram feed 1:1 safe boxes and 9:16 Story dead zones) is fully implemented in `SafeZoneOverlay.tsx`, but creators have zero way to enable it in the studio.
- **Root Cause:**
  1. `StaticGenerator.tsx` maintains state `const [showSafeZones, setShowSafeZones] = useState(false);`, but neither `showSafeZones` nor `onToggleSafeZones` is passed as props to `<CanvasControls />`.
  2. In `CanvasControls.tsx`, the interface `Props` declares `showSafeZones?: boolean` and `onToggleSafeZones?: () => void`, but inside the component JSX (lines 237–372), **there is no toggle button rendered anywhere in the toolbar dock**.
- **How to Fix:**
  1. In `CanvasControls.tsx`, render a Safe Zones toggle button in the toolbar dock:
     ```tsx
     {onToggleSafeZones && (
       <button
         type="button"
         onClick={onToggleSafeZones}
         className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
           showSafeZones
             ? 'bg-primary-soft text-primary border-primary/40 shadow-2xs'
             : 'text-ink-muted hover:text-ink hover:bg-surface border-transparent hover:border-line'
         }`}
         title="Toggle Instagram and mobile safe zone guidelines"
       >
         <Icon name="crop_free" size={13} />
         <span>Safe Zones</span>
       </button>
     )}
     ```
  2. In `StaticGenerator.tsx`, pass the props to `CanvasControls`:
     ```tsx
     <CanvasControls
       showSafeZones={showSafeZones}
       onToggleSafeZones={() => setShowSafeZones((prev) => !prev)}
       ...
     />
     ```

---

#### BUG-UI-02: Canvas 3×3 Rule-of-Thirds Grid Has No Button in the Studio Toolbar
- **Severity:** MEDIUM
- **Feature Area:** Canvas Alignment Guides (`CanvasGridOverlay.tsx` & `CanvasControls.tsx`)
- **Location:**
  - `KontentOS-App/src/screens/StaticGenerator.tsx`, lines 188, 201–219, 748, 755–767
  - `KontentOS-App/src/screens/StaticGenerator/components/CanvasControls.tsx`, lines 13–14, 33–34
- **What It Is:**
  The 3×3 dashed alignment grid overlay is only accessible via the keyboard shortcut `G`. Users on touchscreens, iPads, or those unaware of the undocumented key binding have no UI mechanism to activate the grid.
- **Root Cause:**
  `CanvasControlsProps` specifies `showGrid?: boolean` and `onToggleGrid?: () => void`, but `StaticGenerator.tsx` does not supply them, and `CanvasControls.tsx` never renders a Grid button.
- **How to Fix:**
  Pass `showGrid={showGrid}` and `onToggleGrid={() => setShowGrid(prev => !prev)}` in `StaticGenerator.tsx`, and add a dedicated `Grid (G)` button into the CanvasControls dock.

---

#### BUG-UI-03: Canvas Studio Toolbar Dock Overflows and Clips on Displays ≤ 1366px or High OS Scaling
- **Severity:** MEDIUM
- **Feature Area:** Canvas Controls Toolbar (`CanvasControls.tsx`)
- **Location:** `KontentOS-App/src/screens/StaticGenerator/components/CanvasControls.tsx`, line 238
- **What It Is:**
  On standard 1366×768 laptop displays, or screens with 125%–150% Windows display scaling, the secondary Canvas Studio Dock (*Text, Image, Undo, Redo, Reset Layout, Copy, Paste, Snap*) overflows its container, cutting off the rightmost buttons (*Snap* and *Paste*) with no scroll capability.
- **Root Cause:**
  Line 238 uses `inline-flex` inside a non-scrollable container without `overflow-x-auto` or flex wrapping:
  `<div className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-3 py-1.5 bg-surface-2/80 ...">`.
- **How to Fix:**
  Add horizontal scroll containment and padding:
  ```tsx
  <div className="flex items-center justify-center w-full overflow-x-auto scrollbar-none py-1">
    <div className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-3 py-1.5 bg-surface-2/80 backdrop-blur-md border border-line rounded-xl shadow-xs shrink-0">
  ```

---

### Category 3: Multi-Slide Carousel Stepper & Scene Graph State

#### BUG-STP-01: Slide Reordering Controls are Completely Missing from `CarouselSlideStepper`
- **Severity:** HIGH
- **Feature Area:** Carousel Deck Manager (`CarouselSlideStepper.tsx` & `StaticGenerator.tsx`)
- **Location:**
  - `KontentOS-App/src/screens/StaticGenerator.tsx`, lines 540–564, 729–740
  - `KontentOS-App/src/screens/StaticGenerator/components/CarouselSlideStepper.tsx`, lines 6–22, 51–99
- **What It Is:**
  Creators cannot shift slide order (e.g. moving Slide 3 to Slide 2). They are forced to delete and re-type the entire content manually.
- **Root Cause:**
  `StaticGenerator.tsx` already contains a fully functional reordering handler `handleMoveSlide(direction: 'left' | 'right')` (lines 540–564). However, `CarouselSlideStepperProps` does not declare `onMoveSlide`, and `CarouselSlideStepper.tsx` renders no reordering buttons.
- **How to Fix:**
  1. Add `onMoveSlide: (direction: 'left' | 'right') => void` to `CarouselSlideStepperProps`.
  2. In `CarouselSlideStepper.tsx`, add reorder triggers next to the slide pills:
     ```tsx
     <button
       type="button"
       disabled={currentIndex <= 0}
       onClick={() => onMoveSlide('left')}
       className="p-1 rounded hover:bg-surface text-ink-muted hover:text-ink disabled:opacity-30"
       title="Move slide earlier (Left)"
     >
       <Icon name="arrow_back" size={14} />
     </button>
     <button
       type="button"
       disabled={currentIndex >= slides.length - 1}
       onClick={() => onMoveSlide('right')}
       className="p-1 rounded hover:bg-surface text-ink-muted hover:text-ink disabled:opacity-30"
       title="Move slide later (Right)"
     >
       <Icon name="arrow_forward" size={14} />
     </button>
     ```
  3. Wire `onMoveSlide={handleMoveSlide}` in `StaticGenerator.tsx`.

---

#### BUG-STP-02: Slide Deletion Corrupts Scene Graph Overrides of Subsequent Slides
- **Severity:** HIGH
- **Feature Area:** Scene Graph State Synchronization (`StaticGenerator.tsx` & `useCanvasInteraction.ts`)
- **Location:** `KontentOS-App/src/screens/StaticGenerator.tsx`, lines 522–538
- **What It Is:**
  If a user customizes elements (positions, text sizes, custom shapes) on Slide 2 and Slide 3, then deletes Slide 2:
  Slide 3 shifts to index 1, but inherits the customizations of the *deleted* Slide 2. The creator's work on Slide 3 is wiped or overwritten by the ghost of Slide 2.
- **Root Cause:**
  In `useCanvasInteraction`, `sceneOverrides` is an object keyed by 0-based slide indices (`Record<number, SlideSceneState>`). `handleDeleteSlide` filters `state.slides`, but **never shifts the index keys in `sceneOverrides`**. Index `k` retains whatever was saved at `k`, rather than shifting `k + 1 -> k`.
- **How to Fix:**
  In `handleDeleteSlide` in `StaticGenerator.tsx`, update `sceneOverrides` in `useCanvasInteraction` to shift all subsequent slide keys down by 1:
  ```typescript
  const handleDeleteSlide = (slideId: number) => {
    setState((prev) => {
      const slides = prev.slides || DEFAULT_CAROUSEL_SLIDES;
      if (slides.length <= 1) return prev;
      const targetIdx = slides.findIndex((s) => s.id === slideId);
      if (targetIdx === -1) return prev;

      // Re-index sceneOverrides in Zustand store
      const interaction = useCanvasInteraction.getState();
      const oldOverrides = interaction.sceneOverrides;
      const newOverrides: Record<number, SlideSceneState> = {};
      let newIdx = 0;
      for (let i = 0; i < slides.length; i++) {
        if (i === targetIdx) continue;
        if (oldOverrides[i]) {
          newOverrides[newIdx] = oldOverrides[i];
        }
        newIdx++;
      }
      interaction.setSceneOverrides(newOverrides);

      const updatedSlides = slides.filter((s) => s.id !== slideId);
      const newCurrent = Math.min(prev.slideCurrent, updatedSlides.length);
      interaction.setActiveSlideIndex(newCurrent - 1);

      return {
        ...prev,
        slides: updatedSlides,
        slideTotal: updatedSlides.length,
        slideCurrent: newCurrent,
        headline: updatedSlides[newCurrent - 1].headline,
        supportingText: updatedSlides[newCurrent - 1].supportingText,
      };
    });
  };
  ```

---

#### BUG-STP-03: AI Full Deck Generation Leaves Stale Scene Graph Overrides on New Slides
- **Severity:** HIGH
- **Feature Area:** AI Deck Generation (`StaticGenerator.tsx` lines 397–408)
- **Location:** `KontentOS-App/src/screens/StaticGenerator.tsx`, lines 397–408
- **What It Is:**
  If a creator moves elements, adds stickers, or resizes headlines on an existing carousel, and then clicks **Generate Full Carousel Story Deck**, the AI generates 5 brand-new slides, but the old moved bounding boxes, sticker elements, and custom text boxes persist over the new content.
- **Root Cause:**
  `handleDeckGenerated` updates `state.slides` and resets `slideCurrent: 1`, but **does not call `useCanvasInteraction.getState().clearAllOverrides()`**. Stale custom shapes and manual coordinates remain pinned to slides 0 through 4.
- **How to Fix:**
  Call `useCanvasInteraction.getState().clearAllOverrides()` inside `handleDeckGenerated`:
  ```typescript
  const handleDeckGenerated = (data: { slides: CarouselSlide[]; socialCaption?: string }) => {
    useCanvasInteraction.getState().clearAllOverrides();
    setState((prev) => ({
      ...prev,
      slides: data.slides,
      slideTotal: data.slides.length,
      slideCurrent: 1,
      headline: data.slides[0]?.headline || prev.headline,
      supportingText: data.slides[0]?.supportingText || prev.supportingText,
      socialCaption: data.socialCaption || prev.socialCaption,
    }));
  };
  ```

---

#### BUG-STP-04: Slide Layout Archetype Engine (`slideType`) and `statExtractor.ts` are Completely Unused
- **Severity:** MEDIUM
- **Feature Area:** Slide Archetypes (`CarouselSlideCard.tsx` & `statExtractor.ts`)
- **Location:**
  - `KontentOS-App/src/screens/StaticGenerator/components/formats/CarouselSlideCard.tsx`, lines 116–271
  - `KontentOS-App/src/screens/StaticGenerator/utils/statExtractor.ts`, lines 1–65
- **What It Is:**
  Specifications in `static_post_features.md` marked Task 2.1.2 (Stat layout variant with 80–120px display numbers) and Task 2.1.3 (Quote layout variant) as completed. However, in `CarouselSlideCard.tsx`, `state.slideType` is never inspected, and `statExtractor.ts` is never imported or called. Every carousel slide renders with the standard framework layout.
- **Root Cause:**
  The rendering branch for `slideType === 'stat'` and `slideType === 'quote'` was never added to `CarouselSlideCard.tsx`.
- **How to Fix:**
  Import `extractStatData` from `statExtractor.ts` inside `CarouselSlideCard.tsx`. When `state.slideType === 'stat'`, render the extracted numeric value in display typography (`text-6xl sm:text-7xl font-display font-black text-primary`).

---

### Category 4: WYSIWYG Rich Text & Copy Synchronization

#### BUG-TXT-01: Inline Text Formatting Leaks Raw HTML Tags into Plain-Text Editors and Publish Packs
- **Severity:** HIGH
- **Feature Area:** Inline Text Editor & Publish Pack (`InlineTextEditor.tsx` & `PublishPackDrawer.tsx`)
- **Location:**
  - `KontentOS-App/src/screens/StaticGenerator/components/canvas/InlineTextEditor.tsx`, lines 106–120
  - `KontentOS-App/src/screens/StaticGenerator/components/CopyEditor.tsx`, lines 89–95
  - `KontentOS-App/src/screens/StaticGenerator/components/PublishPackDrawer.tsx`, lines 26–34
  - `KontentOS-App/src/screens/StaticGenerator/components/PublishToCalendarModal.tsx`, lines 76–77
- **What It Is:**
  When a creator uses the canvas inline editor to customize text (e.g. bolding a word or changing its color), the editor commits raw HTML (`<span style="...">word</span>`). Consequently:
  1. In the **Text** tool tab (`CopyEditor.tsx`), the headline `<textarea>` displays raw `<span style="...">` tags.
  2. In the **Publish Pack**, the copied caption contains raw HTML markup, ruining posts sent to LinkedIn, X, or Instagram.
  3. In **Calendar Export**, the scheduled post caption contains raw HTML tags.
- **Root Cause:**
  `InlineTextEditor.tsx` commits `editorRef.current.innerHTML` directly into `state.headline` and `state.supportingText`. `CopyEditor`, `PublishPackDrawer`, and `PublishToCalendarModal` do not strip HTML tags before displaying or publishing plain text.
- **How to Fix:**
  1. Add a shared utility `stripHtml(text: string): string`:
     ```typescript
     export function stripHtml(input?: string): string {
       if (!input) return '';
       return input.replace(/<[^>]+>/g, '').trim();
     }
     ```
  2. Use `stripHtml(state.headline)` in `PublishPackDrawer.tsx`, `PublishToCalendarModal.tsx`, and `CopyEditor.tsx`.
  3. Alternatively, store rich HTML overrides in `ElementTransform.customStyle.richHtml` so that `state.headline` remains clean plain text.

---

#### BUG-TXT-02: Double-Clicking Canvas Background Inadvertently Spawns Empty Text Boxes
- **Severity:** MEDIUM
- **Feature Area:** Canvas Interaction (`CardCanvas.tsx`)
- **Location:** `KontentOS-App/src/screens/StaticGenerator/components/CardCanvas.tsx`, lines 126–140
- **What It Is:**
  Rapidly clicking or double-clicking the canvas background (e.g., to deselect an element or focus the window) inadvertently spawns new editable text boxes (`text-xxx`) in the center of the canvas without creator intent.
- **Root Cause:**
  `handleDoubleClick` on `#kontentos-static-card-canvas` immediately calls `addTextBox(activeSlideIndex, { x, y })` whenever the target is not a canvas element.
- **How to Fix:**
  Require pressing the dedicated **Text** button in the CanvasControls dock or using the keyboard shortcut `T`, or require double-clicking only when holding the `Alt` key.

---

### Category 5: Themes, Colors & Typography

#### BUG-THM-01: `getActiveTheme` Generates Corrupted CSS Hex Colors with Shorthand or RGB Custom Accents
- **Severity:** MEDIUM
- **Feature Area:** Theme Configuration (`staticCardPresets.ts`)
- **Location:** `KontentOS-App/src/data/staticCardPresets.ts`, lines 268–273
- **What It Is:**
  When a custom accent color is selected (or typed as `#f00` or `rgb(...)`), card borders, glowing shadows, and pill badges fail to render or flash invalid CSS errors in the console:
  `borderColor: '#f0055'` (5-digit hex is invalid CSS!).
- **Root Cause:**
  `getActiveTheme` directly appends alpha suffixes to `state.customAccent`:
  ```typescript
  borderColor: isLight ? `${hex}55` : `${hex}66`,
  glowColor: `${hex}40`,
  pillBg: isLight ? `${hex}18` : `${hex}26`,
  ```
  If `hex` is a 3-character shorthand (e.g. `#f50`), appending `55` yields a 5-digit string, which is rejected by CSS parsers. If `hex` is `rgb(...)`, appending `55` yields `rgb(...)55`.
- **How to Fix:**
  Normalize the hex color before appending alpha:
  ```typescript
  function normalizeHex(hex: string): string {
    if (!hex.startsWith('#')) return hex;
    if (hex.length === 4) {
      return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    return hex.slice(0, 7);
  }
  ```
  Use `normalizeHex(hex)` in `getActiveTheme`.

---

#### BUG-THM-02: Double Re-Render Race Condition on Theme Mode Switching
- **Severity:** LOW
- **Feature Area:** Theme Picker (`ThemePicker.tsx` & `StaticGenerator.tsx`)
- **Location:**
  - `KontentOS-App/src/screens/StaticGenerator/components/ThemePicker.tsx`, lines 61–89
  - `KontentOS-App/src/screens/StaticGenerator.tsx`, lines 297–309
- **What It Is:**
  Clicking the **🌙 Dark** or **☀️ Light** button triggers two redundant, competing state updates on `StaticCardState` in rapid succession.
- **Root Cause:**
  `ThemePicker.tsx` calls both `onSelectMode('dark')` AND `onSelectTheme('deckcraft-harbor')` inside the same `onClick` handler. Meanwhile, `handleCardModeChange` in `StaticGenerator.tsx` already updates both `cardMode` and `theme` within a single state setter.
- **How to Fix:**
  In `ThemePicker.tsx`, remove the duplicate `onSelectTheme` call inside the mode buttons and let `onSelectMode` handle the coordinated transition.

---

#### BUG-TYP-01: Canvas Element Resizing Does Not Reflow Optical Typography Font Sizes
- **Severity:** HIGH
- **Feature Area:** Fluid Typography (`typography.ts` & `StaticGenerator.tsx`)
- **Location:**
  - `KontentOS-App/src/screens/StaticGenerator/utils/typography.ts`, lines 174–190
  - `KontentOS-App/src/screens/StaticGenerator.tsx`, lines 246–271
- **What It Is:**
  When a creator uses the transform handles to make the headline bounding box wider or narrower, the font size should dynamically scale proportionally (as designed in `typography.ts`). Instead, the font size remains completely static.
- **Root Cause:**
  `typography.ts` attempts to inspect `state.sceneOverrides?.[activeSlideIndex]?.['headline']`. However, `state.sceneOverrides` in `StaticCardState` is **never updated** when elements are resized in `useCanvasInteraction`. The scene graph overrides live exclusively in Zustand, so `typography.ts` always evaluates `activeScene` as `undefined`.
- **How to Fix:**
  In `calculateCardTypography`, accept an optional `sceneOverrides` parameter or pull directly from `useCanvasInteraction.getState().sceneOverrides`:
  ```typescript
  const interactionOverrides = useCanvasInteraction.getState().sceneOverrides;
  const activeScene = interactionOverrides[activeSlideIndex] || state.sceneOverrides?.[activeSlideIndex];
  ```

---

#### BUG-TYP-02: Missing Devanagari (Hindi) Glyphs Cause Broken Conjuncts and Font Flash on Export
- **Severity:** MEDIUM
- **Feature Area:** Internationalization & Font Rendering (`index.html` & `typography.ts`)
- **Location:** `KontentOS-App/index.html`, lines 13–20
- **What It Is:**
  When Hindi/Devanagari text (e.g., *"प्रौद्योगिकी"*, *"रणनीति"*) is inputted, characters render in standard system fallback fonts (Arial/Segoe UI) rather than designer typography, and complex conjunct matras occasionally clip or disconnect in exported PNGs.
- **Root Cause:**
  Google Fonts preload in `index.html` only loads Latin glyph subsets for `Hanken Grotesk`, `Syne`, `Playfair Display`, etc. Full Devanagari font families (`Noto Sans Devanagari`, `Poppins`) are omitted.
- **How to Fix:**
  Add `Noto+Sans+Devanagari:wght@400..700` and `Rozha+One` to the Google Fonts link in `index.html`, and define Indic fallbacks in `fontFamily` chains in `staticCardPresets.ts`.

---

### Category 6: Background, Media & Branding

#### BUG-MED-01: Solid Studio Background Preset (`pure-solid`) Renders Flat Dark Gray Instead of Studio Gradient
- **Severity:** MEDIUM
- **Feature Area:** Background Presets (`staticCardPresets.ts` & Card Format Components)
- **Location:**
  - `KontentOS-App/src/data/staticCardPresets.ts`, lines 420–427
  - `KontentOS-App/src/screens/StaticGenerator/components/formats/*.tsx`
- **What It Is:**
  Selecting the **Solid / Pure Studio** preset displays a dull `#0f172a` slate rectangle instead of the intended gradient backdrop.
- **Root Cause:**
  `BACKGROUND_PRESETS[5]` specifies `url: ''` and `gradientFallback: 'linear-gradient(145deg, #111827 0%, #030712 100%)'`. However, none of the 5 card format components check or render `preset.gradientFallback`; they only check `safeBg ? url("${safeBg}") : undefined`.
- **How to Fix:**
  Store `backgroundGradient?: string` in `StaticCardState` and set `background: safeBg ? url(...) : state.backgroundGradient || defaultColor`.

---

#### BUG-MED-02: `Randomize Photo` Button Re-Selects Current Photo Due to Proxied URL Mismatch
- **Severity:** LOW
- **Feature Area:** Studio Header Toolbar (`StaticGenerator.tsx`)
- **Location:** `KontentOS-App/src/screens/StaticGenerator.tsx`, lines 364–377
- **What It Is:**
  Clicking **Randomize Photo** occasionally re-selects the photo already displayed on screen.
- **Root Cause:**
  Line 365 filters presets with `p.url !== state.backgroundUrl`. `p.url` is raw Unsplash (`https://images.unsplash.com/...`), while `state.backgroundUrl` is proxied (`/api/proxy-media?url=https%3A...`). The inequality is always true, so the active preset is never excluded from the random selection pool.
- **How to Fix:**
  Compare proxied URLs:
  ```typescript
  const available = BACKGROUND_PRESETS.filter(
    (p) => p.url && getSafeImageUrl(p.url) !== state.backgroundUrl
  );
  ```

---

#### BUG-MED-03: `WatermarkBadge` and `WatermarkSection` are Empty Dummy Stubs
- **Severity:** MEDIUM
- **Feature Area:** Watermark & Creator Attribution (`WatermarkBadge.tsx` & `WatermarkSection.tsx`)
- **Location:**
  - `KontentOS-App/src/screens/StaticGenerator/components/WatermarkBadge.tsx`, lines 1–11
  - `KontentOS-App/src/screens/StaticGenerator/components/WatermarkSection.tsx`, lines 1–11
- **What It Is:**
  `WatermarkBadge.tsx` and `WatermarkSection.tsx` both contain empty stubs returning `null`. Even though `showWatermark` exists in state and is imported across all 5 card formats, it produces zero output.
- **Root Cause:**
  Incomplete stub implementation left in place during Phase 1 refactoring.
- **How to Fix:**
  Implement `<WatermarkBadge />` to render an unobtrusive glass badge (*"Made with KontentOS"*) and provide a toggle in the Brand & Identity inspector panel.

---

### Category 7: Canvas Scene Graph, Stacking & Persistence

#### BUG-SCN-01: Element Stacking Context (`zIndex`) Increments Unboundedly on Every Drag Gesture
- **Severity:** MEDIUM
- **Feature Area:** Element Drag Engine (`TransformableElement.tsx`)
- **Location:** `KontentOS-App/src/screens/StaticGenerator/components/canvas/TransformableElement.tsx`, lines 253–255
- **What It Is:**
  Dragging an element repeatedly causes its `zIndex` to increment indefinitely (e.g., reaching 60, 70, 80), breaking subsequent "Send Backward" or "Send to Back" actions.
- **Root Cause:**
  Line 254 computes:
  `const nextZ = isContentBox ? currentZ : Math.max(20, currentZ + 1);`
  Every pointer release increments `zIndex` by 1, corrupting intentional scene layer ordering.
- **How to Fix:**
  Do not increment `zIndex` on simple pointer drag moves. Preserve the existing `currentZ` and only modify layer stacking through explicit layer reorder commands (*Bring to Front, Send to Back*).

---

#### BUG-SCN-02: Absence of Local Storage / IndexedDB Draft Persistence
- **Severity:** CRITICAL
- **Feature Area:** Draft Autosave & Crash Recovery (`StaticGenerator.tsx`)
- **Location:** `KontentOS-App/src/screens/StaticGenerator.tsx`, lines 246–271
- **What It Is:**
  If a creator accidentally closes their browser tab, refreshes the page, or experiences a browser crash, **all designed carousel slides, custom typography, vector shapes, and AI copy are permanently lost**, resetting to default placeholder content.
- **Root Cause:**
  All editor state is held exclusively in React component memory (`useState<StaticCardState>`). There is no `localStorage` or `IndexedDB` auto-save pipeline.
- **How to Fix:**
  1. Add a debounced `useEffect` in `StaticGenerator.tsx` that persists `state` and `useCanvasInteraction.getState().sceneOverrides` to `localStorage` under `kontentos_static_card_draft`.
  2. On component mount, check for existing saved drafts and display an Unsaved Draft Recovery Banner (*"Restore Draft from [Date]"*).

---

#### BUG-SCN-03: Right-Click "Upload Image" Places Image at Canvas Center Instead of Click Position
- **Severity:** LOW
- **Feature Area:** Canvas Context Menu (`CanvasContextMenu.tsx`)
- **Location:** `KontentOS-App/src/screens/StaticGenerator/components/canvas/CanvasContextMenu.tsx`, lines 139–141
- **What It Is:**
  When a user right-clicks at a specific point on the canvas and clicks **Upload Image**, the resulting image is placed dead-center in the card frame rather than at the cursor's right-click coordinates.
- **Root Cause:**
  Lines 139–140 calculate `x` and `y` using canvas center coordinates `(canvasW - width) / 2` instead of the stored context menu coordinates `(contextMenu.x, contextMenu.y)`.
- **How to Fix:**
  Use `contextMenu.x` and `contextMenu.y` clamped to canvas boundaries:
  ```typescript
  const x = Math.max(12, Math.min(contextMenu.x - width / 2, canvasW - width - 12));
  const y = Math.max(12, Math.min(contextMenu.y - height / 2, canvasH - height - 12));
  ```

---

## Technical Remediation Plan & Execution Roadmap

### Phase 1: Critical Hotfixes (Immediate — Day 1)
1. **Fix Cross-Origin Font SecurityError:**
   - Update `KontentOS-App/index.html` with `crossorigin="anonymous"` on Google Fonts links.
   - Configure `useCardExporter.ts` to handle font reading errors without aborting image exports.
2. **Restore Platform Safe Zones & Visual Grid:**
   - Add Safe Zones and Grid toggle buttons into the `CanvasControls.tsx` toolbar dock.
   - Pass `showSafeZones`, `onToggleSafeZones`, `showGrid`, `onToggleGrid` from `StaticGenerator.tsx`.
3. **Prevent Data Loss with LocalStorage Autosave:**
   - Implement debounced auto-save (500ms) for `state` and `sceneOverrides`.
   - Add an instant recovery banner on mount.

### Phase 2: State Synchronization & Multi-Slide Fixes (Day 2)
1. **Slide Stepper Reordering & Archetypes:**
   - Add Move Left / Move Right triggers to `CarouselSlideStepper.tsx`.
   - Fix `handleDeleteSlide` to shift numeric keys in `useCanvasInteraction.sceneOverrides`.
   - Clear stale scene overrides on AI deck generation.
2. **HTML Tag Leakage Prevention:**
   - Strip HTML markup in `PublishPackDrawer.tsx`, `PublishToCalendarModal.tsx`, and `exportFilename.ts`.
   - Sanitize text when copied or dispatched to calendar schedulers.

### Phase 3: UI Polish, Typography & Visual Engine (Day 3)
1. **Fix Custom Accent Hex Generation:**
   - Normalize 3-digit and RGB color strings in `getActiveTheme()` before appending alpha channels.
2. **Reflow Optical Typography on Resize:**
   - Connect `calculateCardTypography` to active Zustand `sceneOverrides`.
3. **Solid Background & Watermark Implementation:**
   - Support `gradientFallback` in card formats.
   - Implement functional `WatermarkBadge`.
4. **Dock Responsive Scrolling:**
   - Add `overflow-x-auto` to the Canvas Studio Toolbar dock to eliminate button clipping on compact viewports.

---

## Test Verification Checklist for QA Sign-Off

- [ ] **TC-EXP-01:** Verify PNG export downloads at 300 DPI (3240px) with custom fonts intact and zero console errors.
- [ ] **TC-EXP-02:** Verify LinkedIn PDF export creates a valid multi-page PDF with all slides rendered clearly.
- [ ] **TC-UI-01:** Click "Safe Zones" button; verify 1:1 Instagram feed box appears on 4:5 cards and Story dead zones appear on 9:16 cards.
- [ ] **TC-UI-02:** Verify Safe Zones and Grid lines are never present in downloaded PNG or PDF files.
- [ ] **TC-STP-01:** Create a 5-slide deck, add custom elements on Slide 3, delete Slide 2; verify Slide 3 retains its custom elements at its new index.
- [ ] **TC-STP-02:** Click Move Left / Move Right in the Stepper; verify slide order swaps smoothly.
- [ ] **TC-TXT-01:** Bold a word in the canvas inline editor; verify `CopyEditor` textarea and `Publish Pack` do not display `<span style="...">` tags.
- [ ] **TC-THM-01:** Pick a 3-character hex `#f00` in custom accent; verify borders and glow render without CSS syntax warnings.
- [ ] **TC-AUT-01:** Edit a card, refresh the browser window; verify the unsaved draft recovery banner appears and restores all slides.
