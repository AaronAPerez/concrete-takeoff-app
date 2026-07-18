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
  unit: string;  // e.g. 'Inches' — rendered as "Thick (Inches)"
}

export interface CategoryConfig {
  id: string;
  dimensionFields: DimensionFieldConfig[];
}

/**
 * A material discipline (concrete, IMP, future ones). Owns everything that
 * differs between disciplines. The canvas/PDF/calibration layer stays
 * domain-agnostic and calls into whichever domain is active for the project.
 */
export interface EstimatingDomain {
  id: string;
  categories: CategoryConfig[];

  // Replaces the hardcoded 'Slab' / 'Grade Beam' + label strings in
  // InputHandler.ts's double-click handler.
  getDefaultsForTool: (tool: 'area' | 'linear') => { category: string; label: string };

  // Replaces the inline if/else volume formula duplicated in
  // useTakeoffStore's saveCurrentDraft and updateItemDimensions.
  calculateQuantity: (item: TakeoffChecklistItem) => { value: number; unit: string };

  // Replaces CONCRETE_KEYWORDS in pdfRenderer.ts.
  extractionKeywords: RegExp;

  // Replaces guessCategory() in pdfRenderer.ts.
  guessCategory: (text: string) => string;
}