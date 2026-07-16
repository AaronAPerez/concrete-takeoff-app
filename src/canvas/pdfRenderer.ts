import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TakeoffChecklistItem, TakeoffCategory } from '@/types/takeoff';

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

const CONCRETE_KEYWORDS =
  /(slab on grade|slab|grade beam|grade bm|footing|foundation|thick|\d+"\s*concrete|p\.?s\.?i\.?|anchor bolts?|curb|cement|concrete|floor drains?|gutter|gravel|rebar|paving|sidewalks?|slope|stirrups?)/i;

function guessCategory(text: string): TakeoffCategory {
  if (/(grade beam|grade bm)/i.test(text)) return 'Grade Beam';
  if (/footing/i.test(text)) return 'Footing';
  if (/(rebar|reinforc|#\d\s*bar|stirrups?)/i.test(text)) return 'Reinforcement';
  // Slab is the fallback for everything else (curb, gutter, sidewalk, gravel,
  // paving, etc.) — the 4-category model doesn't have a closer fit for those yet.
  return 'Slab';
}

interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isRawTextItem(item: unknown): item is RawTextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as RawTextItem).str === 'string' &&
    Array.isArray((item as RawTextItem).transform)
  );
}

// [a, b, c, d, e, f] PDF/Canvas-style affine matrix: x' = a*x + c*y + e, y' = b*x + d*y + f
function applyMatrix(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// Scans a page's vector text layer (not OCR — this only finds text that's
// actually selectable/searchable in the source PDF) for concrete-related
// keywords and returns each hit as a 'pending' checklist candidate, ready to
// review or convert into a real measurement.
//
// Coordinate note: per pdf.js's own text-content evaluator, item.width/height
// are NOT raw pre-scale local units — they're already accumulated as
// PDF-page-space magnitudes (Math.hypot(trm[...]) products, where trm is the
// same matrix returned as item.transform). So the item's local x/y axes point
// along item.transform's [a,b] and [c,d] columns respectively, but the
// *length* along each axis is width/height directly — re-multiplying by
// transform's own scale (as an earlier version of this function did) double-
// scales it, which is what made every highlight balloon out past the edge of
// the sheet. We take only the *direction* of those columns, walk width/height
// along them from the origin (e,f) to get the 4 corners in page space, then
// map those through viewport.transform into the same top-left-origin, Y-down,
// `scale`-factor canvas pixel space renderPdfPageToCanvas draws the blueprint
// bitmap in.
export async function extractConcreteHighlights(
  url: string,
  pageNumber: number,
  scale: number = PDF_RENDER_SCALE
): Promise<TakeoffChecklistItem[]> {
  const doc = await loadDocument(url);
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();

  const hits: TakeoffChecklistItem[] = [];

  for (const item of textContent.items) {
    if (!isRawTextItem(item)) continue;

    const text = item.str.trim();
    const match = text.match(CONCRETE_KEYWORDS);
    if (!match) continue;

    const [a, b, c, d, e, f] = item.transform;
    const xLen = Math.hypot(a, b) || 1;
    const yLen = Math.hypot(c, d) || 1;
    const xDir: [number, number] = [a / xLen, b / xLen];
    const yDir: [number, number] = [c / yLen, d / yLen];

    const pageCorners: [number, number][] = [
      [e, f],
      [e + item.width * xDir[0], f + item.width * xDir[1]],
      [
        e + item.width * xDir[0] + item.height * yDir[0],
        f + item.width * xDir[1] + item.height * yDir[1]
      ],
      [e + item.height * yDir[0], f + item.height * yDir[1]]
    ];

    const corners = pageCorners.map(([px, py]) => applyMatrix(viewport.transform, px, py));

    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;

    hits.push({
      id: crypto.randomUUID(),
      pageNumber,
      category: guessCategory(text),
      label: `Detected: ${match[0]}`,
      extractedText: text,
      boundingBox: { x, y, width, height },
      points: [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height }
      ],
      status: 'pending',
      dimensions: {}
    });
  }

  return hits;
}
