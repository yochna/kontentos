# Post Studio: Feature Specification (Carousel, Editor, Assets, Export)

> **Audience:** an LLM coding agent implementing this module.
> **Product:** Post Studio, one module inside **Content OS** (React + Next.js). It creates static social posts (single images and carousels) for small creators on **Instagram** and **LinkedIn**.
> **Scope of this file:** four feature areas only: (1) Carousel Studio, (2) Editor, (3) Assets, (4) Export and Output. Other areas (create flow, brand kit, templates) exist elsewhere in the product and are referenced only where these features depend on them.

---

## 0. How to read this document

- **MUST** = required for v1. **SHOULD** = expected, may slip if blocked. **MAY** = optional or later.
- Each feature has a short **Intent** (why it exists) followed by **Requirements** (what to build). When a requirement is ambiguous, follow the Intent.
- Section 6 lists **cross-cutting rules** that apply to every feature. Read it before writing code.
- Section 7 lists **open decisions** you should surface to the human rather than guess.

---

## 1. Core architecture assumptions

These are fixed. Build on them and do not redesign them.

1. **The scene graph is the single source of truth.** A post is a JSON document (see Section 5), never a flat image. The editor, AI, undo/redo, resize, carousels, and export all read and write this one structure.
2. **Text is always real text.** Gemini never bakes words into generated images. Text layers are rendered by the canvas engine so they stay editable and spell-correct.
3. **One renderer for editing and export.** Export MUST use the same rendering path as the on-screen canvas so output matches what the user sees (WYSIWYG). Do not maintain a separate "export renderer".
4. **Gemini is called server-side** via Next.js API routes. The API key MUST NOT be exposed to browser code.
5. **Browser-first persistence.** Autosave to IndexedDB; expose a sync hook so Content OS can mirror projects to cloud storage later.
6. **Canvas library:** use an established 2D canvas library (Konva or Fabric.js). Do not hand-roll a canvas engine.
7. **Languages:** English and Hindi at launch. Devanagari text MUST shape and wrap correctly.

---

## 2. Carousel Studio

**Intent:** Carousels are the highest-performing static format on both platforms. A carousel is a first-class object, not a single post duplicated N times. Its slides share one design system and one narrative.

### 2.1 Carousel generation

- **MUST** generate a complete carousel from a brief. Gemini writes the narrative arc: **hook slide → value slides → recap → CTA slide**.
- **MUST** support a slide count between **3 and 20**. Default is 7 to 10 when unspecified.
- **MUST** provide "make it shorter" and "make it longer" actions that re-plan the arc, not just delete or append slides.
- **SHOULD** stream results slide by slide so the user sees progress.
- Generation output is a `Carousel` scene document (Section 5) with one `Slide` per page, each tagged with a slide type.

### 2.2 Slide types

Supported types: `cover`, `content`, `list`, `quote`, `stat`, `image-led`, `cta`.

- Each type has at least one layout variant. Gemini selects a type per slide based on its content (a numeric claim becomes `stat`, a testimonial becomes `quote`).
- The user can change a slide's type after generation. This re-flows the existing text into the new layout instead of discarding it.

### 2.3 Consistent design system across slides

- **MUST** keep one shared `designSystem` per carousel: palette, font set, grid or margins, corner radius, and recurring elements.
- **Recurring elements** (each independently toggleable): page number, progress dots or bar, swipe arrow, logo, handle or watermark.
- Recurring elements are defined **once** at carousel level and rendered onto every slide. Editing one updates all slides.
- **MUST** support "apply this style change to **all slides**" or "to **this slide only**". Make the scope an explicit choice in the UI, never implicit.

### 2.4 Seamless panoramic mode

- **SHOULD** allow an image, shape, or gradient to span multiple slides so swiping looks continuous.
- Model it as a single element positioned in a **virtual wide canvas** (width = slideWidth × slideCount). At render time each slide shows its window onto that canvas.
- Elements that cross a boundary MUST render identically on both sides of the seam (no gaps, no double edges).
- Export MUST slice the virtual canvas into per-slide images or PDF pages.

### 2.5 Filmstrip view

- **MUST** show a horizontal (or vertical on narrow screens) strip of slide thumbnails.
- **MUST** support: drag to reorder, duplicate, delete, insert blank slide, and "generate a slide about X here" (a prompt that creates one slide in the current design system at that position).
- Thumbnails MUST update live as the user edits.
- Reordering MUST update page numbers and any panoramic elements correctly.

### 2.6 Per-slide regeneration

- **MUST** regenerate one slide without modifying any other slide.
- The request to Gemini includes: the slide's current content, neighbouring slides (for narrative continuity), the design system, and any **locked** elements. Locked elements MUST come back unchanged.

### 2.7 Platform-specific output

| Platform | Output |
|---|---|
| Instagram | Set of individual images (up to 20 slides), 4:5 (1080×1350) default, 1:1 (1080×1080) optional |
| LinkedIn | **Single PDF**, one slide per page (document carousel). 4:5 or 1:1 |

- Platform choice sets the slide size and the export format default (see Section 4).

### 2.8 Carousel preview mode

- **SHOULD** provide a preview that simulates swiping through the slides at actual aspect ratio, with the platform's UI chrome optionally overlaid.
- Preview is read-only and uses the same renderer as the editor.

---

## 3. Editor (maximum freedom)

**Intent:** The user must be able to change **anything** about a generated post. The editor is a general-purpose canvas, not a "tweak a few fields" form. When a design decision pits flexibility against simplicity, favour flexibility, but keep the default view uncluttered (progressive disclosure).

### 3.1 Canvas basics

- **MUST** support select, move, resize, rotate, flip (H/V), group/ungroup, lock/unlock, and hide/show for any element.
- **MUST** support snapping and **smart guides** (alignment to other elements, slide center, and margins).
- **SHOULD** support rulers and a toggleable grid.
- **MUST** provide a **safe-zone overlay**, toggleable per platform, showing areas that the platform's UI may cover (for example Instagram story top/bottom, profile-crop areas).
- **MUST** include a **layers panel**: drag to reorder, rename, toggle visibility and lock, and show element type icons.
- **MUST** support undo/redo with a deep history (treat as unlimited; cap by memory, not by count). History covers manual edits and AI edits alike.
- **MUST** support copy/paste of elements **across slides and across posts**, preserving styling.
- **MUST** support zoom, pan, fit-to-screen, and standard keyboard shortcuts (copy, paste, duplicate, delete, undo, redo, nudge with arrows, group).
- **MUST** support multi-select with align and distribute tools.

### 3.2 Text

- **MUST** support inline editing directly on the canvas.
- **MUST** expose: font family, size, weight, line height, letter spacing, alignment (left/center/right/justify).
- **MUST** support **per-word (range) styling**: color, highlight, underline, bold, italic, and gradient fill. A single text layer holds multiple styled runs.
- **SHOULD** support text effects: shadow, outline/stroke, background box, curved text, glow.
- **MUST** support **auto-fit** ("shrink to fit box"): font size adjusts to keep text inside its box within a configured min/max.
- **MUST** provide a searchable **Google Fonts** library plus custom font upload. Fonts MUST be fully loaded before the first render **and** before export, otherwise exports will show fallback fonts.
- **MUST** render **Hindi and other Indic scripts** with correct shaping and line-breaking. Choose fonts with real Devanagari coverage and test conjuncts and matras.
- **SHOULD** support bullet and numbered lists, and emoji and symbol insertion. Emoji MUST render consistently between canvas and export.

### 3.3 Images and shapes

- **MUST** support replacing an image while keeping its frame, crop, and position.
- **MUST** support crop and **masks**: circle, rounded rectangle, and custom shapes.
- **SHOULD** support filters and adjustments: brightness, contrast, saturation, blur, duotone, grain. Adjustments are **non-destructive** (stored as parameters, applied at render).
- **SHOULD** include an **in-browser background remover** to cut out subjects. Run client-side (WASM/ONNX model) so images need not leave the browser; show a progress state because the first model load is slow.
- **MUST** provide shapes, lines, arrows, dividers, and frames. **SHOULD** provide stickers, icons, and device mockups.
- **MUST** support fills (solid, linear/radial gradient, pattern), opacity, corner radius, shadows. **SHOULD** support blend modes.
- **MUST** accept images by **drag-and-drop** and by **paste (Ctrl/Cmd+V)** from the clipboard.

### 3.4 AI-assisted editing (the "magic" layer)

All AI edits operate on the scene graph and are **undoable as a single history step**.

| Feature | Behaviour |
|---|---|
| **Regenerate element** | Regenerate only the selected element: background, headline, image, or the whole layout. Everything else stays untouched. |
| **Text actions** | On selected text: rewrite, shorten, expand, change tone, translate (en/hi), fix grammar, add emoji. Preserve per-word styling where practical. |
| **Edit with a prompt** | Natural language such as "make the headline bigger and move it to the bottom". Gemini returns a **patch** to the scene JSON (Section 5.3), which is validated and applied. |
| **Magic resize** | Convert between aspect ratios (4:5, 1:1, 9:16, 1.91:1) with **intelligent re-layout**, not cropping. Re-flow text, reposition elements, and re-fit images. |
| **AI image edit** | Remove object, extend background, restyle, recolor on an image layer. |
| **Smart recolor** | Swap the whole palette while preserving theme aesthetics. |
| **Suggest improvements** | One-click critique (for example "headline too long", "CTA unclear", "low contrast") where each suggestion has an **Apply** button that produces a patch. |
| **Lock from AI** | Any element can be locked from AI changes ("don't touch this"). Locked elements MUST be excluded from or preserved by every AI operation. |

**AI behaviour rules:**
- AI proposes, the human decides. Show a quick before/after or allow immediate undo for every AI edit.
- Never let an AI patch delete or alter locked elements. Enforce this **in code** after the model responds, not only in the prompt.
- Gemini responses MUST be schema-validated; on invalid output, retry once with the validation error, then fail gracefully with a clear message.

---

## 4. Assets

**Intent:** Creators reuse logos, photos, and generated images constantly. Assets must be one click away inside the editor.

- **MUST** provide an **upload library** with folders and tags, supporting image formats (PNG, JPG, WebP, SVG). Store in IndexedDB or Content OS storage; keep thumbnails separate from originals for fast browsing.
- **SHOULD** provide **stock photo search** inside the editor via Unsplash and/or Pexels APIs (proxied through a Next.js route to hide keys). Insert with one click and keep photographer attribution metadata on the asset.
- **MUST** keep an **AI image generation history**: every Gemini-generated image is saved with its prompt, so it can be reused in any post or regenerated with tweaks.
- **SHOULD** provide an **icon, sticker, and shape library**, searchable and categorised.
- **MUST** provide **recently used** and **favorites**.
- Assets are referenced from the scene graph by `assetId`, not embedded as base64, so documents stay small and assets can be swapped.

---

## 5. Export and Output

**Intent:** Export is the moment of truth. What the user sees must be what they get.

### 5.1 Formats and options

- **MUST** export **PNG, JPG, WebP** at **1x and 2x** scale.
- **MUST** export **PDF** (essential for LinkedIn carousels). **MAY** export **SVG** where the scene supports it (text-only and vector content; flag that raster layers and some effects will not translate).
- **MUST** support exporting **current slide, selected slides, or all slides**. Multi-file output is bundled as a **ZIP**.
- **MUST** support **transparent-background PNG**.
- **MUST** support **copy image to clipboard** (Clipboard API; fall back to download where unsupported).
- **MUST** support download, and **Web Share API** on mobile where available.
- **SHOULD** offer "send to Content OS scheduler" and "send to caption module" actions. Define these as an integration interface (Section 6) rather than hard-coding.

### 5.2 Publish pack

- **SHOULD** bundle the post's image(s), **caption**, **hashtags**, and **alt text**, each with a one-click copy button.
- Alt text is AI-generated on first use and always editable.

### 5.3 Platform presets and naming

- **MUST** include presets that choose size and compression automatically:

| Preset | Size | Notes |
|---|---|---|
| Instagram portrait post | 1080×1350 | Default for carousels and single posts |
| Instagram square post | 1080×1080 | |
| Instagram story | 1080×1920 | Respect story safe zones |
| LinkedIn square | 1080×1080 | |
| LinkedIn portrait | 1080×1350 | |
| LinkedIn link/landscape | 1200×627 | 1.91:1 |
| LinkedIn carousel | PDF, 1080×1350 or 1080×1080 per page | Single document |

- **MUST** use filename convention `{brand}_{topic}_slide-{NN}.{ext}` (zero-padded, slugified, safe characters only). Single posts: `{brand}_{topic}.{ext}`.

### 5.4 Export correctness requirements

- Wait for all fonts and images to finish loading before rendering.
- Render at the target pixel size directly (do not upscale a screenshot).
- Export MUST be **deterministic**: the same scene graph produces the same output.
- Test on Chrome, Safari (including iOS), and Firefox. Canvas size limits and font handling differ; handle large exports (for example a 20-slide PDF at 2x) by processing **sequentially** to avoid memory crashes, and show progress.

---

## 6. Scene graph (reference contract)

This is the minimum shape. Extend it, but keep these names stable. Validate every document and every AI patch against a schema (Zod or JSON Schema).

### 6.1 Document

```json
{
  "id": "post_01",
  "version": 1,
  "type": "carousel",
  "platform": "instagram",
  "size": { "w": 1080, "h": 1350 },
  "designSystem": {
    "palette": { "primary": "#...", "accent": "#...", "bg": "#...", "text": "#..." },
    "fonts": { "heading": "Poppins", "body": "Inter" },
    "radius": 24,
    "margins": 72,
    "recurring": {
      "pageNumber": { "enabled": true, "position": "bottom-right" },
      "progress": { "enabled": true, "style": "dots" },
      "swipeArrow": { "enabled": true },
      "logo": { "enabled": true, "assetId": "asset_9" },
      "handle": { "enabled": true, "text": "@name" }
    }
  },
  "slides": [ /* Slide[] */ ],
  "panorama": null
}
```

### 6.2 Slide and element

```json
{
  "id": "s1",
  "slideType": "cover",
  "background": { "kind": "image", "assetId": "asset_3", "fit": "cover" },
  "elements": [
    {
      "id": "e1",
      "type": "text",
      "x": 72, "y": 600, "w": 936, "h": 300, "rotation": 0,
      "locked": false, "aiLocked": false, "hidden": false,
      "autoFit": { "enabled": true, "min": 40, "max": 96 },
      "runs": [
        { "text": "5 tips for ", "style": { "weight": 800 } },
        { "text": "beginner photographers", "style": { "weight": 800, "color": "#FFB703" } }
      ],
      "style": { "font": "heading", "size": 88, "lineHeight": 1.1, "align": "left" }
    }
  ]
}
```

Element types: `text`, `image`, `shape`, `line`, `icon`, `group`. Styles may reference design-system tokens (`"color": "token:primary"`) so palette changes propagate.

### 6.3 AI patch format

AI edits return operations, not whole documents:

```json
{
  "ops": [
    { "op": "update", "target": "e1", "set": { "style.size": 104, "y": 980 } },
    { "op": "add", "slide": "s1", "element": { "...": "..." } },
    { "op": "remove", "target": "e7" }
  ]
}
```

Rules: reject ops targeting elements with `aiLocked: true`; reject unknown IDs; clamp values to the canvas; apply the whole patch atomically as one undo step.

---

## 7. Cross-cutting rules

1. **Performance:** editing must stay smooth at 20 slides. Render only the active slide at full fidelity; thumbnails render lazily and are cached.
2. **Autosave:** debounce writes to IndexedDB; recover unsaved work after a crash or tab close.
3. **AI cost control:** generate **text first, images after**. Cache results by prompt hash. Surface a usage meter hook for Content OS credits. Batch carousel image generation with a concurrency limit and retries on rate-limit errors.
4. **Error handling:** every Gemini or network failure shows a specific, recoverable message ("Image generation failed, retry or keep the current background"). Never leave a slide half-updated.
5. **Accessibility:** keyboard-operable editor controls, visible focus states, and editable alt text on every exported image.
6. **Integration interfaces:** define typed interfaces for Content OS hooks (`onSendToScheduler`, `onSendToCaptionModule`, `loadBrandKit`, `syncProject`) and implement them as no-ops or local fallbacks so the module works standalone.
7. **Theming:** use Content OS design tokens so the module looks native.
8. **Testing:** unit-test patch validation and locked-element protection; snapshot-test export output for a fixed set of sample documents; include Hindi and long-text cases.

---

## 8. Out of scope for this spec

Video or animated export, Photoshop-level retouching, team collaboration and approval workflows, ad management, and direct publishing to platform APIs. Do not build these; leave extension points only.

---

## 9. Open decisions (ask the human, do not guess)

1. **Canvas library:** Konva or Fabric.js? (Affects text-run styling, masks, and export.)
2. **PDF generation:** client-side (for example jsPDF/pdf-lib from rendered images) or server-side? Vector text in PDFs requires more work than image-per-page.
3. **Storage:** is Content OS cloud storage ready, or is IndexedDB the only store at launch?
4. **Background remover model:** which in-browser model is acceptable for size and quality?
5. **Stock providers:** Unsplash, Pexels, or both?
6. **Gemini models:** confirm which text and image model names to use, and the per-user rate and credit limits.

---

## 10. Suggested build order

1. Scene graph schema, validation, and renderer (single slide).
2. Canvas interaction: select, move, resize, text editing, layers, undo/redo.
3. Export pipeline (PNG, then PDF/ZIP). Verify parity with the canvas **early**.
4. Carousel model: multi-slide, filmstrip, shared design system, recurring elements.
5. Gemini generation: copy, then layout, then images, with schema-validated output.
6. AI edit layer: patches, locking, regenerate-element, text actions, magic resize.
7. Assets: upload library, AI history, stock search.
8. Polish: panoramic mode, preview mode, filters, background remover, publish pack.

**Definition of done for v1:** a user can enter a brief, receive a carousel, edit any element manually or with AI, and export a pixel-accurate Instagram image set and a LinkedIn PDF, with Hindi text rendering correctly.
