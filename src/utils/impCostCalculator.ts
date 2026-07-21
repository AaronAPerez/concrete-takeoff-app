import type { IMPAssembly } from '@/data/impAssemblies';

export interface IMPCostBreakdown {
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  totalCost: number;
  costPerSf: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Wall cost from a component breakdown. Ported from estimator-app's
 * calculateWallCost. LF-unit components (sealant, trim) scale off the
 * wall's linear run (perimeterLf), not its area — joint sealant runs along
 * the seams between panels, which scale with how far the wall runs, not
 * how tall it is. SF/EA components scale off area.
 */
export function calculateImpWallCost(
  perimeterLf: number,
  wallHeightFt: number,
  assembly: IMPAssembly
): IMPCostBreakdown {
  const areaSF = perimeterLf * wallHeightFt;
  let materialCost = 0;
  let laborCost = 0;

  for (const component of assembly.components) {
    const quantity =
      component.unit === 'LF' ? perimeterLf * component.quantity_per_unit : areaSF * component.quantity_per_unit;
    const cost = quantity * (1 + component.waste_factor) * component.unit_cost;

    if (component.type === 'labor-install' || component.type === 'labor-seal') {
      laborCost += cost;
    } else {
      materialCost += cost;
    }
  }

  const equipmentCost = assembly.equipment_cost_per_sf * areaSF;
  const totalCost = materialCost + laborCost + equipmentCost;

  return {
    materialCost: round2(materialCost),
    laborCost: round2(laborCost),
    equipmentCost: round2(equipmentCost),
    totalCost: round2(totalCost),
    costPerSf: areaSF > 0 ? round2(totalCost / areaSF) : 0,
  };
}

/**
 * Ceiling cost uses the assembly's pre-baked $/SF rates directly — matches
 * estimator-app's calculateRoomCost ceiling branch. No per-component loop
 * needed: for ceilings, the source data's component costs already collapse
 * to a flat $/SF (material_cost_per_sf etc.) rather than needing separate
 * LF-based sealant/trim math the way walls do.
 */
export function calculateImpCeilingCost(areaSF: number, assembly: IMPAssembly): IMPCostBreakdown {
  return {
    materialCost: round2(assembly.material_cost_per_sf * areaSF),
    laborCost: round2(assembly.labor_cost_per_sf * areaSF),
    equipmentCost: round2(assembly.equipment_cost_per_sf * areaSF),
    totalCost: round2(assembly.total_cost_per_sf * areaSF),
    costPerSf: assembly.total_cost_per_sf,
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}