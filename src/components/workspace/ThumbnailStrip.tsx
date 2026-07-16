'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { renderPdfPageToCanvas } from '@/canvas/pdfRenderer';

// Cheap low-res render just for the filmstrip — full PDF_RENDER_SCALE (2x) would be massive overkill.
const THUMBNAIL_SCALE = 0.15;

export function ThumbnailStrip() {
  const blueprintUrl = useBlueprintStore((s) => s.blueprintUrl);
  const pageCount = useBlueprintStore((s) => s.pageCount);
  const currentPage = useBlueprintStore((s) => s.currentPage);
  const setPage = useBlueprintStore((s) => s.setPage);

  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const cacheRef = useRef<{ url: string | null; images: Record<number, string> }>({
    url: null,
    images: {},
  });

  useEffect(() => {
    if (!blueprintUrl || pageCount < 1) return;

    // Blueprint swapped out entirely — drop the stale cache.
    if (cacheRef.current.url !== blueprintUrl) {
      cacheRef.current = { url: blueprintUrl, images: {} };
      setThumbnails({});
    }

    let cancelled = false;

    (async () => {
      // Rendered sequentially, one page at a time, to avoid hammering the
      // pdf.js worker with concurrent render calls against the same document.
      for (let page = 1; page <= pageCount; page++) {
        if (cancelled) return;
        if (cacheRef.current.images[page]) continue;

        const canvas = await renderPdfPageToCanvas(blueprintUrl, page, THUMBNAIL_SCALE);
        if (cancelled) return;

        const dataUrl = canvas.toDataURL('image/png');
        cacheRef.current.images[page] = dataUrl;
        setThumbnails((prev) => ({ ...prev, [page]: dataUrl }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blueprintUrl, pageCount]);

  return (
    <div className="w-28 h-full flex-shrink-0 bg-slate-900/95 backdrop-blur-sm border-r border-slate-800 z-10 flex flex-col">
      <div className="px-2 py-2 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
        Pages
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 p-2">
        {!blueprintUrl ? (
          <p className="text-[11px] text-slate-600 text-center mt-4 px-1">
            Load a blueprint to see page thumbnails.
          </p>
        ) : (
          Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setPage(page)}
              className={`relative shrink-0 rounded-md overflow-hidden border-2 transition ${
                page === currentPage
                  ? 'border-blue-500 ring-2 ring-blue-500/40'
                  : 'border-slate-700 hover:border-slate-500'
              }`}
            >
              {thumbnails[page] ? (
                <img src={thumbnails[page]} alt={`Page ${page}`} className="w-full h-auto block bg-white" />
              ) : (
                <div className="w-full aspect-[8.5/11] bg-slate-800 animate-pulse" />
              )}
              <span className="absolute bottom-0.5 right-0.5 bg-slate-950/80 text-[9px] leading-none text-slate-200 px-1 py-0.5 rounded">
                {page}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
