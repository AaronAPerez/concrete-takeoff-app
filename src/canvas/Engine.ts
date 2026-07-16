import { Viewport } from './Viewport';
import { InputHandler } from './InputHandler';
import { SpatialIndex } from './SpatialIndex';
import { renderPdfPageToCanvas, getPageCount, tintCanvas } from './pdfRenderer';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import type { Point, TakeoffChecklistItem } from '@/types/takeoff';

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
  private comparisonBitmap: HTMLCanvasElement | null = null;
  private pdfLoadToken = 0;
  private comparisonLoadToken = 0;

  private highlightId: string | null = null;
  private highlightExpiresAt = 0;

  private unsubscribers: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Initialize custom camera controllers
    this.viewport = new Viewport();
    this.inputHandler = new InputHandler(this.canvas, this.viewport);

    this.subscribeToStores();
    this.init();
  }

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
          void this.loadBlueprintBitmap();
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

  public setAlignClickListener(listener: ((point: Point) => void) | null) {
    this.inputHandler.alignClickListener = listener;
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
    this.ctx.fillStyle = '#0f172a';
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

    // 4. DRAW USER DRAFT GEOMETRY (PRE-SAVE)
    const store = useTakeoffStore.getState();
    const draft = store.draftPoints;
    const activeTool = store.activeTool;

    if (draft.length > 0) {
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = '#60a5fa'; // Bright Blue-400

      // A. Draw lines between confirmed draft nodes
      this.ctx.beginPath();
      this.ctx.moveTo(draft[0].x, draft[0].y);
      for (let i = 1; i < draft.length; i++) {
        this.ctx.lineTo(draft[i].x, draft[i].y);
      }
      this.ctx.stroke();

      // B. Draw "Rubber-Band Line" connecting last node to active cursor
      const currentMouse = this.inputHandler.currentWorldMousePos;
      this.ctx.beginPath();
      this.ctx.setLineDash([6, 4]); // Set dashed pattern
      this.ctx.moveTo(draft[draft.length - 1].x, draft[draft.length - 1].y);
      this.ctx.lineTo(currentMouse.x, currentMouse.y);
      
      // If tracing a closed area polygon, draw a connecting band back to starting node [0]
      if (activeTool === 'area' && draft.length >= 2) {
        this.ctx.lineTo(draft[0].x, draft[0].y);
      }
      this.ctx.stroke();
      this.ctx.setLineDash([]); // Reset dashed state back to solid lines

      // C. Draw little handles on each vertex
      this.ctx.fillStyle = '#2563eb'; // Blue-600
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.5;
      for (const p of draft) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      }
    }

    // 5. DRAW COMPLETED / SAVED TAKEOFFS
    const savedTakeoffs = store.takeoffs;
    const selectedId = store.selectedTakeoffId;

    for (const item of savedTakeoffs) {
      if (item.points.length < 2) continue;

      const isSelected = item.id === selectedId;

      if (item.category === 'Slab') {
        // --- DRAW CLOSED SLAB POLYGON ---
        this.ctx.beginPath();
        this.ctx.moveTo(item.points[0].x, item.points[0].y);
        for (let i = 1; i < item.points.length; i++) {
          this.ctx.lineTo(item.points[i].x, item.points[i].y);
        }
        this.ctx.closePath();

        // Stylized Translucent Fill
        this.ctx.fillStyle = isSelected 
          ? 'rgba(59, 130, 246, 0.35)' // Stronger blue highlight
          : 'rgba(59, 130, 246, 0.15)'; // Default faint blue
        this.ctx.fill();

        // Borders
        this.ctx.lineWidth = isSelected ? 3 : 2;
        this.ctx.strokeStyle = isSelected ? '#ffffff' : '#3b82f6';
        this.ctx.stroke();

      } else if (item.category === 'Grade Beam') {
        // --- DRAW THICK LINEAR GRADE BEAM ---
        this.ctx.beginPath();
        this.ctx.moveTo(item.points[0].x, item.points[0].y);
        for (let i = 1; i < item.points.length; i++) {
          this.ctx.lineTo(item.points[i].x, item.points[i].y);
        }

        this.ctx.lineWidth = isSelected ? 6 : 4;
        this.ctx.strokeStyle = isSelected ? '#ffffff' : '#f59e0b'; // Amber-500
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
      }

      // Draw anchor point nodes for selected items to allow node editing in the future
      if (isSelected) {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#2563eb';
        this.ctx.lineWidth = 2;
        for (const p of item.points) {
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();
        }
      }
    }

    

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

    this.drawFinalizedTakeoffs();
    this.drawActiveDraft();
    this.drawHighlight();

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
    if (!this.ctx) return;
    const { x, y, width, height } = item.boundingBox;
    const color = item.category === 'Slab' ? '#10b981' : '#f59e0b';

    this.ctx.save();
    this.ctx.lineWidth = (isSelected ? 3 : 2) / this.viewport.zoom;
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = isSelected ? `${color}33` : `${color}1a`;
    this.ctx.strokeRect(x, y, width, height);
    this.ctx.fillRect(x, y, width, height);
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
    this.inputHandler.destroy();
    this.viewport.cancelAnimation();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
  }
}
