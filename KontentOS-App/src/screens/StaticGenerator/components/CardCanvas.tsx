import React, { useRef, useState } from 'react';
import { StaticCardState } from '../../../types/staticCard';
import type { CanvasCustomElement } from '../../../types/canvasScene';
import { getActiveTheme } from '../../../data/staticCardPresets';
import { InstagramOverlayCard } from './formats/InstagramOverlayCard';
import { LinkedInSplitCard } from './formats/LinkedInSplitCard';
import { TweetCardLayout } from './formats/TweetCardLayout';
import { CarouselSlideCard } from './formats/CarouselSlideCard';
import { EditorialQuoteCard } from './formats/EditorialQuoteCard';
import { SafeZoneOverlay } from './SafeZoneOverlay';
import { CanvasGridOverlay } from './CanvasGridOverlay';
import { SelectionBox } from './canvas/SelectionBox';
import { CanvasCustomElementView } from './canvas/CanvasCustomElementView';
import { SmartGuidesOverlay } from './canvas/SmartGuidesOverlay';
import { CanvasContextMenu } from './canvas/CanvasContextMenu';
import { CanvasExportContext } from './canvas/CanvasExportContext';
import { useCanvasInteraction } from '../hooks/useCanvasInteraction';
import { useCanvasShortcuts } from '../hooks/useCanvasShortcuts';
import { getCanvasBounds } from '../utils/canvasMath';

const EMPTY_CUSTOMS: CanvasCustomElement[] = [];

interface CardCanvasProps {
  state: StaticCardState;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  showSafeZones?: boolean;
  showGrid?: boolean;
  isExporting?: boolean;
  onUpdateText?: (field: string, value: string) => void;
}

export const CardCanvas: React.FC<CardCanvasProps> = ({
  state,
  canvasRef,
  showSafeZones = false,
  showGrid = false,
  isExporting = false,
  onUpdateText,
}) => {
  const theme = getActiveTheme(state);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const activeSlide = useCanvasInteraction((s) => s.activeSlide);
  const customElements = useCanvasInteraction(
    (s) => s.customElements[s.activeSlide] || EMPTY_CUSTOMS
  );
  const toast = useCanvasInteraction((s) => s.toast);
  const selectElement = useCanvasInteraction((s) => s.selectElement);
  const clearSelection = useCanvasInteraction((s) => s.clearSelection);
  const addTextBox = useCanvasInteraction((s) => s.addTextBox);
  const addImageElement = useCanvasInteraction((s) => s.addImageElement);
  const setToast = useCanvasInteraction((s) => s.setToast);

  useCanvasShortcuts({ enabled: !isExporting });

  const canvasPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: undefined, y: undefined };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const addImageFromFile = (file: File, centerX?: number, centerY?: number) => {
    if (!file.type.startsWith('image/')) {
      setToast('Please choose an image file');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setToast('Image must be under 6 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const image = new Image();
      image.onload = () => {
        addImageElement(centerX, centerY, src, image.naturalWidth, image.naturalHeight);
        setToast('Image added to canvas');
      };
      image.onerror = () => {
        addImageElement(centerX, centerY, src);
        setToast('Image added to canvas');
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isExporting) return;
    event.preventDefault();
    const target = event.target as HTMLElement;
    if (target.closest('[data-canvas-ui="true"]')) return;

    const point = canvasPoint(event.clientX, event.clientY);
    const element = target.closest('[data-canvas-element-id]') as HTMLElement | null;
    if (element?.dataset.canvasElementId) {
      selectElement(element.dataset.canvasElementId);
    } else {
      selectElement(null);
    }
    setContextMenu({
      x: point.x ?? 12,
      y: point.y ?? 12,
    });
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    setContextMenu(null);
    const target = event.target as HTMLElement;
    if (target.closest('[data-canvas-ui="true"]')) return;
    if (target.closest('[data-canvas-element-id]')) return;
    clearSelection();
  };

  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isExporting) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-canvas-ui="true"]')) return;
    if (target.closest('[data-canvas-element-id]')) return;
    const point = canvasPoint(event.clientX, event.clientY);
    addTextBox(point.x, point.y);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (isExporting) return;
    event.preventDefault();
    const file = Array.from(event.dataTransfer.files).find((entry) =>
      entry.type.startsWith('image/')
    );
    if (!file) return;
    const point = canvasPoint(event.clientX, event.clientY);
    addImageFromFile(file, point.x, point.y);
  };

  const renderCardContent = () => {
    switch (state.format) {
      case 'instagram-overlay':
        return <InstagramOverlayCard state={state} onUpdateText={onUpdateText} />;
      case 'linkedin-split':
        return <LinkedInSplitCard state={state} onUpdateText={onUpdateText} />;
      case 'tweet-card':
        return <TweetCardLayout state={state} onUpdateText={onUpdateText} />;
      case 'carousel-slide':
        return <CarouselSlideCard state={state} onUpdateText={onUpdateText} />;
      case 'editorial-quote':
        return <EditorialQuoteCard state={state} onUpdateText={onUpdateText} />;
      default:
        return <InstagramOverlayCard state={state} onUpdateText={onUpdateText} />;
    }
  };

  const getAspectRatioClasses = () => {
    switch (state.aspectRatio) {
      case '1:1':
        return 'aspect-square max-w-[520px]';
      case '4:5':
        return 'aspect-[4/5] max-w-[460px]';
      case '9:16':
        return 'aspect-[9/16] max-w-[380px]';
      case '16:9':
        return 'aspect-[16/9] max-w-[640px]';
      default:
        return 'aspect-square max-w-[520px]';
    }
  };

  return (
    <div className="relative w-full flex items-center justify-center p-2 sm:p-4">
      {/* Ambient Theme Studio Backlight */}
      <div
        className="absolute w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-500"
        style={{ background: theme.accent }}
      />

      {/* Dynamic Aspect Ratio Card Frame */}
      <div
        ref={canvasRef}
        id="kontentos-static-card-canvas"
        className={`w-full ${getAspectRatioClasses()} transition-all duration-300 rounded-3xl overflow-hidden shadow-[0_30px_70px_-15px_rgba(0,0,0,0.85)] border border-white/10 bg-slate-950 relative flex items-center justify-center`}
        onContextMenu={handleContextMenu}
        onPointerDown={handleCanvasPointerDown}
        onDoubleClick={handleCanvasDoubleClick}
        onDragOver={(event) => {
          if (!isExporting) event.preventDefault();
        }}
        onDrop={handleDrop}
        data-slide={activeSlide}
        data-export-root="true"
      >
        <CanvasExportContext.Provider value={isExporting}>
          {renderCardContent()}

          {customElements.map((element) => (
            <CanvasCustomElementView key={element.id} element={element} />
          ))}

          {/* Platform Safe-Zone Guide Overlay (Excluded during high-res exports) */}
          {showSafeZones && !isExporting && (
            <SafeZoneOverlay aspectRatio={state.aspectRatio} format={state.format} />
          )}

          {/* 3x3 Rule-of-Thirds Grid Overlay (Excluded during high-res exports) */}
          {showGrid && !isExporting && (
            <CanvasGridOverlay isLight={theme.mode === 'light'} />
          )}

          {!isExporting && <SmartGuidesOverlay />}
          {!isExporting && <SelectionBox containerRef={canvasRef} />}

          {!isExporting && contextMenu && (
            <CanvasContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              onClose={() => setContextMenu(null)}
              onAddImage={() => {
                setContextMenu(null);
                imageInputRef.current?.click();
              }}
            />
          )}

          {!isExporting && toast && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[160] px-3 py-1.5 rounded-full bg-slate-950/95 border border-cyan-400/30 text-cyan-100 text-[10px] font-semibold shadow-2xl pointer-events-none"
              data-canvas-ui="true"
              data-export-exclude="true"
              aria-live="polite"
            >
              {toast}
            </div>
          )}
        </CanvasExportContext.Provider>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            const bounds = getCanvasBounds();
            addImageFromFile(file, bounds.width / 2, bounds.height / 2);
          }
          event.target.value = '';
        }}
      />
    </div>
  );
};
