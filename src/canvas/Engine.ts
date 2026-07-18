import { Viewport } from './Viewport';
import { InputHandler } from './InputHandler';
import { SpatialIndex } from './SpatialIndex';
import { renderPdfPageToCanvas, getPageCount, tintCanvas, buildCrossReferenceHotspots } from './pdfRenderer';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import type { Point, TakeoffChecklistItem, Hotspot } from '@/types/takeoff';

const HIGHLIGHT_DURATION_MS = 1600;

export class TakeoffEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private animationFrameId: number | null = null;

  // Expose camera controllers
  public viewport: Viewport;
  private inputHandler: InputHandler;
  private spatialIndex = new SpatialIndex();

  private blueprintBitmap: HTMLCanvasElement | null = null;
  private blueprintBitmapPromise: Promise<void> | null = null;
  private comparisonBitmap: HTMLCanvasElement | null = null;
  private pdfLoadToken = 0;
  private comparisonLoadToken = 0;

  private highlightId: string | null = null;
  private highlightExpiresAt = 0;

  // Cross-reference callouts ("1/S4.0") detected on the current page — see
  // buildCrossReferenceHotspots. Reuses the same SpatialIndex class the
  // takeoff hit-testing uses, just a separate instance/id-space so the two
  // don't collide.
  private hotspots: Hotspot[] = [];
  private hotspotIndex = new SpatialIndex();
  private hotspotLoadToken = 0;
  private hoveredHotspotId: string | null = null;
  private hotspotClickListener: ((hotspot: Hotspot) => void) | null = null;

  // Live AI-segmentation hover preview (see useSegmentationEngine/AiSnapTool).
  // Just a pre-rendered canvas handed in by the React layer — Engine only
  // knows how to stretch it over the blueprint's world-space extent each frame.
  private segmentationPreviewCanvas: HTMLCanvasElement | null = null;

  private unsubscribers: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Initialize custom camera controllers
    this.viewport = new Viewport();
    this.inputHandler = new InputHandler(this.canvas, this.viewport);
    this.canvas.addEventListener('click', this.handleCanvasClick);

    this.subscribeToStores();
    this.init();
  }

  // Hotspot clicks are handled as a plain 'click' listener (separate from
  // InputHandler's toolClickListener channel) because they're always-live
  // navigation aids, not something a tool opts into the way calibration/
  // alignment point-capture does.
  private handleCanvasClick = () => {
    if (!this.hoveredHotspotId) return;
    const hotspot = this.hotspots.find((h) => h.id === this.hoveredHotspotId);
    if (hotspot) this.hotspotClickListener?.(hotspot);
  };

  private init() {
    this.resize();
    window.addEventListener('resize', this.handleResize);
    this.startLoop();
  }

  private handleResize = () => {
    this.resize();
  };

  private resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    this.canvas.width = rect?.width || window.innerWidth;
    this.canvas.height = rect?.height || window.innerHeight;
    this.render();
  }

  private startLoop() {
    const loop = () => {
      this.render();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private subscribeToStores() {
    this.unsubscribers.push(
      useBlueprintStore.subscribe((state, prev) => {
        if (state.blueprintUrl !== prev.blueprintUrl || state.currentPage !== prev.currentPage) {
          this.blueprintBitmapPromise = this.loadBlueprintBitmap();
          void this.loadHotspots();
        }
        if (state.comparisonUrl !== prev.comparisonUrl || state.comparisonPage !== prev.comparisonPage) {
          void this.loadComparisonBitmap();
        }
      })
    );

    this.unsubscribers.push(
      useTakeoffStore.subscribe((state) => {
        this.reindexTakeoffs(state.takeoffs);
      })
    );

    this.reindexTakeoffs(useTakeoffStore.getState().takeoffs);
  }

  private reindexTakeoffs(items: TakeoffChecklistItem[]) {
    this.spatialIndex.rebuild(items);
  }

  private async loadBlueprintBitmap() {
    const { blueprintUrl, currentPage } = useBlueprintStore.getState();
    if (!blueprintUrl) {
      this.blueprintBitmap = null;
      return;
    }

    const token = ++this.pdfLoadToken;
    const bitmap = await renderPdfPageToCanvas(blueprintUrl, currentPage);
    if (token !== this.pdfLoadToken) return; // superseded by a newer load
    this.blueprintBitmap = bitmap;
    this.fitToBitmap(bitmap);
  }

  private async loadHotspots() {
    const { blueprintUrl, currentPage } = useBlueprintStore.getState();
    if (!blueprintUrl) {
      this.hotspots = [];
      this.hotspotIndex.clear();
      this.hoveredHotspotId = null;
      return;
    }

    const token = ++this.hotspotLoadToken;
    const hotspots = await buildCrossReferenceHotspots(blueprintUrl, currentPage);
    if (token !== this.hotspotLoadToken) return; // superseded by a newer load

    this.hotspots = hotspots;
    this.hotspotIndex.rebuild(hotspots);
    this.hoveredHotspotId = null;
  }

  private async loadComparisonBitmap() {
    const { comparisonUrl, comparisonPage } = useBlueprintStore.getState();
    if (!comparisonUrl) {
      this.comparisonBitmap = null;
      return;
    }

    const token = ++this.comparisonLoadToken;
    const bitmap = await renderPdfPageToCanvas(comparisonUrl, comparisonPage);
    if (token !== this.comparisonLoadToken) return;
    this.comparisonBitmap = tintCanvas(bitmap, '#22c55e');
  }

  private fitToBitmap(bitmap: HTMLCanvasElement) {
    const marginFactor = 0.92;
    const fitZoom =
      Math.min(this.canvas.width / bitmap.width, this.canvas.height / bitmap.height) * marginFactor;

    this.viewport.panAndZoomTo(
      bitmap.width / 2,
      bitmap.height / 2,
      { width: this.canvas.width, height: this.canvas.height },
      { zoom: fitZoom > 0 ? fitZoom : 1, duration: 0 }
    );
  }

  // Loads a blueprint PDF from a URL (e.g. an object URL from a file picker)
  // and swaps it in as the active background sheet.
  public async loadBlueprint(url: string) {
    useBlueprintStore.getState().loadBlueprint(url);
    const pageCount = await getPageCount(url);
    useBlueprintStore.getState().setPageCount(pageCount);
  }

  public async loadComparison(url: string) {
    useBlueprintStore.getState().loadComparison(url);
  }

  // Smoothly centers the camera on a world point (used when a checklist item
  // is selected in the sidebar) and briefly flashes its bounding box.
  public panAndZoomTo(worldX: number, worldY: number, options?: { zoom?: number; duration?: number }) {
    this.viewport.panAndZoomTo(
      worldX,
      worldY,
      { width: this.canvas.width, height: this.canvas.height },
      options
    );
  }

  public highlightElement(id: string) {
    this.highlightId = id;
    this.highlightExpiresAt = performance.now() + HIGHLIGHT_DURATION_MS;
  }

  // Snapshot of camera + content state for the scrollbar UI (CanvasScrollbars),
  // which polls this every frame since Viewport isn't itself reactive/store-backed.
  // Returns null when there's nothing loaded to scroll around.
  public getCameraState(): {
    zoom: number;
    offsetX: number;
    offsetY: number;
    canvasWidth: number;
    canvasHeight: number;
    contentWidth: number;
    contentHeight: number;
  } | null {
    if (!this.blueprintBitmap) return null;
    return {
      zoom: this.viewport.zoom,
      offsetX: this.viewport.offsetX,
      offsetY: this.viewport.offsetY,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      contentWidth: this.blueprintBitmap.width,
      contentHeight: this.blueprintBitmap.height
    };
  }

  // Pans the camera by a fraction of the content's total width/height (e.g.
  // 0.1 = shift the view right by 10% of the sheet's width) — used by the
  // scrollbar thumbs, where a drag distance is naturally a track-length
  // fraction rather than a raw pixel delta.
  public panByContentFraction(fx: number, fy: number) {
    const state = this.getCameraState();
    if (!state) return;
    this.viewport.pan(-fx * state.contentWidth * state.zoom, -fy * state.contentHeight * state.zoom);
  }

  // The currently-rendered blueprint page bitmap, for feeding into the
  // AI segmentation model (its "world space" pixel coordinates are exactly
  // this bitmap's own pixel coordinates — see AiSnapTool).
  public getBlueprintBitmap(): HTMLCanvasElement | null {
    return this.blueprintBitmap;
  }

  // Awaits whichever bitmap load is currently in flight (page navigation is
  // async — renderPdfPageToCanvas takes a moment) before returning the
  // result, so callers like AiSnapTool don't race a page flip and feed the
  // segmentation model a stale or not-yet-loaded bitmap.
  public async waitForBlueprintBitmap(): Promise<HTMLCanvasElement | null> {
    await this.blueprintBitmapPromise;
    return this.blueprintBitmap;
  }

  // Live world-space mouse position, for AiSnapTool's hover-preview polling
  // loop (mirrors how drawActiveDraft already reads this internally).
  public getCurrentWorldMousePos(): Point {
    return this.inputHandler.currentWorldMousePos;
  }

  // Sets/clears the AI-segmentation hover-preview overlay (a small canvas
  // the caller has already rendered a colored mask onto). Stretched over the
  // blueprint's full extent every frame in drawSegmentationPreview.
  public setSegmentationPreview(previewCanvas: HTMLCanvasElement | null) {
    this.segmentationPreviewCanvas = previewCanvas;
  }

  // Generic point-capture channel — see InputHandler.toolClickListener.
  // Only one tool can own this at a time; useEngineClickCapture enforces
  // that by clearing it on deactivation/unmount.
  public setToolClickListener(listener: ((point: Point) => void) | null) {
    this.inputHandler.toolClickListener = listener;
  }

  // Fires whenever a cross-reference hotspot is clicked (see handleCanvasClick).
  public setHotspotClickListener(listener: ((hotspot: Hotspot) => void) | null) {
    this.hotspotClickListener = listener;
  }

  // Hit-tests the live mouse position against this page's hotspots and
  // updates the cursor. Only active in 'select' mode so it doesn't fight
  // with drafting/pan/calibrate/align cursors, and only while there's
  // actually a hotspot loaded (queryPoint is a no-op grid lookup either way,
  // but skipping it avoids touching the cursor at all when there's nothing to hover).
  private updateHotspotHover() {
    if (useTakeoffStore.getState().activeTool !== 'select' || this.hotspots.length === 0) {
      if (this.hoveredHotspotId !== null) this.hoveredHotspotId = null;
      return;
    }

    const mouse = this.inputHandler.currentWorldMousePos;
    const hoveredId = this.hotspotIndex.queryPoint(mouse.x, mouse.y)[0] ?? null;

    if (hoveredId !== this.hoveredHotspotId) {
      this.hoveredHotspotId = hoveredId;
      this.canvas.style.cursor = hoveredId ? 'pointer' : 'crosshair';
    }
  }

  // Zooms in/out pivoting around the center of the viewport (for toolbar buttons).
  public zoomBy(factor: number) {
    this.viewport.zoomToPoint(factor, this.canvas.width / 2, this.canvas.height / 2);
  }

public render() {
    if (!this.ctx) return;

    const width = this.canvas.width;
    const height = this.canvas.height;

    // 1. Reset matrix & clean canvas background
    this.viewport.resetTransform(this.ctx);
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = '#121212';
    this.ctx.fillRect(0, 0, width, height);

    // 2. APPLY CAMERA ZOOM/PAN MATRIX
    this.viewport.applyTransform(this.ctx);

    // 3. Render base infinite coordinate grid line layers
    this.ctx.strokeStyle = '#1e293b'; 
    this.ctx.lineWidth = 1;
    const gridSize = 40;
    const worldLimit = 5000;

    this.ctx.beginPath();
    for (let x = -worldLimit; x <= worldLimit; x += gridSize) {
      this.ctx.moveTo(x, -worldLimit);
      this.ctx.lineTo(x, worldLimit);
    }
    for (let y = -worldLimit; y <= worldLimit; y += gridSize) {
      this.ctx.moveTo(-worldLimit, y);
      this.ctx.lineTo(worldLimit, y);
    }
    this.ctx.stroke();

    // ----------------------------------------------------
    // EVERYTHING RENDERED BELOW THIS POINT NOW MOVES/ZOOMS
    // WITH THE CAMERA AS "WORLD" COORDINATES
    // ----------------------------------------------------

    if (this.blueprintBitmap) {
      this.ctx.drawImage(this.blueprintBitmap, 0, 0);
    } else {
      this.drawPlaceholderGrid();
    }

    if (this.comparisonBitmap && useBlueprintStore.getState().isComparing) {
      this.drawComparisonOverlay();
    }

    this.drawSegmentationPreview();
    this.drawFinalizedTakeoffs();
    this.drawActiveDraft();
    this.drawHighlight();
    this.drawPendingScaleHighlight();
    this.updateHotspotHover();
    this.drawHotspotHover();

    // ----------------------------------------------------
    // End camera viewport block
    // ----------------------------------------------------
  }

  private drawPlaceholderGrid() {
    if (!this.ctx) return;

    // Draw reference grid patterns (extending far beyond the screen bounds)
    this.ctx.strokeStyle = '#1e293b'; // Slate-800
    this.ctx.lineWidth = 1;
    const gridSize = 40;
    const worldLimit = 5000; // Extend grid lines outward into workspace limits

    this.ctx.beginPath();
    for (let x = -worldLimit; x <= worldLimit; x += gridSize) {
      this.ctx.moveTo(x, -worldLimit);
      this.ctx.lineTo(x, worldLimit);
    }
    for (let y = -worldLimit; y <= worldLimit; y += gridSize) {
      this.ctx.moveTo(-worldLimit, y);
      this.ctx.lineTo(worldLimit, y);
    }
    this.ctx.stroke();

    // Draw a prominent anchor circle at the origin point (0, 0)
    this.ctx.fillStyle = '#3b82f6'; // Blue-500
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 8, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawComparisonOverlay() {
    if (!this.ctx || !this.comparisonBitmap) return;
    const { translateX, translateY, scale, rotationDeg } = useBlueprintStore.getState().alignmentMatrix;

    this.ctx.save();
    this.ctx.globalAlpha = 0.6;
    this.ctx.globalCompositeOperation = 'multiply';
    this.ctx.translate(translateX, translateY);
    this.ctx.rotate((rotationDeg * Math.PI) / 180);
    this.ctx.scale(scale, scale);
    this.ctx.drawImage(this.comparisonBitmap, 0, 0);
    this.ctx.restore();
  }

  private drawSegmentationPreview() {
    if (!this.ctx || !this.segmentationPreviewCanvas || !this.blueprintBitmap) return;
    this.ctx.drawImage(
      this.segmentationPreviewCanvas,
      0,
      0,
      this.blueprintBitmap.width,
      this.blueprintBitmap.height
    );
  }

  private drawFinalizedTakeoffs() {
    if (!this.ctx) return;
    const { currentPage } = useBlueprintStore.getState();
    const { takeoffs, selectedTakeoffId } = useTakeoffStore.getState();

    for (const item of takeoffs) {
      if (item.pageNumber !== currentPage) continue;
      this.drawTakeoffBox(item, item.id === selectedTakeoffId);
    }
  }

private drawTakeoffBox(item: TakeoffChecklistItem, isSelected: boolean) {
  if (!this.ctx || item.points.length < 2) return;
  const { x, y, width, height } = item.boundingBox;
  const color = item.category === 'Slab' ? '#10b981' : '#f59e0b';

  this.ctx.save();
  this.ctx.lineWidth = (isSelected ? 3 : 2) / this.viewport.zoom;

  // Undreviewed vector-extraction hits stay as a dashed bounding rect —
  // they're a text-match hit, not a traced shape, so there's no polygon yet.
  if (item.status === 'pending') {
    this.ctx.setLineDash([4 / this.viewport.zoom, 3 / this.viewport.zoom]);
    this.ctx.strokeStyle = '#facc15';
    this.ctx.strokeRect(x, y, width, height);
    this.ctx.setLineDash([]);
    this.ctx.restore();
    return;
  }

  // Draw the actual traced outline. Was: strokeRect/fillRect on boundingBox,
  // which flattened every non-rectangular trace into a box once finalized.
  const isLinear = item.dimensions.linearFt !== undefined && item.dimensions.areaSqFt === undefined;

  this.ctx.strokeStyle = color;
  this.ctx.fillStyle = isSelected ? `${color}33` : `${color}1a`;
  this.ctx.beginPath();
  this.ctx.moveTo(item.points[0].x, item.points[0].y);
  for (let i = 1; i < item.points.length; i++) {
    this.ctx.lineTo(item.points[i].x, item.points[i].y);
  }
  if (!isLinear && item.points.length > 2) {
    this.ctx.closePath();
    this.ctx.fill();
  }
  this.ctx.stroke();
  this.ctx.restore();

  const measurement = item.dimensions.areaSqFt
    ? `${item.dimensions.areaSqFt.toFixed(2)} SF`
    : item.dimensions.linearFt
      ? `${item.dimensions.linearFt.toFixed(2)} LF`
      : null;

  if (measurement) {
    this.drawWorldLabel(measurement, { x: x + width / 2, y: y + height / 2 }, color);
  }
}

  private drawActiveDraft() {
    if (!this.ctx) return;
    const { activeTool, draftPoints } = useTakeoffStore.getState();
    if (draftPoints.length === 0) return;
    if (activeTool !== 'area' && activeTool !== 'linear') return;

    const hover = this.inputHandler.currentWorldMousePos;
    const points = [...draftPoints, hover];
    const color = activeTool === 'area' ? '#3b82f6' : '#f59e0b';

    this.ctx.save();
    this.ctx.lineWidth = 2 / this.viewport.zoom;
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = `${color}33`;

    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.ctx.lineTo(points[i].x, points[i].y);
    if (activeTool === 'area' && draftPoints.length >= 3) {
      this.ctx.closePath();
      this.ctx.fill();
    }
    this.ctx.stroke();

    this.ctx.fillStyle = color;
    for (const p of draftPoints) {
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 4 / this.viewport.zoom, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  private drawHotspotHover() {
    if (!this.ctx || !this.hoveredHotspotId) return;
    const hotspot = this.hotspots.find((h) => h.id === this.hoveredHotspotId);
    if (!hotspot) return;

    const { x, y, width, height } = hotspot.boundingBox;
    const pad = 4 / this.viewport.zoom;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';
    this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
    this.ctx.lineWidth = 2 / this.viewport.zoom;
    this.ctx.fillRect(x - pad, y - pad, width + pad * 2, height + pad * 2);
    this.ctx.strokeRect(x - pad, y - pad, width + pad * 2, height + pad * 2);
    this.ctx.restore();
  }

  private drawHighlight() {
    if (!this.ctx || !this.highlightId) return;

    const now = performance.now();
    if (now > this.highlightExpiresAt) {
      this.highlightId = null;
      return;
    }

    const bbox = this.spatialIndex.getBoundingBox(this.highlightId);
    if (!bbox) return;

    const pulse = 0.5 + 0.5 * Math.sin(now / 120);

    this.ctx.save();
    this.ctx.strokeStyle = `rgba(250, 204, 21, ${0.6 + 0.4 * pulse})`;
    this.ctx.fillStyle = `rgba(250, 204, 21, ${0.15 + 0.15 * pulse})`;
    this.ctx.lineWidth = 3 / this.viewport.zoom;
    this.ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
    this.ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);
    this.ctx.restore();
  }

  // Pulsing violet box around the exact text ScaleDetectorToast's auto-scale
  // read its ratio from — same accent color as the toast itself, so it's
  // visually obvious the two are connected. Only draws while that page is
  // actually the one on screen (pendingScaleConfig captures the page it was
  // detected on, which may not be wherever the user has since navigated to).
  private drawPendingScaleHighlight() {
    if (!this.ctx) return;
    const { pendingScaleConfig } = useTakeoffStore.getState();
    if (!pendingScaleConfig) return;
    if (pendingScaleConfig.pageNumber !== useBlueprintStore.getState().currentPage) return;

    const { x, y, width, height } = pendingScaleConfig.boundingBox;
    if (width === 0 && height === 0) return;

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 200);
    const pad = 6 / this.viewport.zoom;

    this.ctx.save();
    this.ctx.strokeStyle = `rgba(139, 92, 246, ${0.7 + 0.3 * pulse})`;
    this.ctx.fillStyle = `rgba(139, 92, 246, ${0.15 + 0.15 * pulse})`;
    this.ctx.lineWidth = 3 / this.viewport.zoom;
    this.ctx.strokeRect(x - pad, y - pad, width + pad * 2, height + pad * 2);
    this.ctx.fillRect(x - pad, y - pad, width + pad * 2, height + pad * 2);
    this.ctx.restore();
  }

  // Draws screen-size-constant text at a world coordinate (compensates for
  // the active zoom level so labels don't grow/shrink with the camera).
  private drawWorldLabel(text: string, worldPoint: Point, color: string) {
    if (!this.ctx) return;
    const zoom = this.viewport.zoom;

    this.ctx.save();
    this.ctx.translate(worldPoint.x, worldPoint.y);
    this.ctx.scale(1 / zoom, 1 / zoom);

    this.ctx.font = '600 12px ui-sans-serif, system-ui';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    const metrics = this.ctx.measureText(text);
    const paddingX = 6;

    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    this.ctx.fillRect(-metrics.width / 2 - paddingX, -10, metrics.width + paddingX * 2, 20);
    this.ctx.fillStyle = color;
    this.ctx.fillText(text, 0, 0);
    this.ctx.restore();
  }

  public destroy() {
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('click', this.handleCanvasClick);
    this.inputHandler.destroy();
    this.viewport.cancelAnimation();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
  }
}
