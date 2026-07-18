import { Viewport } from './Viewport';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { Point } from '@/types/takeoff';

export class InputHandler {
  private canvas: HTMLCanvasElement;
  private viewport: Viewport;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  
  // Track current mouse position in world space for real-time drafting feedback
  public currentWorldMousePos: Point = { x: 0, y: 0 };

  // Generic point-capture channel for any tool that needs the user to click
  // directly on the canvas (sheet alignment, scale calibration, and future
  // ones) without InputHandler needing to know about each tool by name.
  // Registered/cleared via useEngineClickCapture; receives world-space points
  // (post pan/zoom), one per click, while some non-drawing tool is active.
  public toolClickListener: ((point: Point) => void) | null = null;

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

    // Global (not canvas-scoped) since <canvas> isn't focusable by default —
    // guarded inside handleKeyDown so typing in a form field (Known Distance,
    // Scale px/ft, etc.) isn't hijacked into panning the camera.
    window.addEventListener('keydown', this.handleKeyDown);
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
    } else if (e.button === 0 && this.toolClickListener) {
      // 3. Handled by whichever tool currently owns the point-capture channel
      const screenPos = this.getMouseCoordinates(e);
      const worldPos = this.viewport.screenToWorld(screenPos.x, screenPos.y);
      this.toolClickListener(worldPos);
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

  private static readonly ARROW_PAN_STEP = 60; // screen px per key press, independent of zoom

  private handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return; // Let arrow keys behave normally inside form fields
    }

    const step = InputHandler.ARROW_PAN_STEP;
    switch (e.key) {
      case 'ArrowUp':
        this.viewport.pan(0, step);
        break;
      case 'ArrowDown':
        this.viewport.pan(0, -step);
        break;
      case 'ArrowLeft':
        this.viewport.pan(step, 0);
        break;
      case 'ArrowRight':
        this.viewport.pan(-step, 0);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  private handleDoubleClick = (e: MouseEvent) => {
    if (e.button !== 0) return;
    
    const store = useTakeoffStore.getState();
if (store.draftPoints.length < 2) return;

const toolType = store.activeTool === 'area' ? 'area' : 'linear';
const { category, label } = store.activeDomain.getDefaultsForTool(toolType);

store.saveCurrentDraft(
  'project-1',
  useBlueprintStore.getState().currentPage,
  toolType,
  category as any,
  label
);
  };

  public destroy() {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
    window.removeEventListener('keydown', this.handleKeyDown);
  }
}