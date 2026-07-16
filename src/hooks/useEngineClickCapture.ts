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
    if (!engine || !active) {
      engine?.setToolClickListener(null);
      return;
    }

    engine.setToolClickListener(onPoint);
    return () => engine.setToolClickListener(null);
  }, [engine, active, onPoint]);
}
