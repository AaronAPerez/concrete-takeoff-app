import { useCallback, useRef, useState } from 'react';
import { SegmentationEngine, type MaskPreview, type MaskCommitResult } from '@/ai/segmentationEngine';

// Model loading (~32MB fetch + WebGPU/WASM session init) is expensive and
// should happen at most once per browser session, not once per component
// mount — so the engine itself is a module-level singleton, while this hook
// just exposes React-friendly loading state around it.
let sharedEngine: SegmentationEngine | null = null;
function getSharedEngine(): SegmentationEngine {
  if (!sharedEngine) sharedEngine = new SegmentationEngine();
  return sharedEngine;
}

export function useSegmentationEngine() {
  const engineRef = useRef<SegmentationEngine>(getSharedEngine());
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isModelReady, setIsModelReady] = useState(engineRef.current.isReady);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [hasImage, setHasImage] = useState(engineRef.current.hasImage());
  const [error, setError] = useState<string | null>(null);

  const ensureModelLoaded = useCallback(async () => {
    if (engineRef.current.isReady) {
      setIsModelReady(true);
      return;
    }
    setIsModelLoading(true);
    setError(null);
    try {
      await engineRef.current.init();
      setIsModelReady(true);
    } catch (err) {
      console.error('Failed to load segmentation model:', err);
      setError('Failed to load AI model — see console for details.');
    } finally {
      setIsModelLoading(false);
    }
  }, []);

  const loadImage = useCallback(async (canvas: HTMLCanvasElement) => {
    setIsImageLoading(true);
    setError(null);
    setHasImage(false);
    try {
      await ensureModelLoaded();
      await engineRef.current.loadImage(canvas);
      setHasImage(engineRef.current.hasImage());
    } catch (err) {
      console.error('Failed to compute image embeddings:', err);
      setError('Failed to prepare this page for AI tracing — see console for details.');
    } finally {
      setIsImageLoading(false);
    }
  }, [ensureModelLoaded]);

  const clearImage = useCallback(() => {
    engineRef.current.clearImage();
    setHasImage(false);
  }, []);

  const previewAt = useCallback((x: number, y: number): Promise<MaskPreview | null> => {
    return engineRef.current.previewAt(x, y);
  }, []);

  const commitAt = useCallback((x: number, y: number): Promise<MaskCommitResult | null> => {
    return engineRef.current.commitAt(x, y);
  }, []);

  return {
    isModelLoading,
    isModelReady,
    isImageLoading,
    hasImage,
    error,
    ensureModelLoaded,
    loadImage,
    clearImage,
    previewAt,
    commitAt
  };
}
