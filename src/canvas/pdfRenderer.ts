import type { PDFDocumentProxy } from 'pdfjs-dist';

// Render blueprint pages at 2x for crisp zooming; this is the pixel space
// that takeoff vertices, checklist bounding boxes, and the scale factor all live in.
export const PDF_RENDER_SCALE = 2;

// pdfjs-dist touches browser-only globals (DOMMatrix, etc.) at module-evaluation
// time, which crashes Next's SSR pass even for code only ever *called* on the
// client. Loading it via dynamic import defers that evaluation until a browser
// actually calls one of the functions below (from the canvas engine, post-mount).
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

const documentCache = new Map<string, Promise<PDFDocumentProxy>>();

function loadDocument(url: string): Promise<PDFDocumentProxy> {
  let cached = documentCache.get(url);
  if (!cached) {
    cached = loadPdfjs().then((pdfjs) => pdfjs.getDocument({ url }).promise);
    documentCache.set(url, cached);
  }
  return cached;
}

export async function getPageCount(url: string): Promise<number> {
  const doc = await loadDocument(url);
  return doc.numPages;
}

export async function renderPdfPageToCanvas(
  url: string,
  pageNumber: number,
  scale: number = PDF_RENDER_SCALE
): Promise<HTMLCanvasElement> {
  const doc = await loadDocument(url);
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext) throw new Error('Unable to acquire 2D context for PDF render.');

  await page.render({ canvasContext, viewport }).promise;
  return canvas;
}

export function tintCanvas(source: HTMLCanvasElement, tintColor: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to acquire 2D context for tinting.');

  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = tintColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}
