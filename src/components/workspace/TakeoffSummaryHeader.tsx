'use client';

import React from 'react';
import { useTakeoffStore } from '@/stores/useTakeoffStore';

export const TakeoffSummaryHeader: React.FC = () => {
  const takeoffs = useTakeoffStore((state) => state.takeoffs);

  const totalConcreteVolume = takeoffs.reduce((sum, item) => sum + (item.calculatedVolumeCY || 0), 0);

  return (
    <div className="bg-slate-900 text-white p-4 flex justify-between items-center shadow">
      <div>
        <h1 className="text-md font-bold">Project Bid Rollup</h1>
        <p className="text-xs text-slate-400">Live summary calculations</p>
      </div>
      <div className="flex gap-6">
        <div className="text-right">
          <span className="block text-[10px] uppercase text-slate-400 tracking-wider">Total Concrete</span>
          <span className="text-xl font-black text-green-400">{totalConcreteVolume.toFixed(2)} CY</span>
        </div>
      </div>
    </div>
  );
};
