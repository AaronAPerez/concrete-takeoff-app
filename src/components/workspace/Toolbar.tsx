'use client';

import React, { useRef } from 'react';
import { useTakeoffStore, type ToolType } from '@/stores/useTakeoffStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useEngineStore } from '@/stores/useEngineStore';
import { formatArchitecturalScale } from '@/utils/scale';
import { DomainSelector } from './DomainSelector';

const TOOLS: { id: ToolType; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'pan', label: 'Pan' },
  { id: 'area', label: 'Area' },
  { id: 'linear', label: 'Linear' },
];

export const Toolbar: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const activeTool = useTakeoffStore((state) => state.activeTool);
  const setActiveTool = useTakeoffStore((state) => state.setActiveTool);

  const scaleFactor = useBlueprintStore((state) => state.scaleFactor);
  const setScaleFactor = useBlueprintStore((state) => state.setScaleFactor);
  const currentPage = useBlueprintStore((state) => state.currentPage);
  const pageScale = useTakeoffStore((state) => state.pageScales[currentPage]);
  const calibratePage = useTakeoffStore((state) => state.calibratePage);
  const isComparing = useBlueprintStore((state) => state.isComparing);
  const comparisonUrl = useBlueprintStore((state) => state.comparisonUrl);
  const toggleComparison = useBlueprintStore((state) => state.toggleComparison);

  const engine = useEngineStore((state) => state.engine);

  const blueprintInputRef = useRef<HTMLInputElement>(null);
  const comparisonInputRef = useRef<HTMLInputElement>(null);

  const handleBlueprintFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !engine) return;
    void engine.loadBlueprint(URL.createObjectURL(file));
  };

  const handleComparisonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !engine) return;
    void engine.loadComparison(URL.createObjectURL(file));
  };

  return (
  <div className="flex flex-row items-center gap-2 bg-slate-900/95 backdrop-blur-sm border border-slate-800 rounded-lg shadow-lg p-2 text-white">
    <DomainSelector />
    <div className="grid grid-cols-4 gap-1">
      {TOOLS.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            className={`px-2 py-1.5 rounded text-xs font-semibold transition-colors ${
              activeTool === tool.id ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            {tool.label}
          </button>
        ))}
      </div>

      <div className="flex flex-row gap-1">
        <button
          onClick={() => engine?.zoomBy(1.2)}
          className="flex-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs"
        >
          Zoom +
        </button>
        <button
          onClick={() => engine?.zoomBy(1 / 1.2)}
          className="flex-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs"
        >
          Zoom -
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        <label
          className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-slate-400"
          title={
            pageScale
              ? 'Calibrated for this page (via Calibrate or Auto-Scale) — editing overrides that calibration.'
              : 'No calibration on this page yet — this is the uncalibrated default, editing sets it directly.'
          }
        >
          Scale (px/ft){pageScale && <span className="text-emerald-400 normal-case"> (calibrated)</span>}
          <input
            type="number"
            min={1}
            value={pageScale ? pageScale.pixelsPerFoot : scaleFactor}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              if (!next) return;
              // A page that's already calibrated (Calibrate tool or a
              // confirmed Auto-Scale toast) writes into pageScales — see
              // useTakeoffStore's calibratePage — which getActivePageScale
              // always prefers over this component's own scaleFactor. Writing
              // to scaleFactor here for a calibrated page would display the
              // new number but silently do nothing to real measurements, the
              // same disconnect that made this field look permanently stuck.
              if (pageScale) {
                calibratePage(currentPage, { ...pageScale, pixelsPerFoot: next });
              } else {
                setScaleFactor(next);
              }
            }}
            className={`w-26 bg-slate-800 border rounded px-1 py-0.5 text-white text-xs ${
              pageScale ? 'border-emerald-600' : 'border-slate-700'
            }`}
          />
        </label>
        {/* Raw px/ft means nothing to an estimator reading a blueprint —
            show it back in the same "N" = 1'-0"" notation the sheet itself
            prints, derived from pixelsPerFoot rather than a separately
            stored string, so it stays correct even after a manual edit
            above (which has no architectural-scale label of its own). */}
        {(() => {
          const archScale = formatArchitecturalScale(pageScale ? pageScale.pixelsPerFoot : scaleFactor);
          return archScale ? (
            <span className="text-[10px] text-slate-500 text-right">{archScale}</span>
          ) : null;
        })()}
      </div>

      <div className="border-t border-slate-800 pt-2 flex flex-col gap-1">
        <button
          onClick={() => blueprintInputRef.current?.click()}
          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-left"
        >
          Load Blueprint PDF
        </button>
        <input
          ref={blueprintInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleBlueprintFile}
        />

        <button
          onClick={() => comparisonInputRef.current?.click()}
          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-left"
        >
          Load Comparison Revision
        </button>
        <input
          ref={comparisonInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleComparisonFile}
        />

        {comparisonUrl && (
          <button
            onClick={() => toggleComparison()}
            className={`px-2 py-1 rounded text-xs text-left ${
              isComparing ? 'bg-emerald-700' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            {isComparing ? 'Hide' : 'Show'} Comparison Overlay
          </button>
        )}
      </div>
    </div>
  );
};
