export type ToolName = 'select' | 'area' | 'linear' | 'align';

export interface AreaTakeoff {
  id: string;
  kind: 'area';
  pageNumber: number;
  vertices: Point[];
  areaSqFt: number;
  label?: string;
}

export interface LinearTakeoff {
  id: string;
  kind: 'linear';
  pageNumber: number;
  points: Point[];
  lengthFt: number;
  label?: string;
}

/**
 * A standard 2D coordinate pair representing pixel positions on the blueprint viewport.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * A bounding box defining the rectangular spatial boundaries of a takeoff drawing.
 * Used for centering the viewport and querying spatial indexes.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Standard concrete takeoff material classifications.
 */
export type TakeoffCategory = 'Slab' | 'Grade Beam' | 'Footing' | 'Reinforcement';

/**
 * Workflow validation flags for the estimator verification process.
 */
export type TakeoffStatus = 'pending' | 'verified' | 'modified' | 'pending_reverification';

/**
 * Physical dimensional attributes calculated from geometric drawing traces.
 */
export interface TakeoffDimensions {
  thicknessInches?: number;
  widthInches?: number;
  depthInches?: number;
  areaSqFt?: number;
  linearFt?: number;
}

/**
 * The master schema for a finalized material takeoff item.
 * Links spatial screen drawings directly to estimated real-world concrete values.
 */
export interface TakeoffChecklistItem {
  id: string;
  pageNumber: number;
  category: TakeoffCategory;
  label: string;            // e.g., "4" Concrete Slab-on-Grade"
  extractedText: string;    // Bounding text captured via vector PDF or OCR
  boundingBox: BoundingBox; // Coordinate mappings on the canvas
  points: Point[];
  status: TakeoffStatus;
  dimensions: TakeoffDimensions;
  calculatedVolumeCY?: number; // Calculated Cubic Yards
}

export type Takeoff = AreaTakeoff | LinearTakeoff;

/**
 * A clickable cross-reference callout detected in a sheet's vector text
 * (e.g. "1/S4.0" pointing at Detail 1 on Sheet S4.0), used to open a
 * split-screen preview of the referenced detail without leaving the page.
 */
export interface Hotspot {
  id: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  targetDetail: string; // e.g. "1"
  targetSheet: string;  // e.g. "S4.0"
}
