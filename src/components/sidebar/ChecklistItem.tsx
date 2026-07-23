"use client";

import React from "react";
import type { TakeoffChecklistItem } from "@/types/takeoff";
import { useTakeoffStore } from "@/stores/useTakeoffStore";
import { getDomainById } from '@/domains/registry';
import { formatCurrency } from '@/utils/impCostCalculator';
import { resolveWallElevations } from '@/utils/panelCalculator';
import { DEFAULT_PANEL_WIDTH_FT } from '@/utils/panelSizes';
import { formatFeetInches } from '@/utils/geometry';

interface ChecklistItemProps {
  item: TakeoffChecklistItem;
  isSelected: boolean;
}

// Rebuilds one of the three parallel per-edge arrays (edgeThicknesses,
// edgeOpeningWidthFt, edgeOpeningHeightFt) from its current *effective*
// values (falling back per-index for any edge not yet customized) before
// overwriting just the one index being edited — so editing row 3 doesn't
// silently reset rows 1/2 back to their fallback if they'd never been
// individually touched before.
function materializeEdgeArray(
  edgeLengthsFt: number[] | undefined,
  currentArray: number[] | undefined,
  fallback: (index: number) => number
): number[] {
  return (edgeLengthsFt ?? []).map((_, i) => currentArray?.[i] ?? fallback(i));
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

  // Real cold-storage panel schedules quantify each traced wall run
  // ("elevation") separately — COOLER-ELEV1/ELEV2/ELEV3, not one blended
  // room total — and often mix panel thicknesses across a single room's
  // walls (e.g. one side backs an existing structure and needs no new
  // panel at all). This table is that breakdown: one row per polygon edge,
  // length read straight off the trace, thickness editable per row. Only
  // Wall Panel has real per-edge meaning (a ceiling is one continuous
  // plane, not a set of runs), so this is a direct category check rather
  // than a generic dimensionFields entry.
  const elevations = item.category === 'Wall Panel' ? resolveWallElevations(item.dimensions) : [];

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
                  const patch: Record<string, unknown> = { [field.key]: parsed };
                  // e.g. Room Type -> Panel Thickness (see ROOM_TYPE_FIELD in
                  // domains/imp.ts) — never overwrite a field the user already
                  // typed a value into directly (see the input branch below).
                  if (field.autoFill && raw !== "") {
                    const touched = item.dimensions.touchedFields ?? [];
                    const autoFilled = field.autoFill(raw);
                    for (const [key, value] of Object.entries(autoFilled ?? {})) {
                      if (!touched.includes(key as keyof TakeoffChecklistItem["dimensions"])) {
                        patch[key] = value;
                      }
                    }
                  }
                  updateItemDimensions(item.id, patch as Partial<TakeoffChecklistItem["dimensions"]>);
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
                onChange={(e) => {
                  const touched = item.dimensions.touchedFields ?? [];
                  updateItemDimensions(item.id, {
                    [field.key]: parseFloat(e.target.value) || undefined,
                    // A field the user typed into directly never gets
                    // silently overwritten by another field's autoFill later.
                    touchedFields: touched.includes(field.key) ? touched : [...touched, field.key],
                  });
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs text-slate-900 border border-slate-200 rounded p-1"
              />
            )}
          </div>
        ))}
      </div>

      {elevations.length > 0 && (
        <div className="mt-3 pt-2 border-t border-slate-100">
          <p className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">
            Elevations
          </p>
          <div className="grid grid-cols-[2.2rem_1fr_2.6rem_2.8rem_2.8rem_3rem] gap-x-1.5 gap-y-1 items-center">
            <span className="text-[10px] uppercase text-slate-400">Elev</span>
            <span className="text-[10px] uppercase text-slate-400">Length</span>
            <span className="text-[10px] uppercase text-slate-400">Thick</span>
            <span className="text-[10px] uppercase text-slate-400" title="Door/window opening width — 0 means no opening">
              Open W
            </span>
            <span className="text-[10px] uppercase text-slate-400" title="Door/window opening height — ignored if width is 0">
              Open H
            </span>
            <span className="text-[10px] uppercase text-slate-400">Qty</span>
            {elevations.map((elev) => {
              // Raw panel count for this run (openings already netted into
              // effectiveLengthFt — see resolveWallElevations), no waste
              // factor — same convention the real schedule's own Qty
              // column uses. The authoritative, waste-adjusted total is
              // the badge at the top of this item (itemDomain.
              // calculateQuantity), which sums every excluded (thickness
              // 0) edge out and applies waste per edge — this is a quick
              // per-row reference, not a second source of truth.
              const qty = elev.thicknessInches > 0 ? Math.ceil(elev.effectiveLengthFt / DEFAULT_PANEL_WIDTH_FT) : 0;
              return (
                <React.Fragment key={elev.index}>
                  <span className="text-xs text-slate-600">{elev.index + 1}</span>
                  <span className="text-xs text-slate-500 tabular-nums leading-tight">
                    {elev.lengthFt.toFixed(2)} FT
                    <br />
                    <span className="text-[10px] text-slate-400">{formatFeetInches(elev.lengthFt)}</span>
                  </span>
                  <input
                    type="number"
                    value={elev.thicknessInches}
                    title="Panel thickness for this wall run — set to 0 to exclude it (e.g. an existing/shared wall that gets no new panel)"
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      const value = Number.isFinite(raw) && raw >= 0 ? raw : 0;
                      const next = materializeEdgeArray(
                        item.dimensions.edgeLengthsFt,
                        item.dimensions.edgeThicknesses,
                        () => item.dimensions.thicknessInches ?? 0
                      );
                      next[elev.index] = value;
                      updateItemDimensions(item.id, { edgeThicknesses: next });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full text-xs text-slate-900 border border-slate-200 rounded p-1"
                  />
                  <input
                    type="number"
                    value={elev.openingWidthFt}
                    title="Door/window opening width on this wall run, in feet — 0 means no opening"
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      const value = Number.isFinite(raw) && raw >= 0 ? raw : 0;
                      const next = materializeEdgeArray(item.dimensions.edgeLengthsFt, item.dimensions.edgeOpeningWidthFt, () => 0);
                      next[elev.index] = value;
                      updateItemDimensions(item.id, { edgeOpeningWidthFt: next });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full text-xs text-slate-900 border border-slate-200 rounded p-1"
                  />
                  <input
                    type="number"
                    value={elev.openingHeightFt}
                    title="Door/window opening height on this wall run, in feet — ignored unless a width is also set"
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      const value = Number.isFinite(raw) && raw >= 0 ? raw : 0;
                      const next = materializeEdgeArray(item.dimensions.edgeLengthsFt, item.dimensions.edgeOpeningHeightFt, () => 0);
                      next[elev.index] = value;
                      updateItemDimensions(item.id, { edgeOpeningHeightFt: next });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full text-xs text-slate-900 border border-slate-200 rounded p-1"
                  />
                  <span className="text-xs text-slate-500 tabular-nums">
                    {elev.thicknessInches > 0 ? `${qty} EA` : 'excluded'}
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

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