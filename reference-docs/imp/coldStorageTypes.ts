/**
 * MIP (Metal Insulated Panel) Type System
 * Phase 3.1 - Type Definitions
 *
 * Separation of Concerns: Pure type definitions, no logic
 * Reusability: Can be imported anywhere in the app
 */

// ============================================================================
// ENUMS AND LITERAL TYPES
// ============================================================================

/**
 * Temperature zones for cold storage applications
 * Based on Portland Project specifications
 */
export type ColdStorageTemperatureZone =
  | 'blast_freezer'  // -40°F to -10°F - Blast freezing operations
  | 'freezer'        // -10°F to 0°F - Long-term frozen storage
  | 'cooler'         // 32°F to 40°F - Refrigerated storage
  | 'cold_dock'      // 40°F to 50°F - Loading/unloading areas
  | 'ambient';       // 50°F+ - Dry storage, offices

/**
 * Core insulation materials
 * Different materials have different R-values and applications
 */
export type ColdStoragePanelMaterial =
  | 'polyisocyanurate'  // Best R-value (R-7 per inch)
  | 'polyurethane'      // Good R-value (R-6 per inch)
  | 'polystyrene'       // Economy (R-5 per inch)
  | 'mineral_wool';     // Fire-rated (R-4 per inch)

/**
 * Panel profiles for different applications
 */
export type ColdStoragePanelProfile =
  | 'corrugated'     // Standard wall panels
  | 'flat'           // Clean room applications
  | 'standing_seam'  // Roof panels
  | 'ribbed';        // Structural panels

/**
 * Major MIP manufacturers
 */
export type ColdStoragePanelManufacturer =
  | 'Metl-Span'
  | 'Kingspan'
  | 'ATAS'
  | 'MBCI'
  | 'Nucor';

/**
 * Component types in MIP assembly
 */
export type ColdStorageComponentType =
  | 'panel'
  | 'fastener'
  | 'trim'
  | 'sealant'
  | 'vapor_barrier'
  | 'thermal_break';

/**
 * Wind load zones (simplified)
 */
export type WindZone = 'low' | 'medium' | 'high';

/**
 * Trim types for MIP installation
 */
export type TrimType =
  | 'outside_corner'
  | 'inside_corner'
  | 'base'
  | 'head'
  | 'jamb'
  | 'parapet'
  | 'eave';

// ============================================================================
// PANEL SPECIFICATIONS
// ============================================================================

/**
 * Complete panel specifications
 * Based on manufacturer datasheets
 */
export interface ColdStoragePanelSpec {
  /** Panel thickness in inches (3, 4, 5, 6, 8) */
  thickness: number;

  /** Thermal resistance (R-value) */
  rValue: number;

  /** Core insulation material */
  coreMaterial: ColdStoragePanelMaterial;

  /** Panel profile type */
  profile: ColdStoragePanelProfile;

  /** Interior metal gauge (26, 24, 22) */
  interiorGauge: number;

  /** Exterior metal gauge (26, 24, 22) */
  exteriorGauge: number;

  /** Interior finish (white, stainless, etc.) */
  interiorFinish: string;

  /** Exterior finish color */
  exteriorFinish: string;

  /** Panel manufacturer */
  manufacturer: ColdStoragePanelManufacturer;

  /** Product line (e.g., 'CFR', 'CF', 'Metecno') */
  productLine: string;

  /** Weight per square foot (lbs/SF) */
  weightPerSF?: number;

  /** Fire rating (optional) */
  fireRating?: string;
}

// ============================================================================
// FASTENER SPECIFICATIONS
// ============================================================================

/**
 * Fastener specifications for panel attachment
 * Critical for structural integrity and thermal performance
 */
export interface ColdStorageFastenerSpec {
  /** Manufacturer part number (e.g., '1356S') */
  partNumber: string;

  /** Fastener type */
  type: 'self-drilling' | 'standard';

  /** Fastener length in inches */
  length: number;

  /** Compatible panel thickness */
  panelThickness: number;

  /** Wind load rating */
  windLoad: WindZone;

  /** Recommended spacing in inches O.C. */
  spacing: number;

  /** Cost per 100 fasteners */
  costPer100: number;

  /** Finish (painted, zinc, stainless) */
  finish?: string;

  /** Threads per inch */
  threadsPerInch?: number;
}

// ============================================================================
// TRIM SPECIFICATIONS
// ============================================================================

/**
 * Trim piece specifications
 * Provides finished edges and corners
 */
export interface ColdStorageTrimSpec {
  /** Trim type */
  type: TrimType;

  /** Manufacturer part number (e.g., 'F5154') */
  partNumber: string;

  /** Compatible panel thickness */
  panelThickness: number;

  /** Material (steel or aluminum) */
  material: 'steel' | 'aluminum';

  /** Finish color */
  finish: string;

  /** Gauge */
  gauge: number;

  /** Available standard lengths in feet */
  lengthsAvailable: number[];

  /** Cost per linear foot */
  costPerLF: number;

  /** Description */
  description?: string;
}

// ============================================================================
// SEALANT SPECIFICATIONS
// ============================================================================

/**
 * Sealant specifications for joints
 */
export interface ColdStorageSealantSpec {
  /** Manufacturer part number */
  partNumber: string;

  /** Product description */
  description: string;

  /** Coverage in linear feet per tube/cartridge */
  coverage: number;

  /** Cost per tube/cartridge */
  costPerTube: number;

  /** Cure time in hours */
  cureTime?: number;

  /** Color */
  color?: string;
}

// ============================================================================
// VAPOR BARRIER SPECIFICATIONS
// ============================================================================

/**
 * Vapor barrier specifications
 * Critical for cold storage to prevent moisture intrusion
 */
export interface VaporBarrierSpec {
  /** Product description */
  description: string;

  /** Thickness in mils */
  thickness: number;

  /** Roll width in feet */
  rollWidth: number;

  /** Roll length in feet */
  rollLength: number;

  /** Coverage per roll in SF */
  coveragePerRoll: number;

  /** Cost per roll */
  costPerRoll: number;

  /** Perm rating */
  permRating?: number;
}

// ============================================================================
// COMPLETE MIP ASSEMBLY
// ============================================================================

/**
 * Complete MIP assembly with all components
 * Based on Portland Project assemblies
 */
export interface ColdStorageAssembly {
  /** Unique identifier */
  id: string;

  /** Assembly code (e.g., 'MIP-FRZ-6IN-CFR') */
  code: string;

  /** Assembly name */
  name: string;

  /** Detailed description */
  description: string;

  /** Element type (wall, roof, ceiling) */
  elementType: 'mip_wall' | 'mip_roof' | 'mip_ceiling';

  /** Panel specification */
  panelSpec: ColdStoragePanelSpec;

  /** Fastener specification */
  fastenerSpec: ColdStorageFastenerSpec;

  /** Trim specifications (array for different types) */
  trimSpecs: ColdStorageTrimSpec[];

  /** Sealant specification */
  sealantSpec: ColdStorageSealantSpec;

  /** Vapor barrier specification (optional, mainly for floors) */
  vaporBarrierSpec?: VaporBarrierSpec;

  /** Recommended temperature zone */
  temperatureZone: ColdStorageTemperatureZone;

  /** Total cost per square foot (material only) */
  costPerSF: number;

  /** Labor hours per square foot */
  laborHoursPerSF: number;

  /** Waste factor (0.05 = 5%) */
  wasteFactor: number;

  /** Is this assembly active/available? */
  isActive: boolean;

  /** Source project (e.g., 'Portland Project') */
  sourceProject?: string;

  /** Additional notes */
  notes?: string;

  /** Created timestamp */
  createdAt?: string;

  /** Updated timestamp */
  updatedAt?: string;
}

// ============================================================================
// COLD STORAGE ZONE
// ============================================================================

/**
 * Cold storage zone/room definition
 * Represents a single temperature-controlled space
 */
export interface ColdStorageZone {
  /** Unique identifier */
  id: string;

  /** Zone/room name */
  name: string;

  /** Temperature classification */
  temperatureZone: ColdStorageTemperatureZone;

  /** Target temperature in °F */
  targetTemp: number;

  /** Recommended MIP assembly */
  recommendedAssembly?: ColdStorageAssembly;

  /** Floor area in square feet */
  area_sf: number;

  /** Perimeter in linear feet */
  perimeter_lf: number;

  /** Wall height in feet */
  wallHeight_ft: number;

  /** Ceiling height in feet */
  ceilingHeight_ft: number;

  /** Number of doors */
  doorCount?: number;

  /** Number of windows */
  windowCount?: number;

  /** Special requirements */
  specialRequirements?: string[];

  /** Blueprint page number */
  pageNumber?: number;

  /** Blueprint sheet this zone was drawn on */
  blueprintId?: string;

  /** Polygon points (for canvas rendering) */
  polygonPoints?: { x: number; y: number }[];
}

// ============================================================================
// CALCULATION RESULTS
// ============================================================================

/**
 * Fastener calculation result
 */
export interface FastenerCalculation {
  /** Total number of fasteners required */
  totalFasteners: number;

  /** Fastener spacing used (inches O.C.) */
  fastenerSpacing: number;

  /** Number of boxes (100/box typically) */
  boxCount: number;

  /** Total material cost */
  totalCost: number;

  /** Labor hours for installation */
  laborHours: number;

  /** Wind zone used for calculation */
  windZone: WindZone;

  /** Fasteners per panel breakdown */
  fastenersPerPanel?: number;

  /** Number of panels */
  panelCount?: number;
}

/**
 * Trim calculation result for a single trim type
 */
export interface TrimLineItem {
  /** Linear feet required */
  linearFeet: number;

  /** Number of pieces (based on standard lengths) */
  pieces: number;

  /** Total cost */
  cost: number;

  /** Trim specification used */
  trimSpec?: ColdStorageTrimSpec;
}

/**
 * Complete trim calculation for a zone
 */
export interface TrimCalculation {
  /** Outside corner trim */
  outsideCorners: TrimLineItem;

  /** Inside corner trim */
  insideCorners: TrimLineItem;

  /** Base trim */
  base: TrimLineItem;

  /** Head trim (door/window tops) */
  head: TrimLineItem;

  /** Jamb trim (door/window sides) */
  jamb: TrimLineItem;

  /** Parapet trim (roof edge) */
  parapet?: TrimLineItem;

  /** Eave trim */
  eave?: TrimLineItem;

  /** Total material cost */
  totalCost: number;

  /** Total labor hours */
  laborHours: number;

  /** Total linear feet */
  totalLF: number;
}

/**
 * Sealant calculation result
 */
export interface SealantCalculation {
  /** Linear feet to be sealed */
  linearFeet: number;

  /** Number of tubes/cartridges */
  tubeCount: number;

  /** Total cost */
  totalCost: number;

  /** Labor hours */
  laborHours: number;
}

/**
 * Vapor barrier calculation result
 */
export interface VaporBarrierCalculation {
  /** Square feet required */
  squareFeet: number;

  /** Number of rolls */
  rollCount: number;

  /** Total cost */
  totalCost: number;

  /** Labor hours */
  laborHours: number;
}

// ============================================================================
// COMPLETE MIP ESTIMATE
// ============================================================================

/**
 * Complete MIP estimate for a zone
 * Includes all components and costs
 */
export interface ColdStorageEstimate {
  /** Zone being estimated */
  zone: ColdStorageZone;

  /** Assembly used */
  assembly: ColdStorageAssembly;

  /** Panel quantity (SF with waste) */
  panelQuantity_sf: number;

  /** Panel material cost */
  panelCost: number;

  /** Fastener calculation */
  fasteners: FastenerCalculation;

  /** Trim calculation */
  trim: TrimCalculation;

  /** Sealant calculation */
  sealant: SealantCalculation;

  /** Vapor barrier calculation (if applicable) */
  vaporBarrier?: VaporBarrierCalculation;

  /** Total material cost */
  totalMaterialCost: number;

  /** Total labor hours */
  totalLaborHours: number;

  /** Total labor cost */
  totalLaborCost: number;

  /** Grand total cost */
  totalCost: number;

  /** Cost per square foot (for comparison) */
  costPerSF: number;

  /** Calculation notes */
  notes?: string[];

  /** Created timestamp */
  createdAt?: string;
}

// ============================================================================
// DATABASE ROW TYPES (from Supabase)
// ============================================================================

/**
 * MIP assembly row from database view
 * Maps to mip_assemblies_view
 */
export interface ColdStorageAssemblyRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  element_type: 'mip_wall' | 'mip_roof' | 'mip_ceiling';
  thickness: number | null;
  r_value: number | null;
  core_material: string | null;
  profile: string | null;
  temperature_application: string | null;
  manufacturer: string | null;
  mip_specs: any; // JSON field
  components: any; // JSON field
  cost_per_unit: number | null;
  labor_hours_per_unit: number | null;
  waste_factor: number | null;
  active: boolean | null;
  is_default: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}
