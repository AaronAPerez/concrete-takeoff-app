/**
 * Concrete Assembly Types
 * Phase 2 - Concrete + Rebar Automation
 */

export type ConcreteAssemblyType =
  | 'slab_on_grade'
  | 'footing'
  | 'grade_beam'
  | 'stem_wall'
  | 'pier'
  | 'retaining_wall'
  | 'thickened_slab';

export interface ConcreteAssembly {
  id: string;
  name: string;
  type: ConcreteAssemblyType;
  description: string;

  // Material specifications
  psi: number; // Concrete strength
  slump: number; // Inches
  aggregateSize: number; // Max size in inches

  // Cost breakdown (per CY unless noted)
  materialCostPerCY: number;
  laborCostPerCY: number;
  equipmentCostPerCY: number;
  formworkCostPerSF?: number; // For items needing formwork
  finishingCostPerSF?: number; // For slabs

  // Labor productivity
  laborHoursPerCY: number;
  laborHoursFormworkPerSF?: number;
  laborHoursFinishingPerSF?: number;

  // Default dimensions
  defaultThickness?: number; // Inches
  defaultWidth?: number; // Feet
  defaultDepth?: number; // Feet

  // Waste factors
  wasteFactor: number; // Percentage (e.g., 0.05 = 5%)

  // Metadata
  created_at: string;
  updated_at: string;
}

export interface ConcreteElement {
  id: string;
  projectId?: string;
  blueprint_id?: string;
  assemblyId: string;
  assembly: ConcreteAssembly;

  // Geometry
  area_sf: number;
  thickness_inches: number;
  volume_cf: number;
  volume_cy: number;

  // Formwork (if applicable)
  formworkArea_sf?: number;
  formworkHeight_ft?: number;
  formwork_lf?: number; // Linear feet of formwork (NEW - Phase 2)

  // Quantities
  concreteQuantity_cy: number; // Including waste
  formworkQuantity_sf?: number;
  finishingQuantity_sf?: number;

  // Costs
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  formworkCost: number;
  finishingCost: number;
  totalCost: number;

  // Labor hours
  laborHours: number;

  // Drawing data
  points: Array<{ x: number; y: number }>;
  page: number;
  color?: string;

  // Rebar (NEW - Phase 2)
  rebar_spec?: RebarSpecification;

  // Quality Assurance (NEW - Phase 2)
  qa_status?: 'incomplete' | 'complete' | 'warning' | 'error';
  qa_issues?: QAIssue[];

  // Calculation metadata (NEW - Phase 2)
  calculation_metadata?: {
    waste_factor_applied?: number;
    labor_hours_estimated?: number;
    equipment_required?: string[];
    curing_days_required?: number;
  };

  // Metadata
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface RebarSpecification {
  id: string;
  concreteElementId: string;

  // Bar specifications
  barSize: string; // #3, #4, #5, #6, etc.
  barDiameter_inches: number;
  barWeight_lbsPerFt: number;

  // Spacing
  spacing_inches: number;
  direction: 'longitudinal' | 'transverse' | 'both';

  // Coverage
  coverTop_inches: number;
  coverBottom_inches: number;
  coverSides_inches: number;

  // Quantities
  barLength_ft: number;
  barCount: number;
  totalLength_ft: number;
  totalWeight_lbs: number;

  // Accessories
  chairs: number;
  ties: number;
  laps: number;
  lapLength_inches: number;

  // Costs
  barCostPerLb: number;
  totalBarCost: number;
  accessoriesCost: number;
  laborCost: number;
  totalCost: number;

  // Labor
  laborHours: number;

  created_at: string;
}

export interface QAIssue {
  id: string;
  type: 'missing_thickness' | 'missing_psi' | 'missing_rebar' | 'self_intersection' | 'area_too_small' | 'missing_callout' | 'conflicting_note' | 'unmeasured_area' | 'overlap' | 'inconsistent_thickness';
  severity: 'error' | 'warning' | 'info' | 'low' | 'medium' | 'high' | 'critical';

  elementId?: string;
  elementType?: 'concrete' | 'rebar' | 'room' | 'measurement';

  title: string;
  message: string; // Renamed from 'description' to match guide
  description?: string; // Keep for backwards compatibility
  suggested_fix?: string; // NEW - Phase 2

  // Location on canvas
  x: number;
  y: number;
  page: number;

  // Heatmap visualization
  heatmapIntensity: number; // 0-1

  // Resolution
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;

  created_at: string;
}

// Pre-defined concrete assemblies database
export const CONCRETE_ASSEMBLIES: Record<ConcreteAssemblyType, ConcreteAssembly> = {
  slab_on_grade: {
    id: 'assy_slab_on_grade',
    name: 'Slab on Grade',
    type: 'slab_on_grade',
    description: '3000 PSI concrete slab with vapor barrier and wire mesh',
    psi: 3000,
    slump: 4,
    aggregateSize: 0.75,
    materialCostPerCY: 145,
    laborCostPerCY: 85,
    equipmentCostPerCY: 25,
    finishingCostPerSF: 1.25,
    laborHoursPerCY: 2.5,
    laborHoursFinishingPerSF: 0.08,
    defaultThickness: 4,
    wasteFactor: 0.05,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  footing: {
    id: 'assy_footing',
    name: 'Continuous Footing',
    type: 'footing',
    description: '3000 PSI continuous spread footing',
    psi: 3000,
    slump: 4,
    aggregateSize: 0.75,
    materialCostPerCY: 145,
    laborCostPerCY: 95,
    equipmentCostPerCY: 30,
    formworkCostPerSF: 8.50,
    laborHoursPerCY: 3.0,
    laborHoursFormworkPerSF: 0.25,
    defaultThickness: 12,
    defaultWidth: 2,
    wasteFactor: 0.10,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  grade_beam: {
    id: 'assy_grade_beam',
    name: 'Grade Beam',
    type: 'grade_beam',
    description: '4000 PSI grade beam with heavy rebar',
    psi: 4000,
    slump: 4,
    aggregateSize: 0.75,
    materialCostPerCY: 165,
    laborCostPerCY: 110,
    equipmentCostPerCY: 35,
    formworkCostPerSF: 10.50,
    laborHoursPerCY: 3.5,
    laborHoursFormworkPerSF: 0.30,
    defaultThickness: 18,
    defaultWidth: 2,
    defaultDepth: 2,
    wasteFactor: 0.08,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  stem_wall: {
    id: 'assy_stem_wall',
    name: 'Stem Wall',
    type: 'stem_wall',
    description: '3000 PSI stem wall on footing',
    psi: 3000,
    slump: 4,
    aggregateSize: 0.75,
    materialCostPerCY: 145,
    laborCostPerCY: 120,
    equipmentCostPerCY: 30,
    formworkCostPerSF: 11.00,
    laborHoursPerCY: 4.0,
    laborHoursFormworkPerSF: 0.35,
    defaultThickness: 8,
    wasteFactor: 0.10,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  pier: {
    id: 'assy_pier',
    name: 'Concrete Pier',
    type: 'pier',
    description: '4000 PSI drilled pier with rebar cage',
    psi: 4000,
    slump: 6,
    aggregateSize: 0.75,
    materialCostPerCY: 175,
    laborCostPerCY: 135,
    equipmentCostPerCY: 85,
    laborHoursPerCY: 5.0,
    wasteFactor: 0.15,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  retaining_wall: {
    id: 'assy_retaining_wall',
    name: 'Retaining Wall',
    type: 'retaining_wall',
    description: '4000 PSI retaining wall with waterproofing',
    psi: 4000,
    slump: 4,
    aggregateSize: 0.75,
    materialCostPerCY: 165,
    laborCostPerCY: 140,
    equipmentCostPerCY: 40,
    formworkCostPerSF: 12.50,
    laborHoursPerCY: 4.5,
    laborHoursFormworkPerSF: 0.40,
    defaultThickness: 12,
    wasteFactor: 0.10,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  thickened_slab: {
    id: 'assy_thickened_slab',
    name: 'Thickened Slab Edge',
    type: 'thickened_slab',
    description: '3500 PSI thickened slab at perimeter',
    psi: 3500,
    slump: 4,
    aggregateSize: 0.75,
    materialCostPerCY: 155,
    laborCostPerCY: 95,
    equipmentCostPerCY: 28,
    formworkCostPerSF: 9.00,
    finishingCostPerSF: 1.35,
    laborHoursPerCY: 3.0,
    laborHoursFormworkPerSF: 0.28,
    laborHoursFinishingPerSF: 0.09,
    defaultThickness: 12,
    wasteFactor: 0.08,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};

// Rebar size database
export const REBAR_SIZES = {
  '#3': { diameter: 0.375, weight: 0.376 },
  '#4': { diameter: 0.500, weight: 0.668 },
  '#5': { diameter: 0.625, weight: 1.043 },
  '#6': { diameter: 0.750, weight: 1.502 },
  '#7': { diameter: 0.875, weight: 2.044 },
  '#8': { diameter: 1.000, weight: 2.670 },
  '#9': { diameter: 1.128, weight: 3.400 },
  '#10': { diameter: 1.270, weight: 4.303 },
  '#11': { diameter: 1.410, weight: 5.313 },
};

// Standard rebar pricing
export const REBAR_COST_PER_LB = 0.85;
export const CHAIR_COST_EACH = 0.35;
export const TIE_COST_PER_100 = 12.00;
export const REBAR_LABOR_HOURS_PER_TON = 16;
