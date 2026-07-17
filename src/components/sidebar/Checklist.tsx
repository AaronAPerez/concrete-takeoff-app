'use client';

import React, { useState } from 'react';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import { ChecklistItem } from './ChecklistItem';

export const SummaryTakeoffChecklist: React.FC = () => {
  const takeoffs = useTakeoffStore((state) => state.takeoffs);
  const selectedTakeoffId = useTakeoffStore((state) => state.selectedTakeoffId);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="w-10 h-full border-l border-slate-200 bg-white flex flex-col items-center pt-3 gap-2 shadow-sm">
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Expand takeoff checklist"
          title="Expand takeoff checklist"
          className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500"
        >
          ◀
        </button>
        {takeoffs.length > 0 && (
          <span className="text-[10px] font-semibold text-slate-400 rounded-full bg-slate-100 w-5 h-5 flex items-center justify-center">
            {takeoffs.length}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-80 border-l border-slate-200 h-full bg-white flex flex-col shadow-sm">
      <div className="p-4 border-b border-slate-200 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-800">Takeoff Measurements Checklist</h2>
          <p className="text-xs text-slate-500">Verify extracted blueprint variables below</p>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          aria-label="Collapse takeoff checklist"
          title="Collapse takeoff checklist"
          className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500"
        >
          ▶
        </button>
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
