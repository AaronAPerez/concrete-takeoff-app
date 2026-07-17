import { useEffect } from 'react';

// Runs `callback` on every animation frame while `active` is true, cleaning
// up the loop on deactivation/unmount. Generalizes the same rAF-polling
// pattern used to keep React state in sync with values that live outside
// React/the store (CanvasScrollbars polling Viewport's camera position,
// AiSnapTool polling the live mouse position for hover-preview queries).
export function useAnimationFrame(callback: () => void, active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    let frameId: number;
    const loop = () => {
      callback();
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [active, callback]);
}
