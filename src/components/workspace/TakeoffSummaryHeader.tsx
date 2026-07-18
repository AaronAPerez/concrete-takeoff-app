'use client';

import React from 'react';
import { useTakeoffStore } from '@/stores/useTakeoffStore';

export const TakeoffSummaryHeader: React.FC = () => {
  const takeoffs = useTakeoffStore((state) => state.takeoffs);

  // Grouped by unit, not summed flat — a project can have both area (SF)
  // and linear (LF) items (e.g. IMP wall panels + trim), and CY/SF/LF
  // are never meaningfully addable to each other.
  const totalsByUnit = takeoffs.reduce<Record<string, number>>((acc, item) => {
    if (!item.calculatedQuantity) return acc;
    const { value, unit } = item.calculatedQuantity;
    acc[unit] = (acc[unit] || 0) + value;
    return acc;
  }, {});

  const unitEntries = Object.entries(totalsByUnit);

  return (
    <div className="bg-slate-900 text-white p-4 flex justify-between items-center shadow">
      <div>
        <h1 className="text-md font-bold">Project Bid Rollup</h1>
        <p className="text-xs text-slate-400">Live summary calculations</p>
      </div>
      <div className="flex gap-6">
        {unitEntries.length === 0 && (
          <span className="text-xs text-slate-500 italic">Pending dimensions</span>
        )}
        {unitEntries.map(([unit, total]) => (
          <div key={unit} className="text-right">
            <span className="block text-[10px] uppercase text-slate-400 tracking-wider">
              Total {unit}
            </span>
            <span className="text-xl font-black text-green-400">
              {total.toFixed(2)} {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};