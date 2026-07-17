import type { Point } from '@/types/takeoff';

// Clockwise 8-neighbor offsets, starting "west".
const NEIGHBORS: Array<[number, number]> = [
  [-1, 0], [-1, -1], [0, -1], [1, -1],
  [1, 0], [1, 1], [0, 1], [-1, 1]
];

// Moore-neighbor boundary tracing: walks the outer edge of the first
// connected foreground region found (top-to-bottom, left-to-right scan for
// the start pixel) and returns it as an ordered polygon. Verified against
// synthetic rectangle/concave/diagonal-pinch/circle masks before use here —
// see the scratch test harness this was developed against.
//
// Used to convert an AI-segmented binary mask (see useSegmentationEngine)
// into a Point[] polygon suitable for saveCurrentDraft.
export function traceMaskContour(
  mask: Uint8Array | boolean[],
  width: number,
  height: number,
  maxPoints: number = 60
): Point[] | null {
  const at = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return !!mask[y * width + x];
  };

  let start: Point | null = null;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (at(x, y)) {
        start = { x, y };
        break outer;
      }
    }
  }
  if (!start) return null;

  const boundary: Point[] = [start];
  let current = start;
  let backtrackDir = 0; // "west" of start — guaranteed background since start is topmost-leftmost

  const MAX_STEPS = width * height * 4; // hard safety cap against pathological/noisy masks

  for (let step = 0; step < MAX_STEPS; step++) {
    let found = false;
    for (let i = 0; i < 8; i++) {
      const dirIndex = (backtrackDir + 1 + i) % 8;
      const [dx, dy] = NEIGHBORS[dirIndex];
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (at(nx, ny)) {
        current = { x: nx, y: ny };
        backtrackDir = (dirIndex + 6) % 8;
        found = true;
        break;
      }
    }
    if (!found) break; // isolated single pixel — nothing more to trace
    if (current.x === start.x && current.y === start.y) break; // back to start — loop closed
    boundary.push(current);
  }

  if (boundary.length < 3) return null;
  if (boundary.length <= maxPoints) return boundary;

  // Decimate to a manageable vertex count — a raw pixel-boundary trace can
  // easily have hundreds of points, which is both wasteful and jagged for a
  // hand-editable takeoff polygon.
  const stride = boundary.length / maxPoints;
  const decimated: Point[] = [];
  for (let i = 0; i < maxPoints; i++) {
    decimated.push(boundary[Math.floor(i * stride)]);
  }
  return decimated;
}
