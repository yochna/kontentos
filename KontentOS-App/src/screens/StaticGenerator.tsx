import { useState, useRef, useEffect } from 'react';
import {
  StaticCardState,
  CardFormat,
  AspectRatio,
  ColorTheme,
  FontStyle,
  CreatorProfile,
  BackgroundPreset,
  CardMode,
  CarouselSlide,
  SlideType,
  LayerStyleConfig,
} from '../types/staticCard';
import {
  BACKGROUND_PRESETS,
  THEME_CONFIGS,
  DEFAULT_LAYER_STYLES,
} from '../data/staticCardPresets';
import { FormatTabs } from './StaticGenerator/components/FormatTabs';
import { CardCanvas } from './StaticGenerator/components/CardCanvas';
import { CanvasControls } from './StaticGenerator/components/CanvasControls';
import { CarouselSlideStepper } from './StaticGenerator/components/CarouselSlideStepper';
import { CreatorProfileSection } from './StaticGenerator/components/CreatorProfileSection';
import { BackgroundPicker } from './StaticGenerator/components/BackgroundPicker';
import { AspectRatioSelector } from './StaticGenerator/components/AspectRatioSelector';
import { ThemePicker } from './StaticGenerator/components/ThemePicker';
import { TypographyPicker } from './StaticGenerator/components/TypographyPicker';
import { LayerStylesControl } from './StaticGenerator/components/LayerStylesControl';
import { AICopyGenerator } from './StaticGenerator/components/AICopyGenerator';
import { CopyEditor } from './StaticGenerator/components/CopyEditor';
import { PublishPackDrawer } from './StaticGenerator/components/PublishPackDrawer';
import { PublishToCalendarModal } from './StaticGenerator/components/PublishToCalendarModal';
import { SlideRegenerateModal } from './StaticGenerator/components/SlideRegenerateModal';
import { useCardExporter } from './StaticGenerator/hooks/useCardExporter';
import { useCanvasInteraction } from './StaticGenerator/hooks/useCanvasInteraction';
import { getCanvasBounds } from './StaticGenerator/utils/canvasMath';
import { Button, Card, Eyebrow } from '@/components/ui';
import { Icon } from '@/lib/icons';
import { useStore, useDisplayProfile } from '@/lib/store';
import { navigate } from '@/lib/nav';
import { getSafeImageUrl } from '@/lib/images';

const DEFAULT_CAROUSEL_SLIDES: CarouselSlide[] = [
  {
    id: 1,
    headline: 'Most creators spend [80% of their time] on repetitive edits instead of high-leverage ideas.',
    supportingText: 'Here is the exact 3-step system to turn 1 raw thought into 6 high-converting assets in under 5 minutes.',
  },
  {
    id: 2,
    headline: 'Step 1: Capture the [Core Epiphany] without formatting.',
    supportingText: 'Never write a post directly inside Twitter or LinkedIn. Open a blank scratchpad and write your raw uncensored insight first.',
  },
  {
    id: 3,
    headline: 'Step 2: Split your insight into [Hook, Framework, and Takeaway].',
    supportingText: 'A high-converting slide deck always follows a 3-act structure. Give them the paradox, the proof, then the actionable playbook.',
  },
  {
    id: 4,
    headline: 'Step 3: Render as visual archetype cards with [High-Contrast Design].',
    supportingText: 'Visual text stops thumb scrolling 4.2x faster than plain text. Use clean typography with targeted accent glows.',
  },
  {
    id: 5,
    headline: 'The Playbook: [Execute This Framework Today].',
    supportingText: 'Consistency is not about motivation—it is about having systems that make posting feel effortless. Bookmark this framework for your next sprint.',
  },
];

export type StudioSection =
  | 'content'
  | 'typography'
  | 'theme'
  | 'styles'
  | 'ai'
  | 'background'
  | 'aspect'
  | 'branding';

interface SectionMeta {
  id: StudioSection;
  label: string;
  shortLabel: string;
  icon: string;
  eyebrow: string;
  description: string;
  badge?: string;
}

const STUDIO_SECTIONS: SectionMeta[] = [
  {
    id: 'ai',
    label: 'Gemini AI Writer',
    shortLabel: 'AI Copy',
    icon: 'auto_awesome',
    eyebrow: 'AI ACCELERATOR',
    description: 'Viral hooks, multi-slide decks & context-aligned copywriting',
    badge: 'Step 1',
  },
  {
    id: 'content',
    label: 'Copy & Headlines',
    shortLabel: 'Text',
    icon: 'edit_note',
    eyebrow: 'CONTENT & COPY',
    description: 'Headline, supporting text, bracket highlight & optical sizing',
  },
  {
    id: 'typography',
    label: 'Typography Bundles',
    shortLabel: 'Type',
    icon: 'format_size',
    eyebrow: 'CURATED TYPE BUNDLES',
    description: '8 designer-vetted headline & body font pairings with optical hierarchy',
    badge: 'Craft',
  },
  {
    id: 'theme',
    label: 'Themes & Colors',
    shortLabel: 'Themes',
    icon: 'palette',
    eyebrow: 'COLOR PALETTES',
    description: '14 curated Craft & Studio themes and dark/light mode',
  },
  {
    id: 'styles',
    label: 'Layer Styles & Glows',
    shortLabel: 'Styles',
    icon: 'layers',
    eyebrow: 'PHOTOCRAFT STYLES',
    description: 'Non-destructive elevation, neon glows, frosted glass & specular rim',
    badge: 'Craft',
  },
  {
    id: 'background',
    label: 'Backdrop & Atmosphere',
    shortLabel: 'Backdrop',
    icon: 'image',
    eyebrow: 'MEDIA & ATMOSPHERE',
    description: 'Stock photos, custom uploads, darkness overlays & lens blur',
  },
  {
    id: 'aspect',
    label: 'Format & Dimensions',
    shortLabel: 'Ratio',
    icon: 'aspect_ratio',
    eyebrow: 'CANVAS DIMENSIONS',
    description: '1:1 Square, 4:5 Portrait, 9:16 Story & 16:9 Landscape',
  },
  {
    id: 'branding',
    label: 'Brand & Creator Identity',
    shortLabel: 'Identity',
    icon: 'badge',
    eyebrow: 'AUTHOR & IDENTITY',
    description: 'Creator avatar, author name & handle attribution',
  },
];

export default function StaticGenerator() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { updateActiveDraft } = useStore();
  const profile = useDisplayProfile();
  const {
    isExporting,
    statusMessage,
    exportPNG,
    exportDeckSlides,
    exportLinkedInPDF,
    copyImageAndText,
    copyPostText,
  } = useCardExporter();

  const [showSafeZones, setShowSafeZones] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [isPublishPackOpen, setIsPublishPackOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [lastSlideUndo, setLastSlideUndo] = useState<{
    slideId: number;
    previous: { headline: string; supportingText: string };
  } | null>(null);
  const [activeSection, setActiveSection] = useState<StudioSection>('ai');

  // Keyboard shortcut: Press 'G' to toggle alignment grid
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'g' || e.key === 'G') {
        setShowGrid((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [state, setState] = useState<StaticCardState>({
    format: 'instagram-overlay',
    aspectRatio: '1:1',
    cardMode: 'dark',
    fontStyle: 'grotesk',
    headline: 'Most creators spend [80% of their time] on repetitive edits instead of high-leverage ideas.',
    supportingText: 'Here is the exact 3-step system to turn 1 raw thought into 6 high-converting assets in under 5 minutes.',
    socialCaption: 'Consistency is not about working harder—it is about removing friction from creation.\n\nSave this framework for your next production sprint.\n\n#ContentCreation #CreatorEconomy #Productivity #KontentOS',
    creator: {
      name: profile.real ? profile.name : '',
      handle: profile.real ? profile.handle : '',
      avatarUrl: '',
      verified: false,
    },
    showCreatorBadge: true,
    theme: 'midnight-cyan',
    backgroundUrl: getSafeImageUrl(BACKGROUND_PRESETS[0].url),
    backgroundCategory: BACKGROUND_PRESETS[0].category,
    overlayDarkness: 0.5,
    blurAmount: 0,
    showWatermark: false,
    slideCurrent: 1,
    slideTotal: DEFAULT_CAROUSEL_SLIDES.length,
    slides: DEFAULT_CAROUSEL_SLIDES,
    layerStyles: DEFAULT_LAYER_STYLES,
  });

  // ---- Canvas scene store wiring (undo/redo, snap, clipboard, per-slide scenes) ----
  const canvasImageInputRef = useRef<HTMLInputElement>(null);
  const setCanvasActiveSlide = useCanvasInteraction((s) => s.setActiveSlide);
  const snapEnabled = useCanvasInteraction((s) => s.snapEnabled);
  const toggleSnap = useCanvasInteraction((s) => s.toggleSnap);
  const canUndo = useCanvasInteraction((s) => s.past.length > 0);
  const canRedo = useCanvasInteraction((s) => s.future.length > 0);
  const canPaste = useCanvasInteraction((s) => s.clipboard !== null);
  const undoCanvas = useCanvasInteraction((s) => s.undo);
  const redoCanvas = useCanvasInteraction((s) => s.redo);
  const resetCanvasSlide = useCanvasInteraction((s) => s.resetSlide);
  const addCanvasTextBox = useCanvasInteraction((s) => s.addTextBox);
  const addCanvasImage = useCanvasInteraction((s) => s.addImageElement);
  const copyCanvasElement = useCanvasInteraction((s) => s.copySelectedElement);
  const pasteCanvasElement = useCanvasInteraction((s) => s.pasteClipboard);
  const setCanvasToast = useCanvasInteraction((s) => s.setToast);

  // Keep the canvas store pointed at the slide that is actually on screen.
  // Single-card formats always use scene 1.
  const canvasSlideKey = state.format === 'carousel-slide' ? state.slideCurrent ?? 1 : 1;
  useEffect(() => {
    setCanvasActiveSlide(canvasSlideKey);
  }, [canvasSlideKey, setCanvasActiveSlide]);

  const handleCanvasImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setCanvasToast('Please choose an image file');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setCanvasToast('Image must be under 6 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const bounds = getCanvasBounds();
      const img = new Image();
      img.onload = () => {
        addCanvasImage(bounds.width / 2, bounds.height / 2, src, img.naturalWidth, img.naturalHeight);
        setCanvasToast('Image added to canvas');
      };
      img.onerror = () => {
        addCanvasImage(bounds.width / 2, bounds.height / 2, src);
        setCanvasToast('Image added to canvas');
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleFormatChange = (format: CardFormat) => {
    setState((prev) => ({
      ...prev,
      format,
      // Smart default aspect ratio per format
      aspectRatio:
        format === 'linkedin-split'
          ? '16:9'
          : format === 'tweet-card'
          ? '1:1'
          : format === 'carousel-slide'
          ? '4:5'
          : prev.aspectRatio,
    }));
  };

  const handleRatioChange = (aspectRatio: AspectRatio) => {
    setState((prev) => ({ ...prev, aspectRatio }));
  };

  const handleThemeChange = (theme: ColorTheme) => {
    setState((prev) => ({ ...prev, theme }));
  };

  const handleCardModeChange = (cardMode: CardMode) => {
    setState((prev) => {
      const currentConfig = THEME_CONFIGS[prev.theme];
      if (currentConfig && currentConfig.mode === cardMode) {
        return { ...prev, cardMode };
      }
      return {
        ...prev,
        cardMode,
        theme: cardMode === 'light' ? 'deckcraft-paper' : 'deckcraft-harbor',
      };
    });
  };

  const handleCustomAccentChange = (customAccent: string | undefined) => {
    setState((prev) => ({ ...prev, customAccent }));
  };

  const handleFontChange = (fontStyle: FontStyle) => {
    setState((prev) => ({ ...prev, fontStyle }));
  };

  const handleLayerStylesChange = (layerStyles: LayerStyleConfig) => {
    setState((prev) => ({ ...prev, layerStyles }));
  };

  const handleCreatorChange = (updated: Partial<CreatorProfile>) => {
    setState((prev) => ({
      ...prev,
      creator: { ...prev.creator, ...updated },
    }));
  };

  const handleSelectPreset = (preset: BackgroundPreset) => {
    const safeUrl = preset.url ? getSafeImageUrl(preset.url) : '';
    setState((prev) => ({
      ...prev,
      backgroundUrl: safeUrl,
      customBackgroundUrl: safeUrl,
      backgroundCategory: preset.category,
      photographerAttribution: undefined,
    }));
  };

  const handleCustomUpload = (dataUrl: string) => {
    setState((prev) => ({
      ...prev,
      backgroundUrl: dataUrl,
      customBackgroundUrl: dataUrl,
      photographerAttribution: undefined,
    }));
  };

  const handleSelectStockPhoto = (photo: {
    url: string;
    proxyUrl: string;
    photographer: { name: string; username: string; profileUrl?: string };
  }) => {
    const safeUrl = photo.proxyUrl || getSafeImageUrl(photo.url);
    setState((prev) => ({
      ...prev,
      backgroundUrl: safeUrl,
      customBackgroundUrl: safeUrl,
      photographerAttribution: photo.photographer,
    }));
  };

  const handleRandomizePhoto = () => {
    const available = BACKGROUND_PRESETS.filter((p) => p.url && p.url !== state.backgroundUrl);
    if (available.length > 0) {
      const randomPreset = available[Math.floor(Math.random() * available.length)];
      const safeUrl = randomPreset.url ? getSafeImageUrl(randomPreset.url) : '';
      setState((prev) => ({
        ...prev,
        backgroundUrl: safeUrl,
        customBackgroundUrl: safeUrl,
        backgroundCategory: randomPreset.category,
        photographerAttribution: undefined,
      }));
    }
  };

  const handleAiGenerated = (data: { headline: string; supportingText: string; socialCaption?: string }) => {
    setState((prev) => {
      const slides = (prev.slides || DEFAULT_CAROUSEL_SLIDES).map((s, idx) =>
        idx === prev.slideCurrent - 1
          ? { ...s, headline: data.headline, supportingText: data.supportingText }
          : s
      );
      return {
        ...prev,
        headline: data.headline,
        supportingText: data.supportingText,
        socialCaption: data.socialCaption || prev.socialCaption,
        slides,
      };
    });
    setActiveSection('content');
  };

  const handleDeckGenerated = (data: { slides: CarouselSlide[]; socialCaption?: string }) => {
    setState((prev) => ({
      ...prev,
      slides: data.slides,
      slideTotal: data.slides.length,
      slideCurrent: 1,
      headline: data.slides[0]?.headline || prev.headline,
      supportingText: data.slides[0]?.supportingText || prev.supportingText,
      socialCaption: data.socialCaption || prev.socialCaption,
    }));
    setActiveSection('content');
  };

  const handleHeadlineChange = (headline: string) => {
    setState((prev) => {
      const slides = (prev.slides || DEFAULT_CAROUSEL_SLIDES).map((s, idx) =>
        idx === prev.slideCurrent - 1 ? { ...s, headline } : s
      );
      return {
        ...prev,
        headline,
        slides,
      };
    });
  };

  const handleSupportingTextChange = (supportingText: string) => {
    setState((prev) => {
      const slides = (prev.slides || DEFAULT_CAROUSEL_SLIDES).map((s, idx) =>
        idx === prev.slideCurrent - 1 ? { ...s, supportingText } : s
      );
      return {
        ...prev,
        supportingText,
        slides,
      };
    });
  };

  const handleSelectSlide = (slideId: number) => {
    setState((prev) => {
      const slides = prev.slides || DEFAULT_CAROUSEL_SLIDES;
      const targetIdx = slides.findIndex((s) => s.id === slideId);
      if (targetIdx === -1) return prev;
      const targetSlide = slides[targetIdx];
      return {
        ...prev,
        slideCurrent: targetIdx + 1,
        headline: targetSlide.headline,
        supportingText: targetSlide.supportingText,
        slideType: targetSlide.slideType || 'standard',
        statValue: targetSlide.statValue,
      };
    });
  };

  const handleChangeSlideType = (slideType: SlideType) => {
    setState((prev) => {
      const slides = (prev.slides || DEFAULT_CAROUSEL_SLIDES).map((s, idx) =>
        idx === prev.slideCurrent - 1 ? { ...s, slideType } : s
      );
      return {
        ...prev,
        slides,
        slideType,
      };
    });
  };

  const handleAddSlide = () => {
    setState((prev) => {
      const slides = prev.slides || DEFAULT_CAROUSEL_SLIDES;
      const newId = Math.max(0, ...slides.map((s) => s.id)) + 1;
      const stepNum = Math.max(1, slides.length);
      const newSlide: CarouselSlide = {
        id: newId,
        headline: `Step ${stepNum}: [Actionable Leverage Multiplier]`,
        supportingText: 'Define the concrete framework rule, operational boundary, or tactical execution method for this step.',
      };
      const updatedSlides = [...slides, newSlide];
      return {
        ...prev,
        slides: updatedSlides,
        slideTotal: updatedSlides.length,
        slideCurrent: updatedSlides.length,
        headline: newSlide.headline,
        supportingText: newSlide.supportingText,
      };
    });
  };

  const handleDeleteSlide = (slideId: number) => {
    setState((prev) => {
      const slides = prev.slides || DEFAULT_CAROUSEL_SLIDES;
      if (slides.length <= 1) return prev;
      const updatedSlides = slides.filter((s) => s.id !== slideId);
      const newCurrent = Math.min(prev.slideCurrent, updatedSlides.length);
      const activeSlide = updatedSlides[newCurrent - 1];
      return {
        ...prev,
        slides: updatedSlides,
        slideTotal: updatedSlides.length,
        slideCurrent: newCurrent,
        headline: activeSlide.headline,
        supportingText: activeSlide.supportingText,
      };
    });
  };

  const handleMoveSlide = (direction: 'left' | 'right') => {
    setState((prev) => {
      const slides = [...(prev.slides || DEFAULT_CAROUSEL_SLIDES)];
      const currentIndex = prev.slideCurrent - 1;
      const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;

      if (targetIndex < 0 || targetIndex >= slides.length) return prev;

      // Swap slide positions in array
      const temp = slides[currentIndex];
      slides[currentIndex] = slides[targetIndex];
      slides[targetIndex] = temp;

      const newSlideCurrent = targetIndex + 1;
      const activeSlide = slides[targetIndex];

      return {
        ...prev,
        slides,
        slideCurrent: newSlideCurrent,
        headline: activeSlide.headline,
        supportingText: activeSlide.supportingText,
      };
    });
  };

  const switchToSlide = async (slideNum: number) => {
    setState((prev) => {
      const slides = prev.slides || DEFAULT_CAROUSEL_SLIDES;
      const slide = slides[slideNum - 1];
      if (!slide) return prev;
      return {
        ...prev,
        slideCurrent: slideNum,
        headline: slide.headline,
        supportingText: slide.supportingText,
        slideType: slide.slideType || 'standard',
        statValue: slide.statValue,
      };
    });
  };

  const handleApplySlideRegeneration = (
    newSlide: { headline: string; supportingText: string },
    oldSnapshot: { headline: string; supportingText: string }
  ) => {
    const activeSlides = state.slides || DEFAULT_CAROUSEL_SLIDES;
    const activeSlide = activeSlides[state.slideCurrent - 1] || activeSlides[0];

    if (activeSlide) {
      setLastSlideUndo({
        slideId: activeSlide.id,
        previous: oldSnapshot,
      });
    }

    setState((prev) => {
      const slides = (prev.slides || DEFAULT_CAROUSEL_SLIDES).map((s, idx) =>
        idx === prev.slideCurrent - 1
          ? { ...s, headline: newSlide.headline, supportingText: newSlide.supportingText }
          : s
      );
      return {
        ...prev,
        headline: newSlide.headline,
        supportingText: newSlide.supportingText,
        slides,
      };
    });
  };

  const handleUndoSlide = () => {
    if (!lastSlideUndo) return;
    const { slideId, previous } = lastSlideUndo;

    setState((prev) => {
      const slides = (prev.slides || DEFAULT_CAROUSEL_SLIDES).map((s) =>
        s.id === slideId
          ? { ...s, headline: previous.headline, supportingText: previous.supportingText }
          : s
      );
      return {
        ...prev,
        headline: previous.headline,
        supportingText: previous.supportingText,
        slides,
      };
    });

    setLastSlideUndo(null);
  };

  const handleSendToPublish = () => {
    updateActiveDraft({
      title: state.headline.slice(0, 60),
      publishing: {
        caption: `${state.headline}\n\n${state.supportingText}\n\n${state.socialCaption || ''}`,
        hashtags: ['ContentStrategy', 'CreatorEconomy', 'KontentOS'],
        platforms: ['instagram', 'linkedin', 'x'],
      },
      step: 'publish',
    });
    navigate('publish-schedule');
  };

  const activeSlides = state.slides || DEFAULT_CAROUSEL_SLIDES;
  const activeSlideIndex = Math.max(0, Math.min(state.slideCurrent - 1, activeSlides.length - 1));
  const currentActiveSlide = activeSlides[activeSlideIndex] || {
    id: 1,
    headline: state.headline,
    supportingText: state.supportingText,
  };
  const previousSlideObj = activeSlideIndex > 0 ? activeSlides[activeSlideIndex - 1] : null;
  const nextSlideObj = activeSlideIndex < activeSlides.length - 1 ? activeSlides[activeSlideIndex + 1] : null;

  const currentSectionIndex = STUDIO_SECTIONS.findIndex((s) => s.id === activeSection);
  const currentSectionMeta = STUDIO_SECTIONS[currentSectionIndex] || STUDIO_SECTIONS[0];

  const handlePrevSection = () => {
    const prevIdx = (currentSectionIndex - 1 + STUDIO_SECTIONS.length) % STUDIO_SECTIONS.length;
    setActiveSection(STUDIO_SECTIONS[prevIdx].id);
  };

  const handleNextSection = () => {
    const nextIdx = (currentSectionIndex + 1) % STUDIO_SECTIONS.length;
    setActiveSection(STUDIO_SECTIONS[nextIdx].id);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto font-body">
      {/* Editorial Screen Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <Eyebrow>VISUAL ARCHETYPES & STATIC CREATOR STUDIO</Eyebrow>
          <h1 className="text-3xl font-display font-medium text-ink mt-1">
            Static Post Studio
          </h1>
          <p className="text-sm text-ink-muted mt-1 max-w-2xl">
            Transform raw insights into high-converting visual graphics with Gemini AI, custom typography, and 1-click 300 DPI exports.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon="refresh"
            onClick={() => handleRandomizePhoto()}
          >
            Randomize Photo
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon="calendar_month"
            onClick={() => setIsCalendarModalOpen(true)}
            className="shadow-sm font-semibold"
          >
            Export to Calendar
          </Button>

          <Button
            variant="soft"
            size="sm"
            icon="schedule_send"
            onClick={handleSendToPublish}
          >
            Send to Publish
          </Button>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Live Canvas & Actions (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-5 space-y-5">
            {/* Format Archetype Tabs */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-ink-muted">Format Archetype</span>
              <FormatTabs
                currentFormat={state.format}
                onSelectFormat={handleFormatChange}
              />
            </div>

            {/* Carousel Deck Stepper (Visible when Carousel format is active) */}
            {state.format === 'carousel-slide' && (
              <CarouselSlideStepper
                slides={state.slides || DEFAULT_CAROUSEL_SLIDES}
                currentSlideId={
                  (state.slides || DEFAULT_CAROUSEL_SLIDES)[state.slideCurrent - 1]?.id ?? 1
                }
                onSelectSlide={handleSelectSlide}
                onAddSlide={handleAddSlide}
                onDeleteSlide={handleDeleteSlide}
                onOpenRegenerate={() => setIsRegenerateModalOpen(true)}
              />
            )}

            {/* Live Card Viewport Canvas Container */}
            <div className="rounded-card bg-surface-2/60 border border-line p-4 sm:p-6 min-h-[460px] flex items-center justify-center relative overflow-hidden">
              {/* Floating Quick Indicators & Toggles */}
              <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowSafeZones((prev) => !prev)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border backdrop-blur-md transition-all cursor-pointer ${
                    showSafeZones
                      ? 'bg-primary text-on-primary border-primary shadow-sm ring-1 ring-primary/40'
                      : 'bg-surface/80 hover:bg-surface text-ink-muted hover:text-ink border-line'
                  }`}
                  title="Toggle Instagram and LinkedIn platform safe zones & crop boundaries"
                >
                  <span className="text-[12px]">📐</span>
                  <span>{showSafeZones ? 'Safe Zones: On' : 'Safe Zones'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowGrid((prev) => !prev)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border backdrop-blur-md transition-all cursor-pointer ${
                    showGrid
                      ? 'bg-primary text-on-primary border-primary shadow-sm ring-1 ring-primary/40'
                      : 'bg-surface/80 hover:bg-surface text-ink-muted hover:text-ink border-line'
                  }`}
                  title="Toggle 3×3 Rule-of-Thirds alignment grid (Press G)"
                >
                  <span className="text-[12px]">⊞</span>
                  <span>{showGrid ? 'Grid: On' : 'Grid (G)'}</span>
                </button>
              </div>

              <CardCanvas
                state={state}
                canvasRef={canvasRef}
                showSafeZones={showSafeZones}
                showGrid={showGrid}
                isExporting={isExporting}
              />
            </div>

            {/* Canvas Actions Toolbar */}
            <div className="pt-2 border-t border-line">
              <CanvasControls
                isExporting={isExporting}
                isCarouselFormat={state.format === 'carousel-slide'}
                slideCount={state.slides?.length || state.slideTotal || 5}
                snapEnabled={snapEnabled}
                onToggleSnap={toggleSnap}
                canUndo={canUndo}
                canRedo={canRedo}
                canPaste={canPaste}
                onUndo={undoCanvas}
                onRedo={redoCanvas}
                onResetLayout={resetCanvasSlide}
                onAddText={() => {
                  const b = getCanvasBounds();
                  addCanvasTextBox(b.width / 2, b.height / 2);
                }}
                onAddImage={() => canvasImageInputRef.current?.click()}
                onCopy={copyCanvasElement}
                onPaste={() => pasteCanvasElement()}
                onOpenPublishPack={() => setIsPublishPackOpen(true)}
                onOpenPublishToCalendar={() => setIsCalendarModalOpen(true)}
                onExportPNG={() => exportPNG(canvasRef.current, state)}
                onExportEntireDeck={() => exportDeckSlides(canvasRef.current, state, switchToSlide)}
                onExportLinkedInPDF={() => exportLinkedInPDF(canvasRef.current, state, switchToSlide)}
                onCopyImageAndText={() => copyImageAndText(canvasRef.current, state)}
                copiedStatus={statusMessage}
              />
              <input
                ref={canvasImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCanvasImageFile(file);
                  e.target.value = '';
                }}
              />
            </div>
          </Card>
        </div>

        {/* Right Column: Studio Controls Panel (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-4 sm:p-5 space-y-4">
            {/* Studio Tool Inspector Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <Icon name={currentSectionMeta.icon} size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-primary font-bold">
                      {currentSectionMeta.eyebrow}
                    </span>
                    {currentSectionMeta.badge && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full font-mono uppercase tracking-tight bg-primary/15 text-primary font-bold">
                        {currentSectionMeta.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-ink truncate leading-tight">
                    {currentSectionMeta.label}
                  </h3>
                </div>
              </div>

              {/* Prev / Next Stepper */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handlePrevSection}
                  title="Previous tool"
                  className="p-1.5 rounded-lg hover:bg-surface-2 text-ink-muted hover:text-ink border border-line text-xs transition-colors cursor-pointer flex items-center justify-center"
                >
                  <Icon name="chevron_left" size={16} />
                </button>
                <span className="text-xs font-mono font-medium text-ink-dim px-1">
                  {currentSectionIndex + 1}/{STUDIO_SECTIONS.length}
                </span>
                <button
                  type="button"
                  onClick={handleNextSection}
                  title="Next tool"
                  className="p-1.5 rounded-lg hover:bg-surface-2 text-ink-muted hover:text-ink border border-line text-xs transition-colors cursor-pointer flex items-center justify-center"
                >
                  <Icon name="chevron_right" size={16} />
                </button>
              </div>
            </div>

            {/* Horizontal Tool Selection Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {STUDIO_SECTIONS.map((sec) => {
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setActiveSection(sec.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 cursor-pointer select-none shrink-0 ${
                      isActive
                        ? 'bg-primary text-on-primary shadow-sm font-semibold ring-1 ring-primary/30'
                        : 'bg-surface text-ink-muted border border-line hover:text-ink hover:bg-surface-2 hover:border-line-strong'
                    }`}
                    title={`${sec.label}: ${sec.description}`}
                  >
                    <Icon name={sec.icon} size={15} />
                    <span>{sec.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {/* Feature Viewport - Renders ONLY the selected tool */}
            <div className="min-h-[320px]">
              {activeSection === 'content' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <CopyEditor
                    headline={state.headline}
                    supportingText={state.supportingText}
                    textSizeAdjust={state.textSizeAdjust ?? 0}
                    onHeadlineChange={handleHeadlineChange}
                    onSupportingTextChange={handleSupportingTextChange}
                    onTextSizeAdjustChange={(textSizeAdjust) => setState((prev) => ({ ...prev, textSizeAdjust }))}
                    onOpenRegenerate={() => setIsRegenerateModalOpen(true)}
                    hasUndo={lastSlideUndo?.slideId === currentActiveSlide.id}
                    onUndo={handleUndoSlide}
                    onDismissUndo={() => setLastSlideUndo(null)}
                  />
                </div>
              )}

              {activeSection === 'typography' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <TypographyPicker
                    fontStyle={state.fontStyle}
                    onSelectFont={handleFontChange}
                    textSizeAdjust={state.textSizeAdjust ?? 0}
                    onTextSizeAdjustChange={(textSizeAdjust) => setState((prev) => ({ ...prev, textSizeAdjust }))}
                  />
                </div>
              )}

              {activeSection === 'theme' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <ThemePicker
                    currentTheme={state.theme}
                    fontStyle={state.fontStyle}
                    cardMode={state.cardMode || 'dark'}
                    customAccent={state.customAccent}
                    onSelectTheme={handleThemeChange}
                    onSelectFont={handleFontChange}
                    onSelectMode={handleCardModeChange}
                    onSelectCustomAccent={handleCustomAccentChange}
                  />
                </div>
              )}

              {activeSection === 'styles' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <LayerStylesControl
                    layerStyles={state.layerStyles}
                    activeAccent={THEME_CONFIGS[state.theme]?.accent || '#00e5ff'}
                    onChange={handleLayerStylesChange}
                  />
                </div>
              )}

              {activeSection === 'ai' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <AICopyGenerator
                    format={state.format}
                    onGenerated={handleAiGenerated}
                    onDeckGenerated={handleDeckGenerated}
                  />
                </div>
              )}

              {activeSection === 'background' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <BackgroundPicker
                    currentUrl={state.backgroundUrl}
                    overlayDarkness={state.overlayDarkness}
                    blurAmount={state.blurAmount}
                    onSelectPreset={handleSelectPreset}
                    onCustomUpload={handleCustomUpload}
                    onSelectStockPhoto={handleSelectStockPhoto}
                    onUpdateOverlay={(overlayDarkness) => setState((prev) => ({ ...prev, overlayDarkness }))}
                    onUpdateBlur={(blurAmount) => setState((prev) => ({ ...prev, blurAmount }))}
                  />
                </div>
              )}

              {activeSection === 'aspect' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <AspectRatioSelector
                    currentRatio={state.aspectRatio}
                    onSelectRatio={handleRatioChange}
                  />
                </div>
              )}

              {activeSection === 'branding' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <CreatorProfileSection
                    creator={state.creator}
                    showCreatorBadge={state.showCreatorBadge}
                    onToggleBadge={(show) => setState((prev) => ({ ...prev, showCreatorBadge: show }))}
                    onChange={handleCreatorChange}
                  />
                </div>
              )}
            </div>

            {/* Persistent Actions & Stepper Footer */}
            <div className="pt-2 border-t border-line space-y-3">
              <div className="flex items-center justify-between text-xs text-ink-muted px-0.5">
                <span className="text-[11px] text-ink-dim">
                  Tool {currentSectionIndex + 1} of {STUDIO_SECTIONS.length}
                </span>
                <button
                  type="button"
                  onClick={handleNextSection}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
                >
                  <span>Next: {STUDIO_SECTIONS[(currentSectionIndex + 1) % STUDIO_SECTIONS.length].shortLabel}</span>
                  <Icon name="arrow_forward" size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  variant="primary"
                  size="md"
                  icon={isExporting ? undefined : 'download'}
                  disabled={isExporting}
                  onClick={() => exportPNG(canvasRef.current, state)}
                  className="w-full justify-center"
                >
                  <span>Export PNG</span>
                </Button>

                <Button
                  variant="secondary"
                  size="md"
                  icon="content_copy"
                  onClick={() => copyPostText(state)}
                  className="w-full justify-center"
                >
                  <span>Copy Post Text</span>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* One-Click Publish Pack Modal Drawer */}
      <PublishPackDrawer
        isOpen={isPublishPackOpen}
        onClose={() => setIsPublishPackOpen(false)}
        state={state}
        onOpenPublishToCalendar={() => setIsCalendarModalOpen(true)}
      />

      {/* 1-Click Publish to Calendar Modal */}
      <PublishToCalendarModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        state={state}
        canvasRef={canvasRef}
      />

      {/* Context-Aware Slide AI Regeneration Modal (Task 2.4.2) */}
      <SlideRegenerateModal
        isOpen={isRegenerateModalOpen}
        onClose={() => setIsRegenerateModalOpen(false)}
        slideIndex={state.slideCurrent}
        totalSlides={activeSlides.length}
        currentSlide={{
          headline: state.headline,
          supportingText: state.supportingText,
        }}
        previousSlide={previousSlideObj}
        nextSlide={nextSlideObj}
        topic={state.headline}
        onApplyRegeneration={handleApplySlideRegeneration}
      />
    </div>
  );
}
