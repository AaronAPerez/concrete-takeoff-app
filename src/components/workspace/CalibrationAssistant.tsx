'use client';

import React, { useState } from 'react';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useEngineClickCapture } from '@/hooks/useEngineClickCapture';
import { calculateDistance } from '@/utils/geometry';
import type { Point } from '@/types/takeoff';

// Captures 2 clicks on the canvas at a known real-world distance apart and
// solves for that page's pixels-per-foot scale. Clicks arrive in world space
// (post pan/zoom) via useEngineClickCapture, matching the coordinate space
// draftPoints are drawn in.
export function CalibrationAssistant() {
  const blueprintUrl = useBlueprintStore((s) => s.blueprintUrl);
  const setActiveTool = useTakeoffStore((s) => s.setActiveTool);
  const calibratePage = useTakeoffStore((s) => s.calibratePage);

  const [isMeasuring, setIsMeasuring] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [knownLength, setKnownLength] = useState(10); // default to 10ft
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEngineClickCapture(isMeasuring, (point) => {
    setStartPoint((prev) => {
      if (!prev) return point;

      // Second click completes the measurement
      const distanceInPixels = calculateDistance(prev, point);
      const pixelsPerFoot = distanceInPixels / knownLength;
      const page = useBlueprintStore.getState().currentPage;

      calibratePage(page, {
        pixelsPerFoot,
        unit: 'ft',
        isCalibrated: true,
        rawViewportWidth: window.innerWidth,
        rawViewportHeight: window.innerHeight
      });

      setLastResult(`Scale calibrated to ${pixelsPerFoot.toFixed(2)} px/ft on Page ${page}.`);
      setIsMeasuring(false);
      setActiveTool('select');
      return null;
    });
  });

  if (!blueprintUrl) return null;

  const start = () => {
    setLastResult(null);
    setStartPoint(null);
    setIsMeasuring(true);
    setActiveTool('calibrate');
  };

  return (
    <div className="flex flex-col gap-2 bg-slate-900/95 backdrop-blur-sm border border-slate-800 rounded-lg shadow-lg p-3 text-white w-56">
      <p className="text-xs font-semibold">Sheet Calibration</p>
      <p className="text-[11px] text-slate-400">
        Calibrate page scales individually to keep your area and volume measurements perfectly accurate.
      </p>

      <label className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-slate-400">
        Known Distance (ft)
        <input
          type="number"
          min={0.1}
          step={0.1}
          value={knownLength}
          onChange={(e) => setKnownLength(Number(e.target.value) || knownLength)}
          disabled={isMeasuring}
          className="w-16 bg-slate-900 border border-slate-700 text-xs rounded px-1.5 py-1 disabled:opacity-50"
        />
      </label>

      <button
        onClick={start}
        disabled={isMeasuring}
        className={`w-full py-1.5 rounded text-xs font-semibold ${
          isMeasuring ? 'bg-amber-500 text-slate-950' : 'bg-blue-600 hover:bg-blue-500'
        }`}
      >
        {isMeasuring
          ? `Click ${startPoint ? 'end' : 'start'} point on canvas...`
          : 'Calibrate Scale'}
      </button>

      {lastResult && <p className="text-[11px] text-emerald-400">{lastResult}</p>}
    </div>
  );
}
