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

export function calculateAlignment(
  pointsA: [Point, Point], // Base Sheet (Rev A)
  pointsB: [Point, Point]  // Aligning Sheet (Rev B)
): AlignmentMatrix {
  const [a1, a2] = pointsA;
  const [b1, b2] = pointsB;

  // Calculate delta vectors
  const dXa = a2.x - a1.x;
  const dYa = a2.y - a1.y;
  const dXb = b2.x - b1.x;
  const dYb = b2.y - b1.y;

  const denominator = dXa * dXa + dYa * dYa;
  
  if (denominator === 0) {
    throw new Error("Points on Sheet A cannot be identical.");
  }

  // Solve for transformation coefficients (a and b)
  const a = (dXb * dXa + dYb * dYa) / denominator;
  const b = (dYb * dXa - dXb * dYa) / denominator;

  // Calculate translation vectors
  const translateX = b1.x - (a * a1.x - b * a1.y);
  const translateY = b1.y - (b * a1.x + a * a1.y);

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