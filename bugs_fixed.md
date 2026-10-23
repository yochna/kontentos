# Static Post Creator — Bug Remediation & Quality Hardening Roadmap (`bugs_fixed.md`)

> **Product:** KontentOS Static Post Creator (`StaticGenerator`)  
> **Target:** Zero-Defect Production Quality, Robust Export Pipeline, Multi-Slide Integrity, Canva-Grade Interaction & Draft Persistence  
> **Execution Strategy:** Phased, task-by-task remediation plan (Build B). Each task includes exact file locations, defect diagnosis, step-by-step code solution, and verification criteria. As each bug is resolved, its checkbox is marked complete `[x]`.

---

## Remediation Progress Dashboard

| Build Phase | Focus Area | Total Tasks | Completed | Status |
|---|---|:---:|:---:|:---:|
| **Build B1** | Core Graphics, Exporter & Asset Pipeline | 4 | 4 | Complete |
| **Build B2** | Studio Toolbar, Safe Zones & Visual Guides | 3 | 3 | Complete |
| **Build B3** | Carousel Deck Stepper & Slide State Sync | 4 | 4 | Complete |
| **Build B4** | Canvas Scene Graph, Stacking & Persistence | 4 | 4 | Complete |
| **Build B5** | WYSIWYG Inline Editor & Caption Sanitization | 1 | 1 | Complete |
| **Build B6** | Themes, Typography Reflow & Media Branding | 6 | 6 | Complete |
| **Total** | **All Static Post Studio Modules** | **22** | **22** | **100% Completed** |

---

## Build B1: Core Graphics, Exporter & Asset Pipeline

### - [x] Task B1.1: Fix Cross-Origin Stylesheet Access `SecurityError` During 300 DPI PNG & PDF Export (BUG-EXP-01)
- **Severity:** CRITICAL
- **Files:**
  - `KontentOS-App/index.html` (lines 13–20)
  - `KontentOS-App/src/screens/StaticGenerator/hooks/useCardExporter.ts` (lines 73–88, 189–203, 287–301)
- **What It Is:**
  Clicking "Export PNG", "Full Deck PNGs", or "LinkedIn PDF Carousel" triggers:
  `DOMException: Failed to read the 'cssRules' property from 'CSSStyleSheet': Cannot access rules`.
  The export aborts with *"Export failed. Please check image permissions."*
- **Root Cause:**
  `html-to-image` parses `document.styleSheets` to inline web fonts into the cloned SVG foreignObject representation. Google Fonts linked in `index.html` lack `crossorigin="anonymous"`, causing modern browser security policies to restrict `cssRules` access.
- **How to Fix:**
  1. In `index.html`, add `crossorigin="anonymous"` to Google Fonts `<link rel="stylesheet">` tags.
  2. In `useCardExporter.ts`, supply `fontEmbedCSS: ''` or catch font embed failures so `html-to-image` never halts rasterization on cross-origin stylesheet rules.
- **Verification:**
  Trigger single PNG, multi-page PNG, and LinkedIn PDF export; verify file downloads cleanly at 300 DPI with zero console security exceptions.

---

### - [x] Task B1.2: Replace Hardcoded 240ms Timeout with Font & Image Ready Awaiters in Multi-Slide Exports (BUG-EXP-02)
- **Severity:** HIGH
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator/hooks/useCardExporter.ts` (lines 185, 284)
- **What It Is:**
  Exporting multi-slide decks causes intermittent blank slides, un-decoded background images, or fallback font flashes on slow networks or high-resolution devices.
- **Root Cause:**
  `exportDeckSlides` and `exportLinkedInPDF` rely on `setTimeout(240)` after switching slides. 240ms is insufficient to guarantee proxied media decode, DOM reflow, and font glyph rasterization.
- **How to Fix:**
  Replace static timeouts with a robust decode check:
  ```typescript
  await switchToSlide(slideNum);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 150)));
  const images = Array.from(canvasElement.querySelectorAll('img'));
  await Promise.all(images.map((img) => img.decode().catch(() => {})));
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  ```
- **Verification:**
  Export a 5-slide deck with stock photo backgrounds; confirm every slide in the output ZIP and PDF is 100% rendered with correct typography and imagery.

---

### - [x] Task B1.3: Strip HTML Tags from Export Filename Slug Generator (BUG-EXP-03)
- **Severity:** MEDIUM
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator/utils/exportFilename.ts` (lines 5–27)
- **What It Is:**
  If a user customizes text with inline colors/bolding, the exported file is named `kontentos_span-style-color-00e5ff-scale_slide-01-of-05.png`.
- **Root Cause:**
  `sanitizeSlug` removes brackets `[text]` but does not strip HTML tags (`/<[^>]+>/g`) before converting special characters into hyphens.
- **How to Fix:**
  Add `.replace(/<[^>]+>/g, '')` prior to slugifying in `sanitizeSlug`:
  ```typescript
  export function sanitizeSlug(input: string, maxLength: number = 35): string {
    if (!input) return '';
    const cleanText = input
      .replace(/<[^>]+>/g, '')
      .replace(/\[([^\]]+)\]/g, '$1');
    return cleanText
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/[-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLength)
      .replace(/-+$/, '');
  }
  ```
- **Verification:**
  Format a headline with `<span style="color: #ff0055">Hello</span> World`, click Export PNG; verify filename is `kontentos_hello-world_...png`.

---

### - [x] Task B1.4: Add Devanagari & Indic Font Glyphs to Prevent Conjunct Clipping (BUG-TYP-02)
- **Severity:** MEDIUM
- **Files:**
  - `KontentOS-App/index.html` (lines 13–20)
  - `KontentOS-App/src/data/staticCardPresets.ts` (fontFamily configurations)
- **What It Is:**
  Entering Hindi / Devanagari text produces fallback system fonts (Arial/Segoe UI) and clipping of conjunct matras during high-DPI export.
- **Root Cause:**
  Google Fonts preload in `index.html` only requests Latin character subsets.
- **How to Fix:**
  Add `Noto Sans Devanagari` and `Rozha One` to Google Fonts links in `index.html`, and add `Noto Sans Devanagari` to font family fallback chains.
- **Verification:**
  Input Hindi headline "प्रौद्योगिकी और नवाचार"; verify rich serif/sans rendering and flawless rasterization in export.

---

## Build B2: Studio Toolbar, Safe Zones & Visual Guides

### - [x] Task B2.1: Expose and Connect Safe-Zone Platform Guides Overlay in Toolbar (BUG-UI-01)
- **Severity:** CRITICAL
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator.tsx` (lines 187, 755–767)
  - `KontentOS-App/src/screens/StaticGenerator/components/CanvasControls.tsx` (lines 11–12, 237–372)
- **What It Is:**
  `<SafeZoneOverlay />` exists in the codebase but has no UI button in the studio toolbar dock; users cannot toggle Instagram feed safe boxes or 9:16 mobile margins.
- **Root Cause:**
  `StaticGenerator.tsx` has `showSafeZones` state but does not pass it or its toggler to `CanvasControls.tsx`. `CanvasControls.tsx` has props declared but never renders the button in JSX.
- **How to Fix:**
  1. Add Safe Zones button with icon `crop_free` into `CanvasControls.tsx` toolbar dock.
  2. Pass `showSafeZones={showSafeZones}` and `onToggleSafeZones={() => setShowSafeZones(prev => !prev)}` in `StaticGenerator.tsx`.
- **Verification:**
  Click "Safe Zones" button in toolbar; verify 1:1 safe boundary renders on 4:5 cards and mobile UI dead zones render on 9:16 cards.

---

### - [x] Task B2.2: Add UI Toggle Button for 3×3 Rule-of-Thirds Grid (BUG-UI-02)
- **Severity:** MEDIUM
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator.tsx` (lines 188, 755–767)
  - `KontentOS-App/src/screens/StaticGenerator/components/CanvasControls.tsx` (lines 13–14, 237–372)
- **What It Is:**
  Rule-of-thirds grid is only reachable via keyboard shortcut 'G'; tablet and non-keyboard users have no way to toggle the grid.
- **Root Cause:**
  Props `showGrid` and `onToggleGrid` exist in `CanvasControlsProps`, but `StaticGenerator` does not pass them and `CanvasControls` lacks a Grid button.
- **How to Fix:**
  1. Pass `showGrid={showGrid}` and `onToggleGrid={() => setShowGrid(prev => !prev)}` in `StaticGenerator.tsx`.
  2. Render a "Grid (G)" button with icon `grid_on` in `CanvasControls.tsx`.
- **Verification:**
  Click "Grid" button in toolbar; verify dashed rule-of-thirds lines toggle on/off.

---

### - [x] Task B2.3: Prevent Dock Clipping with Horizontal Overflow Scroll on Compact Viewports (BUG-UI-03)
- **Severity:** MEDIUM
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator/components/CanvasControls.tsx` (line 238)
- **What It Is:**
  On 1366px laptops or 125%+ Windows scaling, rightmost toolbar buttons (*Snap, Paste*) are clipped off-screen with no scrollability.
- **Root Cause:**
  The container uses `inline-flex` without `overflow-x-auto` or max-width containment.
- **How to Fix:**
  Wrap toolbar dock in a scrollable container:
  ```tsx
  <div className="flex items-center justify-center w-full overflow-x-auto scrollbar-none py-1 px-2">
    <div className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-3 py-1.5 bg-surface-2/80 backdrop-blur-md border border-line rounded-xl shadow-xs shrink-0">
  ```
- **Verification:**
  Resize browser window to 1200px width; confirm all toolbar buttons are accessible via horizontal scroll with no layout blowout.

---

## Build B3: Carousel Deck Stepper & Slide State Sync

### - [x] Task B3.1: Add Slide Reordering Controls to `CarouselSlideStepper` (BUG-STP-01)
- **Severity:** HIGH
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator/components/CarouselSlideStepper.tsx` (lines 6–22, 51–99)
  - `KontentOS-App/src/screens/StaticGenerator.tsx` (lines 729–740)
- **What It Is:**
  Users cannot change slide order (e.g. moving Slide 3 to Slide 2); they must delete and retype manually.
- **Root Cause:**
  `StaticGenerator.tsx` already has `handleMoveSlide('left' | 'right')`, but `CarouselSlideStepper` never declares `onMoveSlide` and renders no move buttons.
- **How to Fix:**
  1. Add `onMoveSlide?: (direction: 'left' | 'right') => void` to `CarouselSlideStepperProps`.
  2. Add Move Left / Move Right icon buttons in `CarouselSlideStepper.tsx`.
  3. Pass `onMoveSlide={handleMoveSlide}` in `StaticGenerator.tsx`.
- **Verification:**
  Click Move Left on Slide 3; verify Slide 3 moves to position 2 and all headlines update accordingly.

---

### - [x] Task B3.2: Re-Index Scene Graph Overrides on Slide Deletion (BUG-STP-02)
- **Severity:** HIGH
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator.tsx` (lines 522–538)
- **What It Is:**
  Deleting Slide 2 corrupts customizations on Slide 3 because Slide 3 inherits deleted Slide 2's transforms.
- **Root Cause:**
  `useCanvasInteraction.sceneOverrides` is keyed by numeric slide indices (`0, 1, 2...`). `handleDeleteSlide` removes the slide from the array but leaves old index keys in `sceneOverrides`.
- **How to Fix:**
  Re-key `sceneOverrides` in `handleDeleteSlide` so indices shift downwards (`targetIdx + 1 -> targetIdx`).
- **Verification:**
  Place custom sticker on Slide 3, delete Slide 2; verify Slide 3 retains its sticker at its new index.

---

### - [x] Task B3.3: Clear Scene Overrides When AI Generates Full Carousel Story Deck (BUG-STP-03)
- **Severity:** HIGH
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator.tsx` (lines 397–408)
- **What It Is:**
  Generating a new full carousel deck leaves manual transforms and stickers from the previous deck plastered over the new slides.
- **Root Cause:**
  `handleDeckGenerated` updates slides array but fails to call `useCanvasInteraction.getState().clearAllOverrides()`.
- **How to Fix:**
  Call `useCanvasInteraction.getState().clearAllOverrides()` in `handleDeckGenerated`.
- **Verification:**
  Move headline box on Slide 1, click "Generate Full Carousel Story Deck"; verify all newly generated slides have pristine default layouts.

---

### - [x] Task B3.4: Wire `slideType` Layout Archetypes & `statExtractor.ts` into `CarouselSlideCard` (BUG-STP-04)
- **Severity:** MEDIUM
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator/components/formats/CarouselSlideCard.tsx` (lines 116–271)
- **What It Is:**
  Slides marked with `slideType: 'stat'` or `slideType: 'quote'` do not render specialized hero stat or quote layouts.
- **Root Cause:**
  `CarouselSlideCard.tsx` never checks `slide.slideType` and never imports `statExtractor.ts`.
- **How to Fix:**
  Import `extractStatData` in `CarouselSlideCard.tsx`. If `slide.slideType === 'stat'`, render the large numeric callout (e.g. `+240%`) prominently.
- **Verification:**
  Create a slide with headline "Revenue grew by +350% this quarter" and set slide type to stat; verify "+350%" renders in oversized hero display text.

---

## Build B4: Canvas Scene Graph, Stacking & Persistence

### - [x] Task B4.1: Eliminate Unbounded `zIndex` Growth on Drag Gestures (BUG-SCN-01)
- **Severity:** MEDIUM
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator/components/canvas/TransformableElement.tsx` (lines 253–255)
- **What It Is:**
  Dragging an element increments its `zIndex` on every pointer release, causing z-indices to blow up to 80+ and breaking layer ordering.
- **Root Cause:**
  Line 254 computes `Math.max(20, currentZ + 1)` on drag end instead of keeping existing `currentZ`.
- **How to Fix:**
  Remove `currentZ + 1` from simple pointer translations; only modify `zIndex` when explicitly calling layer stacking actions.
- **Verification:**
  Drag an element 10 times in a row; verify its `zIndex` remains constant.

---

### - [x] Task B4.2: Implement LocalStorage Draft Autosave & Recovery Banner (BUG-SCN-02)
- **Severity:** CRITICAL
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator.tsx`
- **What It Is:**
  Refreshing the page or browser crashes wipe all creator progress, resetting all slides to default templates.
- **Root Cause:**
  Zero draft persistence to `localStorage` or `IndexedDB`.
- **How to Fix:**
  1. Add debounced `useEffect` (500ms) to save `state` and `useCanvasInteraction.sceneOverrides` to `localStorage` key `kontentos_static_card_draft`.
  2. On mount, detect saved draft and show a non-intrusive recovery banner ("Restore Draft from [Time]").
  3. Provide "Restore Draft" and "Dismiss" actions.
- **Verification:**
  Type custom text, refresh browser; verify recovery banner appears and clicking "Restore" recovers all slides.

---

### - [x] Task B4.3: Position Context Menu Uploaded Images at Click Coordinates (BUG-SCN-03)
- **Severity:** LOW
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator/components/canvas/CanvasContextMenu.tsx` (lines 139–141)
- **What It Is:**
  Right-clicking canvas and choosing "Upload Image" drops image in the center instead of at the clicked point.
- **Root Cause:**
  Uses canvas center calculations instead of `contextMenu.x` and `contextMenu.y`.
- **How to Fix:**
  Compute `x` and `y` from `contextMenu.x - width / 2` clamped to canvas boundaries.
- **Verification:**
  Right-click near top-left of canvas and upload image; verify image appears at click position.

---

### - [x] Task B4.4: Prevent Spurious Text Box Creation on Canvas Double-Click (BUG-TXT-02)
- **Severity:** MEDIUM
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator/components/CardCanvas.tsx` (lines 126–140)
- **What It Is:**
  Double-clicking canvas background creates unwanted empty text boxes.
- **Root Cause:**
  `handleDoubleClick` creates a text box whenever canvas background is clicked without requiring modifier keys.
- **How to Fix:**
  Require `e.altKey` or double-clicking the specific Text tool button to spawn text boxes, or ignore double-clicks on outer canvas background.
- **Verification:**
  Double-click canvas background; verify no stray text boxes are added.

---

## Build B5: WYSIWYG Inline Editor & Clean Caption Sanitization

### - [x] Task B5.1: Sanitize HTML Tags Across CopyEditor, Publish Pack, and Calendar Exporters (BUG-TXT-01)
- **Severity:** HIGH
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator/components/canvas/InlineTextEditor.tsx`
  - `KontentOS-App/src/screens/StaticGenerator/components/CopyEditor.tsx` (lines 89–95)
  - `KontentOS-App/src/screens/StaticGenerator/components/PublishPackDrawer.tsx` (lines 26–34)
  - `KontentOS-App/src/screens/StaticGenerator/components/PublishToCalendarModal.tsx` (lines 76–77)
- **What It Is:**
  Inline rich text formatting emits `<span style="...">` tags which leak into sidebar textareas, social media captions, and calendar posts.
- **Root Cause:**
  `innerHTML` is written directly into `headline` and `supportingText` without a clean-text extraction layer.
- **How to Fix:**
  1. Add a shared utility `stripHtml(input?: string): string`.
  2. Strip HTML in `CopyEditor` display, `PublishPackDrawer`, and `PublishToCalendarModal`.
- **Verification:**
  Color a word on the canvas, open Publish Pack; verify caption contains pure plain text with zero HTML tags.

---

## Build B6: Themes, Typography Reflow & Media Branding

### - [x] Task B6.1: Normalize Custom Accent Hex Colors in `getActiveTheme` (BUG-THM-01)
- **Severity:** MEDIUM
- **Files:**
  - `KontentOS-App/src/data/staticCardPresets.ts` (lines 268–273)
- **What It Is:**
  Using shorthand `#f00` or `rgb()` custom accents creates invalid 5-digit hex codes (`#f0055`) and broken CSS border colors.
- **Root Cause:**
  Direct string interpolation `${hex}55` without hex normalization.
- **How to Fix:**
  Normalize 3-character hex to 6 characters (`#f00` -> `#ff0000`) before appending alpha channels.
- **Verification:**
  Enter `#f00` as custom accent; inspect card border style; verify valid `#ff000055` CSS color.

---

### - [x] Task B6.2: Eliminate Double State Updates in Theme Mode Switching (BUG-THM-02)
- **Severity:** LOW
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator/components/ThemePicker.tsx` (lines 61–89)
- **What It Is:**
  Switching Light/Dark mode triggers redundant double-renders.
- **Root Cause:**
  Calls both `onSelectMode` and `onSelectTheme` in the same click event.
- **How to Fix:**
  Remove duplicate `onSelectTheme` call in `ThemePicker.tsx`.
- **Verification:**
  Click Dark / Light mode; verify single smooth theme transition with zero layout jitter.

---

### - [x] Task B6.3: Reflow Optical Typography Font Sizing on Canvas Element Resize (BUG-TYP-01)
- **Severity:** HIGH
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator/utils/typography.ts` (lines 174–190)
  - `KontentOS-App/src/screens/StaticGenerator.tsx` (lines 246–271)
- **What It Is:**
  Resizing headline bounding box does not scale font size proportionally.
- **Root Cause:**
  `typography.ts` checks `state.sceneOverrides`, but overrides are stored in Zustand `useCanvasInteraction`.
- **How to Fix:**
  Read active scene overrides from `useCanvasInteraction.getState().sceneOverrides` inside `calculateCardTypography`.
- **Verification:**
  Resize headline box wider; verify optical font size updates smoothly in real time.

---

### - [x] Task B6.4: Implement Studio Gradient Fallback for Solid Background Preset (BUG-MED-01)
- **Severity:** MEDIUM
- **Files:**
  - `KontentOS-App/src/data/staticCardPresets.ts` (lines 420–427)
  - Card format components (`InstagramOverlayCard.tsx`, etc.)
- **What It Is:**
  Selecting "Solid Studio" renders flat dark gray instead of the specified gradient.
- **Root Cause:**
  Card formats only check `backgroundUrl`, ignoring `preset.gradientFallback`.
- **How to Fix:**
  Support `preset.gradientFallback` when `backgroundUrl` is empty.
- **Verification:**
  Select Solid / Pure Studio preset; verify rich 145deg radial studio backdrop.

---

### - [x] Task B6.5: Fix URL Comparison in "Randomize Photo" (BUG-MED-02)
- **Severity:** LOW
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator.tsx` (lines 364–377)
- **What It Is:**
  Clicking "Randomize Photo" occasionally reselects the current photo because raw Unsplash URL is compared with proxied URL.
- **Root Cause:**
  `p.url !== state.backgroundUrl` is always true because `state.backgroundUrl` has `/api/proxy-media?url=`.
- **How to Fix:**
  Compare proxied URLs using `getSafeImageUrl(p.url) !== state.backgroundUrl`.
- **Verification:**
  Click "Randomize Photo" 5 times; confirm each click switches to a distinct photo.

---

### - [x] Task B6.6: Implement Functional Watermark Badge & Inspector Toggle (BUG-MED-03)
- **Severity:** MEDIUM
- **Files:**
  - `KontentOS-App/src/screens/StaticGenerator/components/WatermarkBadge.tsx`
  - `KontentOS-App/src/screens/StaticGenerator/components/WatermarkSection.tsx`
- **What It Is:**
  `WatermarkBadge` and `WatermarkSection` are empty stub files returning `null`.
- **Root Cause:**
  Unimplemented placeholder components.
- **How to Fix:**
  1. In `WatermarkBadge.tsx`, render a sleek glass pill badge (*"Made with KontentOS"*).
  2. In `WatermarkSection.tsx`, provide a toggle switch in the Brand panel to show/hide watermark and customize text.
- **Verification:**
  Toggle Watermark in Brand panel; verify badge appears on canvas and in export.

---

## Testing & Verification Sign-Off Checklist

- [x] All 22 tasks implemented with zero TypeScript compiler errors (`tsc --noEmit`).
- [x] Export tests pass: Single PNG, Multi-page PNG ZIP, LinkedIn Carousel PDF.
- [x] UI guide overlays (Safe Zones, Rule-of-Thirds Grid) tested across all aspect ratios.
- [x] Multi-slide carousel operations (Reorder, Delete, Add, AI Regenerate) validated.
- [x] LocalStorage autosave recovery tested after browser tab reload.
- [x] Copy sanitization verified: no raw HTML tags in caption exports or plain-text editors.
