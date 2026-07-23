import { PDF_RENDER_SCALE } from '@/canvas/pdfRenderer';

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

// Standard architectural scale notations, as inches-of-drawing per foot of
// real-world distance — e.g. 3/32" = 1'-0" is 0.09375 in/ft. Covers the
// common engineering/architectural scale set; not exhaustive, but enough to
// recognize a real printed scale rather than only ever showing a raw
// px/ft number nobody can eyeball against a sheet's own "SCALE: ..." label.
const STANDARD_SCALES: { inchesPerFoot: number; label: string }[] = [
  { inchesPerFoot: 1 / 16, label: '1/16"' },
  { inchesPerFoot: 3 / 32, label: '3/32"' },
  { inchesPerFoot: 1 / 8, label: '1/8"' },
  { inchesPerFoot: 3 / 16, label: '3/16"' },
  { inchesPerFoot: 1 / 4, label: '1/4"' },
  { inchesPerFoot: 3 / 8, label: '3/8"' },
  { inchesPerFoot: 1 / 2, label: '1/2"' },
  { inchesPerFoot: 3 / 4, label: '3/4"' },
  { inchesPerFoot: 1, label: '1"' },
  { inchesPerFoot: 1.5, label: '1 1/2"' },
  { inchesPerFoot: 3, label: '3"' }
];

// Converts a pixelsPerFoot value (Calibrate, Auto-Scale, or the manual
// toolbar fallback — all live in the same PDF_RENDER_SCALE-space pixel
// units) back into the "N" = 1'-0"" notation printed on the sheet itself.
// Matches against STANDARD_SCALES within 1% first (covers the vast
// majority of real architectural/engineering drawings, including ones
// calibrated by hand against a dimension string rather than auto-detected
// from a "SCALE: ..." callout); falls back to the nearest 1/32" otherwise
// so an unusual/non-standard scale still gets a real inches value instead
// of silently showing nothing.
export function formatArchitecturalScale(pixelsPerFoot: number): string | null {
  if (!Number.isFinite(pixelsPerFoot) || pixelsPerFoot <= 0) return null;
  const inchesPerFoot = pixelsPerFoot / (PDF_RENDER_SCALE * 72);

  for (const std of STANDARD_SCALES) {
    if (Math.abs(inchesPerFoot - std.inchesPerFoot) / std.inchesPerFoot < 0.01) {
      return `${std.label} = 1'-0"`;
    }
  }

  const thirtySeconds = Math.round(inchesPerFoot * 32);
  if (thirtySeconds <= 0) return null;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(thirtySeconds, 32);
  return `${thirtySeconds / divisor}/${32 / divisor}" = 1'-0" (approx.)`;
}
