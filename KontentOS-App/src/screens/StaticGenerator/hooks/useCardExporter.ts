import { useState } from 'react';
import { toPng, toBlob } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { StaticCardState } from '../../../types/staticCard';
import { generateExportFilename } from '../utils/exportFilename';
import { cleanExportFilter, waitForPaint, wait } from '../utils/exportHelpers';
import { notify } from '@/components/ui/toast';

export function useCardExporter() {
  const [isExporting, setIsExporting] = useState(false);
  // Only the count of a multi-file job lives here; every finished job reports through the one
  // toast system, because this message used to be printed on the clipboard button.
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  const exportPNG = async (canvasElement: HTMLElement | null, state: StaticCardState) => {
    if (!canvasElement) return;
    setIsExporting(true);

    try {
      // Ensure all custom fonts are ready before rasterizing
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // ignore font-ready timeouts
        }
      }

      const brand = state.creator?.name || 'kontentos';
      const topic = state.headline || state.format;
      const totalSlides = state.slides && state.slides.length > 0 ? state.slides.length : 1;
      const currentSlide = state.slideCurrent || 1;
      const filename = generateExportFilename(brand, topic, currentSlide, totalSlides, 'png');

      // pixelRatio 3 draws the card at three times its on-screen size; a browser that caps the
      // canvas falls back to 2x, and the creator is told which one they actually got.
      let dataUrl: string;
      let ratio = 3;
      try {
        dataUrl = await toPng(canvasElement, {
          quality: 1.0,
          pixelRatio: 3,
          cacheBust: true,
          skipAutoScale: true,
          filter: cleanExportFilter,
        });
      } catch (hiResErr) {
        console.warn('3x render hit canvas bounds, retrying at 2x...', hiResErr);
        ratio = 2;
        dataUrl = await toPng(canvasElement, {
          quality: 0.96,
          pixelRatio: 2,
          cacheBust: true,
          filter: cleanExportFilter,
        });
      }

      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();

      notify.ok(`PNG saved at ${ratio}× resolution`);
    } catch (err: any) {
      console.error('Failed to export high-res PNG:', err);
      notify.bad('The card could not be rendered. Nothing was saved.');
    } finally {
      setIsExporting(false);
      setProgressMessage(null);
    }
  };

  const copyImageAndText = async (canvasElement: HTMLElement | null, state: StaticCardState) => {
    if (!canvasElement) return;
    setIsExporting(true);
    setProgressMessage('Rendering the card for the clipboard…');

    try {
      const blob = await toBlob(canvasElement, {
        quality: 1.0,
        pixelRatio: 2.5,
        cacheBust: true,
        filter: cleanExportFilter,
      });

      if (blob && navigator.clipboard && (window as any).ClipboardItem) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': blob,
            }),
          ]);
          notify.ok('Card image is on the clipboard.');
          return;
        } catch (clipErr) {
          console.warn('Direct image clipboard write failed, copying post text...', clipErr);
        }
      }

      // Fallback: Copy post copy & hashtags
      const textToCopy = `${state.headline}\n\n${state.supportingText}\n\n${state.socialCaption || ''}`;
      await navigator.clipboard.writeText(textToCopy);
      notify.info('The browser would not take the image, so only the words were copied.');
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      notify.bad('The browser blocked the clipboard. Export the PNG and copy the text yourself.');
    } finally {
      setIsExporting(false);
      setProgressMessage(null);
    }
  };

  const copyPostText = async (state: StaticCardState) => {
    try {
      const textToCopy = `${state.headline}\n\n${state.supportingText}\n\n${state.socialCaption || ''}`;
      await navigator.clipboard.writeText(textToCopy);
      notify.ok('Headline, body and caption copied.');
    } catch (err) {
      console.error('Failed to copy text to clipboard:', err);
      notify.bad('The browser blocked the clipboard. Select the text and copy it yourself.');
    }
  };

  const exportDeckSlides = async (
    canvasElement: HTMLElement | null,
    state: StaticCardState,
    switchToSlide: (slideIdx: number) => Promise<void>
  ) => {
    if (!canvasElement) return;
    const slides = state.slides || [];
    if (slides.length <= 1) {
      return exportPNG(canvasElement, state);
    }

    setIsExporting(true);
    const originalSlide = state.slideCurrent;
    // Counted, not assumed: the browser can block or drop programmatic downloads.
    let exported = 0;

    try {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // ignore
        }
      }

      for (let i = 0; i < slides.length; i++) {
        const slideNum = i + 1;
        setProgressMessage(`Rendering slide ${slideNum} of ${slides.length}…`);
        await switchToSlide(slideNum);
        await waitForPaint();
        await wait(80);

        let dataUrl: string;
        try {
          dataUrl = await toPng(canvasElement, {
            quality: 1.0,
            pixelRatio: 3,
            cacheBust: true,
            skipAutoScale: true,
            filter: cleanExportFilter,
          });
        } catch {
          dataUrl = await toPng(canvasElement, {
            quality: 0.96,
            pixelRatio: 2,
            cacheBust: true,
            filter: cleanExportFilter,
          });
        }

        const brand = state.creator?.name || 'kontentos';
        const topic = state.headline || state.format;
        const filename = generateExportFilename(brand, topic, slideNum, slides.length, 'png');

        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
        exported += 1;

        await new Promise((r) => setTimeout(r, 260));
      }

      await switchToSlide(originalSlide);
      await waitForPaint();
      notify.ok(
        exported === slides.length
          ? `${exported} slide PNGs saved.`
          : `${exported} of ${slides.length} slide PNGs saved — the rest did not render.`,
      );
    } catch (err: any) {
      console.error('Failed to export carousel deck:', err);
      notify.bad(
        exported > 0
          ? `Deck export stopped after ${exported} of ${slides.length} slides.`
          : 'Deck export encountered an error — no files were saved.',
      );
    } finally {
      setIsExporting(false);
      setProgressMessage(null);
    }
  };

  const exportLinkedInPDF = async (
    canvasElement: HTMLElement | null,
    state: StaticCardState,
    switchToSlide: (slideIdx: number) => Promise<void>
  ) => {
    if (!canvasElement) return;
    const slides = state.slides || [];
    if (slides.length === 0) return;

    setIsExporting(true);
    const originalSlide = state.slideCurrent;

    try {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // ignore
        }
      }

      let pdfWidth = 1080;
      let pdfHeight = 1080;
      let orientation: 'p' | 'l' = 'p';

      if (state.aspectRatio === '4:5') {
        pdfWidth = 1080;
        pdfHeight = 1350;
        orientation = 'p';
      } else if (state.aspectRatio === '9:16') {
        pdfWidth = 1080;
        pdfHeight = 1920;
        orientation = 'p';
      } else if (state.aspectRatio === '16:9') {
        pdfWidth = 1920;
        pdfHeight = 1080;
        orientation = 'l';
      } else {
        pdfWidth = 1080;
        pdfHeight = 1080;
        orientation = 'p';
      }

      const doc = new jsPDF({
        orientation,
        unit: 'px',
        format: [pdfWidth, pdfHeight],
        hotfixes: ['px_scaling'],
      });

      for (let i = 0; i < slides.length; i++) {
        const slideNum = i + 1;
        setProgressMessage(`Adding slide ${slideNum} of ${slides.length} to the PDF…`);
        await switchToSlide(slideNum);
        await waitForPaint();
        await wait(80);

        let dataUrl: string;
        try {
          dataUrl = await toPng(canvasElement, {
            quality: 1.0,
            pixelRatio: 2.2,
            cacheBust: true,
            skipAutoScale: true,
            filter: cleanExportFilter,
          });
        } catch {
          dataUrl = await toPng(canvasElement, {
            quality: 0.95,
            pixelRatio: 2,
            cacheBust: true,
            filter: cleanExportFilter,
          });
        }

        if (i > 0) {
          doc.addPage([pdfWidth, pdfHeight], orientation);
        }

        doc.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        await new Promise((r) => setTimeout(r, 120));
      }

      await switchToSlide(originalSlide);
      await waitForPaint();
      const brand = state.creator?.name || 'kontentos';
      const topic = state.headline || 'carousel';
      const filename = generateExportFilename(brand, topic, 1, slides.length, 'pdf');
      doc.save(filename);

      notify.ok(`PDF saved with ${slides.length} pages.`);
    } catch (err: any) {
      console.error('Failed to export the deck as a PDF:', err);
      notify.bad('The PDF could not be built. Nothing was saved.');
    } finally {
      setIsExporting(false);
      setProgressMessage(null);
    }
  };

  return {
    isExporting,
    progressMessage,
    exportPNG,
    exportDeckSlides,
    exportLinkedInPDF,
    copyImageAndText,
    copyPostText,
  };
}
