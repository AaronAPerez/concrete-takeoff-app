'use client';

import React, { useState } from 'react';
import { calculateAlignment, type Point } from '@/utils/alignment';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useTakeoffStore } from '@/stores/useTakeoffStore';
import { useEngineClickCapture } from '@/hooks/useEngineClickCapture';

type Step = 'idle' | 'points_a' | 'points_b';

// Captures 2 calibration points on the base sheet and 2 on the loaded
// comparison revision, then solves for the translate/scale/rotate transform
// that overlays them (see utils/alignment.ts). Clicks arrive in world space
// (post pan/zoom) via useEngineClickCapture.
export const AlignmentWizard: React.FC = () => {
  const [step, setStep] = useState<Step>('idle');
  const [pointsA, setPointsA] = useState<Point[]>([]);
  const [pointsB, setPointsB] = useState<Point[]>([]);

  const comparisonUrl = useBlueprintStore((state) => state.comparisonUrl);
  const setActiveTool = useTakeoffStore((state) => state.setActiveTool);

  useEngineClickCapture(step !== 'idle', (point) => {
    if (step === 'points_a') {
      setPointsA((prev) => {
        const updated = [...prev, point];
        if (updated.length === 2) setStep('points_b');
        return updated;
      });
    } else if (step === 'points_b') {
      setPointsB((prev) => {
        const updated = [...prev, point];
        if (updated.length === 2) {
          const result = calculateAlignment([pointsA[0], pointsA[1]], [updated[0], updated[1]]);
          useBlueprintStore.getState().setRevisionAlignment(result);
          setStep('idle');
          setActiveTool('select');
        }
        return updated;
      });
    }
  });

  if (!comparisonUrl) return null;

  const start = () => {
    setPointsA([]);
    setPointsB([]);
    setStep('points_a');
    setActiveTool('align');
  };

  return (
    <div className="bg-slate-900 text-white p-4 rounded shadow-lg max-w-sm">
      {step === 'idle' && (
        <button
          onClick={start}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-semibold"
        >
          Auto-Align Blueprint Sheets
        </button>
      )}
      {step === 'points_a' && (
        <p className="text-xs">
          Click <strong>Point {pointsA.length + 1}</strong> on the base sheet (current page).
        </p>
      )}
      {step === 'points_b' && (
        <p className="text-xs">
          Click <strong>Point {pointsB.length + 1}</strong> on the comparison sheet.
        </p>
      )}
    </div>
  );
};
