import { createElement, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

const portalRoots = new WeakMap<HTMLElement, Root>();
let activePrintCleanup: (() => void) | null = null;

function getOrCreateRoot(container: HTMLElement): Root {
  const existing = portalRoots.get(container);
  if (existing) return existing;
  const created = createRoot(container);
  portalRoots.set(container, created);
  return created;
}

function waitForImages(container: HTMLElement, timeoutMs = 4000): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'));
  if (imgs.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, timeoutMs);

    Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((res) => {
            if (img.complete) {
              res();
              return;
            }
            const done = () => {
              img.removeEventListener('load', done);
              img.removeEventListener('error', done);
              res();
            };
            img.addEventListener('load', done);
            img.addEventListener('error', done);
          })
      )
    ).then(() => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve();
      }
    });
  });
}

async function waitForRenderStability(container: HTMLElement): Promise<void> {
  // Allow React 19 concurrent root.render() to commit DOM nodes before querying fonts/images
  await new Promise<void>((res) =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => res()))
  );
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise<void>((res) => window.setTimeout(res, 2000)),
      ]);
    } catch {
      // ignore font readiness failures
    }
  }
  await waitForImages(container);
  await new Promise<void>((res) =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => res()))
  );
}

export type MedoraPrintFormat = 'a4' | 'thermal_80' | 'thermal_58';

export interface MedoraPrintOptions {
  format?: MedoraPrintFormat;
  onPrintAction?: () => void | Promise<void>;
}

/**
 * Prints any React A4 / Thermal (80mm / 58mm) document sheet inside an isolated #medora-print-portal.
 * Renders synchronously via flushSync so window.print() retains transient user activation,
 * and shows an interactive Print & PDF Preview overlay with A4/Thermal switcher if embedded iframes block window.print().
 */
export async function printMedoraDocument(
  element: ReactElement,
  documentTitle?: string,
  options?: MedoraPrintOptions,
): Promise<void> {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  if (activePrintCleanup) {
    activePrintCleanup();
    activePrintCleanup = null;
  }

  let portal = document.getElementById('medora-print-portal');
  if (!portal) {
    portal = document.createElement('div');
    portal.id = 'medora-print-portal';
    document.body.appendChild(portal);
  }

  const root = getOrCreateRoot(portal);
  const previousTitle = document.title;
  if (documentTitle) {
    document.title = documentTitle;
  }

  const isArabic = document.documentElement.dir === 'rtl' || document.documentElement.lang === 'ar';
  const docDir: 'rtl' | 'ltr' = isArabic ? 'rtl' : 'ltr';
  const safeFilename = sanitizePdfFilename((documentTitle || 'medora-document') + '.pdf');

  let cleaned = false;
  let nativePrintOpened = false;
  let currentFormat: MedoraPrintFormat = options?.format || 'a4';
  let printCallbackTriggered = false;

  const notifyPrintTracked = () => {
    if (printCallbackTriggered || !options?.onPrintAction) return;
    printCallbackTriggered = true;
    Promise.resolve(options.onPrintAction()).catch(() => undefined);
  };

  portal.setAttribute('data-print-format', currentFormat);

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    activePrintCleanup = null;
    document.body.classList.remove('medora-printing-active');
    portal?.classList.remove('medora-print-preview-visible');
    portal?.removeAttribute('data-print-format');
    window.removeEventListener('beforeprint', onBeforePrint);
    window.removeEventListener('afterprint', onAfterPrint);
    window.removeEventListener('keydown', onKeyDown);
    if (documentTitle) {
      document.title = previousTitle;
    }
    try {
      root.render(null);
    } catch {
      // ignore render reset error
    }
  };

  const onBeforePrint = () => {
    nativePrintOpened = true;
    notifyPrintTracked();
  };

  const onAfterPrint = () => {
    if (nativePrintOpened) {
      window.setTimeout(cleanup, 150);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanup();
    }
  };

  activePrintCleanup = cleanup;
  window.addEventListener('beforeprint', onBeforePrint);
  window.addEventListener('afterprint', onAfterPrint);
  window.addEventListener('keydown', onKeyDown);

  const FORMAT_LABELS: Array<{ id: MedoraPrintFormat; label: string }> = [
    { id: 'a4', label: isArabic ? 'صفحة A4' : 'A4 Sheet' },
    { id: 'thermal_80', label: isArabic ? 'حراري 80mm' : '80mm Thermal' },
    { id: 'thermal_58', label: isArabic ? 'حراري 58mm' : '58mm Thermal' },
  ];

  const renderPreviewShell = (opts: { exportingPdf: boolean; blockedHint: boolean }) => {
    portal?.setAttribute('data-print-format', currentFormat);
    const shell = createElement(
      'div',
      {
        className: 'medora-print-preview-backdrop',
        dir: docDir,
        onClick: (e: { target: EventTarget | null; currentTarget: EventTarget | null }) => {
          if (e.target === e.currentTarget) cleanup();
        },
      },
      createElement(
        'div',
        { className: 'medora-print-preview-frame' },
        createElement(
          'div',
          {
            className:
              'medora-no-print flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b border-slate-200 bg-slate-900 px-4 py-3 text-white',
          },
          createElement(
            'div',
            { className: 'min-w-0' },
            createElement(
              'p',
              { className: 'text-sm font-bold' },
              isArabic
                ? `معاينة الطباعة — ${currentFormat === 'a4' ? 'A4' : currentFormat === 'thermal_80' ? 'حراري 80mm' : 'حراري 58mm'}`
                : `Print Preview — ${currentFormat === 'a4' ? 'A4' : currentFormat === 'thermal_80' ? '80mm Thermal' : '58mm Thermal'}`
            ),
            opts.blockedHint
              ? createElement(
                  'p',
                  { className: 'mt-0.5 text-[11px] text-amber-300' },
                  isArabic
                    ? 'إذا حظر المتصفح أو المعاينة المدمجة نافذة الطابعة التلقائية، اختر الحجم ثم اضغط «طباعة الآن» أو «تنزيل PDF».'
                    : 'If your browser blocked auto-print, pick your paper format and click Print Now or Download PDF.'
                )
              : null
          ),
          createElement(
            'div',
            { className: 'flex flex-wrap items-center gap-2' },
            createElement(
              'div',
              {
                className:
                  'inline-flex items-center rounded-xl border border-slate-700 bg-slate-800 p-0.5',
              },
              ...FORMAT_LABELS.map((fmt) =>
                createElement(
                  'button',
                  {
                    key: fmt.id,
                    type: 'button',
                    onClick: () => {
                      currentFormat = fmt.id;
                      renderPreviewShell({ exportingPdf: false, blockedHint: opts.blockedHint });
                    },
                    className: `rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition cursor-pointer ${
                      currentFormat === fmt.id
                        ? 'bg-[#d9a43b] text-[#040917]'
                        : 'text-slate-300 hover:text-white'
                    }`,
                  },
                  fmt.label
                )
              )
            ),
            createElement(
              'button',
              {
                type: 'button',
                onClick: () => {
                  notifyPrintTracked();
                  try {
                    window.print();
                  } catch {
                    renderPreviewShell({ exportingPdf: false, blockedHint: true });
                  }
                },
                className:
                  'inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer',
              },
              isArabic ? 'طباعة الآن' : 'Print Now'
            ),
            createElement(
              'button',
              {
                type: 'button',
                disabled: opts.exportingPdf,
                onClick: async () => {
                  notifyPrintTracked();
                  renderPreviewShell({ exportingPdf: true, blockedHint: opts.blockedHint });
                  try {
                    await downloadMedoraPdf({
                      filename: safeFilename,
                      element,
                      dir: docDir,
                      format: currentFormat,
                    });
                  } finally {
                    if (!cleaned) {
                      renderPreviewShell({ exportingPdf: false, blockedHint: opts.blockedHint });
                    }
                  }
                },
                className:
                  'inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#d9a43b] px-4 text-xs font-bold text-[#040917] hover:bg-[#ecc264] disabled:opacity-60 cursor-pointer',
              },
              opts.exportingPdf
                ? isArabic
                  ? 'جاري تجهيز PDF...'
                  : 'Generating PDF...'
                : isArabic
                  ? 'تنزيل PDF للطباعة'
                  : 'Download PDF to Print'
            ),
            createElement(
              'button',
              {
                type: 'button',
                onClick: cleanup,
                className:
                  'inline-flex min-h-[38px] items-center rounded-xl border border-slate-600 px-3.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 cursor-pointer',
              },
              isArabic ? 'إغلاق' : 'Close'
            )
          )
        ),
        createElement(
          'div',
          { className: 'medora-print-preview-body bg-white p-2 sm:p-5 text-slate-900' },
          element
        )
      )
    );

    flushSync(() => {
      root.render(shell);
    });
  };

  document.body.classList.add('medora-printing-active');
  portal.classList.add('medora-print-preview-visible');
  renderPreviewShell({ exportingPdf: false, blockedHint: false });

  try {
    window.print();
  } catch {
    renderPreviewShell({ exportingPdf: false, blockedHint: true });
  }

  // If native print dialog did not open (e.g. sandboxed iframe), show clear helper note on the visible preview
  window.setTimeout(() => {
    if (!cleaned && !nativePrintOpened) {
      renderPreviewShell({ exportingPdf: false, blockedHint: true });
    }
  }, 350);
}

interface PageSlice {
  startPx: number;
  endPx: number;
}

function computePageSlices(
  container: HTMLElement,
  totalHeightPx: number,
  maxPageHeightPx: number
): PageSlice[] {
  if (totalHeightPx <= maxPageHeightPx) {
    return [{ startPx: 0, endPx: totalHeightPx }];
  }

  const containerRect = container.getBoundingClientRect();
  const blocks = Array.from(
    container.querySelectorAll<HTMLElement>('[data-pdf-block]')
  )
    .map((el) => {
      const r = el.getBoundingClientRect();
      const top = Math.max(0, Math.round(r.top - containerRect.top));
      const bottom = Math.max(top, Math.round(r.bottom - containerRect.top));
      return { top, bottom, height: bottom - top };
    })
    .filter((b) => b.height > 0)
    .sort((a, b) => a.top - b.top);

  if (blocks.length === 0) {
    const slices: PageSlice[] = [];
    for (let y = 0; y < totalHeightPx; y += maxPageHeightPx) {
      slices.push({ startPx: y, endPx: Math.min(totalHeightPx, y + maxPageHeightPx) });
    }
    return slices;
  }

  const slices: PageSlice[] = [];
  let currentStart = 0;

  while (currentStart < totalHeightPx - 2) {
    const targetEnd = currentStart + maxPageHeightPx;
    if (targetEnd >= totalHeightPx) {
      slices.push({ startPx: currentStart, endPx: totalHeightPx });
      break;
    }

    // Find the last block that ends cleanly before targetEnd
    let chosenBreak = targetEnd;
    let foundCleanBreak = false;
    for (const block of blocks) {
      if (block.bottom > currentStart + 24 && block.bottom <= targetEnd) {
        chosenBreak = block.bottom;
        foundCleanBreak = true;
      } else if (block.top < targetEnd && block.bottom > targetEnd) {
        // This block crosses the page boundary! Break right before it if it's after currentStart
        if (block.top > currentStart + 32) {
          chosenBreak = block.top;
          foundCleanBreak = true;
        }
        break;
      }
    }

    if (!foundCleanBreak || chosenBreak <= currentStart + 24) {
      chosenBreak = targetEnd;
    }

    slices.push({ startPx: currentStart, endPx: chosenBreak });
    currentStart = chosenBreak;
  }

  return slices;
}

/**
 * Generates a crisp A4 or Thermal (80mm / 58mm) PDF with block-aware pagination (Arabic RTL & English LTR safe)
 * and triggers direct download across Desktop and Mobile browsers.
 */
export async function downloadMedoraPdf(params: {
  filename: string;
  element: ReactElement;
  dir?: 'rtl' | 'ltr';
  format?: MedoraPrintFormat;
}): Promise<void> {
  if (typeof document === 'undefined') return;

  const fmt: MedoraPrintFormat = params.format || 'a4';
  const totalWidthPx = fmt === 'thermal_58' ? 220 : fmt === 'thermal_80' ? 302 : 794;

  let host = document.getElementById('medora-pdf-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'medora-pdf-host';
    host.style.position = 'fixed';
    host.style.left = '-99999px';
    host.style.top = '0';
    host.style.background = '#ffffff';
    host.style.color = '#0f172a';
    host.style.zIndex = '-1';
    host.style.pointerEvents = 'none';
    document.body.appendChild(host);
  }
  host.style.width = `${totalWidthPx}px`;
  host.dir = params.dir || 'rtl';

  const root = getOrCreateRoot(host);
  try {
    root.render(params.element);
    await waitForRenderStability(host);

    const sheetEl =
      host.querySelector<HTMLElement>('.medora-print-sheet') || host;
    const totalHeightPx = Math.max(sheetEl.scrollHeight, sheetEl.offsetHeight, 100);

    const marginXMm = fmt === 'a4' ? 10 : 3;
    const marginTopMm = fmt === 'a4' ? 10 : 4;
    const printableWidthMm = fmt === 'thermal_58' ? 52 : fmt === 'thermal_80' ? 74 : 190;
    const printableHeightMm = fmt === 'a4' ? 273 : 2000;
    const pxPerMm = totalWidthPx / printableWidthMm;
    const maxPageHeightPx = Math.floor(printableHeightMm * pxPerMm);

    const slices = computePageSlices(sheetEl, totalHeightPx, maxPageHeightPx);

    const canvas = await html2canvas(sheetEl, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: totalWidthPx,
      windowWidth: totalWidthPx,
    });

    const scaleRatio = canvas.width / totalWidthPx;
    const thermalTotalHeightMm = Math.max(80, Math.ceil((totalHeightPx / totalWidthPx) * printableWidthMm) + 14);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format:
        fmt === 'thermal_58'
          ? [58, thermalTotalHeightMm]
          : fmt === 'thermal_80'
            ? [80, thermalTotalHeightMm]
            : 'a4',
      compress: true,
    });

    slices.forEach((slice, index) => {
      if (index > 0) pdf.addPage();
      const srcY = Math.max(0, Math.round(slice.startPx * scaleRatio));
      const srcH = Math.max(
        1,
        Math.min(
          canvas.height - srcY,
          Math.round((slice.endPx - slice.startPx) * scaleRatio)
        )
      );

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = srcH;
      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          srcY,
          canvas.width,
          srcH,
          0,
          0,
          canvas.width,
          srcH
        );
      }

      const imgData = pageCanvas.toDataURL('image/png');
      const renderedHeightMm = (srcH / canvas.width) * printableWidthMm;
      pdf.addImage(
        imgData,
        'PNG',
        marginXMm,
        marginTopMm,
        printableWidthMm,
        renderedHeightMm,
        undefined,
        'FAST'
      );

      pdf.setFontSize(fmt === 'a4' ? 8.5 : 6.5);
      pdf.setTextColor(100, 116, 139);
      const footerXMm = fmt === 'thermal_58' ? 29 : fmt === 'thermal_80' ? 40 : 105;
      const footerYMm = fmt === 'a4' ? 290 : Math.min(thermalTotalHeightMm - 4, marginTopMm + renderedHeightMm + 5);
      pdf.text(
        fmt === 'a4'
          ? `MEDORA Healthcare Platform  |  Page ${index + 1} / ${slices.length}`
          : `MEDORA Platform (${index + 1}/${slices.length})`,
        footerXMm,
        footerYMm,
        { align: 'center' }
      );
    });

    const cleanName = params.filename.endsWith('.pdf')
      ? params.filename
      : `${params.filename}.pdf`;

    try {
      pdf.save(cleanName);
    } catch {
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = cleanName;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 10000);
    }
  } finally {
    try {
      root.render(null);
    } catch {
      // ignore
    }
  }
}

export function sanitizePdfFilename(raw: string): string {
  return (
    raw
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'medora-document'
  );
}
