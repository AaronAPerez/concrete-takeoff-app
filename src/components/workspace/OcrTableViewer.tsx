'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderPageRegionToCanvas, OCR_RENDER_SCALE, type DetectedImageRegion } from '@/canvas/pdfRenderer';
import { useOcrEngine } from '@/hooks/useOcrEngine';
import { reconstructTable, type OcrTable } from '@/utils/tableReconstruction';

interface OcrTableViewerProps {
  blueprintUrl: string;
  pageNumber: number;
  region: DetectedImageRegion;
  regionScale: number; // the pixel scale region.boundingBox was computed at (see detectImageRegions)
  onClose: () => void;
}

type Stage = 'rendering' | 'loading-model' | 'recognizing' | 'done' | 'error';

// Full-screen review panel for one detected image region: crops it out of
// the page at OCR_RENDER_SCALE, runs it through Tesseract, and reconstructs
// a draft table — shown side by side with the source crop so a human can
// check every cell against the actual picture. This is deliberately never
// wired to any takeoff item's dimensions or cost (see reconstructTable's
// own comment for why, and CLAUDE.md for the real misreads that justify
// treating this as a draft, not a source of truth).
export function OcrTableViewer({ blueprintUrl, pageNumber, region, regionScale, onClose }: OcrTableViewerProps) {
  const { recognizeRegion } = useOcrEngine();
  const [stage, setStage] = useState<Stage>('rendering');
  const [croppedImageUrl, setCroppedImageUrl] = useState<string | null>(null);
  const [table, setTable] = useState<OcrTable | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStage('rendering');
        const canvas = await renderPageRegionToCanvas(
          blueprintUrl,
          pageNumber,
          region.boundingBox,
          regionScale,
          OCR_RENDER_SCALE
        );
        if (cancelled) return;
        setCroppedImageUrl(canvas.toDataURL('image/png'));

        setStage('loading-model');
        setStage('recognizing');
        const words = await recognizeRegion(canvas);
        if (cancelled) return;
        if (!words) {
          setError('OCR failed — see console for details.');
          setStage('error');
          return;
        }

        setTable(reconstructTable(words));
        setStage('done');
      } catch (err) {
        if (cancelled) return;
        console.error('OCR table reconstruction failed:', err);
        setError('Something went wrong reading this region — see console for details.');
        setStage('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- region/regionScale/pageNumber/blueprintUrl identify one run; recognizeRegion is stable
  }, [blueprintUrl, pageNumber, region, regionScale]);

  // Escape-to-close, independent of the header's Close button ever being
  // reachable — a real report from using this against a taller schedule
  // (more elevation rows than the one this was first built/verified
  // against) showed the panel can grow past the viewport height and push
  // the header (with the only Close button) out of view. Fixed below by
  // sizing the panel off the viewport explicitly instead of a `max-h-full`
  // percentage chain, and by making the backdrop itself scrollable as a
  // fallback — but Escape and backdrop-click are kept too so there's always
  // a way out regardless of any future layout regression.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const statusText: Record<Stage, string> = {
    rendering: 'Rendering this region at high resolution…',
    'loading-model': 'Loading OCR model (~15MB, cached after first use)…',
    recognizing: 'Reading text…',
    done: '',
    error: error ?? 'Something went wrong.',
  };

  // Portaled straight to document.body — this app's own header bar
  // (TakeoffSummaryHeader) is a flex item with an explicit z-index, which
  // per the flexbox spec makes it a real stacking context even at
  // `position: static`. Rendered in place, this modal's `z-50` only ever
  // wins comparisons within its own nested ancestor chain (a `position:
  // relative` container with no z-index of its own never escapes to
  // compete with that header at the page's top level) — confirmed live:
  // the header's own div sat visually on top of and intercepted clicks on
  // this modal's Close button, even though 50 > 30 in isolation. A portal
  // sidesteps the whole ancestor stacking-context chain rather than
  // chasing z-index values that could just as easily break again the next
  // time any ancestor gains a z-index of its own.
  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex max-h-[85vh] w-full max-w-5xl flex-col rounded-lg border border-slate-800 bg-slate-900 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold">OCR Table Reader — Page {pageNumber}</h2>
            <p className="text-[11px] text-slate-400">Draft reconstruction, not a source of truth — read on.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white flex-shrink-0"
            aria-label="Close OCR table viewer"
          >
            ✕ Close
          </button>
        </div>

        <div className="border-b border-slate-800 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-300 flex-shrink-0">
          <strong>Verify every cell against the image before using any of these numbers.</strong> OCR can misread a
          digit with no visible sign anything&rsquo;s wrong — cells below flagged{' '}
          <span className="rounded bg-amber-500/30 px-1">amber</span> had low recognition confidence or an
          unusually wide number (often a merged/dropped digit), but an unflagged cell can still be wrong. Nothing
          here is written to any takeoff item automatically — this is a reference to read values off, not a form to
          submit. To use a value: read it here (or off the source crop below), then type it into the matching field
          on a real traced item in the sidebar checklist, same as if you&rsquo;d read it off the original PDF by eye.
          Click outside this panel or press Esc to close.
        </div>

        <div className="flex-1 overflow-auto p-4">
          {stage !== 'done' && stage !== 'error' && (
            <p className="text-sm text-slate-300">{statusText[stage]}</p>
          )}
          {stage === 'error' && <p className="text-sm text-rose-400">{statusText.error}</p>}

          {croppedImageUrl && (
            <div className="mb-4">
              <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Source (as rendered)</p>
              {/* Actual pixel dimensions can be large at OCR_RENDER_SCALE —
                  capped visually, not downsampled, so zooming in the browser
                  (Ctrl/Cmd+scroll or right-click "Open image") still shows
                  full detail for a close read. A dynamically generated data
                  URI isn't a fit for next/image's remote-optimization
                  pipeline, so a plain <img> is the right tool here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={croppedImageUrl}
                alt="Cropped source region sent to OCR"
                className="max-h-64 rounded border border-slate-700"
              />
            </div>
          )}

          {table && table.rows.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">Reconstructed table</p>
              <div className="overflow-x-auto rounded border border-slate-700">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {table.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/50'}>
                        {row.map((cell, colIndex) => {
                          const flagged = cell.lowConfidence || cell.suspiciousWidth;
                          return (
                            <td
                              key={colIndex}
                              title={
                                cell.text
                                  ? `confidence ${cell.confidence.toFixed(0)}%${cell.suspiciousWidth ? ' — unusually wide for its character count' : ''}`
                                  : undefined
                              }
                              className={`border border-slate-700 px-2 py-1 whitespace-nowrap ${
                                flagged ? 'bg-amber-500/20 text-amber-200' : 'text-slate-200'
                              }`}
                            >
                              {cell.text || '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {table && table.rows.length === 0 && stage === 'done' && (
            <p className="text-sm text-slate-400">No text recognized in this region.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
