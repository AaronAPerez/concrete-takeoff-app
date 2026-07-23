// tesseract.js touches browser-only APIs at worker-creation time, same
// SSR-crash risk pdfjs-dist and @huggingface/transformers have — deferred
// via dynamic import for the same reason (see segmentationEngine.ts).
let tesseractPromise: Promise<typeof import('tesseract.js')> | null = null;
function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import('tesseract.js');
  }
  return tesseractPromise;
}

export interface OcrBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  confidence: number; // 0-100, Tesseract's own per-word certainty
  bbox: OcrBbox;
}

// Wraps tesseract.js: loads the worker + English model once (~15MB,
// IndexedDB-cached by tesseract.js itself after first use — same "slow
// once, fast after" tradeoff as the SAM model in segmentationEngine.ts),
// then serves recognizeRegion() calls against it. Framework-agnostic, no
// React/DOM assumptions beyond the canvas passed in.
export class OcrEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private worker: any = null;
  private initPromise: Promise<void> | null = null;

  public isReady = false;

  // Idempotent — safe to call from multiple places; only loads once. On
  // failure, clears the cached promise so a later call can retry instead of
  // replaying the same rejection forever (promises only settle once) — same
  // pattern SegmentationEngine.init uses.
  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    const { createWorker } = await loadTesseract();
    this.worker = await createWorker('eng');
    this.isReady = true;
  }

  // Runs OCR against a single cropped region (see pdfRenderer.ts's
  // cropCanvasRegion) and flattens Tesseract's block/paragraph/line
  // hierarchy into a plain word list — utils/tableReconstruction.ts works
  // on this flat list, not the hierarchy, since a schedule's visual rows/
  // columns rarely line up with Tesseract's own paragraph/line grouping
  // (see that file's row/column clustering for why it re-derives structure
  // from word bounding boxes instead of trusting Tesseract's own layout).
  async recognizeRegion(source: HTMLCanvasElement): Promise<OcrWord[]> {
    await this.init();

    const { data } = await this.worker.recognize(source, {}, { blocks: true, text: false });

    const words: OcrWord[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const word of line.words ?? []) {
            const text = (word.text ?? '').trim();
            if (!text) continue;
            words.push({ text, confidence: word.confidence, bbox: word.bbox });
          }
        }
      }
    }
    return words;
  }

  // Releases the worker (and its wasm/model memory). Not called anywhere
  // yet — this app has no navigation-away lifecycle that needs it (same as
  // SegmentationEngine, which also never terminates its model) — kept for
  // completeness/future use rather than left unwritten.
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isReady = false;
      this.initPromise = null;
    }
  }
}
