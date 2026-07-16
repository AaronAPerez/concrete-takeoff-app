import { useEffect, useRef } from 'react';
import { TakeoffEngine } from '@/canvas/Engine';
import { useEngineStore } from '@/stores/useEngineStore';

export function useCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TakeoffEngine | null>(null);
  const setEngine = useEngineStore((state) => state.setEngine);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Instantiate the engine on mounted canvas
    const engine = new TakeoffEngine(canvas);
    engineRef.current = engine;
    setEngine(engine);

    // Cleanup on component unmount
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
      setEngine(null);
    };
  }, [setEngine]);

  return { canvasRef, engineRef };
}