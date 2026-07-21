import type { CostBreakdown, EstimatingDomain } from '@/types/estimatingDomain';
import {
  getConcreteMixRate,
  SLAB_LABOR_RATE_PER_SF_PER_INCH,
  GRADE_BEAM_LABOR_COST_PER_CY,
  FREEZER_INSULATION_COST_PER_SF,
  FREEZER_SLAB_PACKAGE_COST_PER_SF,
  FREEZER_UNDERFLOOR_WARMING_COST_PER_SF,
} from '@/data/concreteAssemblies';

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

// [Certain] Sourced from Turnkey_Concrete_Quote.xlsx's SOG-CONCRETE sheet —
// explicit waste columns per category: 10% slab, 20% grade beam. Neither
// was applied anywhere in this file before; every quantity this domain has
// ever calculated was under by that margin.
const SLAB_WASTE_FACTOR = 0.10;
const GRADE_BEAM_WASTE_FACTOR = 0.20;

// Single source of truth for the two volume formulas — calculateQuantity
// and calculateCost each need the same CY figure (cost prices the CY you'd
// actually order, same rounding as the displayed quantity), so this used to
// be copy-pasted between them. Footing reuses areaThicknessVolumeCy too
// (same area x thickness shape as Slab), just with wasteFactor left at its
// 0 default since no source job prices a standalone footing to derive one from.
function areaThicknessVolumeCy(areaSqFt: number, thicknessInches: number, wasteFactor = 0): number {
  return ((areaSqFt * (thicknessInches / 12)) / 27) * (1 + wasteFactor);
}

function gradeBeamVolumeCy(linearFt: number, widthInches: number, depthInches: number, wasteFactor = 0): number {
  return ((linearFt * (widthInches / 12) * (depthInches / 12)) / 27) * (1 + wasteFactor);
}

const MIX_PSI_FIELD = {
  key: 'concreteMixPsi' as const,
  label: 'Mix PSI',
  unit: '',
  type: 'select' as const,
  options: [
    { value: '3000', label: '3000 PSI' },
    { value: '3500', label: '3500 PSI' },
  ],
};

// [Certain] Standard ASTM A615 rebar designations — a physical/engineering
// constant, not a sourced job rate. Documentation only: neither reference
// job (Timewise/Turnkey, Taco Bell Wharton) prices standalone reinforcement
// separately from its concrete assembly, so this doesn't feed calculateCost.
const BAR_SIZE_FIELD = {
  key: 'barSize' as const,
  label: 'Bar Size',
  unit: '',
  type: 'select' as const,
  options: [
    { value: '#3', label: '#3' },
    { value: '#4', label: '#4' },
    { value: '#5', label: '#5' },
    { value: '#6', label: '#6' },
    { value: '#7', label: '#7' },
    { value: '#8', label: '#8' },
  ],
};

export const concreteDomain: EstimatingDomain = {
  id: 'concrete',
  displayName: 'Concrete',
  categories: [
    {
      id: 'Slab',
      swapGroup: 'concrete-slab-family',
      dimensionFields: [
        { key: 'thicknessInches', label: 'Thick', unit: 'Inches' },
        { key: 'areaSqFt', label: 'Area', unit: 'SF' },
        MIX_PSI_FIELD,
      ]
    },
    {
      id: 'Freezer Slab',
      // Insulated freezer floor: 2" sand base + 7" XPS insulation + 6"
      // slab, per CW Portland's floor detail. Shares Slab's swapGroup so
      // it's reachable via the same toolbar toggle / post-trace dropdown —
      // both trace the room floor the same way, only the cost model and
      // extra documentation fields differ. No Mix PSI field here
      // deliberately: the freezer slab package rate is a flat lump sum
      // that doesn't vary by PSI in the source bid, so offering the field
      // would imply a price sensitivity that doesn't exist.
      swapGroup: 'concrete-slab-family',
      dimensionFields: [
        { key: 'thicknessInches', label: 'Slab Thick', unit: 'Inches' },
        { key: 'areaSqFt', label: 'Floor Area', unit: 'SF' },
        { key: 'insulationThicknessInches', label: 'Insulation Thick', unit: 'Inches' },
        { key: 'sandBaseInches', label: 'Sand Base', unit: 'Inches' },
        {
          key: 'underfloorWarmingSystem',
          label: 'Underfloor Warming',
          unit: '',
          type: 'select',
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
        },
      ]
    },
    {
      id: 'Grade Beam',
      dimensionFields: [
        { key: 'widthInches', label: 'Width', unit: 'Inches' },
        { key: 'depthInches', label: 'Depth', unit: 'Inches' },
        { key: 'linearFt', label: 'Linear', unit: 'FT' },
        MIX_PSI_FIELD,
      ]
    },
    {
      // Isolated pad/spread footing under a column, traced as its plan-view
      // footprint (same Area-tool pattern as Slab) with a manually-entered
      // depth. No swapGroup: a footing's footprint+depth fields don't share
      // meaning with any other category's fields (see swapGroup comment in
      // types/estimatingDomain.ts).
      id: 'Footing',
      dimensionFields: [
        { key: 'thicknessInches', label: 'Depth', unit: 'Inches' },
        { key: 'areaSqFt', label: 'Footprint Area', unit: 'SF' },
      ]
    },
    {
      // Standalone rebar takeoff (dowels, misc. reinforcement not already
      // folded into a Slab/Grade Beam/Footing pour) — traced as a linear
      // run, same pattern as IMP's Trim/Flashing.
      id: 'Reinforcement',
      dimensionFields: [
        { key: 'linearFt', label: 'Linear', unit: 'FT' },
        BAR_SIZE_FIELD,
      ]
    }
  ],

  // Moved verbatim from InputHandler.ts's handleDoubleClick call site.
  getDefaultsForTool: (tool) =>
    tool === 'area'
      ? { category: 'Slab', label: '4" SOG Concrete Slab' }
      : { category: 'Grade Beam', label: 'Continuous Wall Footing' },

  // Moved verbatim from useTakeoffStore's saveCurrentDraft + updateItemDimensions
  // (those two had the same formula duplicated — this is the single source now),
  // now with waste factors applied (see SLAB_WASTE_FACTOR / GRADE_BEAM_WASTE_FACTOR above).
  calculateQuantity: (item) => {
    const { category, dimensions } = item;

    if ((category === 'Slab' || category === 'Freezer Slab') && dimensions.areaSqFt && dimensions.thicknessInches) {
      const value = areaThicknessVolumeCy(dimensions.areaSqFt, dimensions.thicknessInches, SLAB_WASTE_FACTOR);
      // Round UP to a whole CY — matches Turnkey_Concrete_Quote.xlsx's own
      // formula exactly: =ROUNDUP(E24*(1+F24),) — zero decimal places, not
      // "nearest". Concrete gets ordered by the truck load, not the decimal.
      return { value: Math.ceil(value), unit: 'CY' };
    }

    if (
      category === 'Grade Beam' &&
      dimensions.linearFt &&
      dimensions.widthInches &&
      dimensions.depthInches
    ) {
      const value = gradeBeamVolumeCy(
        dimensions.linearFt,
        dimensions.widthInches,
        dimensions.depthInches,
        GRADE_BEAM_WASTE_FACTOR
      );
      return { value: Math.ceil(value), unit: 'CY' };
    }

    if (category === 'Footing') {
      if (!dimensions.areaSqFt || !dimensions.thicknessInches) return { value: 0, unit: 'CY' };
      // No waste factor (see areaThicknessVolumeCy comment) — every footing
      // line in the Taco Bell Wharton takeoff extract
      // (reference-docs/line_items.json, source_sheet "SOG- REBAR") is
      // quantity 0 / inactive, and the Taco Bell Wayside structural set
      // (reference-docs/STRUCTURAL.pdf, S4.0 detail 9 "GRADE BEAM @
      // COLUMN") shows footings as a thickened block-out of the grade beam
      // itself, not an independently poured/priced element.
      const value = areaThicknessVolumeCy(dimensions.areaSqFt, dimensions.thicknessInches);
      return { value: Math.ceil(value), unit: 'CY' };
    }

    if (category === 'Reinforcement') {
      if (!dimensions.linearFt) return { value: 0, unit: 'LF' };
      // LF, not tonnage — converting to weight would need a $/ton rate to
      // be useful, and none exists in either reference job (see barSize's
      // comment). Ordered/tied by the linear foot in practice, not rounded
      // up to a whole unit the way CY concrete or IMP panels are.
      return { value: Math.round(dimensions.linearFt * 100) / 100, unit: 'LF' };
    }

    return { value: 0, unit: 'CY' };
  },

  // [Certain] Slab, Freezer Slab, and Grade Beam have real cost data behind
  // them (see data/concreteAssemblies.ts). Footing/Reinforcement return
  // undefined — no fabricated cost, same pattern as IMP's missing assemblies.
  calculateCost: (item): CostBreakdown | undefined => {
    const { category, dimensions } = item;

    // Freezer Slab first, and separately from Slab/Grade Beam below — its
    // package rates are flat $/SF lump sums with no PSI dependency, so it
    // doesn't gate on getConcreteMixRate the way the other two do.
    if (category === 'Freezer Slab') {
      if (!dimensions.areaSqFt) return undefined;
      const insulationCost = dimensions.areaSqFt * FREEZER_INSULATION_COST_PER_SF;
      const slabPackageCost = dimensions.areaSqFt * FREEZER_SLAB_PACKAGE_COST_PER_SF;
      // Only priced when explicitly selected 'yes' — an unset field is not
      // the same as "no", but it's also not license to assume "yes".
      const warmingCost =
        dimensions.underfloorWarmingSystem === 'yes'
          ? dimensions.areaSqFt * FREEZER_UNDERFLOOR_WARMING_COST_PER_SF
          : 0;
      // Blended subcontractor package rates — the source bid never splits
      // these into material vs labor, so it all lands in materialCost
      // rather than guessing a split. See concreteAssemblies.ts header.
      const materialCost = insulationCost + slabPackageCost + warmingCost;
      return {
        materialCost: round2(materialCost),
        laborCost: 0,
        equipmentCost: 0,
        totalCost: round2(materialCost),
        costPerSf: round2(materialCost / dimensions.areaSqFt),
      };
    }

    const mixRate = getConcreteMixRate(dimensions.concreteMixPsi);
    if (!mixRate) return undefined;

    if (category === 'Slab') {
      if (!dimensions.areaSqFt || !dimensions.thicknessInches) return undefined;
      // Price the CY you'd actually order (rounded up to a whole yard, same
      // as calculateQuantity), not the raw fractional volume — you're
      // billed for the truck load, not the exact theoretical pour.
      const cyOrdered = Math.ceil(
        areaThicknessVolumeCy(dimensions.areaSqFt, dimensions.thicknessInches, SLAB_WASTE_FACTOR)
      );
      const materialCost = cyOrdered * mixRate.materialCostPerCy;
      const laborCost = dimensions.areaSqFt * dimensions.thicknessInches * SLAB_LABOR_RATE_PER_SF_PER_INCH;
      const totalCost = materialCost + laborCost;
      return {
        materialCost: round2(materialCost),
        laborCost: round2(laborCost),
        equipmentCost: 0,
        totalCost: round2(totalCost),
        costPerSf: dimensions.areaSqFt > 0 ? round2(totalCost / dimensions.areaSqFt) : 0,
      };
    }

    if (category === 'Grade Beam') {
      if (!dimensions.linearFt || !dimensions.widthInches || !dimensions.depthInches) return undefined;
      const cyOrdered = Math.ceil(
        gradeBeamVolumeCy(dimensions.linearFt, dimensions.widthInches, dimensions.depthInches, GRADE_BEAM_WASTE_FACTOR)
      );
      const materialCost = cyOrdered * mixRate.materialCostPerCy;
      const laborCost = cyOrdered * GRADE_BEAM_LABOR_COST_PER_CY; // confirmed $0, not a gap
      const totalCost = materialCost + laborCost;
      return {
        materialCost: round2(materialCost),
        laborCost: round2(laborCost),
        equipmentCost: 0,
        totalCost: round2(totalCost),
        costPerSf: 0, // grade beam cost isn't naturally SF-denominated (it's CY-driven)
      };
    }

    return undefined;
  },

  extractionKeywords: CONCRETE_KEYWORDS,
  guessCategory
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}