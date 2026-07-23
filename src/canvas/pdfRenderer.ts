import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TakeoffChecklistItem, TakeoffCategory, BoundingBox, Hotspot } from '@/types/takeoff';


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

// Higher than PDF_RENDER_SCALE (2) — small, dense schedule text benefits
// from more source pixels than the app needs for everyday on-screen
// viewing/tracing. Only used for the one-off "OCR this region" action, not
// the hot page-render path, so the extra render cost is acceptable.
export const OCR_RENDER_SCALE = 6;

// Renders a page at `renderScale` and crops out just `region` — `region`
// is expected in `regionScale`-space pixel coordinates (e.g. straight from
// detectImageRegions, which defaults to PDF_RENDER_SCALE), scaled up to
// match the higher-resolution render before cropping. Re-renders the whole
// page rather than a true partial-viewport render for simplicity; fine for
// a user-triggered one-off action, not something called per frame.
export async function renderPageRegionToCanvas(
  url: string,
  pageNumber: number,
  region: BoundingBox,
  regionScale: number,
  renderScale: number = OCR_RENDER_SCALE
): Promise<HTMLCanvasElement> {
  const fullCanvas = await renderPdfPageToCanvas(url, pageNumber, renderScale);
  const factor = renderScale / regionScale;

  const sx = region.x * factor;
  const sy = region.y * factor;
  const sw = region.width * factor;
  const sh = region.height * factor;

  const cropped = document.createElement('canvas');
  cropped.width = Math.max(1, Math.round(sw));
  cropped.height = Math.max(1, Math.round(sh));
  const ctx = cropped.getContext('2d');
  if (!ctx) throw new Error('Unable to acquire 2D context for cropping.');
  ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, cropped.width, cropped.height);
  return cropped;
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

// Maps a text item's local bounding box into viewport/canvas pixel space.
// Shared by every text-scanning feature below (concrete keywords, cross-
// reference hotspots, detail anchors) so this math only has to be right once.
//
// Coordinate note: per pdf.js's own text-content evaluator, item.width/height
// are NOT raw pre-scale local units — they're already accumulated as
// PDF-page-space magnitudes (Math.hypot(trm[...]) products, where trm is the
// same matrix returned as item.transform). So the item's local x/y axes point
// along item.transform's [a,b] and [c,d] columns respectively, but the
// *length* along each axis is width/height directly — re-multiplying by
// transform's own scale double-scales it (this is what made early highlight
// boxes balloon out past the edge of the sheet). We take only the *direction*
// of those columns, walk width/height along them from the origin (e,f) to get
// the 4 corners in page space, then map those through viewport.transform into
// the same top-left-origin, Y-down, `scale`-factor canvas pixel space
// renderPdfPageToCanvas draws the blueprint bitmap in.
function textItemViewportBox(item: RawTextItem, viewport: { transform: number[] }): BoundingBox {
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
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

// [a, b, c, d, e, f] affine-matrix composition — same convention applyMatrix
// uses above (a PDF/Canvas 2x3 matrix representing [a c e; b d f; 0 0 1]).
function multiplyMatrix(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

// Scans a page's *drawing* operations (not text) for embedded raster images
// large enough to plausibly be a pasted-in schedule/table rather than an
// icon, seal, or logo. extractHighlights above only ever sees the PDF's
// real vector text layer — a schedule authored in Excel and pasted into the
// CAD export as a picture (common in the wild; confirmed on a real sheet
// this app was tested against) is completely invisible to it, no matter how
// the keyword regex is tuned. This walks the operator list PDF.js already
// builds for rendering, tracking the current transform through save/
// restore/transform ops (same CTM convention PDF.js's own canvas renderer
// uses), and records the on-page bounding box of every image-paint op.
// Small icons/stamps (under ~40pt square) are filtered out — a schedule
// table is a substantial chunk of sheet real estate, not a thumbnail.
export interface DetectedImageRegion {
  boundingBox: BoundingBox;
}

const MIN_IMAGE_REGION_PX = 80; // at PDF_RENDER_SCALE=2, ~40pt (~0.55in) square

export async function detectImageRegions(
  url: string,
  pageNumber: number,
  scale: number = PDF_RENDER_SCALE
): Promise<DetectedImageRegion[]> {
  const pdfjs = await loadPdfjs();
  const doc = await loadDocument(url);
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const opList = await page.getOperatorList();

  const IMAGE_OPS = new Set([
    pdfjs.OPS.paintImageXObject,
    pdfjs.OPS.paintImageXObjectRepeat,
    pdfjs.OPS.paintInlineImageXObject,
    pdfjs.OPS.paintInlineImageXObjectGroup,
  ]);

  const regions: DetectedImageRegion[] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack: number[][] = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === pdfjs.OPS.save) {
      ctmStack.push(ctm);
    } else if (fn === pdfjs.OPS.restore) {
      ctm = ctmStack.pop() ?? ctm;
    } else if (fn === pdfjs.OPS.transform) {
      ctm = multiplyMatrix(ctm, args as number[]);
    } else if (IMAGE_OPS.has(fn)) {
      // Every PDF image paints a unit square [0,1]x[0,1] through whatever
      // CTM is active — same convention pdf.js's own graphics executor uses.
      const unitCorners: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const pageCorners = unitCorners
        .map(([x, y]) => applyMatrix(ctm, x, y))
        .map(([x, y]) => applyMatrix(viewport.transform, x, y));
      const xs = pageCorners.map((p) => p[0]);
      const ys = pageCorners.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const width = Math.max(...xs) - x;
      const height = Math.max(...ys) - y;

      if (width >= MIN_IMAGE_REGION_PX && height >= MIN_IMAGE_REGION_PX) {
        regions.push({ boundingBox: { x, y, width, height } });
      }
    }
  }

  return regions;
}

import type { EstimatingDomain } from '@/types/estimatingDomain';

// Renamed from extractConcreteHighlights — no longer concrete-specific.
export async function extractHighlights(
  url: string,
  pageNumber: number,
  domain: EstimatingDomain,
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
    const match = text.match(domain.extractionKeywords);
    if (!match) continue;

    const { x, y, width, height } = textItemViewportBox(item, viewport);

hits.push({
  id: crypto.randomUUID(),
  pageNumber,
  category: domain.guessCategory(text),
  domainId: domain.id,
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

// Matches "SCALE: 1/4" = 1'-0"", "SCALE 1" = 20'-0"", and also the bare
// ratio with no "SCALE" label at all (e.g. "FOUNDATION PLAN 1/4"=1'-0""),
// which is how many title blocks actually print it — the "SCALE" word is
// optional, but the inch mark and foot mark are required as anchors so this
// doesn't false-positive on unrelated "N = N" text.
const SCALE_REGEX = /(?:scale\s*[:=]?\s*)?(\d+(?:\/\d+)?)\s*"\s*=\s*(\d+)\s*'/i;

export interface DetectedScale {
  pixelsPerFoot: number;
  label: string;
  boundingBox: BoundingBox;
}

function unionBoxes(boxes: BoundingBox[]): BoundingBox {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: maxX - x, height: maxY - y };
}

// Scans a page's vector text for an architectural scale annotation and
// converts it into a pixelsPerFoot ratio in the SAME pixel space the rest of
// the app measures in (renderPdfPageToCanvas's `scale`-factor canvas, not raw
// PDF points — 72 points/inch is a PDF-native constant that only gives the
// ratio at viewport scale 1, so it still needs multiplying by our render scale).
//
// Scale text is frequently split across several adjacent text items (separate
// runs for "SCALE:", "1/4"", "=", "1'-0""), so this matches against the whole
// page's text joined together rather than any single item's string — but we
// still track each item's character range in that joined string, so once we
// know where the match landed we can trace it back to the item(s) that
// produced it and return a bounding box the caller can highlight on-canvas.
export async function detectPageScale(
  url: string,
  pageNumber: number,
  scale: number = PDF_RENDER_SCALE
): Promise<DetectedScale | null> {
  const doc = await loadDocument(url);
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();

  const items: RawTextItem[] = [];
  const ranges: Array<{ start: number; end: number }> = [];
  let pageText = '';

  for (const item of textContent.items) {
    if (!isRawTextItem(item)) continue;
    const start = pageText.length;
    pageText += item.str;
    ranges.push({ start, end: pageText.length });
    items.push(item);
    pageText += ' ';
  }

  const match = pageText.match(SCALE_REGEX);
  if (!match || match.index === undefined) return null;

  const numeratorStr = match[1];
  const feetVal = parseFloat(match[2]);
  if (!feetVal) return null;

  let inchesOnPage: number;
  if (numeratorStr.includes('/')) {
    const [num, den] = numeratorStr.split('/').map(Number);
    if (!den) return null;
    inchesOnPage = num / den;
  } else {
    inchesOnPage = parseFloat(numeratorStr);
  }
  if (!inchesOnPage) return null;

  const pointsPerFoot = (inchesOnPage * 72) / feetVal;

  const matchStart = match.index;
  const matchEnd = match.index + match[0].length;
  const contributingItems = items.filter((_, i) => ranges[i].start < matchEnd && ranges[i].end > matchStart);
  const boundingBox =
    contributingItems.length > 0
      ? unionBoxes(contributingItems.map((item) => textItemViewportBox(item, viewport)))
      : { x: 0, y: 0, width: 0, height: 0 };

  return {
    pixelsPerFoot: pointsPerFoot * scale,
    label: `${numeratorStr}" = ${feetVal}'-0"`,
    boundingBox
  };
}

// Matches structural/detail cross-reference callouts like "1/S4.0" or "3-A1.1".
const CROSS_REF_REGEX = /\b(\d+)\s*[/\-\\]\s*([A-Z]\d+(?:\.\d+)?)\b/;

// Scans a page's vector text for cross-reference callouts (e.g. "1/S4.0")
// and returns each as a clickable Hotspot with its on-canvas bounding box.
export async function buildCrossReferenceHotspots(
  url: string,
  pageNumber: number,
  scale: number = PDF_RENDER_SCALE
): Promise<Hotspot[]> {
  const doc = await loadDocument(url);
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();

  const hotspots: Hotspot[] = [];

  for (const item of textContent.items) {
    if (!isRawTextItem(item)) continue;

    const text = item.str.trim();
    const match = text.match(CROSS_REF_REGEX);
    if (!match) continue;

    hotspots.push({
      id: crypto.randomUUID(),
      pageNumber,
      boundingBox: textItemViewportBox(item, viewport),
      targetDetail: match[1],
      targetSheet: match[2]
    });
  }

  return hotspots;
}

// Caches, per document URL, a map of sheet label (e.g. "S4.0") -> page
// number. Built once and reused by every hotspot click against that
// document, since resolving a label can require scanning every page.
const sheetPageMapCache = new Map<string, Promise<Map<string, number>>>();

function buildSheetPageMap(url: string): Promise<Map<string, number>> {
  let cached = sheetPageMapCache.get(url);
  if (cached) return cached;

  cached = (async () => {
    const doc = await loadDocument(url);
    const map = new Map<string, number>();

    // Preferred path: PDFs authored with custom page labels (common for
    // CAD-exported sheet sets) name each page after its sheet number directly.
    const labels = await doc.getPageLabels();
    if (labels) {
      labels.forEach((label, index) => {
        if (label) map.set(label.trim().toUpperCase(), index + 1);
      });
      if (map.size > 0) return map;
    }

    // Fallback: scan each page, one at a time, for a text run that's
    // *exactly* a sheet label (e.g. a title-block stamp reading "S4.0")
    // rather than embedded in a larger callout like "1/S4.0".
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!isRawTextItem(item)) continue;
        const text = item.str.trim().toUpperCase();
        if (/^[A-Z]\d+(?:\.\d+)?$/.test(text) && !map.has(text)) {
          map.set(text, pageNumber);
        }
      }
    }

    return map;
  })();

  sheetPageMapCache.set(url, cached);
  return cached;
}

// Resolves a sheet label (e.g. "S4.0") to its 1-indexed page number within
// the given document, or null if no matching page can be found.
export async function resolveSheetPageNumber(url: string, sheetLabel: string): Promise<number | null> {
  const map = await buildSheetPageMap(url);
  return map.get(sheetLabel.trim().toUpperCase()) ?? null;
}

// Scans a (resolved) target page for a "DETAIL N" / "DET. N" callout and
// returns its center point in viewport pixel space, for centering the
// split-screen preview. Returns null if no matching heading is found (the
// caller falls back to centering on the page itself).
export async function findDetailAnchorPoint(
  url: string,
  pageNumber: number,
  detailNumber: string,
  scale: number = PDF_RENDER_SCALE
): Promise<{ x: number; y: number } | null> {
  const doc = await loadDocument(url);
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();

  const needle = detailNumber.trim().toUpperCase();

  for (const item of textContent.items) {
    if (!isRawTextItem(item)) continue;
    const text = item.str.toUpperCase();
    if (
      text.includes(`DETAIL ${needle}`) ||
      text.includes(`DET. ${needle}`) ||
      text.includes(`DET ${needle}`)
    ) {
      const box = textItemViewportBox(item, viewport);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
  }

  return null;
}
