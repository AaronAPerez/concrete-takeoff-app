import type { Point } from '@/types/takeoff';
import { traceMaskContour } from '@/utils/contour';

// @huggingface/transformers touches browser-only APIs (WebGPU, canvas) at
// import/init time, which would crash Next's SSR pass the same way
// pdfjs-dist does (see canvas/pdfRenderer.ts) — deferring via dynamic import
// keeps module evaluation lazy until a browser actually calls one of the
// methods below (from useSegmentationEngine, post-mount).
let transformersPromise: Promise<typeof import('@huggingface/transformers')> | null = null;
function loadTransformers() {
  if (!transformersPromise) {
    transformersPromise = (async () => {
      hideBrokenWebGpuIfNeeded();
      return import('@huggingface/transformers');
    })();
  }
  return transformersPromise;
}

// Some GPU/driver combinations expose `navigator.gpu` (so simple feature
// detection reports WebGPU as available) but crash deep inside ONNX Runtime
// Web's compiled glue — `Cannot read properties of undefined (reading
// 'subgroupMinSize')` — as soon as it's touched at all, and this happens
// identically whether you request device 'auto' or explicit 'wasm': the
// crash is in shared module-level capability detection, not EP selection,
// so asking for WASM doesn't route around it.
//
// Setting navigator.gpu's *value* to undefined (rather than deleting the
// key) is what actually routes around it — verified directly against ORT's
// bundled source, its WebGPU session-init does `if (!navigator.gpu) throw
// new Error("WebGPU is not supported in current environment")` before ever
// touching an adapter. That's a plain truthiness check, not `'gpu' in
// navigator` (which stays true either way, since defineProperty always
// leaves the key present — deleting it doesn't help either, since it just
// re-exposes Navigator.prototype's native getter). ORT's own EP-registration
// wrapper then catches that thrown error and cleanly drops 'webgpu' from the
// session's execution providers with a console.warn, instead of crashing —
// that "removing requested execution provider webgpu... not available"
// warning is this fix working as intended, not a new problem.
function hideBrokenWebGpuIfNeeded() {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return;
  try {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
  } catch (err) {
    // Some browsers won't allow redefining navigator.gpu — fall through;
    // the try/catch retry in doInit() below is still a (weaker) backstop.
    console.warn('Could not disable navigator.gpu to work around a known WebGPU/ONNX Runtime crash:', err);
  }
}

// Ultra-lightweight SAM variant — small enough to fetch and cache in the
// browser rather than needing a server-hosted model + embedding endpoint.
// Verified against the live Hub: architectures=["SamModel"], model_type=
// "sam", processor_class="SamProcessor", with matching onnx/vision_encoder.onnx
// + onnx/prompt_encoder_mask_decoder.onnx files (the exact session name
// modeling_sam.js's forward() looks up). The model id this was originally
// written against, 'onnx-community/slimsam-0.0.2', doesn't exist on the Hub
// at all — every request 401'd.
const MODEL_ID = 'Xenova/slimsam-77-uniform';

export interface MaskPreview {
  grid: Float32Array; // raw low-res decoder output for the best-scoring mask
  gridSize: number; // grid is gridSize x gridSize (SAM's fixed decoder resolution)
  score: number;
}

export interface MaskCommitResult {
  points: Point[]; // polygon in the loaded image's own pixel space
  score: number;
}

// Wraps Transformers.js's SAM model/processor: loads once, precomputes the
// (relatively slow, ~1-2s) image encoder embeddings once per loaded page,
// then serves fast (<15ms) per-point decoder queries against those cached
// embeddings. Framework-agnostic — no React/DOM assumptions beyond the
// canvas passed into loadImage, so it's reusable outside this component tree.
export class SegmentationEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processor: any = null;
  private initPromise: Promise<void> | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private imageEmbeddings: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private imagePositionalEmbeddings: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private originalSizes: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private reshapedInputSizes: any = null;
  private embeddingToken = 0;

  public isReady = false;

  // Idempotent — safe to call from multiple places; only loads once. On
  // failure, clears the cached promise so a later call can retry instead of
  // replaying the same rejection forever (promises only settle once).
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
    const { SamModel, AutoProcessor } = await loadTransformers();
    this.processor = await AutoProcessor.from_pretrained(MODEL_ID);

    // 'auto' prefers WebGPU and falls back to WASM when unsupported. Under
    // normal circumstances this is exactly what we want; the try/catch here
    // is just a second line of defense — hideBrokenWebGpuIfNeeded() (in
    // loadTransformers, above) is the actual fix for the known subgroupMinSize
    // crash, since that crash happens regardless of which device string is
    // requested and therefore isn't something retrying with 'wasm' alone routes around.
    try {
      this.model = await SamModel.from_pretrained(MODEL_ID, { device: 'auto' });
    } catch (err) {
      console.warn('Model load failed on first attempt, retrying on WASM:', err);
      this.model = await SamModel.from_pretrained(MODEL_ID, { device: 'wasm' });
    }

    this.isReady = true;
  }

  hasImage(): boolean {
    return !!(this.imageEmbeddings && this.imagePositionalEmbeddings && this.originalSizes && this.reshapedInputSizes);
  }

  // Runs the image encoder once for this canvas's current contents. Token-
  // guarded the same way Engine.ts guards blueprint bitmap loads, so a page
  // flip mid-encode doesn't let a stale result clobber a newer one.
  async loadImage(source: HTMLCanvasElement): Promise<void> {
    await this.init();
    const { RawImage } = await loadTransformers();

    const token = ++this.embeddingToken;

    // RawImage.fromCanvas reads pixels via getImageData, which the browser
    // flags as needing `willReadFrequently` for good performance. Setting
    // that on `source` itself would be wrong — it's the same canvas Engine's
    // render loop drawImage()s every animation frame, and willReadFrequently
    // trades that (much hotter) path's performance away in exchange for
    // readback performance we only need once per page. Copying into a
    // throwaway canvas created with the hint keeps the two uses isolated.
    const snapshot = document.createElement('canvas');
    snapshot.width = source.width;
    snapshot.height = source.height;
    snapshot.getContext('2d', { willReadFrequently: true })?.drawImage(source, 0, 0);

    const image = await RawImage.read(snapshot);
    const inputs = await this.processor(image);
    const { image_embeddings, image_positional_embeddings } = await this.model.get_image_embeddings({
      pixel_values: inputs.pixel_values
    });

    if (token !== this.embeddingToken) return; // superseded by a newer loadImage call

    this.imageEmbeddings = image_embeddings;
    this.imagePositionalEmbeddings = image_positional_embeddings;
    this.originalSizes = inputs.original_sizes;
    this.reshapedInputSizes = inputs.reshaped_input_sizes;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async decodeAt(x: number, y: number): Promise<any | null> {
    if (!this.hasImage()) return null;

    // reshape_input_points scales raw image-space coordinates into SAM's
    // internal padded/resized coordinate space — skipping this (e.g. handing
    // the model raw pixel coords directly) silently produces wrong masks.
    const reshapedPoints = this.processor.reshape_input_points(
      [[[x, y]]],
      this.originalSizes,
      this.reshapedInputSizes
    );

    // Calling the model with image_embeddings already supplied skips re-
    // running the (slow) encoder — this is what makes per-point queries fast.
    return this.model({
      input_points: reshapedPoints,
      image_embeddings: this.imageEmbeddings,
      image_positional_embeddings: this.imagePositionalEmbeddings
    });
  }

  // Fraction of the image a mask covers, above which it's treated as a
  // degenerate "whole page" prediction rather than a real region.
  private static readonly MAX_MASK_AREA_FRACTION = 0.6;
  private static readonly MIN_MASK_SCORE = 0.5;

  // SAM returns 3 candidate masks per point at different granularities
  // (roughly: sub-part / whole-object / whole-scene), each with its own
  // confidence score — argmax(score) alone isn't a reliable pick. SAM was
  // trained on natural photos; on architectural line drawings (thin strokes,
  // large uniform-white regions) it frequently rates the "whole scene"
  // candidate as most confident, which argmax(score) would then show as a
  // solid-colored overlay covering almost the entire sheet. Filtering out
  // any candidate above MAX_MASK_AREA_FRACTION before ranking by score fixes
  // that; if every candidate is that large, we return null (show nothing)
  // rather than the least-bad giant blob.
  private static selectMaskIndex(scores: Float32Array, areaFractions: number[]): number | null {
    const viable: number[] = [];
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] >= SegmentationEngine.MIN_MASK_SCORE) viable.push(i);
    }
    if (viable.length === 0) return null;

    const reasonable = viable.filter((i) => areaFractions[i] <= SegmentationEngine.MAX_MASK_AREA_FRACTION);
    if (reasonable.length === 0) return null;

    return reasonable.reduce((best, i) => (scores[i] > scores[best] ? i : best), reasonable[0]);
  }

  private static areaFractionsOf(data: Float32Array | Uint8Array, maskCount: number, maskArea: number): number[] {
    const fractions: number[] = [];
    for (let m = 0; m < maskCount; m++) {
      const offset = m * maskArea;
      let count = 0;
      for (let i = 0; i < maskArea; i++) {
        if (data[offset + i] > 0) count++;
      }
      fractions.push(count / maskArea);
    }
    return fractions;
  }

  // Fast hover-preview query: returns the raw low-res decoder grid for
  // whichever of SAM's 3 candidate masks best fits (see selectMaskIndex).
  // Deliberately skips the (slower) post_process_masks upscaling step — the
  // caller stretches this visually for feedback, not precision.
  async previewAt(x: number, y: number): Promise<MaskPreview | null> {
    const outputs = await this.decodeAt(x, y);
    if (!outputs) return null;

    const scores = outputs.iou_scores.data as Float32Array;
    const maskData = outputs.pred_masks.data as Float32Array;
    const dims: number[] = outputs.pred_masks.dims;
    const gridSize = dims[dims.length - 1];
    const maskArea = gridSize * gridSize;

    const areaFractions = SegmentationEngine.areaFractionsOf(maskData, scores.length, maskArea);
    const bestIndex = SegmentationEngine.selectMaskIndex(scores, areaFractions);
    if (bestIndex === null) return null;

    return {
      grid: maskData.slice(bestIndex * maskArea, (bestIndex + 1) * maskArea),
      gridSize,
      score: scores[bestIndex]
    };
  }

  // Accurate commit query: upscales the best mask back to the loaded
  // image's original pixel dimensions (post_process_masks) and traces its
  // outline into a polygon in that same coordinate space — which, in this
  // app, is identical to "world space" for the loaded blueprint bitmap
  // (drawn at (0,0) with no additional scale), so the result can be handed
  // straight to saveCurrentDraft.
  async commitAt(x: number, y: number): Promise<MaskCommitResult | null> {
    const outputs = await this.decodeAt(x, y);
    if (!outputs) return null;

    const scores = outputs.iou_scores.data as Float32Array;

    const [processedMask] = await this.processor.post_process_masks(
      outputs.pred_masks,
      this.originalSizes,
      this.reshapedInputSizes
    );
    // processedMask dims: [point_batch=1, num_masks=3, origH, origW], bool (Uint8Array 0/1) data
    const dims: number[] = processedMask.dims;
    const [origH, origW] = [dims[dims.length - 2], dims[dims.length - 1]];
    const maskArea = origH * origW;
    const fullData = processedMask.data as Uint8Array;

    const areaFractions = SegmentationEngine.areaFractionsOf(fullData, scores.length, maskArea);
    const bestIndex = SegmentationEngine.selectMaskIndex(scores, areaFractions);
    if (bestIndex === null) return null;

    const bestMask = fullData.slice(bestIndex * maskArea, (bestIndex + 1) * maskArea);
    const points = traceMaskContour(bestMask, origW, origH);
    if (!points) return null;

    return { points, score: scores[bestIndex] };
  }

  // Drops cached embeddings (e.g. when the blueprint/page changes) without
  // discarding the loaded model itself.
  clearImage() {
    this.embeddingToken++; // invalidate any in-flight loadImage
    this.imageEmbeddings = null;
    this.imagePositionalEmbeddings = null;
    this.originalSizes = null;
    this.reshapedInputSizes = null;
  }
}
