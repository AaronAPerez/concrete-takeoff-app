"use client";

import React from "react";
import type { TakeoffChecklistItem } from "@/types/takeoff";
import { useTakeoffStore } from "@/stores/useTakeoffStore";
import { getDomainById } from '@/domains/registry';

interface ChecklistItemProps {
  item: TakeoffChecklistItem;
  isSelected: boolean;
}

export const ChecklistItem: React.FC<ChecklistItemProps> = ({
  item,
  isSelected,
}) => {
  const selectTakeoff = useTakeoffStore((state) => state.selectTakeoff);
  const updateItemDimensions = useTakeoffStore(
    (state) => state.updateItemDimensions,
  );
  const deleteTakeoff = useTakeoffStore((state) => state.deleteTakeoff);
  const activeDomain = useTakeoffStore((state) => state.activeDomain);

  // Looks up which dimension fields this item's category needs from the
  // active domain config, instead of a hardcoded per-category JSX block.
const categoryConfig = getDomainById(item.domainId).categories.find((c) => c.id === item.category);

  return (
    <div
      onClick={() => selectTakeoff(item.id)}
      className={`p-4 cursor-pointer transition-colors ${
        isSelected
          ? "bg-blue-50/70 border-l-4 border-blue-500"
          : "hover:bg-slate-50"
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
          {item.category}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-blue-600">
            {item.calculatedQuantity
              ? `${item.calculatedQuantity.value} ${item.calculatedQuantity.unit}`
              : "--"}
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
        {categoryConfig?.dimensionFields.map((field) => (
          <div key={field.key}>
            <label className="text-[10px] uppercase font-bold text-slate-400">
              {field.label} ({field.unit})
            </label>
            <input
              type="number"
              value={item.dimensions[field.key] ?? ""}
              onChange={(e) =>
                updateItemDimensions(item.id, {
                  [field.key]: parseFloat(e.target.value) || undefined,
                })
              }
              onClick={(e) => e.stopPropagation()}
              className="w-full text-xs border border-slate-200 rounded p-1"
            />
          </div>
        ))}
      </div>
    </div>
  );
};
