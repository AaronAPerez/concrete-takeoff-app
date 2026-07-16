import { Viewport } from './Viewport';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import { Point } from '@/types/takeoff';

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private viewport: Viewport;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  
  // Track current mouse position in world space for real-time drafting feedback
  public currentWorldMousePos: Point = { x: 0, y: 0 };

  // Registered by the revision-alignment wizard while activeTool === 'align';
  // receives each clicked world point in sequence.
  public alignClickListener: ((point: Point) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, viewport: Viewport) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.initEvents();
  }

  private initEvents() {
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    
    // Intercept double-click to finalize the active drawing
    this.canvas.addEventListener('dblclick', this.handleDoubleClick);
  }

  private getMouseCoordinates(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  private handleMouseDown = (e: MouseEvent) => {
    const activeTool = useTakeoffStore.getState().activeTool;
    const isPanAction = e.button === 1 || (e.button === 0 && e.shiftKey) || activeTool === 'pan';

    if (isPanAction) {
      // 1. Handled by Camera Pan Action
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
      e.preventDefault();
    } else if (e.button === 0 && (activeTool === 'area' || activeTool === 'linear')) {
      // 2. Handled by Takeoff Drawing Tool
      const screenPos = this.getMouseCoordinates(e);
      const worldPos = this.viewport.screenToWorld(screenPos.x, screenPos.y);

      // Save coordinate point to state slice
      useTakeoffStore.getState().addDraftPoint(worldPos);
    } else if (e.button === 0 && activeTool === 'align') {
      // 3. Handled by the revision-alignment wizard's point-capture sequence
      const screenPos = this.getMouseCoordinates(e);
      const worldPos = this.viewport.screenToWorld(screenPos.x, screenPos.y);
      this.alignClickListener?.(worldPos);
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    const screenPos = this.getMouseCoordinates(e);
    
    // Continuously map raw mouse movement to world space (for drawing loops)
    this.currentWorldMousePos = this.viewport.screenToWorld(screenPos.x, screenPos.y);

    if (!this.isDragging) return;

    // Pan camera viewport relative to mouse drag
    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    this.viewport.pan(dx, dy);

    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  };

  private handleMouseUp = () => {
    if (this.isDragging) {
      this.isDragging = false;
      const activeTool = useTakeoffStore.getState().activeTool;
      this.canvas.style.cursor = activeTool === 'pan' ? 'grab' : 'crosshair';
    }
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const screenPos = this.getMouseCoordinates(e);
    const zoomIntensity = 0.1;
    const zoomFactor = e.deltaY < 0 ? (1 + zoomIntensity) : (1 - zoomIntensity);

    this.viewport.zoomToPoint(zoomFactor, screenPos.x, screenPos.y);
  };

  private handleDoubleClick = (e: MouseEvent) => {
    if (e.button !== 0) return;
    
    const store = useTakeoffStore.getState();
    if (store.draftPoints.length < 2) return;

    // Finalize drawing: Save draft coordinates as a permanent takeoff item
    // For this boilerplate step, we default to page 1, Category Slab, and a generic label.
    store.saveCurrentDraft(
      'project-1',
      1,
      store.activeTool === 'area' ? 'Slab' : 'Grade Beam',
      store.activeTool === 'area' ? '4" SOG Concrete Slab' : 'Continuous Wall Footing'
    );
  };

  public destroy() {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
  }
}