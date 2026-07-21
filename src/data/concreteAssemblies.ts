// Concrete cost data ported from real bid workbooks: Turnkey_Concrete_Quote.xlsx
// ("Timewise #278") and taco-bell-pricing.json ("Taco Bell Wharton").
//
// [Certain] Unlike IMP_ASSEMBLIES (a stable manufacturer product catalog),
// concrete pricing here is QUOTE-SPECIFIC — the same nominal "3000 PSI" mix
// priced at $138/CY on one job and $155/CY on another, presumably supplier/
// date dependent. These are defaults an estimator should confirm per job,
// not a fixed catalog. Treat CONCRETE_MIX_RATES as a starting point to
// override, not ground truth the way the IMP panel data was.
//
// [Certain] Grade beam labor is $0.00/CY — confirmed identically across
// both source jobs' line-item pricing, not a gap. Grade beam pour labor is
// evidently folded into the slab crew's rate rather than billed separately.
//
// [Likely] Slab labor is $1.00/SF per inch of thickness — derived from two
// reliably-labeled data points (5" -> $5.00/SF, 2.5" -> $2.50/SF), both
// exact. A third row (labeled "5" slab" but priced $1.50/SF under a car-
// wash section that's actually 6" per the SOG-CONCRETE sheet) doesn't fit
// this formula at either thickness and was excluded as likely mislabeled
// rather than incorporated.
//
// [Certain] No footing pricing exists in either source job — zero rows.
// getConcreteMixRate/getSlabLaborRate return what they have; Footing has
// no cost path in domains/concrete.ts at all, matching that gap honestly.

export interface ConcreteMixRate {
  psi: number;
  materialCostPerCy: number;
  source: string; // which bid this rate came from, since it's job-specific
}

export const CONCRETE_MIX_RATES: ConcreteMixRate[] = [
  { psi: 3000, materialCostPerCy: 138.0, source: 'Timewise #278' },
  { psi: 3500, materialCostPerCy: 147.0, source: 'Timewise #278' },
];

export function getConcreteMixRate(psi: number | undefined): ConcreteMixRate | undefined {
  if (!psi) return undefined;
  return CONCRETE_MIX_RATES.find((r) => r.psi === psi);
}

// $/SF of slab labor, scaled by thickness. See file header for derivation.
export const SLAB_LABOR_RATE_PER_SF_PER_INCH = 1.0;

// Grade beam pour labor — confirmed $0, not missing. See file header.
export const GRADE_BEAM_LABOR_COST_PER_CY = 0;

// Freezer insulated floor — sourced from CW Portland CSM Proposal 23-M038
// Rev.9 (Feb 2025), same 13,260 SF freezer footprint across all three
// lines below, plus the floor detail in the permit set drawings:
//   2" sand base + (2 layers 3" + 1 layer 1" = 7") extruded polystyrene
//   insulation + 6" concrete slab, with underfloor EMT conduit for an
//   electric heat-trace warming system.
//
// [Certain] These are blended subcontractor PACKAGE rates, not decomposed
// into material vs labor — the source bid presents them as single lump
// sums ($155,163 / $194,075 / $79,560 for the whole 13,260 SF scope), so
// there's no material/labor split to port. calculateCost bundles all of it
// under materialCost with laborCost fixed at 0, rather than guessing a split.
//
// [Certain] No sand cost exists anywhere in either bid revision. The detail
// calls for a 2" sand base, but it's evidently folded into general sitework
// / subgrade prep rather than itemized — sandBaseInches on the dimension
// is recorded for documentation only and isn't priced.
//
// [Guessing] The insulation rate changed between bid revisions ($140,163 ->
// $155,163 for the identical 13,260 SF scope, Rev.5 -> Rev.9) while the
// slab package rate stayed flat. Using Rev.9 (the more recent, currently-
// signed proposal) as the default — same "confirm per job" caveat as
// CONCRETE_MIX_RATES applies here too.

export const FREEZER_INSULATION_COST_PER_SF = 155163 / 13260; // ~$11.70/SF — Rev.9
export const FREEZER_SLAB_PACKAGE_COST_PER_SF = 194075 / 13260; // ~$14.64/SF — 6" slab, rebar, armor joints, dowel baskets, finish
export const FREEZER_UNDERFLOOR_WARMING_COST_PER_SF = 79560 / 13260; // $6.00/SF exactly