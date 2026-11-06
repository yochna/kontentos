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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';
import { Icon } from '@/lib/icons';
import { useStore, useDisplayProfile } from '@/lib/store';
import { navigate } from '@/lib/nav';
import { getSafeImageUrl } from '@/lib/images';

// What a deck looks like before anyone writes it: the five-move shape, with every line still blank.
// Pre-filling finished sentences here would put words nobody chose onto an exported image.
const DEFAULT_CAROUSEL_SLIDES: CarouselSlide[] = [
  {
    id: 1,
    headline: '[the claim this deck makes]',
    supportingText: '[why you are making it — one sentence, in your own words]',
  },
  {
    id: 2,
    headline: '[first move]',
    supportingText: '[what to do, and what it took off your plate]',
  },
  {
    id: 3,
    headline: '[second move]',
    supportingText: '[the part most people get wrong, if you have actually seen it]',
  },
  {
    id: 4,
    headline: '[third move]',
    supportingText: '[what changed for you after doing it]',
  },
  {
    id: 5,
    headline: '[what the reader should do next]',
    supportingText: 'KontentOS scaffold — fill every bracket before exporting.',
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
  /** One line under the tool's name, and the same line in its tooltip — so it has to stay true. */
  description: string;
}

const STUDIO_SECTIONS: SectionMeta[] = [
  {
    id: 'ai',
    label: 'Write from a prompt',
    shortLabel: 'Write',
    icon: 'auto_awesome',
    description: 'Ask the copy engine for this card, or for the whole deck',
  },
  {
    id: 'content',
    label: 'Copy on the card',
    shortLabel: 'Text',
    icon: 'edit_note',
    description: 'Headline and body of the slide you are standing on',
  },
  {
    id: 'typography',
    label: 'Type pairing',
    shortLabel: 'Type',
    icon: 'format_size',
    description: 'Eight headline-and-body pairs, each with its own scale',
  },
  {
    id: 'theme',
    label: 'Colour theme',
    shortLabel: 'Themes',
    icon: 'palette',
    description: 'Fourteen palettes, each with a light and a dark set',
  },
  {
    id: 'styles',
    label: 'Layer styles',
    shortLabel: 'Styles',
    icon: 'layers',
    description: 'Depth, glow, frost and rim on the text layers',
  },
  {
    id: 'background',
    label: 'Backdrop',
    shortLabel: 'Backdrop',
    icon: 'image',
    description: 'Stock photo, your own upload, dimming and blur',
  },
  {
    id: 'aspect',
    label: 'Canvas size',
    shortLabel: 'Ratio',
    icon: 'aspect_ratio',
    description: '1:1, 4:5, 9:16 or 16:9',
  },
  {
    id: 'branding',
    label: 'Author line',
    shortLabel: 'Identity',
    icon: 'badge',
    description: 'Avatar, name and handle printed on the card',
  },
];

export default function StaticGenerator() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { updateActiveDraft } = useStore();
  const profile = useDisplayProfile();
  const {
    isExporting,
    progressMessage,
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
    headline: '[the claim this deck makes]',
    supportingText: '[why you are making it — one sentence, in your own words]',
    socialCaption: '',
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
        headline: `Step ${stepNum}: [the move you make here]`,
        supportingText: '[what to do, and what it took off your plate]',
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
        // The deck's own caption is the only source of tags here. A fixed set of generic ones would
        // ship words into the creator's post that neither they nor the engine chose.
        hashtags: Array.from(new Set((state.socialCaption || '').match(/#[A-Za-z0-9_\u0590-\u05ff]+/g) || [])).map((t) =>
          t.replace(/^#/, '')
        ),
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
      {/* Bench-scale station header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <Eyebrow>Cut · Card</Eyebrow>
          <h1 className="mt-1 font-display text-[21px] font-bold leading-tight text-ink sm:text-[24px]">
            Card studio
          </h1>
          <p className="text-[13px] text-ink-muted mt-1.5 max-w-2xl">
            Turn one insight into a static slide post: layout, type and caption, exported as an image you can post.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon="refresh"
            onClick={() => handleRandomizePhoto()}
          >
            Shuffle backdrop
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
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-ink-muted">Card shape</span>
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

            {/* The bench's own toolbar: what you do to the card, above the card. It sits here
                because the artboard is taller than the stage, and export should never be
                something you have to scroll to find. */}
            <div className="border-t border-line pt-4">
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
                progress={progressMessage}
              />
            </div>

            {/* Live Card Viewport Canvas Container */}
            <div className="rounded-card bg-surface-2/60 border border-line p-4 sm:p-6 min-h-[460px] flex items-center justify-center relative overflow-hidden">
              {/* Floating Quick Indicators & Toggles */}
              <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
                <Tooltip content="Show the Instagram and LinkedIn safe zones and crop boundaries" side="bottom">
                  <button
                    type="button"
                    onClick={() => setShowSafeZones((prev) => !prev)}
                    aria-pressed={showSafeZones}
                    className={`inline-flex items-center gap-1 rounded-btn border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      showSafeZones
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    <Icon name="crop_free" size={15} />
                    <span>{showSafeZones ? 'Safe Zones: On' : 'Safe Zones'}</span>
                  </button>
                </Tooltip>

                <Tooltip content="Show the 3×3 rule-of-thirds grid — or press G" side="bottom">
                  <button
                    type="button"
                    onClick={() => setShowGrid((prev) => !prev)}
                    aria-pressed={showGrid}
                    className={`inline-flex items-center gap-1 rounded-btn border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      showGrid
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    <Icon name="grid_on" size={15} />
                    <span>{showGrid ? 'Grid: On' : 'Grid (G)'}</span>
                  </button>
                </Tooltip>
              </div>

              <CardCanvas
                state={state}
                canvasRef={canvasRef}
                showSafeZones={showSafeZones}
                showGrid={showGrid}
                isExporting={isExporting}
              />
            </div>

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
          </Card>
        </div>

        {/* Right Column: Studio Controls Panel (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-4 sm:p-5 space-y-4">
            {/* Studio Tool Inspector Header */}
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon name={currentSectionMeta.icon} size={15} className="shrink-0 text-primary" />
                  <h3 className="truncate text-[13px] font-semibold text-ink">{currentSectionMeta.label}</h3>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-ink-dim">{currentSectionMeta.description}</p>
              </div>

              {/* Prev / Next Stepper */}
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevSection}
                  aria-label="Previous tool"
                  title="Previous tool"
                  className="kt-focus flex cursor-pointer items-center justify-center rounded-lg border border-line p-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Icon name="chevron_left" size={16} />
                </button>
                <span className="px-1 font-mono text-xs font-medium text-ink-dim">
                  {currentSectionIndex + 1}/{STUDIO_SECTIONS.length}
                </span>
                <button
                  type="button"
                  onClick={handleNextSection}
                  aria-label="Next tool"
                  title="Next tool"
                  className="kt-focus flex cursor-pointer items-center justify-center rounded-lg border border-line p-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Icon name="chevron_right" size={16} />
                </button>
              </div>
            </div>

            <Tabs
              value={activeSection}
              onValueChange={(v) => setActiveSection(v as StudioSection)}
              className="space-y-4"
            >
              {/* Horizontal Tool Selection Pills */}
              <TabsList
                variant="pill"
                aria-label="Studio tools"
                className="-mx-1 gap-1.5 overflow-x-auto rounded-none bg-transparent p-0 px-1 pb-1 scrollbar-none"
              >
                {STUDIO_SECTIONS.map((sec) => (
                  <Tooltip key={sec.id} content={`${sec.label}: ${sec.description}`}>
                    <TabsTrigger
                      variant="pill"
                      value={sec.id}
                      className="shrink-0 select-none rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-all data-[state=inactive]:hover:bg-surface-2 data-[state=inactive]:hover:border-line-strong data-[state=active]:border-transparent data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-on-primary data-[state=active]:ring-1 data-[state=active]:ring-primary/30"
                    >
                      <Icon name={sec.icon} size={15} />
                      <span>{sec.shortLabel}</span>
                    </TabsTrigger>
                  </Tooltip>
                ))}
              </TabsList>

              {/* Feature Viewport - Renders ONLY the selected tool */}
              <div className="min-h-[320px]">
                <TabsContent value="content" className="mt-0">
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
                </TabsContent>

                <TabsContent value="typography" className="mt-0">
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <TypographyPicker
                      fontStyle={state.fontStyle}
                      onSelectFont={handleFontChange}
                      textSizeAdjust={state.textSizeAdjust ?? 0}
                      onTextSizeAdjustChange={(textSizeAdjust) => setState((prev) => ({ ...prev, textSizeAdjust }))}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="theme" className="mt-0">
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
                </TabsContent>

                <TabsContent value="styles" className="mt-0">
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <LayerStylesControl
                      layerStyles={state.layerStyles}
                      activeAccent={THEME_CONFIGS[state.theme]?.accent || '#00e5ff'}
                      onChange={handleLayerStylesChange}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="ai" className="mt-0">
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <AICopyGenerator
                      format={state.format}
                      onGenerated={handleAiGenerated}
                      onDeckGenerated={handleDeckGenerated}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="background" className="mt-0">
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
                </TabsContent>

                <TabsContent value="aspect" className="mt-0">
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <AspectRatioSelector
                      currentRatio={state.aspectRatio}
                      onSelectRatio={handleRatioChange}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="branding" className="mt-0">
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <CreatorProfileSection
                      creator={state.creator}
                      showCreatorBadge={state.showCreatorBadge}
                      onToggleBadge={(show) => setState((prev) => ({ ...prev, showCreatorBadge: show }))}
                      onChange={handleCreatorChange}
                    />
                  </div>
                </TabsContent>
              </div>
            </Tabs>

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
