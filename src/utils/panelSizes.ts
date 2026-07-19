// Standard Insulated Metal Panel Sizes — ported from estimator-app's
// lib/imp/panelSizes.ts (source of truth for the physical panel module).

export const DEFAULT_PANEL_WIDTH_FT = 3.667; // 3'-8"
export const DEFAULT_PANEL_WIDTH_INCHES = '3\'-8"';

export const PANEL_THICKNESSES = {
  FREEZER: [6, 8],
  COOLER: [4, 6],
  INTERIOR: [2, 4],
  CEILING_FREEZER: [6, 8],
  CEILING_COOLER: [4, 6],
};

export const R_VALUES: Record<string, number> = {
  '2': 14,
  '4': 28,
  '6': 40,
  '8': 54,
};