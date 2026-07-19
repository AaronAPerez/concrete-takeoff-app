/**
 * Takeoff material classification. Was a closed union scoped to concrete
 * ('Slab' | 'Grade Beam' | 'Footing' | 'Reinforcement'); widened to string
 * now that categories are domain-config-driven (see types/estimatingDomain.ts)
 * rather than known at compile time.
 */
export type TakeoffCategory = string;

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
  wasteFactorPercent?: number;
  wallHeightFt?: number; // new — the one input a plan-view trace can't derive itself
  perimeterFt?: number;
  roomWidthFt?: number;
  roomLengthFt?: number;
}


export interface TakeoffChecklistItem {
  id: string;
  pageNumber: number;
  category: TakeoffCategory;
  domainId: string; // which EstimatingDomain this item belongs to — lets
                     // one project mix concrete + IMP items instead of
                     // assuming a project is single-domain
  label: string;
  extractedText: string;
  boundingBox: BoundingBox;
  points: Point[];
  status: TakeoffStatus;
  dimensions: TakeoffDimensions;
  calculatedQuantity?: { value: number; unit: string };
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
