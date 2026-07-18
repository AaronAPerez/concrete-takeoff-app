import type { EstimatingDomain } from '@/types/estimatingDomain';

const IMP_KEYWORDS =
  /(insulated metal panel|imp panel|foam[- ]core|liner panel|wall panel|roof panel|\d+"\s*(?:thick\s*)?panel|22\s*ga|24\s*ga|26\s*ga|gauge|r-?value|flashing|trim)/i;

function guessCategory(text: string): string {
  if (/roof panel/i.test(text)) return 'Roof Panel';
  if (/liner panel/i.test(text)) return 'Liner Panel';
  if (/(flashing|trim)/i.test(text)) return 'Trim/Flashing';
  // Wall Panel is the fallback — most IMP callouts on elevation/plan sheets
  // are wall panels unless explicitly labeled roof or liner.
  return 'Wall Panel';
}

// [Guessing] Placeholder — not confirmed against real job practice. Confirm
// the actual overage % your estimator uses before relying on this number.
const DEFAULT_WASTE_FACTOR_PERCENT = 10;

export const impDomain: EstimatingDomain = {
  id: 'imp',

  categories: [
    {
      id: 'Wall Panel',
      dimensionFields: [
        { key: 'areaSqFt', label: 'Area', unit: 'SF' },
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

  // IMP is priced by area (or linear ft for trim), not a geometric volume —
  // unlike concrete's CY formula, there's no thickness × width × depth
  // multiplication here. Waste factor accounts for seam overlap and cut
  // loss on top of the raw traced quantity.
  calculateQuantity: (item) => {
    const { category, dimensions } = item;
    const wasteMultiplier = 1 + (dimensions.wasteFactorPercent ?? DEFAULT_WASTE_FACTOR_PERCENT) / 100;

    if (category === 'Trim/Flashing') {
      if (!dimensions.linearFt) return { value: 0, unit: 'LF' };
      return { value: Math.round(dimensions.linearFt * wasteMultiplier * 100) / 100, unit: 'LF' };
    }

    // Wall Panel / Roof Panel / Liner Panel — all area-based.
    if (!dimensions.areaSqFt) return { value: 0, unit: 'SF' };
    return { value: Math.round(dimensions.areaSqFt * wasteMultiplier * 100) / 100, unit: 'SF' };
  },

  extractionKeywords: IMP_KEYWORDS,
  guessCategory
};