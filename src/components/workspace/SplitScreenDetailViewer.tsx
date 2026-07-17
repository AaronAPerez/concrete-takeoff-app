'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { renderPdfPageToCanvas, resolveSheetPageNumber, findDetailAnchorPoint } from '@/canvas/pdfRenderer';
import type { Hotspot } from '@/types/takeoff';

const PREVIEW_SCALE = 3; // High magnification — this is a zoomed detail crop, not the full sheet.
const PREVIEW_SIZE = 360; // Square crop, in CSS px.

type Status = 'loading' | 'ready' | 'not-found';

// Floating picture-in-picture preview opened by clicking a cross-reference
// hotspot (e.g. "1/S4.0"): resolves the target sheet to a page number,
// locates the "DETAIL N" callout on it, and crops a high-res render centered
// on that point — so the estimator doesn't have to flip pages to see it.
export function SplitScreenDetailViewer({
  hotspot,
  onClose
}: {
  hotspot: Hotspot;
  onClose: () => void;
}) {
  const blueprintUrl = useBlueprintStore((s) => s.blueprintUrl);
  const setPage = useBlueprintStore((s) => s.setPage);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [resolvedPage, setResolvedPage] = useState<number | null>(null);

  useEffect(() => {
    if (!blueprintUrl) return;
    let cancelled = false;
    setStatus('loading');
    setResolvedPage(null);

    (async () => {
      const pageNumber = await resolveSheetPageNumber(blueprintUrl, hotspot.targetSheet);
      if (cancelled) return;
      if (pageNumber === null) {
        setStatus('not-found');
        return;
      }
      setResolvedPage(pageNumber);

      const [anchor, fullBitmap] = await Promise.all([
        findDetailAnchorPoint(blueprintUrl, pageNumber, hotspot.targetDetail, PREVIEW_SCALE),
        renderPdfPageToCanvas(blueprintUrl, pageNumber, PREVIEW_SCALE)
      ]);
      if (cancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = PREVIEW_SIZE;
      canvas.height = PREVIEW_SIZE;

      // Fall back to centering on the page itself if the "DETAIL N" heading
      // couldn't be found (still useful — just not pre-zoomed to the right spot).
      const center = anchor ?? { x: fullBitmap.width / 2, y: fullBitmap.height / 2 };
      const srcX = Math.max(0, Math.min(fullBitmap.width - PREVIEW_SIZE, center.x - PREVIEW_SIZE / 2));
      const srcY = Math.max(0, Math.min(fullBitmap.height - PREVIEW_SIZE, center.y - PREVIEW_SIZE / 2));

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      ctx.drawImage(fullBitmap, srcX, srcY, PREVIEW_SIZE, PREVIEW_SIZE, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      setStatus('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [blueprintUrl, hotspot]);

  return (
    <div className="absolute right-4 top-4 border-2 border-slate-700 bg-slate-900 rounded-xl overflow-hidden shadow-2xl z-40 w-[360px]">
      <div className="bg-slate-800 px-3 py-1.5 flex items-center justify-between text-xs text-slate-300 border-b border-slate-700">
        <span>
          Detail {hotspot.targetDetail} on {hotspot.targetSheet}
        </span>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition" aria-label="Close">
          ✕
        </button>
      </div>

      {status === 'not-found' ? (
        <p className="p-4 text-xs text-slate-400">
          Couldn&apos;t find a sheet labeled &quot;{hotspot.targetSheet}&quot; in this document.
        </p>
      ) : (
        <canvas ref={canvasRef} style={{ aspectRatio: '1 / 1' }} className="bg-white block w-full h-auto" />
      )}

      {status === 'loading' && <p className="px-3 py-2 text-[11px] text-slate-500">Loading…</p>}

      {status === 'ready' && resolvedPage !== null && (
        <button
          onClick={() => setPage(resolvedPage)}
          className="w-full px-3 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border-t border-slate-700 transition"
        >
          Jump to Page {resolvedPage} →
        </button>
      )}
    </div>
  );
}
