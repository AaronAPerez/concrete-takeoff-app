import { DEFAULT_PANEL_WIDTH_FT } from './panelSizes';

export interface WallElevation {
  index: number;
  lengthFt: number;
  // Panel quantity/cost math uses this, not lengthFt directly — see the
  // opening-deduction comment below. Equals lengthFt when there's no
  // opening (or no wallHeightFt to relate one to yet), so every existing
  // caller/behavior is unchanged for the common no-opening case.
  effectiveLengthFt: number;
  // 0 means explicitly excluded (e.g. an existing/shared wall this room
  // borders that doesn't get a new panel) — resolveWallElevations still
  // returns the row (so the UI can show it and let a user un-exclude it),
  // but callers computing quantity/cost should filter thicknessInches > 0.
  thicknessInches: number;
  // 0/0 means no door/window opening on this elevation.
  openingWidthFt: number;
  openingHeightFt: number;
}

// Resolves a traced room's per-wall-run ("elevation") breakdown from its
// dimensions — real cold-storage panel schedules are laid out this way
// (COOLER-ELEV1/ELEV2/ELEV3, each separately quantified), not as one
// blended room total. edgeLengthsFt is geometry-derived (see
// utils/geometry.ts's resolveGeometryDimensions); edgeThicknesses is
// user-editable per edge, with any edge missing from it (or the whole array
// missing) falling back to the item's single thicknessInches — so a plain
// single-thickness room needs zero extra input to keep working exactly as
// before. Returns [] when there's no traced geometry yet.
//
// Opening deduction: a traced wall run's raw lengthFt assumes full,
// unbroken panel coverage — a real run with a door or window doesn't need
// panel across that opening. Rather than a separate SF-deduction code path,
// this collapses to one number, effectiveLengthFt, that every existing
// panel-count/cost function already accepts in place of lengthFt: the
// opening's area (widthFt * heightFt) divided back out by wallHeightFt,
// i.e. "how much of this run's length would you have to remove, at full
// wall height, to lose the same square footage the opening actually
// covers." A full-height opening (heightFt === wallHeightFt) reduces
// exactly to effectiveLengthFt = lengthFt - openingWidthFt — "shorten the
// run by the door's width," matching the intuitive case (e.g. a full-height
// dock door). A door far shorter than the wall (typical in cold storage —
// a 7-10ft door in a 12-31ft+ freezer/cooler wall, confirmed against the
// real Chef's Warehouse Portland job this feature was verified against)
// proportionally barely reduces it, since most of the run's height above
// the door still needs full panel coverage. This is a deliberate
// SF-equivalence simplification, not a cut-sheet — it doesn't model the
// actual head/jamb panel pieces around an opening, same "bid-accurate, not
// shop-drawing-accurate" level of detail the rest of this app's panel math
// already operates at (see calculateRoomWallPanels's own one-panel-per-run
// simplification). Multiple openings on one elevation aren't supported —
// a wall run with two separate doors needs to be approximated as one
// combined opening for now.
export function resolveWallElevations(dimensions: {
  edgeLengthsFt?: number[];
  edgeThicknesses?: number[];
  thicknessInches?: number;
  edgeOpeningWidthFt?: number[];
  edgeOpeningHeightFt?: number[];
  wallHeightFt?: number;
}): WallElevation[] {
  const lengths = dimensions.edgeLengthsFt;
  if (!lengths || lengths.length === 0) return [];

  return lengths.map((lengthFt, index) => {
    const openingWidthFt = dimensions.edgeOpeningWidthFt?.[index] ?? 0;
    const openingHeightFt = dimensions.edgeOpeningHeightFt?.[index] ?? 0;
    const openingSF = openingWidthFt * openingHeightFt;
    const effectiveLengthFt =
      openingSF > 0 && dimensions.wallHeightFt
        ? Math.max(0, lengthFt - openingSF / dimensions.wallHeightFt)
        : lengthFt;

    return {
      index,
      lengthFt,
      effectiveLengthFt,
      thicknessInches: dimensions.edgeThicknesses?.[index] ?? dimensions.thicknessInches ?? 0,
      openingWidthFt,
      openingHeightFt,
    };
  });
}

export interface PanelCalculationResult {
  panelsWide: number;
  panelsHigh: number;
  totalPanels: number;
  coverageSF: number;
  actualAreaSF: number;
  wastedSF: number;
}

/**
 * Wall panels for a room: perimeter (LF) × wall height (FT).
 * Ported from estimator-app's calculateRoomWallPanels / calculatePanelQuantity.
 */
export function calculateRoomWallPanels(
  perimeterLf: number,
  wallHeightFt: number,
  panelWidthFt: number = DEFAULT_PANEL_WIDTH_FT,
  wasteFactor: number = 0.05,
  panelHeightFt: number = 0 // 0 = use wall height (one panel per wall run, typical)
): PanelCalculationResult {
  const effectivePanelHeight = panelHeightFt > 0 ? panelHeightFt : wallHeightFt;

  const panelsWide = Math.ceil(perimeterLf / panelWidthFt);
  const panelsHigh = Math.ceil(wallHeightFt / effectivePanelHeight);
  const totalPanels = panelsWide * panelsHigh;

  const coverageSF = panelsWide * panelWidthFt * panelsHigh * effectivePanelHeight;
  const actualAreaSF = perimeterLf * wallHeightFt;
  const wastedSF = coverageSF - actualAreaSF;

  return {
    panelsWide,
    panelsHigh,
    totalPanels: Math.ceil(totalPanels * (1 + wasteFactor)),
    coverageSF,
    actualAreaSF,
    wastedSF
  };
}

/**
 * Ceiling panels for a room: bounding-box width × length (FT).
 * Ported from estimator-app's calculateCeilingPanelQuantity.
 */
export function calculateCeilingPanelQuantity(
  roomWidthFt: number,
  roomLengthFt: number,
  panelWidthFt: number = DEFAULT_PANEL_WIDTH_FT,
  panelLengthFt: number = 0, // 0 = use room length (one panel per run, typical)
  wasteFactor: number = 0.05
): PanelCalculationResult {
  const effectivePanelLength = panelLengthFt > 0 ? panelLengthFt : roomLengthFt;

  const panelsWide = Math.ceil(roomWidthFt / panelWidthFt);
  const panelsLong = Math.ceil(roomLengthFt / effectivePanelLength);
  const totalPanels = panelsWide * panelsLong;

  const coverageSF = panelsWide * panelWidthFt * panelsLong * effectivePanelLength;
  const actualAreaSF = roomWidthFt * roomLengthFt;
  const wastedSF = coverageSF - actualAreaSF;

  return {
    panelsWide,
    panelsHigh: panelsLong,
    totalPanels: Math.ceil(totalPanels * (1 + wasteFactor)),
    coverageSF,
    actualAreaSF,
    wastedSF
  };
}