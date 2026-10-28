import { useState } from 'react';
import { toPng, toBlob } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { StaticCardState } from '../../../types/staticCard';
import { generateExportFilename } from '../utils/exportFilename';
import { cleanExportFilter, waitForPaint, wait } from '../utils/exportHelpers';

export function useCardExporter() {
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const exportPNG = async (canvasElement: HTMLElement | null, state: StaticCardState) => {
    if (!canvasElement) return;
    setIsExporting(true);
    setStatusMessage('Rendering high-res 300 DPI graphic...');

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

      // 300 DPI multiplier (pixelRatio 3.0 provides pristine 3240px resolution)
      let dataUrl: string;
      try {
        dataUrl = await toPng(canvasElement, {
          quality: 1.0,
          pixelRatio: 3,
          cacheBust: true,
          skipAutoScale: true,
          filter: cleanExportFilter,
        });
      } catch (hiResErr) {
        console.warn('300 DPI export hit canvas bounds, falling back to 2x resolution...', hiResErr);
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

      setStatusMessage('✓ High-res graphic downloaded!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to export high-res PNG:', err);
      setStatusMessage('Export failed. Please check image permissions.');
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  const copyImageAndText = async (canvasElement: HTMLElement | null, state: StaticCardState) => {
    if (!canvasElement) return;
    setStatusMessage('Copying to clipboard...');

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
          setStatusMessage('✓ Image copied to clipboard!');
          setTimeout(() => setStatusMessage(null), 3000);
          return;
        } catch (clipErr) {
          console.warn('Direct image clipboard write failed, copying post text...', clipErr);
        }
      }

      // Fallback: Copy post copy & hashtags
      const textToCopy = `${state.headline}\n\n${state.supportingText}\n\n${state.socialCaption || ''}`;
      await navigator.clipboard.writeText(textToCopy);
      setStatusMessage('✓ Caption & post copy copied to clipboard!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      setStatusMessage('Failed to copy');
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const copyPostText = async (state: StaticCardState) => {
    try {
      const textToCopy = `${state.headline}\n\n${state.supportingText}\n\n${state.socialCaption || ''}`;
      await navigator.clipboard.writeText(textToCopy);
      setStatusMessage('✓ Post copy & caption copied!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('Failed to copy text to clipboard:', err);
      setStatusMessage('Failed to copy');
      setTimeout(() => setStatusMessage(null), 3000);
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
        setStatusMessage(`Rendering slide ${slideNum} of ${slides.length} (300 DPI)...`);
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
      setStatusMessage(
        `✓ Exported ${exported} of ${slides.length} slides — allow "multiple downloads" if the browser asked.`,
      );
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Failed to export carousel deck:', err);
      setStatusMessage(
        exported > 0
          ? `Deck export stopped after ${exported} of ${slides.length} slides.`
          : 'Deck export encountered an error — no files were saved.',
      );
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsExporting(false);
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
        setStatusMessage(`Compiling slide ${slideNum} of ${slides.length} for LinkedIn PDF...`);
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

      setStatusMessage(`✓ LinkedIn PDF (${slides.length} pages) downloaded!`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Failed to export LinkedIn PDF:', err);
      setStatusMessage('LinkedIn PDF export failed.');
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  return {
    isExporting,
    statusMessage,
    exportPNG,
    exportDeckSlides,
    exportLinkedInPDF,
    copyImageAndText,
    copyPostText,
  };
}
