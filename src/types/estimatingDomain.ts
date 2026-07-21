import type { TakeoffChecklistItem, TakeoffDimensions } from './takeoff';

/**
 * One input field rendered in the checklist sidebar for a given category
 * (e.g. Slab needs Thickness + Area; Grade Beam needs Width + Depth + Linear).
 * Replaces the old hardcoded `item.category === 'Slab' && (...)` blocks
 * in ChecklistItem.tsx with data instead of conditional JSX.
 */
export interface DimensionFieldConfig {
  key: keyof TakeoffDimensions;
  label: string; // e.g. 'Thick'
  unit: string;  // e.g. 'Inches' — rendered as "Thick (Inches)"; pass '' to omit the suffix (e.g. for select fields)
  // 'number' (default, omit) renders <input type="number"> and stores a
  // parsed float. 'select' renders a <select> populated from `options` and
  // stores the raw string value — used for roomType (see domains/imp.ts).
  type?: 'number' | 'select';
  options?: { value: string; label: string }[];
}

export interface CategoryConfig {
  id: string;
  dimensionFields: DimensionFieldConfig[];
  // Optional grouping key. The category-switcher dropdown (ChecklistItem)
  // only offers other categories sharing the same swapGroup as swap
  // targets — for categories whose dimension fields are derived from the
  // same traced geometry (e.g. IMP Wall Panel <-> Ceiling Panel both come
  // from one room polygon: perimeterFt+wallHeightFt vs
  // roomWidthFt+roomLengthFt). Categories with no swapGroup (or a group no
  // sibling shares) aren't offered as swap targets — switching e.g. Wall
  // Panel -> Trim/Flashing would show quantity 0 until an unrelated
  // linearFt field gets filled in, which is correct but confusing to offer
  // as a one-click option.
  swapGroup?: string;
}

/**
 * A material discipline (concrete, IMP, future ones). Owns everything that
 * differs between disciplines. The canvas/PDF/calibration layer stays
 * domain-agnostic and calls into whichever domain is active for the project.
 */
export interface EstimatingDomain {
  id: string;
  displayName: string; // human-readable label for UI — 'Concrete', 'IMP'
  categories: CategoryConfig[];
  getDefaultsForTool: (tool: 'area' | 'linear') => { category: string; label: string };
  calculateQuantity: (item: TakeoffChecklistItem) => { value: number; unit: string };
  extractionKeywords: RegExp;
  guessCategory: (text: string) => string;

  // Optional — domains with real per-assembly $ data can implement this
  // (see domains/imp.ts). Domains without pricing data simply omit it.
  // Returns undefined when there's no priced assembly for the item's
  // room type / thickness combination — callers must treat that as "no
  // pricing available", never fabricate a $0 or estimated cost.
  calculateCost?: (item: TakeoffChecklistItem) => CostBreakdown | undefined;
}

export interface CostBreakdown {
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
  costPerSf: number;
}