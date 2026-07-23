import { useCallback, useRef, useState } from 'react';
import { OcrEngine, type OcrWord } from '@/ai/ocrEngine';

// Model loading (~15MB fetch + worker init) is expensive and should happen
// at most once per browser session, not once per component mount — same
// module-level-singleton reasoning as useSegmentationEngine.ts.
let sharedEngine: OcrEngine | null = null;
function getSharedEngine(): OcrEngine {
  if (!sharedEngine) sharedEngine = new OcrEngine();
  return sharedEngine;
}

export function useOcrEngine() {
  const engineRef = useRef<OcrEngine>(getSharedEngine());
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognizeRegion = useCallback(async (canvas: HTMLCanvasElement): Promise<OcrWord[] | null> => {
    setError(null);
    if (!engineRef.current.isReady) setIsModelLoading(true);
    setIsRecognizing(true);
    try {
      const words = await engineRef.current.recognizeRegion(canvas);
      return words;
    } catch (err) {
      console.error('OCR failed:', err);
      setError('OCR failed — see console for details.');
      return null;
    } finally {
      setIsModelLoading(false);
      setIsRecognizing(false);
    }
  }, []);

  return {
    isModelLoading,
    isRecognizing,
    error,
    recognizeRegion,
  };
}
