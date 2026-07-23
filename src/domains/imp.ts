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
  // Checked before the generic flashing|trim fallback below, most-specific
  // first — a callout like "outside corner trim" would otherwise only ever
  // match the generic branch, since it also contains the word "trim".
  if (/outside\s*corner/i.test(text)) return 'Outside Corner Trim';
  if (/inside\s*corner/i.test(text)) return 'Inside Corner Trim';
  if (/\bparapet\b/i.test(text)) return 'Parapet Trim';
  if (/\beave\b/i.test(text)) return 'Eave Trim';
  if (/\bjamb\b/i.test(text)) return 'Jamb Trim';
  if (/\bhead\s*(?:trim|flashing)?\b/i.test(text)) return 'Head Trim';
  if (/\bbase\s*(?:trim|flashing)?\b/i.test(text)) return 'Base Trim';
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

// Real cold-storage jobs price/schedule trim by named condition — outside
// corner, inside corner, base, head, jamb, parapet, eave — not one blended
// "trim" bucket (confirmed against the sister project estimator-app's
// TrimCalculation type, which breaks a zone's trim out exactly this way,
// and general IMP install literature). Every one of these categories
// shares the same shape (a linear run, priced the same way — see
// calculateCost) and the same swapGroup, so a run traced generically can
// be reclassified into the right named type with one dropdown click, the
// same post-trace-swap pattern Wall Panel/Ceiling Panel and Slab/Freezer
// Slab already use. Room Type + Panel Thick are here (not just Linear +
// Waste) because pricing looks up the same per-(roomType,thickness) wall
// assembly Wall Panel uses — see the calculateCost comment for why.
const TRIM_DIMENSION_FIELDS = [
  { key: 'linearFt' as const, label: 'Linear', unit: 'FT' },
  { key: 'wasteFactorPercent' as const, label: 'Waste', unit: '%' },
  { key: 'thicknessInches' as const, label: 'Panel Thick', unit: 'Inches' },
  ROOM_TYPE_FIELD,
];

const TRIM_SWAP_GROUP = 'imp-trim-family';

// Every category priced the same way in calculateCost below — kept as one
// list so that branch and the categories array can't silently drift apart.
const TRIM_CATEGORY_IDS = [
  'Trim/Flashing',
  'Outside Corner Trim',
  'Inside Corner Trim',
  'Base Trim',
  'Head Trim',
  'Jamb Trim',
  'Parapet Trim',
  'Eave Trim',
];

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
      // Generic/unclassified linear trim — kept as the Linear tool's
      // default (see getDefaultsForTool) and as a catch-all for a run that
      // doesn't cleanly fit one of the named conditions below. Same
      // swapGroup as the named types, so it's a one-click reclassification
      // either direction once the actual condition is known.
      id: 'Trim/Flashing',
      swapGroup: TRIM_SWAP_GROUP,
      dimensionFields: TRIM_DIMENSION_FIELDS
    },
    { id: 'Outside Corner Trim', swapGroup: TRIM_SWAP_GROUP, dimensionFields: TRIM_DIMENSION_FIELDS },
    { id: 'Inside Corner Trim', swapGroup: TRIM_SWAP_GROUP, dimensionFields: TRIM_DIMENSION_FIELDS },
    { id: 'Base Trim', swapGroup: TRIM_SWAP_GROUP, dimensionFields: TRIM_DIMENSION_FIELDS },
    { id: 'Head Trim', swapGroup: TRIM_SWAP_GROUP, dimensionFields: TRIM_DIMENSION_FIELDS },
    { id: 'Jamb Trim', swapGroup: TRIM_SWAP_GROUP, dimensionFields: TRIM_DIMENSION_FIELDS },
    { id: 'Parapet Trim', swapGroup: TRIM_SWAP_GROUP, dimensionFields: TRIM_DIMENSION_FIELDS },
    { id: 'Eave Trim', swapGroup: TRIM_SWAP_GROUP, dimensionFields: TRIM_DIMENSION_FIELDS }
  ],

  getDefaultsForTool: (tool) =>
    tool === 'area'
      ? { category: 'Wall Panel', label: '4" Insulated Metal Wall Panel' }
      : { category: 'Trim/Flashing', label: 'Panel Trim/Flashing' },

  calculateQuantity: (item) => {
    const { category, dimensions } = item;
    const wasteFraction = (dimensions.wasteFactorPercent ?? DEFAULT_WASTE_FACTOR_PERCENT) / 100;

    if (TRIM_CATEGORY_IDS.includes(category)) {
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

    if (TRIM_CATEGORY_IDS.includes(category)) {
      if (!dimensions.linearFt) return undefined;
      // Reuses the same (roomType, thickness) wall assembly Wall Panel
      // prices off — there's no separate trim-rate table, and this is the
      // only real trim cost data in this repo: both the 6" Freezer and 4"
      // Cooler wall assemblies carry an identical `trim` component
      // ($3.50/LF, 5% waste — [Certain], ported from estimator-app the
      // same as every other IMP_ASSEMBLIES rate), currently only ever
      // consumed as a blended line inside the wall's own $/SF total. This
      // is the first place it's surfaced as a standalone cost. The
      // Ambient/Interior and both Ceiling assemblies carry no `trim`
      // component at all, so a trim item under those room types correctly
      // returns undefined rather than a guessed rate — same "no fabricated
      // cost" rule as everywhere else in this domain.
      //
      // [Guessing → not attempted] There is no source data anywhere in
      // this repo breaking trim cost out *by type* (outside corner vs.
      // base vs. jamb, etc.) — every named trim category prices off this
      // same single blended rate. Splitting quantity out by type is still
      // real value (matches how these jobs are actually scheduled/ordered
      // — see the category comment above); pretending there's a
      // per-type rate would not be.
      //
      // assembly.components' trim entry has quantity_per_unit: 0.1 — that
      // ratio means "for a wall's full perimeter, buy trim equal to 10% of
      // that length," a derivation factor for estimating trim FROM a wall
      // run. It doesn't apply here: the user is tracing actual trim
      // length directly, so only unit_cost is used, not quantity_per_unit.
      const assembly = findWallAssembly(dimensions.roomType, dimensions.thicknessInches);
      const trimComponent = assembly?.components.find((c) => c.type === 'trim');
      if (!trimComponent) return undefined;

      const netLf = dimensions.linearFt * (1 + (dimensions.wasteFactorPercent ?? DEFAULT_WASTE_FACTOR_PERCENT) / 100);
      const materialCost = netLf * trimComponent.unit_cost;
      return {
        materialCost: round2(materialCost),
        // Not a confirmed zero (contrast Grade Beam labor in the concrete
        // domain) — no sourced trim-install labor rate exists anywhere in
        // this repo's IMP data, material-only until one turns up.
        laborCost: 0,
        equipmentCost: 0,
        totalCost: round2(materialCost),
        costPerSf: 0, // not SF-denominated
      };
    }

    return undefined;
  },

  extractionKeywords: IMP_KEYWORDS,
  guessCategory
};