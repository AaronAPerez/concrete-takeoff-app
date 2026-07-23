import type { CostBreakdown, EstimatingDomain } from '@/types/estimatingDomain';
import { calculateRoomWallPanels, calculateCeilingPanelQuantity, resolveWallElevations } from '@/utils/panelCalculator';
import { DEFAULT_PANEL_WIDTH_FT } from '@/utils/panelSizes';
import { calculateImpWallCost, calculateImpCeilingCost } from '@/utils/impCostCalculator';
import { IMP_ASSEMBLIES, type IMPAssembly } from '@/data/impAssemblies';
import { getRoomTypeOptions, ROOM_TYPE_CONFIGS, type IMPRoomType } from '@/data/roomTypes';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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
  // [Certain] ROOM_TYPE_CONFIGS.recommended_panel_thickness (roomTypes.ts) —
  // standard cold-storage panel thickness per temperature class. Seeds
  // Panel Thickness when Room Type is picked, unless the user already typed
  // a thickness in themselves (see DimensionFieldConfig.autoFill).
  autoFill: (roomType: string) => {
    const config = ROOM_TYPE_CONFIGS[roomType as IMPRoomType];
    return config ? { thicknessInches: config.recommended_panel_thickness } : undefined;
  },
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
      // Real cold-storage panel schedules quantify each traced wall run
      // ("elevation") separately, not the room's blended total perimeter —
      // see resolveWallElevations. A 0 thickness means that edge is
      // explicitly excluded (e.g. an existing wall this room borders that
      // doesn't get a new panel), same as it being unpaneled in a real job.
      const elevations = resolveWallElevations(dimensions).filter((e) => e.thicknessInches > 0);
      if (elevations.length === 0) return { value: 0, unit: 'EA' };
      if (!dimensions.wallHeightFt) {
        return { value: 0, unit: 'EA (enter Wall Height)' };
      }
      // Each elevation's panel count is rounded/waste-adjusted on its own
      // (calculateRoomWallPanels ceils internally), then summed — matches
      // how panels actually get ordered per wall run, not shared across a
      // corner. This can total slightly higher than treating the whole
      // perimeter as one continuous run did before (ceil(a)+ceil(b) >=
      // ceil(a+b)), which is the more honest, buildable number.
      // effectiveLengthFt (not lengthFt) already accounts for any door/
      // window opening on that elevation — see resolveWallElevations.
      const totalPanels = elevations.reduce(
        (sum, elev) =>
          sum +
          calculateRoomWallPanels(
            elev.effectiveLengthFt,
            dimensions.wallHeightFt!,
            DEFAULT_PANEL_WIDTH_FT,
            wasteFraction
          ).totalPanels,
        0
      );
      return { value: totalPanels, unit: 'EA' };
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
      if (!dimensions.wallHeightFt) return undefined;
      const elevations = resolveWallElevations(dimensions).filter((e) => e.thicknessInches > 0);
      if (elevations.length === 0) return undefined;

      // Each elevation can be a different thickness (this is the whole
      // point — a real room's walls often aren't all one panel spec), so
      // each needs its own assembly lookup and priced separately, then
      // summed. Never fabricate a cost: if even one priced elevation is
      // missing an assembly for its (roomType, thickness) combo, the whole
      // item returns undefined rather than a partial/misleading total.
      let materialCost = 0;
      let laborCost = 0;
      let equipmentCost = 0;
      let totalSF = 0;
      for (const elev of elevations) {
        const assembly = findWallAssembly(dimensions.roomType, elev.thicknessInches);
        if (!assembly) return undefined;
        // effectiveLengthFt, not lengthFt — nets out any door/window
        // opening on this elevation (see resolveWallElevations).
        const breakdown = calculateImpWallCost(elev.effectiveLengthFt, dimensions.wallHeightFt, assembly);
        materialCost += breakdown.materialCost;
        laborCost += breakdown.laborCost;
        equipmentCost += breakdown.equipmentCost;
        totalSF += elev.effectiveLengthFt * dimensions.wallHeightFt;
      }
      const totalCost = materialCost + laborCost + equipmentCost;
      return {
        materialCost: round2(materialCost),
        laborCost: round2(laborCost),
        equipmentCost: round2(equipmentCost),
        totalCost: round2(totalCost),
        costPerSf: totalSF > 0 ? round2(totalCost / totalSF) : 0,
      };
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