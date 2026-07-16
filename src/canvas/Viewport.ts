export class Viewport {
  public zoom = 1.0;
  public offsetX = 0;
  public offsetY = 0;

  private minZoom = 0.1;
  private maxZoom = 10.0;

  private animationFrameId: number | null = null;

  constructor() {}

  public cancelAnimation() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // Smoothly pans/zooms so that the given world point ends up centered in the
  // viewport (used to jump the camera to a selected checklist item's bounding box).
  public panAndZoomTo(
    worldX: number,
    worldY: number,
    viewportSize: { width: number; height: number },
    options: { zoom?: number; duration?: number } = {}
  ) {
    this.cancelAnimation();

    const targetZoom = Math.min(this.maxZoom, Math.max(this.minZoom, options.zoom ?? this.zoom));
    const duration = options.duration ?? 400;

    const startZoom = this.zoom;
    const startOffsetX = this.offsetX;
    const startOffsetY = this.offsetY;

    const targetOffsetX = viewportSize.width / 2 - worldX * targetZoom;
    const targetOffsetY = viewportSize.height / 2 - worldY * targetZoom;

    if (duration <= 0) {
      this.zoom = targetZoom;
      this.offsetX = targetOffsetX;
      this.offsetY = targetOffsetY;
      return;
    }

    const startTime = performance.now();
    const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = easeInOutCubic(t);

      this.zoom = startZoom + (targetZoom - startZoom) * eased;
      this.offsetX = startOffsetX + (targetOffsetX - startOffsetX) * eased;
      this.offsetY = startOffsetY + (targetOffsetY - startOffsetY) * eased;

      this.animationFrameId = t < 1 ? requestAnimationFrame(step) : null;
    };

    this.animationFrameId = requestAnimationFrame(step);
  }

  // Apply the current camera matrix directly to the 2D canvas context
  public applyTransform(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(this.zoom, 0, 0, this.zoom, this.offsetX, this.offsetY);
  }

  // Reset the transform matrix back to identity (useful for rendering UI overlays)
  public resetTransform(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Convert a physical screen pixel coordinate to infinite "world" coordinates
  public screenToWorld(screenX: number, screenY: number) {
    return {
      x: (screenX - this.offsetX) / this.zoom,
      y: (screenY - this.offsetY) / this.zoom,
    };
  }

  public pan(dx: number, dy: number) {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  // Zoom into a specific screen point (so the cursor acts as the focal pivot)
  public zoomToPoint(zoomFactor: number, screenX: number, screenY: number) {
    const newZoom = Math.min(
      this.maxZoom,
      Math.max(this.minZoom, this.zoom * zoomFactor)
    );

    // Calculate the target world coordinate before zooming
    const worldPoint = this.screenToWorld(screenX, screenY);

    this.zoom = newZoom;

    // Adjust offsets so the world point remains pinned under the cursor
    this.offsetX = screenX - worldPoint.x * this.zoom;
    this.offsetY = screenY - worldPoint.y * this.zoom;
  }
}