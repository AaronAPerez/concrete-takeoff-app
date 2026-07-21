'use client';

import React, { useEffect } from 'react';
import { useCanvas } from '@/hooks/useCanvas';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useTakeoffStore } from '@/stores/useTakeoffStore';

export const CanvasContainer: React.FC = () => {
  const { canvasRef, engineRef } = useCanvas();
  const selectedTakeoffId = useTakeoffStore((state) => state.selectedTakeoffId);

  // When a checklist item is selected in the sidebar, jump the camera to its
  // page and bounding box, then flash it so it's easy to spot on the sheet.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !selectedTakeoffId) return;

    const item = useTakeoffStore.getState().takeoffs.find((t) => t.id === selectedTakeoffId);
    if (!item) return;

    if (useBlueprintStore.getState().currentPage !== item.pageNumber) {
      useBlueprintStore.getState().setPage(item.pageNumber);
    }

    const { x, y, width, height } = item.boundingBox;
    // Deliberately omit `zoom` — panAndZoomTo defaults to the viewport's
    // current zoom (see Viewport.panAndZoomTo's `options.zoom ?? this.zoom`).
    // This used to hardcode `zoom: 2`, but saveCurrentDraft auto-selects
    // every newly finalized trace (not just manual sidebar clicks), so that
    // silently forced the camera to 2x after the very first trace in any
    // session and left it there — halving every subsequent screenToWorld
    // conversion (screen px / zoom) and understating every later area by 4x.
    // Panning/centering without forcing zoom keeps the "jump to what you
    // selected" UX without corrupting later measurements.
    engine.panAndZoomTo(x + width / 2, y + height / 2, { duration: 400 });
    engine.highlightElement(item.id);
  }, [selectedTakeoffId, engineRef]);
  

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      {/*
        The canvas is explicitly set to block, filling 100% of the parent.
        The Engine class handles coordinate mapping updates under the hood.
      */}
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair select-none touch-none"
      />

      {/* Visual Canvas State Overlay Badge */}
      <div className="absolute bottom-4 left-4 bg-[#000000]/90 backdrop-blur-sm border border-slate-800 text-[10px] text-emerald-400 font-mono px-3 py-1.5 rounded-md shadow-md select-none pointer-events-none flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        RENDER_LOOP_ACTIVE (2D_CONTEXT)
      </div>
    </div>
  );
};
