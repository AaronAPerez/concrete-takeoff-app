import { Point, BoundingBox } from '@/types/takeoff';
import { useTakeoffStore, PageScaleConfig } from '@/stores/useTakeoffStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';

// Helper to get active scale configuration. Pass an explicit pageNumber when
// saving/recalculating a specific item; defaults to whichever page is on
// screen right now (useBlueprintStore is the live page tracker — see
// PageNavigator/ThumbnailStrip/InputHandler, which all read from it too).
export function getActivePageScale(pageNumber?: number): PageScaleConfig {
  const { pageScales } = useTakeoffStore.getState();
  const page = pageNumber ?? useBlueprintStore.getState().currentPage;

  const calibrated = pageScales[page];
  if (calibrated) return calibrated;

  // Not calibrated yet — fall back to the toolbar's manual global scale factor.
  const { scaleFactor } = useBlueprintStore.getState();
  return {
    pixelsPerFoot: scaleFactor,
    unit: 'ft',
    isCalibrated: false,
    rawViewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
    rawViewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0
  };
}

// Convert pixels to square footage using Page Scale
export function calculateArea(points: { x: number, y: number }[]): number {
  const scale = getActivePageScale();
  
  // Standard Shoelace algorithm to find raw pixel area
  let areaInPixels = 0;
  const j = points.length - 1;
  
  for (let i = 0; i < points.length; i++) {
    const prev = points[i === 0 ? j : i - 1];
    const curr = points[i];
    areaInPixels += (prev.x + curr.x) * (prev.y - curr.y);
  }
  areaInPixels = Math.abs(areaInPixels / 2);

  // Crucial conversion: Divide pixel area by (pixelsPerFoot squared)
  const conversionFactor = Math.pow(scale.pixelsPerFoot, 2);
  return areaInPixels / conversionFactor;
}

/**
 * Calculates the Euclidean distance between two 2D points in pixels.
 */
export function calculateDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

// Screen-space proximity radius shared by every "close enough to grab/close"
// interaction: dragging a saved item's vertex (InputHandler's vertexDrag)
// and closing an in-progress area trace by clicking back on its first point
// (InputHandler's handleMouseDown + Engine's drawActiveDraft highlight).
// One constant so the visual highlight radius and the actual click-hit
// radius can't drift apart. Divide by viewport.zoom at the call site to get
// a world-space threshold, same convention as every other zoom-aware
// hit-test/handle-size in this app.
export const CLOSE_PROXIMITY_PX = 10;

/**
 * Returns the index of the first vertex within `thresholdPx` of `target`, or
 * -1 if none qualify. `thresholdPx` is in the same coordinate space as
 * `points`/`target` — pass a world-space radius (screen px / viewport.zoom)
 * when hit-testing against world-space vertices, same convention every other
 * zoom-aware hit-test in this app already follows (see Engine.ts's line
 * widths/handle radii, all divided by viewport.zoom).
 */
export function findVertexNear(points: Point[], target: Point, thresholdPx: number): number {
  for (let i = 0; i < points.length; i++) {
    if (calculateDistance(points[i], target) <= thresholdPx) return i;
  }
  return -1;
}

/**
 * Calculates the real-world linear length of a multi-segment line (polyline) in feet.
 */
export function calculateRealWorldLength(
  vertices: Point[],
  scaleFactor: number // pixels per foot
): number {
  if (vertices.length < 2 || scaleFactor <= 0) return 0;

  let totalPixelDistance = 0;
  for (let i = 0; i < vertices.length - 1; i++) {
    totalPixelDistance += calculateDistance(vertices[i], vertices[i + 1]);
  }

  return totalPixelDistance / scaleFactor;
}

/**
 * Calculates the real-world perimeter of a closed polygon in linear feet.
 * Ported from estimator-app's calculatePolygonPerimeter — same wraparound
 * convention as calculateRealWorldArea (last vertex connects back to first).
 */
export function calculateRealWorldPerimeter(
  vertices: Point[],
  scaleFactor: number // pixels per foot
): number {
  const n = vertices.length;
  if (n < 2 || scaleFactor <= 0) return 0;

  let perimeterPixels = 0;
  for (let i = 0; i < n; i++) {
    const next = vertices[(i + 1) % n];
    perimeterPixels += calculateDistance(vertices[i], next);
  }

  return perimeterPixels / scaleFactor;
}

/**
 * Calculates the real-world surface area of a closed polygon in square feet 
 * using the Shoelace (Gauss's Area) formula.
 */
export function calculateRealWorldArea(
  vertices: Point[],
  scaleFactor: number // pixels per foot
): number {
  const n = vertices.length;
  if (n < 3 || scaleFactor <= 0) return 0;

  let areaPixels = 0;

  for (let i = 0; i < n; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % n]; // Wraps around to the first vertex
    areaPixels += (current.x * next.y) - (next.x * current.y);
  }

  areaPixels = Math.abs(areaPixels) / 2;

  // Convert square pixels to square feet (divide by scaleFactor squared)
  return areaPixels / Math.pow(scaleFactor, 2);
}

/**
 * Generates a tight bounding box around a set of coordinate points.
 * Useful for viewport framing, spatial indexing, and highlight boxes.
 */
export function calculateBoundingBox(vertices: Point[]): BoundingBox {
  if (vertices.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of vertices) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Resolves the geometry-derived slice of TakeoffDimensions (areaSqFt,
 * linearFt, perimeterFt, roomWidthFt, roomLengthFt) from a set of points —
 * the single source of truth for "points + scale -> dimensions", used by
 * both saveCurrentDraft (new trace) and updateItemVertex (dragging an
 * existing item's corner) in useTakeoffStore.ts. Previously duplicated
 * inline in saveCurrentDraft only, which meant vertex-editing would have
 * needed a second copy of the same formula.
 */
export function resolveGeometryDimensions(
  points: Point[],
  kind: 'area' | 'linear',
  scaleFactor: number
): {
  areaSqFt?: number;
  linearFt?: number;
  perimeterFt?: number;
  roomWidthFt?: number;
  roomLengthFt?: number;
} {
  if (kind === 'area') {
    const areaSqFt = calculateRealWorldArea(points, scaleFactor);
    const perimeterFt = calculateRealWorldPerimeter(points, scaleFactor);
    const boundingBox = calculateBoundingBox(points);
    return {
      areaSqFt: areaSqFt > 0 ? Math.round(areaSqFt * 100) / 100 : undefined,
      linearFt: undefined,
      perimeterFt: Math.round(perimeterFt * 100) / 100,
      roomWidthFt: Math.round((boundingBox.width / scaleFactor) * 100) / 100,
      roomLengthFt: Math.round((boundingBox.height / scaleFactor) * 100) / 100,
    };
  }

  const linearFt = calculateRealWorldLength(points, scaleFactor);
  return {
    areaSqFt: undefined,
    linearFt: linearFt > 0 ? Math.round(linearFt * 100) / 100 : undefined,
    perimeterFt: undefined,
    roomWidthFt: undefined,
    roomLengthFt: undefined,
  };
}

/**
 * Helper to determine if two line segments (A-B and C-D) intersect.
 * Critical for preventing structural self-intersection errors.
 */
function lineSegmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const det = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (det === 0) return false; // Parallel lines

  const u = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / det;
  const v = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / det;

  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

/**
 * Validates a polygon to ensure none of its perimeter lines cross over each other.
 * Estimators often make drawing errors that break the area math; this catches them.
 */
export function isPolygonSelfIntersecting(vertices: Point[]): boolean {
  const n = vertices.length;
  if (n < 4) return false; // Triangles can never self-intersect

  for (let i = 0; i < n; i++) {
    const a1 = vertices[i];
    const a2 = vertices[(i + 1) % n];

    for (let j = i + 2; j < n; j++) {
      // Avoid checking adjacent segments (they share a vertex and mathematically "touch")
      if ((j + 1) % n === i) continue;

      const b1 = vertices[j];
      const b2 = vertices[(j + 1) % n];

      if (lineSegmentsIntersect(a1, a2, b1, b2)) {
        return true; // Intersection found!
      }
    }
  }

  return false;
}

// import type { Point } from './alignment';

// export function distance(a: Point, b: Point): number {
//   return Math.hypot(b.x - a.x, b.y - a.y);
// }

// export function centroidOf(vertices: Point[]): Point {
//   const sum = vertices.reduce(
//     (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
//     { x: 0, y: 0 }
//   );
//   return { x: sum.x / vertices.length, y: sum.y / vertices.length };
// }

// // Shoelace formula
// export function polygonAreaPx(vertices: Point[]): number {
//   if (vertices.length < 3) return 0;

//   let area = 0;
//   for (let i = 0; i < vertices.length; i++) {
//     const current = vertices[i];
//     const next = vertices[(i + 1) % vertices.length];
//     area += current.x * next.y - next.x * current.y;
//   }
//   return Math.abs(area) / 2;
// }

// export function polygonAreaSqFt(vertices: Point[], scaleFactor: number): number {
//   return polygonAreaPx(vertices) / (scaleFactor * scaleFactor);
// }

// export function polylineLengthPx(points: Point[]): number {
//   let length = 0;
//   for (let i = 1; i < points.length; i++) {
//     length += distance(points[i - 1], points[i]);
//   }
//   return length;
// }

// export function polylineLengthFt(points: Point[], scaleFactor: number): number {
//   return polylineLengthPx(points) / scaleFactor;
// }

// export function pointInPolygon(point: Point, vertices: Point[]): boolean {
//   let inside = false;
//   for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
//     const vi = vertices[i];
//     const vj = vertices[j];
//     const intersect =
//       vi.y > point.y !== vj.y > point.y &&
//       point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x;
//     if (intersect) inside = !inside;
//   }
//   return inside;
// }

// export function distanceToSegment(point: Point, a: Point, b: Point): number {
//   const dx = b.x - a.x;
//   const dy = b.y - a.y;
//   const lengthSq = dx * dx + dy * dy;
//   if (lengthSq === 0) return distance(point, a);

//   const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
//   return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
// }
