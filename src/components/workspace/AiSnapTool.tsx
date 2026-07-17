'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useEngineStore } from '@/stores/useEngineStore';
import { useEngineClickCapture } from '@/hooks/useEngineClickCapture';
import { useAnimationFrame } from '@/hooks/useAnimationFrame';
import { useSegmentationEngine } from '@/hooks/useSegmentationEngine';
import { ToolbarPopoverButton } from './ToolbarPopoverButton';
import type { MaskPreview } from '@/ai/segmentationEngine';

const PREVIEW_COLOR: [number, number, number] = [56, 189, 248]; // sky-400 — distinct from every other accent already in use

function buildPreviewCanvas(preview: MaskPreview): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = preview.gridSize;
  canvas.height = preview.gridSize;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(preview.gridSize, preview.gridSize);

  for (let i = 0; i < preview.grid.length; i++) {
    const idx = i * 4;
    if (preview.grid[i] > 0) {
      imageData.data[idx] = PREVIEW_COLOR[0];
      imageData.data[idx + 1] = PREVIEW_COLOR[1];
      imageData.data[idx + 2] = PREVIEW_COLOR[2];
      imageData.data[idx + 3] = 130; // ~50% opacity
    } else {
      imageData.data[idx + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// AI-assisted tracing: runs SlimSAM entirely client-side via Transformers.js
// (see src/ai/segmentationEngine.ts). Hovering the sheet while active shows
// a live mask preview; clicking commits the accurate outline as a real Slab
// takeoff through the same saveCurrentDraft path manual area drawing uses.
export function AiSnapTool() {
  const blueprintUrl = useBlueprintStore((s) => s.blueprintUrl);
  const currentPage = useBlueprintStore((s) => s.currentPage);
  const activeTool = useTakeoffStore((s) => s.activeTool);
  const setActiveTool = useTakeoffStore((s) => s.setActiveTool);
  const setDraftPoints = useTakeoffStore((s) => s.setDraftPoints);
  const saveCurrentDraft = useTakeoffStore((s) => s.saveCurrentDraft);
  const engine = useEngineStore((s) => s.engine);

  const seg = useSegmentationEngine();
  const [open, setOpen] = useState(false);
  const loadedPageKeyRef = useRef<string | null>(null);
  const isQueryingRef = useRef(false);

  const isActive = activeTool === 'magic';

  const ensureImageLoaded = useCallback(async () => {
    if (!engine || !blueprintUrl) return;
    const key = `${blueprintUrl}|${currentPage}`;
    if (loadedPageKeyRef.current === key) return;

    // Page navigation is itself async (renderPdfPageToCanvas) — wait for
    // whichever bitmap load is in flight rather than racing it.
    const bitmap = await engine.waitForBlueprintBitmap();
    if (!bitmap) return;

    loadedPageKeyRef.current = key;
    await seg.loadImage(bitmap);
  }, [engine, blueprintUrl, currentPage, seg]);

  // Keep the embeddings in sync with whatever page is on screen while this
  // tool stays active (e.g. the user flips pages without leaving AI Snap mode).
  useEffect(() => {
    if (isActive) void ensureImageLoaded();
  }, [isActive, ensureImageLoaded]);

  const enable = () => {
    setActiveTool('magic');
    void ensureImageLoaded();
  };

  const disable = () => {
    setActiveTool('select');
    engine?.setSegmentationPreview(null);
  };

  // Hover-preview loop — only while active and an image is ready. Skips a
  // frame if a previous query is still in flight (the "debounce hover
  // triggers" guard) rather than piling up overlapping model calls.
  useAnimationFrame(() => {
    if (!engine || !seg.hasImage || isQueryingRef.current) return;

    const bitmap = engine.getBlueprintBitmap();
    if (!bitmap) return;

    const { x, y } = engine.getCurrentWorldMousePos();
    if (x < 0 || y < 0 || x > bitmap.width || y > bitmap.height) {
      engine.setSegmentationPreview(null);
      return;
    }

    isQueryingRef.current = true;
    seg
      .previewAt(x, y)
      .then((preview) => {
        // previewAt already filters out low-confidence and degenerate
        // (near-whole-page) candidates — see SegmentationEngine.selectMaskIndex.
        if (!preview) {
          engine.setSegmentationPreview(null);
          return;
        }
        engine.setSegmentationPreview(buildPreviewCanvas(preview));
      })
      .catch((err) => console.error('AI Snap preview failed:', err))
      .finally(() => {
        isQueryingRef.current = false;
      });
  }, isActive);

  // Click-to-commit: re-runs the query at full accuracy (post_process_masks)
  // and traces its outline into a real takeoff.
  useEngineClickCapture(isActive, (point) => {
    if (!seg.hasImage) return;

    seg
      .commitAt(point.x, point.y)
      .then((result) => {
        if (!result) return;
        setDraftPoints(result.points);
        saveCurrentDraft(
          'project-1',
          currentPage,
          'area',
          'Slab',
          '4" SOG Concrete Slab',
          4,
          `AI-traced outline (${Math.round(result.score * 100)}% confidence)`
        );
        engine?.setSegmentationPreview(null);
      })
      .catch((err) => console.error('AI Snap commit failed:', err));
  });

  if (!blueprintUrl) return null;

  const statusText = seg.isModelLoading
    ? 'Loading AI model (~32MB, cached after first use)…'
    : seg.isImageLoading
      ? 'Analyzing this page…'
      : seg.error
        ? seg.error
        : isActive && seg.hasImage
          ? 'Hover the sheet to preview a shape, click to save it.'
          : 'Runs entirely in your browser — no upload, no server.';

  return (
    <ToolbarPopoverButton
      label="AI Snap"
      description="Hover a slab/room outline for an AI-suggested trace; click to save it as a takeoff. Runs fully client-side (Transformers.js + SlimSAM)."
      variant={isActive ? 'open' : 'default'}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      panel={
        <div className="flex flex-col gap-2 bg-slate-900/95 backdrop-blur-sm border border-slate-800 rounded-lg shadow-lg p-3 text-white w-64">
          <p className="text-xs font-semibold">AI-Assisted Tracing</p>
          <p className="text-[11px] text-slate-400">{statusText}</p>

          <button
            onClick={isActive ? disable : enable}
            disabled={seg.isModelLoading || seg.isImageLoading}
            className={`w-full py-1.5 rounded text-xs font-semibold disabled:opacity-50 ${
              isActive ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {isActive ? 'Stop AI Snap' : 'Start AI Snap'}
          </button>
        </div>
      }
    />
  );
}
