'use client';

import React, { useEffect, useState } from 'react';
import { useEngineStore } from '@/stores/useEngineStore';
import { SplitScreenDetailViewer } from './SplitScreenDetailViewer';
import type { Hotspot } from '@/types/takeoff';

// Bridges Engine's always-on hotspot click channel (Engine.setHotspotClickListener)
// to the split-screen detail viewer. Kept separate from useEngineClickCapture
// since hotspot clicks aren't gated behind an "active tool" the way
// calibration/alignment point-capture is — they're always live in select mode.
export function DetailCrossReference() {
  const engine = useEngineStore((s) => s.engine);
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null);

  useEffect(() => {
    if (!engine) return;
    engine.setHotspotClickListener(setActiveHotspot);
    return () => engine.setHotspotClickListener(null);
  }, [engine]);

  if (!activeHotspot) return null;

  return <SplitScreenDetailViewer hotspot={activeHotspot} onClose={() => setActiveHotspot(null)} />;
}
