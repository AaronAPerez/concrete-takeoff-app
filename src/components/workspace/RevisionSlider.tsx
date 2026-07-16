import React, { useRef } from 'react';

export const RevisionOverlayViewport: React.FC<{
  revACanvas: HTMLCanvasElement;
  revBCanvas: HTMLCanvasElement;
  alignment: { x: number; y: number; scale: number; rotation: number };
}> = ({ revACanvas, revBCanvas, alignment }) => {
  
  return (
    <div className="relative w-full h-[80vh] bg-white overflow-hidden border border-slate-200 rounded">
      {/* Base Layer: Revision A (Red) */}
      <div className="absolute inset-0 z-10 origin-top-left">
        <canvas 
          ref={(el) => {
            if (el && revACanvas) {
              el.width = revACanvas.width;
              el.height = revACanvas.height;
              el.getContext('2d')?.drawImage(revACanvas, 0, 0);
            }
          }}
        />
      </div>

      {/* Comparison Layer: Revision B (Green) */}
      <div 
        className="absolute inset-0 z-20 origin-top-left mix-blend-multiply opacity-80"
        style={{
          transform: `translate(${alignment.x}px, ${alignment.y}px) scale(${alignment.scale}) rotate(${alignment.rotation}deg)`
        }}
      >
        <canvas 
          ref={(el) => {
            if (el && revBCanvas) {
              el.width = revBCanvas.width;
              el.height = revBCanvas.height;
              el.getContext('2d')?.drawImage(revBCanvas, 0, 0);
            }
          }}
        />
      </div>
    </div>
  );
};