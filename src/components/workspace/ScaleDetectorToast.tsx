'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import { detectPageScale, renderPageRegionToCanvas, PDF_RENDER_SCALE, OCR_RENDER_SCALE } from '@/canvas/pdfRenderer';
import type { BoundingBox } from '@/types/takeoff';

// Auto-runs scale detection whenever a page loads (skipping pages that are
// already calibrated, or that the user already dismissed this session) and
// surfaces a non-blocking confirmation toast — the estimator still approves
// before it's written into pageScales, so a regex false-positive can't
// silently corrupt a page's measurements.
export function ScaleDetectorToast() {
  const blueprintUrl = useBlueprintStore((s) => s.blueprintUrl);
  const currentPage = useBlueprintStore((s) => s.currentPage);
  const pageScales = useTakeoffStore((s) => s.pageScales);
  const pendingScaleConfig = useTakeoffStore((s) => s.pendingScaleConfig);
  const setPendingScale = useTakeoffStore((s) => s.setPendingScale);
  const confirmPendingScale = useTakeoffStore((s) => s.confirmPendingScale);

  // Pages already prompted (confirmed or dismissed) this session, keyed by
  // `${url}|${page}` — component-local, not store state, since nothing else
  // in the app needs to know "did we already nag about this page."
  const handledPagesRef = useRef<Set<string>>(new Set());

  // The matched scale text (e.g. "3/32" = 1'-0"") is real but tiny on the
  // actual sheet — legible in the toast's own wording, but the highlighted
  // box on the page itself is easy to lose without zooming in first. Render
  // a magnified crop of just that region, same renderPageRegionToCanvas/
  // OCR_RENDER_SCALE approach OcrTableViewer already uses for schedule
  // tables, so the user can see the source text at readable size right in
  // the toast instead of hunting for a small highlight on the full sheet.
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pendingScaleConfig || !blueprintUrl) {
        if (!cancelled) setPreviewSrc(null);
        return;
      }
      // Pad the text's own tight match box so the crop shows a little
      // surrounding context, not just the bare glyphs edge-to-edge.
      const box = pendingScaleConfig.boundingBox;
      const pad = Math.max(box.height, 10) * 1.5;
      const region: BoundingBox = {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: box.width + pad * 2,
        height: box.height + pad * 2
      };
      try {
        const canvas = await renderPageRegionToCanvas(
          blueprintUrl,
          pendingScaleConfig.pageNumber,
          region,
          PDF_RENDER_SCALE,
          OCR_RENDER_SCALE
        );
        if (!cancelled) setPreviewSrc(canvas.toDataURL());
      } catch (err) {
        console.error('ScaleDetectorToast preview render failed:', err);
        if (!cancelled) setPreviewSrc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingScaleConfig, blueprintUrl]);

  useEffect(() => {
    if (!blueprintUrl) return;

    const key = `${blueprintUrl}|${currentPage}`;
    if (handledPagesRef.current.has(key)) return;
    if (pageScales[currentPage]?.isCalibrated) return;

    let cancelled = false;

    (async () => {
      const detected = await detectPageScale(blueprintUrl, currentPage);
      if (cancelled || !detected) return;

      handledPagesRef.current.add(key);
      setPendingScale({
        pageNumber: currentPage,
        pixelsPerFoot: detected.pixelsPerFoot,
        label: detected.label,
        boundingBox: detected.boundingBox
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [blueprintUrl, currentPage, pageScales, setPendingScale]);

  if (!pendingScaleConfig) return null;

  const dismiss = () => {
    handledPagesRef.current.add(`${blueprintUrl}|${pendingScaleConfig.pageNumber}`);
    setPendingScale(null);
  };

  return (
    <div
      className="absolute top-6 right-6 flex items-center gap-3 bg-slate-950/95 border-2 border-violet-500 text-white p-4 rounded-xl z-50 max-w-xl"
      style={{ boxShadow: '0 0 0 1px rgba(139,92,246,0.25), 0 0 24px rgba(139,92,246,0.35), 0 20px 40px rgba(0,0,0,0.6)' }}
    >
      {previewSrc && (
        <img
          src={previewSrc}
          alt={`Zoomed crop of the detected scale text: ${pendingScaleConfig.label}`}
          className="h-16 w-auto rounded border border-violet-400/60 bg-white flex-shrink-0"
        />
      )}
      <div className="text-sm">
        <span className="text-violet-400 font-bold">Auto-Scale:</span> Detected a scale of{' '}
        <span className="font-semibold text-white">{pendingScaleConfig.label}</span> on Page{' '}
        {pendingScaleConfig.pageNumber} — highlighted on the sheet, and zoomed in at left. Use this?
      </div>
      <div className="flex gap-2">
        <button
          onClick={dismiss}
          className="px-2.5 py-1 text-xs text-slate-400 hover:text-white transition"
        >
          Cancel
        </button>
        <button
          onClick={confirmPendingScale}
          className="px-3.5 py-1 text-xs bg-violet-600 hover:bg-violet-500 rounded-lg font-bold transition"
        >
          Click to Confirm
        </button>
      </div>
    </div>
  );
}
