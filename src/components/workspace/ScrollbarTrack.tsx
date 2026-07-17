'use client';

import React, { useRef } from 'react';

// A single presentational scrollbar track + thumb. Knows nothing about the
// canvas/camera it's controlling — it just reports drag distance as a
// fraction of its own track length, so it's reusable for both the
// horizontal and vertical bars (CanvasScrollbars owns translating that
// fraction into an actual camera pan).
export function ScrollbarTrack({
  orientation,
  thumbStart,
  thumbSize,
  onScrollByFraction,
  onJumpToFraction
}: {
  orientation: 'horizontal' | 'vertical';
  thumbStart: number; // fraction [0,1] of the track the thumb begins at
  thumbSize: number; // fraction [0,1] of the track the thumb spans
  onScrollByFraction: (delta: number) => void;
  onJumpToFraction: (center: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ lastClient: number } | null>(null);
  const isHorizontal = orientation === 'horizontal';

  const trackLength = () => {
    const rect = trackRef.current?.getBoundingClientRect();
    return (isHorizontal ? rect?.width : rect?.height) || 1;
  };

  const clientPos = (e: React.PointerEvent) => (isHorizontal ? e.clientX : e.clientY);

  const handleThumbPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current = { lastClient: clientPos(e) };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleTrackPointerDown = (e: React.PointerEvent) => {
    // Clicking the bare track (not the thumb) jumps the thumb's center there.
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offset = isHorizontal ? e.clientX - rect.left : e.clientY - rect.top;
    onJumpToFraction(offset / trackLength());
    dragRef.current = { lastClient: clientPos(e) };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pos = clientPos(e);
    const deltaPx = pos - drag.lastClient;
    dragRef.current = { lastClient: pos };
    if (deltaPx !== 0) onScrollByFraction(deltaPx / trackLength());
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const clampedStart = Math.max(0, Math.min(1 - thumbSize, thumbStart));

  return (
    <div
      ref={trackRef}
      onPointerDown={handleTrackPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={
        isHorizontal
          ? 'absolute bottom-0 left-0 right-3 h-3 bg-slate-950/70 z-30'
          : 'absolute top-0 right-0 bottom-3 w-3 bg-slate-950/70 z-30'
      }
    >
      <div
        onPointerDown={handleThumbPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="absolute bg-slate-600 hover:bg-slate-500 active:bg-slate-400 rounded-full cursor-pointer transition-colors"
        style={
          isHorizontal
            ? { left: `${clampedStart * 100}%`, width: `${thumbSize * 100}%`, top: 2, bottom: 2 }
            : { top: `${clampedStart * 100}%`, height: `${thumbSize * 100}%`, left: 2, right: 2 }
        }
      />
    </div>
  );
}
