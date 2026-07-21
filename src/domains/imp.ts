import type { CostBreakdown, EstimatingDomain } from '@/types/estimatingDomain';
import { calculateRoomWallPanels, calculateCeilingPanelQuantity } from '@/utils/panelCalculator';
import { DEFAULT_PANEL_WIDTH_FT } from '@/utils/panelSizes';
import { calculateImpWallCost, calculateImpCeilingCost } from '@/utils/impCostCalculator';
import { IMP_ASSEMBLIES, type IMPAssembly } from '@/data/impAssemblies';
import { getRoomTypeOptions } from '@/data/roomTypes';

const IMP_KEYWORDS =
  /(insulated metal panel|imp panel|foam[- ]core|liner panel|wall panel|ceiling panel|roof panel|\d+"\s*(?:thick\s*)?panel|22\s*ga|24\s*ga|26\s*ga|gauge|r-?value|flashing|trim)/i;

function guessCategory(text: string): string {
  if (/ceiling panel/i.test(text)) return 'Ceiling Panel';
  if (/roof panel/i.test(text)) return 'Roof Panel';
  if (/liner panel/i.test(text)) return 'Liner Panel';
  if (/(flashing|trim)/i.test(text)) return 'Trim/Flashing';
  return 'Wall Panel';
}

// [Certain] Sourced from estimator-app's lib/imp/panelSizes.ts /
// impPanelCalculator.ts — 5% is the real default wasteFactor for panel
// counts in that codebase.
const DEFAULT_WASTE_FACTOR_PERCENT = 5;

// [Certain] Ported from estimator-app's IMP_ASSEMBLIES — only 5 assemblies
// exist (freezer/cooler/ambient walls, freezer/cooler ceilings). There's no
// assembly for cold-dock, ante-room, or every thickness combination.
// findWallAssembly/findCeilingAssembly return undefined for anything not
// in that sparse set — calculateCost then returns undefined rather than
// guessing a price, so a missing assembly shows up as "no cost available"
// in the UI, not a wrong number.
function findWallAssembly(roomType: string | undefined, thicknessInches: number | undefined): IMPAssembly | undefined {
  if (!roomType || !thicknessInches) return undefined;
  return IMP_ASSEMBLIES.find(
    (a) => a.room_type === roomType && a.panel_thickness === thicknessInches && !a.wall_type.startsWith('ceiling')
  );
}

function findCeilingAssembly(roomType: string | undefined, thicknessInches: number | undefined): IMPAssembly | undefined {
  if (!roomType || !thicknessInches) return undefined;
  return IMP_ASSEMBLIES.find(
    (a) => a.room_type === roomType && a.panel_thickness === thicknessInches && a.wall_type.startsWith('ceiling')
  );
}

const ROOM_TYPE_FIELD = {
  key: 'roomType' as const,
  label: 'Room Type',
  unit: '',
  type: 'select' as const,
  options: getRoomTypeOptions(),
};

export const impDomain: EstimatingDomain = {
  id: 'imp',
  displayName: 'IMP',

  categories: [
    {
      id: 'Wall Panel',
      swapGroup: 'imp-room-polygon',
      dimensionFields: [
        { key: 'wallHeightFt', label: 'Wall Height', unit: 'FT' },
        { key: 'thicknessInches', label: 'Panel Thick', unit: 'Inches' },
        { key: 'wasteFactorPercent', label: 'Waste', unit: '%' },
        ROOM_TYPE_FIELD,
      ]
    },
    {
      id: 'Ceiling Panel',
      swapGroup: 'imp-room-polygon',
      dimensionFields: [
        { key: 'areaSqFt', label: 'Room Area', unit: 'SF' },
        { key: 'thicknessInches', label: 'Panel Thick', unit: 'Inches' },
        { key: 'wasteFactorPercent', label: 'Waste', unit: '%' },
        ROOM_TYPE_FIELD,
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

    if (!dimensions.areaSqFt) return { value: 0, unit: 'SF' };
    return { value: Math.round(dimensions.areaSqFt * (1 + wasteFraction) * 100) / 100, unit: 'SF' };
  },

  calculateCost: (item): CostBreakdown | undefined => {
    const { category, dimensions } = item;

    if (category === 'Wall Panel') {
      if (!dimensions.perimeterFt || !dimensions.wallHeightFt) return undefined;
      const assembly = findWallAssembly(dimensions.roomType, dimensions.thicknessInches);
      if (!assembly) return undefined;
      return calculateImpWallCost(dimensions.perimeterFt, dimensions.wallHeightFt, assembly);
    }

    if (category === 'Ceiling Panel') {
      if (!dimensions.roomWidthFt || !dimensions.roomLengthFt) return undefined;
      const assembly = findCeilingAssembly(dimensions.roomType, dimensions.thicknessInches);
      if (!assembly) return undefined;
      const areaSF = dimensions.roomWidthFt * dimensions.roomLengthFt;
      return calculateImpCeilingCost(areaSF, assembly);
    }

    return undefined;
  },

  extractionKeywords: IMP_KEYWORDS,
  guessCategory
};