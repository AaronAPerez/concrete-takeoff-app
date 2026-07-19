import type { EstimatingDomain } from '@/types/estimatingDomain';
import { calculateRoomWallPanels, calculateCeilingPanelQuantity } from '@/utils/panelCalculator';
import { DEFAULT_PANEL_WIDTH_FT } from '@/utils/panelSizes';

const IMP_KEYWORDS =
  /(insulated metal panel|imp panel|foam[- ]core|liner panel|wall panel|ceiling panel|roof panel|\d+"\s*(?:thick\s*)?panel|22\s*ga|24\s*ga|26\s*ga|gauge|r-?value|flashing|trim)/i;

function guessCategory(text: string): string {
  if (/ceiling panel/i.test(text)) return 'Ceiling Panel';
  if (/roof panel/i.test(text)) return 'Roof Panel';
  if (/liner panel/i.test(text)) return 'Liner Panel';
  if (/(flashing|trim)/i.test(text)) return 'Trim/Flashing';
  return 'Wall Panel';
}

// [Certain] Sourced from lib/imp/panelSizes.ts / impPanelCalculator.ts —
// 5% is the real default wasteFactor for panel counts in that codebase.
const DEFAULT_WASTE_FACTOR_PERCENT = 5;

// add displayName:
export const impDomain: EstimatingDomain = {
  id: 'imp',
  displayName: 'IMP',

 categories: [
    {
      id: 'Wall Panel',
      // Traced polygon is the ROOM outline (plan view). perimeterFt is
      // pre-computed by the store from that polygon (see useTakeoffStore's
      // saveCurrentDraft) — wall height can't be read off a plan view, so
      // it's the one field the estimator has to enter by hand.
      swapGroup: 'imp-room-polygon',
      dimensionFields: [
        { key: 'wallHeightFt', label: 'Wall Height', unit: 'FT' },
        { key: 'thicknessInches', label: 'Panel Thick', unit: 'Inches' },
        { key: 'wasteFactorPercent', label: 'Waste', unit: '%' }
      ]
    },
    {
      id: 'Ceiling Panel',
      // Same room polygon — floor area IS the ceiling area, no extra input needed.
      swapGroup: 'imp-room-polygon',
      dimensionFields: [
        { key: 'areaSqFt', label: 'Room Area', unit: 'SF' },
        { key: 'thicknessInches', label: 'Panel Thick', unit: 'Inches' },
        { key: 'wasteFactorPercent', label: 'Waste', unit: '%' }
      ]
    },
    {
      id: 'Roof Panel',
      dimensionFields: [
        { key: 'areaSqFt', label: 'Area', unit: 'SF' },
        { key: 'thicknessInches', label: 'Panel Thick', unit: 'Inches' },
        { key: 'wasteFactorPercent', label: 'Waste', unit: '%' }
      ]
    },
    {
      id: 'Liner Panel',
      dimensionFields: [
        { key: 'areaSqFt', label: 'Area', unit: 'SF' },
        { key: 'thicknessInches', label: 'Panel Thick', unit: 'Inches' },
        { key: 'wasteFactorPercent', label: 'Waste', unit: '%' }
      ]
    },
    {
      id: 'Trim/Flashing',
      dimensionFields: [
        { key: 'linearFt', label: 'Linear', unit: 'FT' },
        { key: 'wasteFactorPercent', label: 'Waste', unit: '%' }
      ]
    }
  ],

  getDefaultsForTool: (tool) =>
    tool === 'area'
      ? { category: 'Wall Panel', label: '4" Insulated Metal Wall Panel' }
      : { category: 'Trim/Flashing', label: 'Panel Trim/Flashing' },


 // Deliberately a pure function of `dimensions` only — no geometry/store
  // imports. Reaching into utils/geometry.ts from this file creates a real
  // import cycle through registry.ts (registry -> imp -> geometry ->
  // useTakeoffStore -> registry), which throws "Cannot access before
  // initialization" because registry.ts builds DOMAIN_REGISTRY eagerly at
  // module load. Geometry is pre-resolved upstream in
  // useTakeoffStore.saveCurrentDraft, same place areaSqFt is resolved.
  calculateQuantity: (item) => {
    const { category, dimensions } = item;
    const wasteFraction = (dimensions.wasteFactorPercent ?? DEFAULT_WASTE_FACTOR_PERCENT) / 100;

    if (category === 'Trim/Flashing') {
      if (!dimensions.linearFt) return { value: 0, unit: 'LF' };
      return { value: Math.round(dimensions.linearFt * (1 + wasteFraction) * 100) / 100, unit: 'LF' };
    }

    if (category === 'Wall Panel') {
      if (!dimensions.perimeterFt) return { value: 0, unit: 'EA' };

      if (!dimensions.wallHeightFt) {
        // No wall height yet — don't fabricate a panel count.
        return { value: 0, unit: 'EA (enter Wall Height)' };
      }

      const result = calculateRoomWallPanels(
        dimensions.perimeterFt,
        dimensions.wallHeightFt,
        DEFAULT_PANEL_WIDTH_FT,
        wasteFraction
      );
      return { value: result.totalPanels, unit: 'EA' };
    }

    if (category === 'Ceiling Panel') {
      if (!dimensions.roomWidthFt || !dimensions.roomLengthFt) return { value: 0, unit: 'EA' };

      const result = calculateCeilingPanelQuantity(
        dimensions.roomWidthFt,
        dimensions.roomLengthFt,
        DEFAULT_PANEL_WIDTH_FT,
        0,
        wasteFraction
      );
      return { value: result.totalPanels, unit: 'EA' };
    }

    // Roof Panel / Liner Panel — unchanged, area-based.
    if (!dimensions.areaSqFt) return { value: 0, unit: 'SF' };
    return { value: Math.round(dimensions.areaSqFt * (1 + wasteFraction) * 100) / 100, unit: 'SF' };
  },

  extractionKeywords: IMP_KEYWORDS,
  guessCategory
};