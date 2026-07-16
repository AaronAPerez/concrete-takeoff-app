'use client';

import React, { useRef } from 'react';
import { useTakeoffStore, type ToolType } from '@/stores/useTakeoffStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useEngineStore } from '@/stores/useEngineStore';

const TOOLS: { id: ToolType; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'pan', label: 'Pan' },
  { id: 'area', label: 'Area' },
  { id: 'linear', label: 'Linear' },
];

export const Toolbar: React.FC = () => {
  const activeTool = useTakeoffStore((state) => state.activeTool);
  const setActiveTool = useTakeoffStore((state) => state.setActiveTool);

  const scaleFactor = useBlueprintStore((state) => state.scaleFactor);
  const setScaleFactor = useBlueprintStore((state) => state.setScaleFactor);
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
    <div className="flex flex-row gap-2 bg-slate-900/95 backdrop-blur-sm border border-slate-800 rounded-lg shadow-lg p-2 text-white w-full h-10">
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

      <label className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-slate-400">
        Scale (px/ft)
        <input
          type="number"
          min={1}
          value={scaleFactor}
          onChange={(e) => setScaleFactor(parseFloat(e.target.value) || scaleFactor)}
          className="w-16 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-white text-xs"
        />
      </label>

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
