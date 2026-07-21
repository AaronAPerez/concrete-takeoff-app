export interface Point {
  x: number;
  y: number;
}

export interface AlignmentMatrix {
  translateX: number;
  translateY: number;
  scale: number;
  rotationDeg: number;
}

// Solves for the similarity transform (translate/rotate/scale) that maps
// points on the COMPARISON sheet (Rev B, as clicked while it's still
// rendered unaligned/identity) onto the matching points on the BASE sheet
// (Rev A) — i.e. T(b1)=a1, T(b2)=a2. That direction matters: the result
// gets fed straight into Engine.ts's drawComparisonOverlay, which applies
// it to the comparison BITMAP's own native pixel coordinates
// (ctx.translate/rotate/scale then drawImage(bitmap, 0, 0)), so it has to
// carry comparison-space points into base-world-space, not the reverse.
//
// [Fixed] This used to solve the opposite direction — T(a1)=b1, T(a2)=b2 —
// which produces a transform that, applied to the comparison bitmap, moves
// it *away* from alignment rather than onto the base sheet (verified with a
// numeric round-trip test: for a case with a real rotation+offset between
// the two clicked segments, the old formula mapped the comparison points to
// positions nowhere near the base points; solving with the roles of A and B
// swapped in the denominator/coefficients maps them exactly onto the base
// points, both in that case and in a general scale+rotate+translate case).
// Never exercised before — AlignmentWizard shares the same click-capture
// channel Calibration does, and Calibration was completely non-functional
// (see CLAUDE.md) until earlier this session, so this math had no way to
// ever run against a real click until that was fixed.
export function calculateAlignment(
  pointsA: [Point, Point], // Base Sheet (Rev A) — the fixed reference
  pointsB: [Point, Point]  // Comparison Sheet (Rev B) — the one being moved
): AlignmentMatrix {
  const [a1, a2] = pointsA;
  const [b1, b2] = pointsB;

  // Calculate delta vectors
  const dXa = a2.x - a1.x;
  const dYa = a2.y - a1.y;
  const dXb = b2.x - b1.x;
  const dYb = b2.y - b1.y;

  // Denominator is Sheet B's own segment length squared — we're solving
  // for "what rotation+scale turns B's segment into A's segment," so the
  // division normalizes by B's vector, not A's.
  const denominator = dXb * dXb + dYb * dYb;

  if (denominator === 0) {
    throw new Error("Points on Sheet B cannot be identical.");
  }

  // Solve for transformation coefficients (a and b): complex z = dA / dB,
  // i.e. z * dB = dA (this segment-on-B rotates/scales onto that segment-on-A).
  const a = (dXa * dXb + dYa * dYb) / denominator;
  const b = (dYa * dXb - dXa * dYb) / denominator;

  // Calculate translation: t = a1 - z*b1, so that T(b1) = z*b1 + t = a1.
  const translateX = a1.x - (a * b1.x - b * b1.y);
  const translateY = a1.y - (b * b1.x + a * b1.y);

  // Extract scale and rotation from coefficients
  const scale = Math.sqrt(a * a + b * b);
  const rotationRad = Math.atan2(b, a);
  const rotationDeg = rotationRad * (180 / Math.PI);

  return {
    translateX,
    translateY,
    scale,
    rotationDeg
  };
}