import React from 'react';
import { CarouselSlide } from '../../../types/staticCard';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';

interface Props {
  slides: CarouselSlide[];
  currentSlideId: number;
  onSelectSlide: (slideId: number) => void;
  onAddSlide: () => void;
  onDeleteSlide: (slideId: number) => void;
  onOpenRegenerate?: () => void;
}

export const CarouselSlideStepper: React.FC<Props> = ({
  slides,
  currentSlideId,
  onSelectSlide,
  onAddSlide,
  onDeleteSlide,
  onOpenRegenerate,
}) => {
  const currentIndex = slides.findIndex((s) => s.id === currentSlideId);
  const currentNum = currentIndex >= 0 ? currentIndex + 1 : 1;

  const handlePrev = () => {
    if (currentIndex > 0) {
      onSelectSlide(slides[currentIndex - 1].id);
    }
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      onSelectSlide(slides[currentIndex + 1].id);
    }
  };

  return (
    <div className="rounded-card bg-surface-2/90 border border-primary/20 p-3.5 space-y-2.5 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Icon name="view_carousel" size={17} className="text-primary" />
          <span className="text-xs font-bold text-ink">
            Carousel Deck Stepper
          </span>
          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            Slide {currentNum} of {slides.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            icon="chevron_left"
            disabled={currentIndex <= 0}
            onClick={handlePrev}
            className="py-1 px-2.5 h-7"
            title="Previous slide"
          >
            Prev
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon="chevron_right"
            disabled={currentIndex >= slides.length - 1}
            onClick={handleNext}
            className="py-1 px-2.5 h-7"
            title="Next slide"
          >
            Next
          </Button>

          {onOpenRegenerate && (
            <Button
              variant="secondary"
              size="sm"
              icon="auto_awesome"
              onClick={onOpenRegenerate}
              className="py-1 px-2.5 h-7 text-[11px] text-primary border-primary/30 hover:bg-primary/5 font-semibold"
              title="Regenerate this slide with Gemini AI"
            >
              Regenerate
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            icon="add"
            onClick={onAddSlide}
            className="py-1 px-2.5 h-7 text-[11px]"
            title="Add a new slide"
          >
            Add Slide
          </Button>
        </div>
      </div>

      {/* Slide Navigation Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
        {slides.map((s, idx) => {
          const isActive = s.id === currentSlideId;
          const slideNumber = idx + 1;
          return (
            <div key={s.id} className="relative group shrink-0">
              <button
                type="button"
                onClick={() => onSelectSlide(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer select-none ${
                  isActive
                    ? 'bg-primary text-on-primary border-primary shadow-sm ring-1 ring-primary/40 font-bold'
                    : 'bg-surface hover:bg-surface-2 text-ink-muted hover:text-ink border-line'
                }`}
              >
                <span>Slide {slideNumber}</span>
                {idx === 0 && <span className="text-[10px] opacity-75 font-normal">(Hook)</span>}
                {idx === slides.length - 1 && slides.length > 1 ? (
                  <span className="text-[10px] opacity-75 font-normal">(CTA)</span>
                ) : idx > 0 ? (
                  <span className="text-[10px] opacity-75 font-normal">(Step {idx})</span>
                ) : null}
              </button>

              {/* Delete slide button if deck has more than 1 slide */}
              {slides.length > 1 && isActive && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSlide(s.id);
                  }}
                  className="absolute -top-1.5 -right-1 w-4 h-4 rounded-full bg-danger text-white flex items-center justify-center text-[10px] font-bold shadow-md hover:scale-110 transition-transform cursor-pointer"
                  title="Remove this slide"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
