'use client';

import React, { useState } from 'react';
import { useEngineStore } from '@/stores/useEngineStore';
import { useAnimationFrame } from '@/hooks/useAnimationFrame';
import { ScrollbarTrack } from './ScrollbarTrack';

// Bridges the Engine's camera (Viewport isn't reactive/store-backed — see
// Engine.getCameraState) to a pair of standard-looking scroll tracks, so
// users who don't know about drag-to-pan/shift-drag can still move around a
// zoomed-in sheet. Polls every animation frame (matching the canvas's own
// render loop) rather than subscribing to a store, since camera position
// isn't store state in this app.
export function CanvasScrollbars() {
  const engine = useEngineStore((s) => s.engine);
  const [, forceTick] = useState(0);

  useAnimationFrame(() => forceTick((t) => t + 1), !!engine);

  if (!engine) return null;
  const camera = engine.getCameraState();
  if (!camera) return null;

  const { zoom, offsetX, offsetY, canvasWidth, canvasHeight, contentWidth, contentHeight } = camera;

  const visibleWidthFraction = canvasWidth / zoom / contentWidth;
  const visibleHeightFraction = canvasHeight / zoom / contentHeight;
  const thumbStartX = -offsetX / zoom / contentWidth;
  const thumbStartY = -offsetY / zoom / contentHeight;

  const showHorizontal = visibleWidthFraction < 0.999;
  const showVertical = visibleHeightFraction < 0.999;
  if (!showHorizontal && !showVertical) return null;

  return (
    <>
      {showHorizontal && (
        <ScrollbarTrack
          orientation="horizontal"
          thumbStart={thumbStartX}
          thumbSize={visibleWidthFraction}
          onScrollByFraction={(delta) => engine.panByContentFraction(delta, 0)}
          onJumpToFraction={(center) => engine.panByContentFraction(center - visibleWidthFraction / 2 - thumbStartX, 0)}
        />
      )}
      {showVertical && (
        <ScrollbarTrack
          orientation="vertical"
          thumbStart={thumbStartY}
          thumbSize={visibleHeightFraction}
          onScrollByFraction={(delta) => engine.panByContentFraction(0, delta)}
          onJumpToFraction={(center) => engine.panByContentFraction(0, center - visibleHeightFraction / 2 - thumbStartY)}
        />
      )}
    </>
  );
}
