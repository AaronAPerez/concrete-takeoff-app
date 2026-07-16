'use client';

import React from 'react';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import { ChecklistItem } from './ChecklistItem';

export const SummaryTakeoffChecklist: React.FC = () => {
  const takeoffs = useTakeoffStore((state) => state.takeoffs);
  const selectedTakeoffId = useTakeoffStore((state) => state.selectedTakeoffId);

  return (
    <div className="w-96 border-l border-slate-200 h-full bg-white flex flex-col shadow-sm">
      <div className="p-4 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-800">Takeoff Measurements Checklist</h2>
        <p className="text-xs text-slate-500">Verify extracted blueprint variables below</p>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {takeoffs.length === 0 && (
          <p className="p-4 text-xs text-slate-400 italic">
            No takeoffs yet — draw an Area or Linear measurement on the canvas.
          </p>
        )}
        {takeoffs.map((item) => (
          <ChecklistItem key={item.id} item={item} isSelected={selectedTakeoffId === item.id} />
        ))}
      </div>
    </div>
  );
};
