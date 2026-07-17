'use client';

import React from 'react';

// A compact toolbar trigger button that shows a description tooltip on
// hover (while closed) and reveals an anchored popover panel on click.
// Controlled (open/onToggle) rather than managing its own outside-click
// dismissal, because some panels here (calibration) need clicks on the main
// canvas to keep working normally while the popover is open — an
// outside-click-to-close listener would fight with that.
export function ToolbarPopoverButton({
  label,
  description,
  variant = 'default',
  open,
  onToggle,
  panel
}: {
  label: string;
  description: string;
  variant?: 'default' | 'open' | 'busy';
  open: boolean;
  onToggle: () => void;
  panel: React.ReactNode;
}) {
  const colorClass =
    variant === 'busy'
      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
      : variant === 'open'
        ? 'bg-blue-600 hover:bg-blue-500'
        : 'bg-slate-800 hover:bg-slate-700';

  return (
    <div className="relative group flex items-center">
      <button
        onClick={onToggle}
        className={`px-2 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors ${colorClass}`}
      >
        {label}
      </button>

      {!open && (
        <div className="pointer-events-none absolute left-1/2 top-full mt-2 w-56 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-[11px] text-slate-300 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 z-30">
          {description}
        </div>
      )}

      {open && <div className="absolute left-0 top-full mt-2 z-30">{panel}</div>}
    </div>
  );
}
