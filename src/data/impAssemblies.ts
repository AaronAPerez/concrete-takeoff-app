// Standard IMP (Insulated Metal Panel) assembly cost data for cold storage
// applications. Ported verbatim from estimator-app's lib/imp/impAssemblies.ts.
//
// [Certain] This is deliberately sparse — only 5 assemblies, not a full
// matrix of every room_type x thickness combination. There's no cold-dock
// or ante-room specific assembly, no ambient ceiling assembly, and no
// freezer-4in variant. That's inherited from the source data, not a bug
// introduced here. Costing intentionally returns `undefined` (see
// domains/imp.ts calculateCost) rather than guessing a price for a
// combination that has no real assembly behind it.

export interface IMPAssemblyComponent {
  type: 'panels' | 'fasteners' | 'sealant' | 'trim' | 'labor-install' | 'labor-seal';
  description: string;
  unit: 'SF' | 'LF' | 'EA';
  quantity_per_unit: number;
  unit_cost: number;
  waste_factor: number;
}

export interface IMPAssembly {
  id: string;
  name: string;
  code: string;
  wall_type: string; // e.g. 'exterior-6in' | 'interior-4in' | 'ceiling-6in'
  room_type: string;
  panel_thickness: number;
  panel_width: number;
  components: IMPAssemblyComponent[];
  material_cost_per_sf: number;
  labor_cost_per_sf: number;
  equipment_cost_per_sf: number;
  total_cost_per_sf: number;
}

export const IMP_ASSEMBLIES: IMPAssembly[] = [
  // FREEZER WALL (6")
  {
    id: 'imp-frz-6in-cfr-white',
    name: '6" Freezer Wall - White/White CFR',
    code: 'IMP-FRZ-6IN-CFR',
    wall_type: 'exterior-6in',
    room_type: 'freezer',
    panel_thickness: 6,
    panel_width: 3.667,
    components: [
      { type: 'panels', description: '6" CFR Freezer Panel - White/White', unit: 'SF', quantity_per_unit: 1, unit_cost: 8.50, waste_factor: 0.05 },
      { type: 'fasteners', description: 'Panel Fasteners', unit: 'EA', quantity_per_unit: 4, unit_cost: 0.15, waste_factor: 0.1 },
      { type: 'sealant', description: 'Joint Sealant', unit: 'LF', quantity_per_unit: 0.27, unit_cost: 2.50, waste_factor: 0.1 },
      { type: 'trim', description: 'Trim & Flashing', unit: 'LF', quantity_per_unit: 0.1, unit_cost: 3.50, waste_factor: 0.05 },
      { type: 'labor-install', description: 'Panel Installation', unit: 'SF', quantity_per_unit: 1, unit_cost: 4.20, waste_factor: 0 },
      { type: 'labor-seal', description: 'Joint Sealing', unit: 'LF', quantity_per_unit: 0.27, unit_cost: 1.50, waste_factor: 0 },
    ],
    material_cost_per_sf: 9.64,
    labor_cost_per_sf: 4.61,
    equipment_cost_per_sf: 0.35,
    total_cost_per_sf: 14.60,
  },

  // COOLER WALL (4")
  {
    id: 'imp-clr-4in-cfr-white',
    name: '4" Cooler Wall - White/White CFR',
    code: 'IMP-CLR-4IN-CFR',
    wall_type: 'exterior-4in',
    room_type: 'cooler',
    panel_thickness: 4,
    panel_width: 3.667,
    components: [
      { type: 'panels', description: '4" CFR Cooler Panel - White/White', unit: 'SF', quantity_per_unit: 1, unit_cost: 6.50, waste_factor: 0.05 },
      { type: 'fasteners', description: 'Panel Fasteners', unit: 'EA', quantity_per_unit: 4, unit_cost: 0.15, waste_factor: 0.1 },
      { type: 'sealant', description: 'Joint Sealant', unit: 'LF', quantity_per_unit: 0.27, unit_cost: 2.50, waste_factor: 0.1 },
      { type: 'trim', description: 'Trim & Flashing', unit: 'LF', quantity_per_unit: 0.1, unit_cost: 3.50, waste_factor: 0.05 },
      { type: 'labor-install', description: 'Panel Installation', unit: 'SF', quantity_per_unit: 1, unit_cost: 3.80, waste_factor: 0 },
      { type: 'labor-seal', description: 'Joint Sealing', unit: 'LF', quantity_per_unit: 0.27, unit_cost: 1.50, waste_factor: 0 },
    ],
    material_cost_per_sf: 7.52,
    labor_cost_per_sf: 4.21,
    equipment_cost_per_sf: 0.27,
    total_cost_per_sf: 12.00,
  },

  // INTERIOR PARTITION (4")
  {
    id: 'imp-int-4in-white',
    name: '4" Interior Partition - White/White',
    code: 'IMP-INT-4IN',
    wall_type: 'interior-4in',
    room_type: 'ambient',
    panel_thickness: 4,
    panel_width: 3.667,
    components: [
      { type: 'panels', description: '4" Interior Panel - White/White', unit: 'SF', quantity_per_unit: 1, unit_cost: 5.80, waste_factor: 0.05 },
      { type: 'fasteners', description: 'Panel Fasteners', unit: 'EA', quantity_per_unit: 4, unit_cost: 0.15, waste_factor: 0.1 },
      { type: 'sealant', description: 'Joint Sealant', unit: 'LF', quantity_per_unit: 0.27, unit_cost: 2.50, waste_factor: 0.1 },
      { type: 'labor-install', description: 'Panel Installation', unit: 'SF', quantity_per_unit: 1, unit_cost: 3.20, waste_factor: 0 },
      { type: 'labor-seal', description: 'Joint Sealing', unit: 'LF', quantity_per_unit: 0.27, unit_cost: 1.50, waste_factor: 0 },
    ],
    material_cost_per_sf: 6.75,
    labor_cost_per_sf: 3.61,
    equipment_cost_per_sf: 0.14,
    total_cost_per_sf: 10.50,
  },

  // CEILING (6")
  {
    id: 'imp-ceil-6in-white',
    name: '6" Ceiling Panel - White/White',
    code: 'IMP-CEIL-6IN',
    wall_type: 'ceiling-6in',
    room_type: 'freezer',
    panel_thickness: 6,
    panel_width: 3.667,
    components: [
      { type: 'panels', description: '6" Ceiling Panel - White/White', unit: 'SF', quantity_per_unit: 1, unit_cost: 9.20, waste_factor: 0.05 },
      { type: 'fasteners', description: 'Ceiling Fasteners', unit: 'EA', quantity_per_unit: 5, unit_cost: 0.18, waste_factor: 0.1 },
      { type: 'sealant', description: 'Joint Sealant', unit: 'LF', quantity_per_unit: 0.27, unit_cost: 2.50, waste_factor: 0.1 },
      { type: 'labor-install', description: 'Ceiling Installation (Higher Labor)', unit: 'SF', quantity_per_unit: 1, unit_cost: 5.50, waste_factor: 0 },
      { type: 'labor-seal', description: 'Joint Sealing', unit: 'LF', quantity_per_unit: 0.27, unit_cost: 1.50, waste_factor: 0 },
    ],
    material_cost_per_sf: 10.63,
    labor_cost_per_sf: 5.91,
    equipment_cost_per_sf: 0.46,
    total_cost_per_sf: 17.00,
  },

  // CEILING (4")
  {
    id: 'imp-ceil-4in-white',
    name: '4" Ceiling Panel - White/White',
    code: 'IMP-CEIL-4IN',
    wall_type: 'ceiling-4in',
    room_type: 'cooler',
    panel_thickness: 4,
    panel_width: 3.667,
    components: [
      { type: 'panels', description: '4" Ceiling Panel - White/White', unit: 'SF', quantity_per_unit: 1, unit_cost: 7.20, waste_factor: 0.05 },
      { type: 'fasteners', description: 'Ceiling Fasteners', unit: 'EA', quantity_per_unit: 5, unit_cost: 0.18, waste_factor: 0.1 },
      { type: 'sealant', description: 'Joint Sealant', unit: 'LF', quantity_per_unit: 0.27, unit_cost: 2.50, waste_factor: 0.1 },
      { type: 'labor-install', description: 'Ceiling Installation', unit: 'SF', quantity_per_unit: 1, unit_cost: 4.80, waste_factor: 0 },
      { type: 'labor-seal', description: 'Joint Sealing', unit: 'LF', quantity_per_unit: 0.27, unit_cost: 1.50, waste_factor: 0 },
    ],
    material_cost_per_sf: 8.36,
    labor_cost_per_sf: 5.21,
    equipment_cost_per_sf: 0.43,
    total_cost_per_sf: 14.00,
  },
];

export function getAssemblyByCode(code: string): IMPAssembly | undefined {
  return IMP_ASSEMBLIES.find((a) => a.code === code);
}

export function getAssembliesByRoomType(roomType: string): IMPAssembly[] {
  return IMP_ASSEMBLIES.filter((a) => a.room_type === roomType);
}