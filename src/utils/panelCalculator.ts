import { DEFAULT_PANEL_WIDTH_FT } from './panelSizes';

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