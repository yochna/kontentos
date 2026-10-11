# KontentOS — Editorial Studio (Redesign)

A ground-up rebuild of the KontentOS web app in the **Paper Editorial / "Editorial Studio"**
design language, based on the redesign mockups in the parent folder.

## Stack

- **React 19 + TypeScript**
- **Vite 6** (dev server, port **4111**)
- **Tailwind CSS v4** (`@tailwindcss/vite`, CSS-first `@theme` tokens)
- **Fonts**: Newsreader (editorial display) + Hanken Grotesk (studio UI)
- **Icons**: Material Symbols Outlined (Google Fonts webfont)

## Design decisions implemented

1. **Smart Editor** is kept as its own separate screen (not merged into Raw → Reel).
2. A new **Home / Creator Command Center** screen is the default landing view.
3. The app **adopts the new design system** (Paper Editorial palette + typography).
4. **Light theme is the default**; a muted "Evergreen" dark theme is retained via the toggle.
5. The net-new screens (**Home, Content Library, Analytics**) plus Calendar, Brand Kit and
   Settings are all designed in the same language.

## Getting started

```bash
npm install
npm run dev      # http://localhost:4111
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

## Structure

```
app/
  index.html            # fonts + Material Symbols + root
  vite.config.ts        # react + tailwind plugins, port 4111
  src/
    main.tsx            # React entry
    App.tsx             # shell + client-side navigation
    index.css           # Tailwind import + design tokens (light + dark)
    lib/
      icons.tsx         # <Icon> Material Symbols wrapper
      theme.ts          # theme hook (light default, persisted)
      nav.ts            # navigation model
    data/
      mock.ts           # representative data for all screens
    components/
      Sidebar.tsx
      Topbar.tsx
      ui.tsx            # Button, Card, Chip, Badge, SectionTitle, Modal, StatusPill
    screens/
      CommandCenter.tsx  Ideas.tsx  RawReel.tsx  SmartEditor.tsx
      PublishSchedule.tsx ContentLibrary.tsx Calendar.tsx
      Analytics.tsx  BrandKit.tsx  Settings.tsx
```

> This is a UI redesign build. Screens run on representative mock data so the full
> feature set is navigable and reviewable before wiring the production backend.
