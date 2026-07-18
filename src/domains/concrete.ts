import type { EstimatingDomain } from '@/types/estimatingDomain';

// Moved verbatim from src/canvas/pdfRenderer.ts
const CONCRETE_KEYWORDS =
  /(slab on grade|slab|grade beam|grade bm|footing|foundation|thick|\d+"\s*concrete|p\.?s\.?i\.?|anchor bolts?|curb|cement|concrete|floor drains?|gutter|gravel|rebar|paving|sidewalks?|slope|stirrups?)/i;

// Moved verbatim from src/canvas/pdfRenderer.ts
function guessCategory(text: string): string {
  if (/(grade beam|grade bm)/i.test(text)) return 'Grade Beam';
  if (/footing/i.test(text)) return 'Footing';
  if (/(rebar|reinforc|#\d\s*bar|stirrups?)/i.test(text)) return 'Reinforcement';
  // Slab is the fallback for everything else (curb, gutter, sidewalk, gravel,
  // paving, etc.) — the 4-category model doesn't have a closer fit for those yet.
  return 'Slab';
}

export const concreteDomain: EstimatingDomain = {
  id: 'concrete',

  // Field lists match exactly what ChecklistItem.tsx rendered before this
  // refactor. Footing and Reinforcement had no input fields in the old code
  // either — that's a pre-existing gap, not something introduced here.
  categories: [
    {
      id: 'Slab',
      dimensionFields: [
        { key: 'thicknessInches', label: 'Thick', unit: 'Inches' },
        { key: 'areaSqFt', label: 'Area', unit: 'SF' }
      ]
    },
    {
      id: 'Grade Beam',
      dimensionFields: [
        { key: 'widthInches', label: 'Width', unit: 'Inches' },
        { key: 'depthInches', label: 'Depth', unit: 'Inches' },
        { key: 'linearFt', label: 'Linear', unit: 'FT' }
      ]
    },
    { id: 'Footing', dimensionFields: [] },
    { id: 'Reinforcement', dimensionFields: [] }
  ],

  // Moved verbatim from InputHandler.ts's handleDoubleClick call site.
  getDefaultsForTool: (tool) =>
    tool === 'area'
      ? { category: 'Slab', label: '4" SOG Concrete Slab' }
      : { category: 'Grade Beam', label: 'Continuous Wall Footing' },

  // Moved verbatim from useTakeoffStore's saveCurrentDraft + updateItemDimensions
  // (those two had the same formula duplicated — this is the single source now).
  calculateQuantity: (item) => {
    const { category, dimensions } = item;

    if (category === 'Slab' && dimensions.areaSqFt && dimensions.thicknessInches) {
      const value = (dimensions.areaSqFt * (dimensions.thicknessInches / 12)) / 27;
      return { value: Math.round(value * 100) / 100, unit: 'CY' };
    }

    if (
      category === 'Grade Beam' &&
      dimensions.linearFt &&
      dimensions.widthInches &&
      dimensions.depthInches
    ) {
      const value =
        (dimensions.linearFt * (dimensions.widthInches / 12) * (dimensions.depthInches / 12)) / 27;
      return { value: Math.round(value * 100) / 100, unit: 'CY' };
    }

    return { value: 0, unit: 'CY' };
  },

  extractionKeywords: CONCRETE_KEYWORDS,
  guessCategory
};