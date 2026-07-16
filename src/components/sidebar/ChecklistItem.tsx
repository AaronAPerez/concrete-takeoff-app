'use client';

import React from 'react';
import type { TakeoffChecklistItem } from '@/types/takeoff';
import { useTakeoffStore } from '@/stores/useTakeoffStore';

interface ChecklistItemProps {
  item: TakeoffChecklistItem;
  isSelected: boolean;
}

export const ChecklistItem: React.FC<ChecklistItemProps> = ({ item, isSelected }) => {
  const selectTakeoff = useTakeoffStore((state) => state.selectTakeoff);
  const updateItemDimensions = useTakeoffStore((state) => state.updateItemDimensions);
  const deleteTakeoff = useTakeoffStore((state) => state.deleteTakeoff);

  return (
    <div
      onClick={() => selectTakeoff(item.id)}
      className={`p-4 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50/70 border-l-4 border-blue-500' : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
          {item.category}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-blue-600">
            {item.calculatedVolumeCY ? `${item.calculatedVolumeCY} CY` : '--'}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteTakeoff(item.id);
            }}
            className="text-slate-300 hover:text-red-500 text-xs"
            aria-label="Delete takeoff"
          >
            ✕
          </button>
        </div>
      </div>

      <h4 className="text-sm font-medium text-slate-800">{item.label}</h4>
      <p className="text-xs text-slate-400 italic mb-3">{item.extractedText}</p>

      <div className="grid grid-cols-2 gap-2">
        {item.category === 'Slab' && (
          <>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400">Thick (Inches)</label>
              <input
                type="number"
                value={item.dimensions.thicknessInches ?? ''}
                onChange={(e) =>
                  updateItemDimensions(item.id, { thicknessInches: parseFloat(e.target.value) || undefined })
                }
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs border border-slate-200 rounded p-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400">Area (SF)</label>
              <input
                type="number"
                value={item.dimensions.areaSqFt ?? ''}
                onChange={(e) =>
                  updateItemDimensions(item.id, { areaSqFt: parseFloat(e.target.value) || undefined })
                }
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs border border-slate-200 rounded p-1"
              />
            </div>
          </>
        )}
        {item.category === 'Grade Beam' && (
          <>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400">Width (Inches)</label>
              <input
                type="number"
                value={item.dimensions.widthInches ?? ''}
                onChange={(e) =>
                  updateItemDimensions(item.id, { widthInches: parseFloat(e.target.value) || undefined })
                }
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs border border-slate-200 rounded p-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400">Depth (Inches)</label>
              <input
                type="number"
                value={item.dimensions.depthInches ?? ''}
                onChange={(e) =>
                  updateItemDimensions(item.id, { depthInches: parseFloat(e.target.value) || undefined })
                }
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs border border-slate-200 rounded p-1"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400">Linear (FT)</label>
              <input
                type="number"
                value={item.dimensions.linearFt ?? ''}
                onChange={(e) =>
                  updateItemDimensions(item.id, { linearFt: parseFloat(e.target.value) || undefined })
                }
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs border border-slate-200 rounded p-1"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
