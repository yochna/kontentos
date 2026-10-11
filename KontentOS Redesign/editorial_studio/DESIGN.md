---
name: Editorial Studio
colors:
  surface: '#f4fbf6'
  surface-dim: '#d4dcd7'
  surface-bright: '#f4fbf6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eef5f0'
  surface-container: '#e8f0ea'
  surface-container-high: '#e3eae5'
  surface-container-highest: '#dde4df'
  on-surface: '#161d1a'
  on-surface-variant: '#404945'
  inverse-surface: '#2b322f'
  inverse-on-surface: '#ebf2ed'
  outline: '#707975'
  outline-variant: '#c0c9c3'
  surface-tint: '#346858'
  primary: '#0a4436'
  on-primary: '#ffffff'
  primary-container: '#285c4d'
  on-primary-container: '#9dd2bf'
  inverse-primary: '#9cd2be'
  secondary: '#406658'
  on-secondary: '#ffffff'
  secondary-container: '#c2ecda'
  on-secondary-container: '#466c5e'
  tertiary: '#5d3105'
  on-tertiary: '#ffffff'
  tertiary-container: '#79471b'
  on-tertiary-container: '#feb882'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b7eeda'
  primary-fixed-dim: '#9cd2be'
  on-primary-fixed: '#002018'
  on-primary-fixed-variant: '#1a4f41'
  secondary-fixed: '#c2ecda'
  secondary-fixed-dim: '#a7cfbf'
  on-secondary-fixed: '#002117'
  on-secondary-fixed-variant: '#284e41'
  tertiary-fixed: '#ffdcc4'
  tertiary-fixed-dim: '#feb882'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6a3b0f'
  background: '#f4fbf6'
  on-background: '#161d1a'
  surface-variant: '#dde4df'
typography:
  display:
    fontFamily: Newsreader
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Newsreader
    fontSize: 36px
    fontWeight: '400'
    lineHeight: 44px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Newsreader
    fontSize: 36px
    fontWeight: '400'
    lineHeight: 44px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Newsreader
    fontSize: 28px
    fontWeight: '400'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Newsreader
    fontSize: 26px
    fontWeight: '400'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Newsreader
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Newsreader
    fontSize: 19px
    fontWeight: '400'
    lineHeight: 32px
    letterSpacing: 0.005em
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes an atelier-grade workspace for independent writers, researchers, and multimedia publishers. The emotional tone evokes the tactile serenity of archival print publications, high-end literary broadsheets, and Scandinavian design studios. Rather than presenting as an ephemeral SaaS dashboard, the environment acts as a permanent, quiet writing sanctuary that balances editorial gravitas with modern publishing velocity.

The style unites **Minimalism** and **Modern Editorial Structure**. Visual hierarchy relies on expansive cream negative space, precise baseline grids, disciplined typographic pairing, and architectural borderlines rather than loud background fills or heavy drop shadows. The aesthetic respects the creator's mental bandwidth by keeping utility framing muted, ensuring that draft text, archival media, and composition canvases remain the dominant focal anchors.

## Colors

The palette is anchored in archival paper substrates and vegetable-tanned print inks, avoiding synthetic primaries in favor of deep vegetal and earthen tones.

- **Primary (`#285C4D`)**: Deep forest green utilized for high-intent actions, active publishing controls, focus-mode indicators, and primary branding moments.
- **Secondary (`#4D7365`)**: Muted pine used for interactive secondary elements, active metadata tags, progressive disclosure toggles, and contextual highlights.
- **Tertiary (`#C98A58`)**: Warm terracotta used sparingly for revision flags, editorial alerts, and real-time review markers.
- **Neutral (`#1E2522`)**: Deep carbon-forest black for primary reading copy, titles, and high-emphasis structure.
- **Canvas & Surfaces**:
  - Application Canvas: `#FAF9F5` (warm archival cream).
  - Studio Workspace Surfaces: `#FFFFFF` (pure white sheet overlay).
  - Elevated Popovers & Overlays: `#FFFFFF`.
- **Text & Structure**:
  - Primary Typography: `#1E2522`.
  - Secondary Typography & Metadata: `#68736D` (subdued stone green).
  - Subtle Borders & Rules: `#DDE7DF` (pale lichen line weight).

## Typography

The typographic hierarchy features a strict dual-voice architecture:
- **Editorial Voice (Newsreader)**: Utilized for all high-level display headers, article composition viewports, longform narratives, and pull quotes. It instills an authoritative, literary pace reminiscent of century-old periodicals. It employs optical sizing and generous line heights to minimize eye fatigue during prolonged reading and writing sessions.
- **Studio Interface Voice (Hanken Grotesk)**: Utilized for all studio instrumentation, navigation, metadata ribbons, control bars, metrics, and property panels. Sharp, neutral, and contemporary, it stays quiet until summoned.

Rules for implementation:
- Draft longform body copy must always use `body-lg` (Newsreader, 19px/32px) to honor proper editorial proportions.
- All structural system labels and status badges must render in `label-sm` or `label-md` with slight positive tracking (`0.02em` to `0.04em`) to ensure legibility against subtle borders.

## Layout & Spacing

The spatial engine utilizes an asymmetrical studio layout modeled after an artist's drafting desk:
- **Canvas Model**: The root background `#FAF9F5` forms the foundation. Work areas, document pages, and media canvases sit atop this field as discrete `#FFFFFF` physical sheets framed by 1px `#DDE7DF` dividers.
- **Desktop (>= 1280px)**: Three-pane layout consisting of a fixed utilitarian sidebar (64px collapsed or 240px expanded), an unbounded primary editor desk with a centered 740px maximum reading column, and an optional 360px collapsible context inspector.
- **Tablet (768px - 1279px)**: Inspector collapses into a sliding drawer. Main content area maintains 24px outer margins and fluid column distribution.
- **Mobile (< 768px)**: Single column with edge-to-edge `#FFFFFF` active cards sitting directly over `#FAF9F5`. Navigation folds into a persistent bottom sheet or floating toolbar. Margins compress to 16px.

Gaps and paddings follow a disciplined 4px baseline rhythm (`space-xs` through `space-xl`). Ample whitespace is mandatory around drafting surfaces—a minimum of `space-xl` (40px) must breathe around any active publishing canvas on desktop viewports.

## Elevation & Depth

Visual hierarchy does not use diffuse dark dropshadows or heavy blur layers. Depth is constructed through **Tonal Stacking and Fine Architectural Linework**:

- **Level 0 (Desk Bed)**: The base background `#FAF9F5`.
- **Level 1 (Paper Surface / Cards)**: `#FFFFFF` sheets defined by a crisp 1px solid `#DDE7DF` outline. When elevated slightly off the desk, apply a faint, warm ambient contact shadow: `box-shadow: 0 1px 3px rgba(30, 37, 34, 0.04), 0 4px 12px rgba(30, 37, 34, 0.02)`.
- **Level 2 (Active Floating Palettes / Menus)**: `#FFFFFF` surfaces with 1px `#DDE7DF` border and a soft ambient tint: `box-shadow: 0 8px 24px rgba(30, 37, 34, 0.06), 0 2px 6px rgba(30, 37, 34, 0.04)`.
- **Level 3 (Modal Dialogs & Asset Preview Overlays)**: `#FFFFFF` backing with an overlaid scrim of `#1E2522` at 20% opacity, maintaining visual connection to the warm canvas below.

## Shapes

The interface embraces a tailored **12px (`0.75rem`) default radius** for primary cards, media containers, contextual inspector panels, and input fields. This strikes a balance between classical bookbinding angles and modern software softness.

- **Primary Cards & Workspaces**: 12px radius with a uniform 1px `#DDE7DF` border.
- **Buttons & Interactive Inputs**: 8px radius for compact mechanical action, preserving crisp click targets.
- **Pills & Status Indicators**: Full rounded pill (`9999px`) reserved exclusively for publication state indicators (e.g., Draft, In Review, Live) and filter chips.
- **Asset / Video Tiles**: Strictly 12px exterior radius with clipped inner media to retain structural continuity across the asset grid.

## Components

### Buttons
- **Primary Action**: Solid `#285C4D` background, `#FFFFFF` label, 8px corner radius, zero border. Subtle hover shift to `#1F473B`.
- **Secondary Action**: `#FFFFFF` background with 1px `#DDE7DF` border, `#1E2522` text. Hover changes background to `#FAF9F5` and border to `#68736D`.
- **Tertiary / Ghost**: Transparent background, `#68736D` text. Hover shifts text to `#1E2522` with a `#FAF9F5` tint.

### Inputs & Text Areas
- Built on `#FFFFFF` with a 1px `#DDE7DF` border and 8px corner radius. Placeholder text in `#68736D` at 60% opacity.
- Focus state: Border color transitions sharply to `#285C4D` with an offset hairline ring: `box-shadow: 0 0 0 1px #285C4D`.

### Cards & Media Panels
- Crisp `#FFFFFF` containers with 12px rounded corners and a 1px `#DDE7DF` boundary.
- Media cards display rich asset previews flush to the top edge with metadata fields anchored below in generous 16px internal padding.

### Chips & Badges
- **Status Chips**: Subtle tinted backgrounds (`#FAF9F5` or `#285C4D` at 8% opacity) paired with a 1px matching border and `label-sm` typography in `#285C4D`.
- **Filter Tags**: Pill-shaped (`9999px`), `#FFFFFF` base, 1px `#DDE7DF` outline, shifting to `#285C4D` text and border upon selection.

### Checkboxes & Radio Controls
- 16px squares (checkbox) or circles (radio) with 1px `#DDE7DF` border on a `#FFFFFF` substrate.
- Checked state fills with `#285C4D` with a crisp white check glyph or inner pip.

### Lists & Outlines
- Border-bottom dividers using 1px `#DDE7DF`. Row hover triggers a subtle background transition to `#FAF9F5`.
- Secondary metadata aligned right in `label-md` (`#68736D`).

### Editorial Toolbar (Specific to Studio)
- Floating contextual bar with `#FFFFFF` background, 1px `#DDE7DF` frame, Level 2 ambient shadow, and 8px internal tool spacing. Dividers rendered as 1px by 16px vertical lines in `#DDE7DF`.