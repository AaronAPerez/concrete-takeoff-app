"use client";

import React from "react";
import type { TakeoffChecklistItem } from "@/types/takeoff";
import { useTakeoffStore } from "@/stores/useTakeoffStore";
import { getDomainById } from '@/domains/registry';
import { formatCurrency } from '@/utils/impCostCalculator';

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
  const updateItemCategory = useTakeoffStore((state) => state.updateItemCategory);
  const deleteTakeoff = useTakeoffStore((state) => state.deleteTakeoff);

  // Looks up which dimension fields this item's category needs from the
  // active domain config, instead of a hardcoded per-category JSX block.
  const itemDomain = getDomainById(item.domainId);
  const categoryConfig = itemDomain.categories.find((c) => c.id === item.category);

  // Only offer categories that share the current one's swapGroup (e.g. IMP
  // Wall Panel <-> Ceiling Panel, both derived from the same traced room
  // polygon). Categories with no swapGroup — or whose group has no sibling
  // in this domain — stay a plain, non-editable badge: switching into them
  // needs unrelated fields filled in by hand, so it's not a one-click swap.
  const swapTargets = categoryConfig?.swapGroup
    ? itemDomain.categories.filter((c) => c.swapGroup === categoryConfig.swapGroup)
    : [categoryConfig ?? { id: item.category, dimensionFields: [] }];
  const canSwapCategory = swapTargets.length > 1;

  // Computed live rather than cached in the store (unlike calculatedQuantity)
  // — it's a cheap pure lookup against static assembly data, and keeping it
  // out of the store avoids yet another place that needs recalculating on
  // every dimension/category change.
  const costBreakdown = itemDomain.calculateCost?.(item);

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
        {canSwapCategory ? (
          <select
            value={item.category}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateItemCategory(item.id, e.target.value)}
            aria-label="Item category"
            className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border-0 cursor-pointer"
          >
            {swapTargets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            {item.category}
          </span>
        )}
        <div className="flex items-center gap-2">
          {/* Same SF/LF the canvas label shows (see Engine.ts's drawTakeoffBox)
              — kept side by side with the quantity so the two are easy to
              cross-check against each other at a glance. */}
          {(item.dimensions.areaSqFt || item.dimensions.linearFt) && (
            <span className="text-xs font-medium text-slate-500">
              {item.dimensions.areaSqFt
                ? `${item.dimensions.areaSqFt.toFixed(2)} SF`
                : `${item.dimensions.linearFt!.toFixed(2)} LF`}
            </span>
          )}
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
              {field.label}{field.unit ? ` (${field.unit})` : ""}
            </label>
            {field.type === "select" ? (
              <select
                value={(item.dimensions[field.key] as string | number | undefined) ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  // Select fields store whatever type their options represent —
                  // roomType is a string ('freezer'), concreteMixPsi is a number
                  // (3000). The DOM always hands back a string; coerce purely
                  // numeric values back to number so lookups like
                  // getConcreteMixRate's `r.psi === psi` (strict equality)
                  // don't silently fail against a stringified "3000".
                  const parsed: string | number | undefined =
                    raw === "" ? undefined : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
                  updateItemDimensions(item.id, {
                    [field.key]: parsed,
                  } as Partial<TakeoffChecklistItem["dimensions"]>);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs text-slate-900 border border-slate-200 rounded p-1"
              >
                <option value="">--</option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                value={(item.dimensions[field.key] as number | undefined) ?? ""}
                onChange={(e) =>
                  updateItemDimensions(item.id, {
                    [field.key]: parseFloat(e.target.value) || undefined,
                  })
                }
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs text-slate-900 border border-slate-200 rounded p-1"
              />
            )}
          </div>
        ))}
      </div>

      {costBreakdown && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            Material {formatCurrency(costBreakdown.materialCost)} + Labor {formatCurrency(costBreakdown.laborCost)}
          </span>
          <span className="font-semibold text-slate-700">{formatCurrency(costBreakdown.totalCost)}</span>
        </div>
      )}
    </div>
  );
};