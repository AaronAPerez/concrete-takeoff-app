'use client';

import React, { useEffect, useRef } from 'react';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import { detectPageScale } from '@/canvas/pdfRenderer';

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
      className="absolute top-6 right-6 flex items-center gap-3 bg-slate-950/95 border-2 border-violet-500 text-white p-4 rounded-xl z-50"
      style={{ boxShadow: '0 0 0 1px rgba(139,92,246,0.25), 0 0 24px rgba(139,92,246,0.35), 0 20px 40px rgba(0,0,0,0.6)' }}
    >
      <div className="text-sm">
        <span className="text-violet-400 font-bold">Auto-Scale:</span> Detected a scale of{' '}
        <span className="font-semibold text-white">{pendingScaleConfig.label}</span> on Page{' '}
        {pendingScaleConfig.pageNumber} — highlighted on the sheet. Use this?
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
