'use client';

import React from 'react';
import { useBlueprintStore } from '@/stores/useBlueprintStore';

// Floating "dock" pill for stepping through blueprint pages. Overlays the
// canvas rather than taking up flex layout space.
export function PageNavigator() {
  const currentPage = useBlueprintStore((s) => s.currentPage);
  const pageCount = useBlueprintStore((s) => s.pageCount);
  const setPage = useBlueprintStore((s) => s.setPage);
  const blueprintUrl = useBlueprintStore((s) => s.blueprintUrl);

  if (!blueprintUrl) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-slate-900/95 backdrop-blur-sm border border-slate-800 rounded-lg shadow-lg px-3 py-1.5 text-white">
      <button
        onClick={() => setPage(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-sm font-medium transition"
      >
        ◀ Prev
      </button>

      <span className="text-sm font-medium whitespace-nowrap">
        Page {currentPage} of {pageCount}
      </span>

      <button
        onClick={() => setPage(currentPage + 1)}
        disabled={currentPage === pageCount}
        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-sm font-medium transition"
      >
        Next ▶
      </button>
    </div>
  );
}
