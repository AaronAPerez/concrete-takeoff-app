'use client';

import React, { useState } from 'react';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import { ToolbarPopoverButton } from './ToolbarPopoverButton';
import { extractConcreteHighlights } from '@/canvas/pdfRenderer';

// Scans the current page's vector text layer (not OCR — only text that's
// actually selectable in the source PDF) for concrete-related keywords and
// drops each hit into the checklist as a 'pending' candidate. Rendering is
// handled entirely by the existing takeoff pipeline (Engine.drawTakeoffBox),
// which already draws a dashed outline for 'pending' items.
export function VectorExtractionAssistant() {
  const blueprintUrl = useBlueprintStore((s) => s.blueprintUrl);
  const currentPage = useBlueprintStore((s) => s.currentPage);
  const addExtractedTakeoffs = useTakeoffStore((s) => s.addExtractedTakeoffs);

  const [open, setOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  if (!blueprintUrl) return null;

  const scan = async () => {
    setIsScanning(true);
    setLastResult(null);
    try {
      const hits = await extractConcreteHighlights(blueprintUrl, currentPage);
      addExtractedTakeoffs(hits);
      setLastResult(
        hits.length > 0
          ? `Found ${hits.length} concrete callout${hits.length === 1 ? '' : 's'} on Page ${currentPage}.`
          : `No concrete keywords found on Page ${currentPage}.`
      );
    } catch (err) {
      console.error('Vector text extraction failed:', err);
      setLastResult('Scan failed — see console for details.');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <ToolbarPopoverButton
      label="Scan Text"
      description="Finds slab/footing/grade-beam callouts already embedded as text in this sheet's PDF."
      variant={isScanning ? 'busy' : open ? 'open' : 'default'}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      panel={
        <div className="flex flex-col gap-2 bg-slate-900/95 backdrop-blur-sm border border-slate-800 rounded-lg shadow-lg p-3 text-white w-56">
          <p className="text-xs font-semibold">Vector Text Scan</p>

          <button
            onClick={scan}
            disabled={isScanning}
            className={`w-full py-1.5 rounded text-xs font-semibold ${
              isScanning ? 'bg-amber-500 text-slate-950' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {isScanning ? 'Scanning…' : `Scan Page ${currentPage} for Callouts`}
          </button>

          {lastResult && <p className="text-[11px] text-emerald-400">{lastResult}</p>}
        </div>
      }
    />
  );
}
