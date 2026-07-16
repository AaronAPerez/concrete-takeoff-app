// Pixels-per-foot at the blueprint's native rendered resolution.
export const DEFAULT_SCALE_FACTOR = 20;

export function pixelsToFeet(px: number, scaleFactor: number): number {
  return px / scaleFactor;
}

export function feetToPixels(ft: number, scaleFactor: number): number {
  return ft * scaleFactor;
}

export function scaleFactorFromCalibration(pixelDistance: number, knownFeet: number): number {
  if (knownFeet <= 0) throw new Error('Known distance must be greater than zero.');
  return pixelDistance / knownFeet;
}
