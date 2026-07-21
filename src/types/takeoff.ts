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

  // Derived from the traced polygon at save time (see saveCurrentDraft) for
  // any 'area' item, regardless of domain. Kept dimensions-only/geometry-free
  // in imp.ts deliberately — EstimatingDomain.calculateQuantity must stay a
  // pure function of `dimensions`. Reaching into utils/geometry.ts from a
  // domain file creates a real import cycle: registry.ts -> imp.ts ->
  // geometry.ts -> useTakeoffStore.ts -> registry.ts, which throws
  // "Cannot access before initialization" because registry.ts builds
  // DOMAIN_REGISTRY eagerly at module load.
  perimeterFt?: number;   // IMP Wall Panel — drives panel count with wallHeightFt
  roomWidthFt?: number;   // IMP Ceiling Panel — polygon bounding-box width
  roomLengthFt?: number;  // IMP Ceiling Panel — polygon bounding-box height
  roomType?: string;      // IMP Wall/Ceiling Panel — freezer/cooler/cold-dock/ambient/ante-room; used to look up a priced IMPAssembly
  concreteMixPsi?: number; // Concrete Slab/Grade Beam — 3000/3500/etc; used to look up a priced ConcreteMixRate
  insulationThicknessInches?: number; // Concrete Freezer Slab — documentation only (7" typ.), not separately priced — see data/concreteAssemblies.ts
  sandBaseInches?: number;            // Concrete Freezer Slab — documentation only (2" typ.), NOT priced — no sand cost exists in source data
  underfloorWarmingSystem?: string;   // Concrete Freezer Slab — 'yes' | 'no'; only priced when explicitly 'yes', never assumed
  barSize?: string;                   // Concrete Reinforcement — documentation only (#3-#8), not separately priced — see domains/concrete.ts
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