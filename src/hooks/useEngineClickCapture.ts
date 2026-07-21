import { useEffect } from 'react';
import { useEngineStore } from '@/stores/useEngineStore';
import type { Point } from '@/types/takeoff';

// Subscribes onPoint to the canvas engine's generic tool-click-capture
// channel (world-space points, post pan/zoom — see InputHandler.toolClickListener)
// while `active` is true, and unsubscribes on deactivation/unmount. Shared by
// any tool that needs the user to click points directly on the canvas
// (sheet alignment, scale calibration, and future ones), so each tool only
// owns its own click-sequence state, not the subscribe/cleanup wiring.
export function useEngineClickCapture(active: boolean, onPoint: (point: Point) => void) {
  const engine = useEngineStore((s) => s.engine);

  useEffect(() => {
    // Multiple tools (Calibration, Alignment, AI Snap) share this one
    // listener slot. Only ever clear it via this effect's own cleanup —
    // i.e. only when *this* hook instance is the one stepping down (active
    // -> false, or unmount). Proactively nulling it out just because
    // `active` happens to be false here was clobbering whichever OTHER
    // tool's listener was actually live: any inactive consumer re-renders
    // (e.g. AiSnapTool on every activeTool change, since it reads
    // activeTool directly) get a fresh `onPoint` closure, which used to
    // retrigger this effect and wipe out a different tool's just-registered
    // callback before its first click could ever land.
    if (!engine || !active) return;

    engine.setToolClickListener(onPoint);
    return () => engine.setToolClickListener(null);
  }, [engine, active, onPoint]);
}
