# Static Post Studio: Feature Roadmap & Subatomic Task Matrix

> **Source Specification:** [static_post.md](file:///d:/Abu%20Horairah%20Ansari/Internship_Projects/KontentOS%20v3/static_post.md)  
> **Target Implementation:** KontentOS Static Post Studio  
> **Status:** Evaluated and partitioned into 3 execution tiers based on technical complexity, risk, and test requirements. Pre-made features (Phases 1–3) have been pruned out.

---

## 0. Pruned Pre-Made Features (Already Implemented)
The following items from `static_post.md` have **already been built and verified** in Phases 1–3 and are excluded from the backlog below:
- Single-card AI copy generation with Gemini cascades (`/api/static-card/generate-copy`).
- Multi-slide AI carousel narrative deck generator (`/api/static-card/generate-deck`) with customizable slide count (3, 5, 7 slides).
- Carousel Slide Stepper & Deck Manager (navigation, slide counters, dynamic add/delete slides).
- Dynamic typography fluid auto-fit & scale adjuster.
- Keyword accentuation & glowing text (`[bracketed]` and `*asterisk*` syntax).
- Dark and Light mode variants with curated palettes (`alabaster-light`, `nordic-cream`, etc.).
- Custom accent color picker with dynamic gradient and drop-shadow glow calculation.
- 5 Card format archetypes (Instagram Overlay, LinkedIn Split, Tweet Card, Carousel Slide, Editorial Quote).
- 300 DPI high-resolution PNG export with font pre-warming.
- Sequential full deck PNG exporter.
- Native LinkedIn multi-page PDF carousel exporter (`jspdf`).
- CORS & tainted canvas protection via `/api/proxy-media`.
- 1-click copy post text and caption.

---

## Section 1: The Easy Version (Immediate High-Value, Zero-Risk Features)
*Features that can be implemented cleanly in a single session without breaking existing layouts, requiring no heavy external libraries, and ready for immediate deployment.*

### Phase 1.1: Platform Safe-Zones & Visual Grid Guides
**Intent:** Creators need visual reassurance that their text and vital focal points won't be obscured by Instagram or LinkedIn native overlays (e.g., account header, like buttons, story navigation bars).

- **Task 1.1.1: Toggleable Safe-Zone Overlay Component**
  - **Description:** Create `<SafeZoneOverlay />` that renders non-exportable semi-transparent guide borders over the canvas showing platform UI boundaries.
  - **Criteria:**
    - Instagram 4:5 in-feed crop safe-area (centered 1:1 box highlight).
    - Instagram 9:16 Story top (14% header) and bottom (20% interactive UI) dead-zones.
    - Floating toggle button on the canvas toolbar (`Show Safe Zones: On/Off`).
    - Excluded from PNG and PDF export renders automatically.
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 1.1.2: Rule-of-Thirds & Alignment Center Grid**
  - **Description:** Add an optional 3x3 dashed grid guide toggle over `<CardCanvas />` to aid manual text positioning and visual weight balance.
  - **Criteria:**
    - Grid lines render with ultra-subtle contrast (`white/15` or `black/15`).
    - Keyboard shortcut (`G`) or canvas toolbar button to toggle on/off.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 1.2: Aspect Ratio Expansion (9:16 Vertical Story Format)
**Intent:** Static quotes and carousel hooks are increasingly posted to Instagram Stories, TikTok static photos, and YouTube Community posts requiring 9:16 (1080×1920) vertical canvas support.

- **Task 1.2.1: Aspect Ratio Model & Selector Update**
  - **Description:** Extend `AspectRatio` type in `staticCard.ts` to include `'9:16'`. Add a `'9:16 Story / Mobile'` button to `AspectRatioSelector.tsx`.
  - **Criteria:**
    - Updates aspect ratio calculations in `typography.ts` to preserve balanced vertical padding.
    - Updates PDF & PNG exporter dimension matrices (1080×1920).
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 1.2.2: Format-Specific Card Layout Pacing for 9:16** [COMPLETED]
  - **Description:** Ensure all 5 card archetypes vertically center headline and supporting cards gracefully without excessive dead whitespace on 9:16 dimensions.
  - **Criteria:**
    - Responsive padding adjustments in `InstagramOverlayCard`, `EditorialQuoteCard`, and `CarouselSlideCard`.
    - Dynamic vertical top/bottom split for `LinkedInSplitCard` on 9:16 vertical smartphone dimensions.
    - Sinking prevention and primary safe-zone centering across all formats.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 1.3: Standardized File Naming & Zero-Padded Slug Generator
**Intent:** Creators downloading 10–20 slides need clean, organized filenames for bulk uploading to social schedulers.

- **Task 1.3.1: Deterministic Slug & Zero-Padding Utility** [COMPLETED]
  - **Description:** Implement `generateExportFilename(brand, topic, slideNum, totalSlides, ext)` utility function.
  - **Criteria:**
    - Output format: `{brand}_{topic_slug}_slide-{01-of-05}.{png|pdf}`.
    - Sanitizes special characters, trims whitespace, limits slug to 35 characters.
    - Integrates into both `exportPNG`, `exportDeckSlides`, and `exportLinkedInPDF`.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 1.4: One-Click Publish Pack & Multi-Copy Drawer
**Intent:** Creators need quick access to all textual assets associated with the visual post (Title, Caption, Hashtags, and Alt Text) without navigating away.

- **Task 1.4.1: Publish Pack Drawer Component** [COMPLETED]
  - **Description:** Create `<PublishPackDrawer />` modal accessible via a "Publish Pack" toolbar button.
  - **Criteria:**
    - Tabbed/card layout displaying: (1) Headline Hook, (2) Body Takeaway, (3) Full Social Caption, (4) Extracted Hashtags.
    - Dedicated "Copy" button for each individual field with visual tick feedback.
    - "Copy All as Complete Post" master button.
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 1.4.2: Automated Accessibility Alt-Text Synthesis** [COMPLETED]
  - **Description:** Generate accessible alt-text description string (`"Visual social card featuring [Creator]: [Headline] - [Supporting Text]"`) for SEO and screen-readers.
  - **Criteria:**
    - Displayed in the Publish Pack drawer with 1-click copy for Instagram/LinkedIn alt-text fields.
    - Format-aware synthesis with bracket stripping, character count, and platform SEO guidance.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 1.5: Slide Reordering Controls in Stepper
**Intent:** Give creators fast mechanical control over slide sequence without complex drag-and-drop libraries.

- **Task 1.5.1: Slide "Move Left" / "Move Right" Buttons** [COMPLETED]
  - **Description:** Add small reordering arrow triggers to `<CarouselSlideStepper />` (`← Move Earlier`, `Move Later →`).
  - **Criteria:**
    - Swaps active slide position in `state.slides` array.
    - Automatically updates `slideCurrent` to follow the moved slide.
    - Updates slide badges (`Slide 1 (Hook)`, `Slide N (CTA)`) dynamically.
  - **Prompt Execution:** Schedule as 1 prompt.

---

## Section 2: Medium Features (Interactive, Stateful & API Integrations)
*Features that elevate the creator experience through rich UI workflows, state persistence, and external APIs. Require dedicated test cases and responsive validation.*

### Phase 2.1: Slide Layout Archetypes & Content Reflow
**Intent:** Different slides in a carousel serve different structural purposes: a numeric statistic needs gigantic figures, a testimonial needs quote marks, and a framework needs bullet points.

- **Task 2.1.1: Slide Type Classification & State Model** [COMPLETED]
  - **Description:** Extend `CarouselSlide` type to support `slideType`: `'hook' | 'standard' | 'stat' | 'quote' | 'list' | 'cta'`.
  - **Criteria:**
    - Add a slide archetype selector dropdown/pill bar inside `<CarouselSlideStepper />`.
    - Reflows existing headline and supporting text into the chosen layout without text loss.
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 2.1.2: Stat & Big Number Layout Variant** [COMPLETED]
  - **Description:** Create a specialized layout renderer for `'stat'` slides that extracts numbers (e.g. `80%`, `4.2x`, `10M+`) and displays them in massive, high-contrast display typography above the explanation.
  - **Criteria:**
    - Dynamic sizing of the metric number (80–120px) with custom accent glow.
    - Pacing tested across 1:1, 4:5, and 16:9 ratios.
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 2.1.3: Quote & Testimonial Layout Variant** [COMPLETED]
  - **Description:** Create `'quote'` layout variant featuring prominent editorial quotation marks, serif italic typography, and author attribution container.
  - **Criteria:**
    - Clean typography hierarchy with customizable quotation mark opacity.
    - Integrated with carousel slide stepper archetype selector and responsive attribution card.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 2.2: In-App Stock Photography Search (Unsplash / Pexels)
**Intent:** Creators need fast, high-quality atmosphere photos without leaving the studio to download files from external sites.

- **Task 2.2.1: Server-Side Stock Search API Route** [COMPLETED]
  - **Description:** Create `/api/static-card/stock-search` endpoint proxying Unsplash/Pexels search requests with API key protection.
  - **Criteria:**
    - Accepts `query`, `page`, and `orientation`.
    - Returns sanitized image URL, thumbnail, preview, and photographer attribution.
    - Fallback to curated high-resolution editorial photography collections if rate limits are hit.
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 2.2.2: Stock Search Drawer in Background Picker** [COMPLETED]
  - **Description:** Add a "Search Stock Photos" tab in `<BackgroundPicker />` with a search input, popular category chips (Architecture, Moody Workspace, Abstract Neon, Minimalist Nature), and responsive thumbnail grid.
  - **Criteria:**
    - Selecting an image routes it through `/api/proxy-media` to ensure zero CORS canvas tainting.
    - Stores photographer attribution metadata for accessibility.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 2.3: IndexedDB Autosave & Crash Recovery
**Intent:** Protect creators from accidental tab closures, browser refreshes, or device power outages by continuously preserving drafts locally.

- **Task 2.3.1: IndexedDB Storage Adapter for Static Post Studio**
  - **Description:** Implement `staticCardDb.ts` using native IndexedDB (or `idb`) to save the complete `StaticCardState` document.
  - **Criteria:**
    - Debounced writes (500ms debounce on text/color changes).
    - Stores project metadata (`lastModified`, `format`, `slideCount`, thumbnail snapshot).
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 2.3.2: Unsaved Draft Recovery Banner**
  - **Description:** On component mount, check for existing stored draft. If draft exists and differs from default state, show a subtle recovery prompt: *"Unsaved draft from [Time] found. [Restore Draft] [Discard]"*.
  - **Criteria:**
    - Restores entire state (all slides, custom accents, background URLs, typography).
    - Clear draft action resets cleanly to blank preset.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 2.4: Single-Slide AI Regeneration with Context Continuity
**Intent:** Allow creators to rewrite or re-plan just Slide 3 without disturbing Slides 1, 2, 4, or 5, while maintaining narrative continuity.

- **Task 2.4.1: Context-Aware Per-Slide Regeneration Endpoint** [COMPLETED]
  - **Description:** Create `/api/static-card/regenerate-slide` endpoint.
  - **Criteria:**
    - Accepts: `slideIndex`, `currentSlide`, `previousSlide` (context), `nextSlide` (context), `topic`, and `instruction` (e.g., "Make this step more tactical").
    - Gemini returns updated `{ headline, supportingText }` that logically links the preceding and subsequent slides.
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 2.4.2: Slide Regeneration Action in Stepper & Copy Editor** [COMPLETED]
  - **Description:** Add "Regenerate This Slide" button next to active slide with quick instruction prompt modal ("Make more concise", "Add concrete example", "Strengthen hook").
  - **Criteria:**
    - Seamless in-place replacement of the active slide.
    - Undo option immediately accessible if the new version is less desirable.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 2.5: Multi-Slide Filmstrip Thumbnail Bar
**Intent:** A visual overview of all slides in the deck side-by-side allows creators to assess visual pacing and flow across the full carousel.

- **Task 2.5.1: Filmstrip Thumbnail Generator & Carousel Drawer**
  - **Description:** Build `<DeckFilmstrip />` component showing a horizontal thumbnail reel of all slides in the carousel.
  - **Criteria:**
    - Renders lightweight SVG/CSS previews of each slide's headline, background, and accent.
    - Clicking any slide thumbnail immediately selects it in the editor.
    - Responsive collapse on mobile viewports.
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 2.5.2: Drag-and-Drop Reordering in Filmstrip**
  - **Description:** Add drag-and-drop reordering using HTML5 Drag-and-Drop API or lightweight pointer math.
  - **Criteria:**
    - Smooth drag feedback, drop indicators between slides.
    - Re-indexes all slides and updates slide indicators instantly.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 2.6: One-Click Calendar Publishing & Distribution Engine [COMPLETED]
**Intent:** Creators need to dispatch designed static cards and entire multi-slide carousel decks directly into their Publishing Calendar with zero friction or manual copy-pasting.

- **Task 2.6.1: Direct Calendar Dispatch Modal & Workflow** [COMPLETED]
  - **Description:** Implement `<PublishToCalendarModal />` allowing 1-click publishing or scheduled cadence dispatch of all designed posts.
  - **Criteria:**
    - Supports **1-Click Publish Now** (instantly records live drops in today's calendar).
    - Supports **Sequential Cadence Drops** (automatically distributes carousel slides across consecutive calendar days or staggered hours at peak engagement times).
    - Multi-channel platform toggle (Instagram, LinkedIn, X, Threads, TikTok).
    - Instant live canvas snapshot thumbnail generation for rich visual calendar display.
    - Post-dispatch navigation shortcut directly into the Calendar screen.
  - **Prompt Execution:** Completed.

- **Task 2.6.2: Studio Canvas & Header Integration** [COMPLETED]
  - **Description:** Expose one-click calendar publishing actions directly on the Studio top header, CanvasControls toolbar, and the Publish Pack drawer.
  - **Criteria:**
    - Prominent "1-Click Publish to Calendar" primary button on Studio header.
    - Toolbar "Publish to Calendar" button in `<CanvasControls />`.
    - Integrated dispatch action inside `<PublishPackDrawer />`.
    - Rich thumbnail preview and card visual display inside `<Calendar />` inspector.
  - **Prompt Execution:** Completed.

---



## Section 3: Hard Features (Complex Architecture, Math & Rigorous Testing)
*Features that involve client-side machine learning, virtual multi-canvas coordinate mathematics, full scene-graph undo stacks, or Indic script rendering engines. Require extensive cross-browser testing and performance optimization.*

### Phase 3.1: Seamless Panoramic Carousel Mode
**Intent:** Carousels where an image or graphic element spans continuously across multiple slides create high thumb-stop rates on Instagram and LinkedIn.

- **Task 3.1.1: Virtual Wide Canvas Mathematics & Scene Model**
  - **Description:** Design coordinate model for panoramic elements: virtual width = `slideWidth * slideCount`.
  - **Criteria:**
    - Calculates horizontal offset `windowX = slideIndex * slideWidth`.
    - Renders exact slice onto active slide without visual misalignment or edge artifacts.
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 3.1.2: Panoramic Background & Graphic Slice Exporter**
  - **Description:** Update `useCardExporter` to slice the virtual wide canvas sequentially during 300 DPI PNG and PDF exports.
  - **Criteria:**
    - Mathematically seamless seams across Slide 1 → Slide 2 → Slide 3.
    - Zero pixel gaps or double edge artifacts when swiping between pages.
    - Rigorous cross-browser testing on Safari, Chrome, and Firefox canvas implementations.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 3.2: In-Browser Client-Side Background Remover (WASM / ONNX)
**Intent:** Creators need to upload portrait photos or product shots and remove the background directly in the browser without sending images to third-party paid APIs.

- **Task 3.2.1: Client-Side Web Worker & Model Loader**
  - **Description:** Implement a background remover worker utilizing a lightweight segmentation model (e.g. RMBG or BiRefNet via `@huggingface/transformers` or ONNX Runtime Web).
  - **Criteria:**
    - Runs in a dedicated Web Worker to prevent UI thread freezing.
    - Caches model weights in Cache API / IndexedDB.
    - Shows non-blocking download progress bar during first-time model retrieval.
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 3.2.2: Cutout Mask Renderer & Canvas Integration**
  - **Description:** Render transparent cutout PNG and provide position/scale controls over the card background.
  - **Criteria:**
    - Memory disposal on completion to avoid heap exhaustion.
    - Rigorous testing on lower-end hardware and mobile browsers.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 3.3: Interactive Element Layers & Free-Form Canvas Drag
**Intent:** Enable creators to add floating badge stickers, arrows, custom logos, and secondary image layers and position them anywhere on the canvas.

- **Task 3.3.1: Layer Stack Model & Element Scene Graph**
  - **Description:** Refactor card interior to support an array of `CanvasElement` objects (`{ id, type, x, y, width, height, rotation, locked }`).
  - **Criteria:**
    - Layer reordering (Move Forward / Send Backward).
    - Bounding-box selection handles for repositioning and scaling.
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 3.3.2: Snapping Guides & Pointer Physics Engine**
  - **Description:** Implement pointer events for dragging with smart-guide alignment to horizontal/vertical center and card margins.
  - **Criteria:**
    - Magnetic snap tolerance (5px).
    - Visual guide lines appear when snapping occurs.
    - Smooth 60fps interaction during drag gestures.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 3.4: Complete Undo / Redo Command History Engine
**Intent:** A professional creator tool requires deep, unlimited undo/redo covering both manual user interactions and AI generation patches.

- **Task 3.4.1: Immutable Command History Architecture**
  - **Description:** Implement a lightweight Command/State stack (History Manager) with `past`, `present`, and `future` states.
  - **Criteria:**
    - Debounced state snapshots for continuous sliders (e.g., overlay darkness, font size).
    - Atomic snapshots for AI generation events (undoing an AI deck generation reverts to the prior deck in 1 keystroke).
    - Memory cap to prevent heap blowup (retaining last 50 states).
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 3.4.2: Keyboard Shortcuts & Visual History Controls**
  - **Description:** Wire `Ctrl+Z` / `Cmd+Z` (Undo) and `Ctrl+Shift+Z` / `Cmd+Shift+Z` / `Ctrl+Y` (Redo) with undo/redo toolbar buttons.
  - **Criteria:**
    - Disables buttons when history boundaries are reached.
    - Preserves focus and selection state after undo.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 3.5: Multi-Aspect Ratio "Magic Resize" with Intelligent Re-Layout
**Intent:** Allow creators who designed a 4:5 carousel to convert it into a 1:1 square post or 16:9 LinkedIn deck with smart re-balancing rather than crude cropping.

- **Task 3.5.1: Proportional Constraint & Re-Flow Engine**
  - **Description:** Build an intelligent layout recalculator that adjusts font sizes, card widths, and line-heights dynamically when switching aspect ratios.
  - **Criteria:**
    - Prevents text overflow when transitioning from tall 4:5 to short 16:9.
    - Automatically repositions badges, step indicators, and creator watermark to fit new bounds.
  - **Prompt Execution:** Schedule as 1 prompt.

---

### Phase 3.6: Bilingual Devanagari (Hindi) Typography & Shaping Engine
**Intent:** Content OS targets creators in India and globally. Hindi text rendering requires specialized font handling to avoid conjunct clipping, broken matras, or incorrect line wraps.

- **Task 3.6.1: Devanagari Google Font Integration & Fallback Chain**
  - **Description:** Curate and preload high-quality Devanagari font families (e.g., Noto Sans Devanagari, Rozha One, Poppins with full Indic glyph tables).
  - **Criteria:**
    - Verifies font files contain full Indic coverage.
    - Preloads fonts before rendering so `html-to-image` and `jspdf` never render box fallbacks (tofu glyphs).
  - **Prompt Execution:** Schedule as 1 prompt.

- **Task 3.6.2: Indic Conjunct & Line-Breaking Validation Pipeline**
  - **Description:** Implement automated test suite verifying complex Hindi words with conjuncts (e.g., "प्रौद्योगिकी", "क्रिएटर्स", "रणनीति") render with identical shaping between browser canvas and exported 300 DPI PNG/PDF.
  - **Criteria:**
    - Zero split matras or disconnected viramas in exported images.
  - **Prompt Execution:** Schedule as 1 prompt.

---

## 4. Execution Strategy & Prompt Scheduling Matrix

| Tier | Phase | Subatomic Tasks | Estimated Prompts | Risk Level |
|---|---|---|---|---|
| **Section 1: Easy** | 1.1 Safe-Zones & Grid Guides | 1.1.1, 1.1.2 | 2 Prompts | Very Low |
| **Section 1: Easy** | 1.2 Aspect Ratio 9:16 | 1.2.1, 1.2.2 | 2 Prompts | Very Low |
| **Section 1: Easy** | 1.3 Slug & File Naming | 1.3.1 | 1 Prompt | Zero |
| **Section 1: Easy** | 1.4 Publish Pack Drawer | 1.4.1, 1.4.2 | 2 Prompts | Very Low |
| **Section 1: Easy** | 1.5 Stepper Slide Reorder | 1.5.1 | 1 Prompt | Zero |
| **Section 2: Medium** | 2.1 Slide Layout Types | 2.1.1, 2.1.2, 2.1.3 | 3 Prompts | Low-Medium |
| **Section 2: Medium** | 2.2 Unsplash/Pexels Search | 2.2.1, 2.2.2 | 2 Prompts | Medium |
| **Section 2: Medium** | 2.3 IndexedDB Autosave | 2.3.1, 2.3.2 | 2 Prompts | Low-Medium |
| **Section 2: Medium** | 2.4 Single Slide AI Regene | 2.4.1, 2.4.2 | 2 Prompts | Medium |
| **Section 2: Medium** | 2.5 Filmstrip Reel & Drag | 2.5.1, 2.5.2 | 2 Prompts | Medium |
| **Section 2: Medium** | 2.6 Calendar 1-Click Publishing | 2.6.1, 2.6.2 | Completed | Low |
| **Section 3: Hard** | 3.1 Seamless Panorama | 3.1.1, 3.1.2 | 2 Prompts | High |
| **Section 3: Hard** | 3.2 Client Background Remover | 3.2.1, 3.2.2 | 2 Prompts | Very High |
| **Section 3: Hard** | 3.3 Free-Form Layer Drag | 3.3.1, 3.3.2 | 2 Prompts | High |
| **Section 3: Hard** | 3.4 Deep Undo/Redo Engine | 3.4.1, 3.4.2 | 2 Prompts | High |
| **Section 3: Hard** | 3.5 Magic Resize Relayout | 3.5.1 | 1 Prompt | Medium-High |
| **Section 3: Hard** | 3.6 Hindi & Devanagari Pipeline | 3.6.1, 3.6.2 | 2 Prompts | Medium-High |

---

> **Ready for Scheduling:** Any single task above can be scheduled and executed as a standalone prompt without conflicting with existing codebase functionality.
