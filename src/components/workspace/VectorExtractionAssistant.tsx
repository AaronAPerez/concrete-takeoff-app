"use client";

import React, { useState } from "react";
import { useBlueprintStore } from "@/stores/useBlueprintStore";
import { useTakeoffStore } from "@/stores/useTakeoffStore";
import { ToolbarPopoverButton } from "./ToolbarPopoverButton";
import { extractHighlights, detectImageRegions, PDF_RENDER_SCALE, type DetectedImageRegion } from "@/canvas/pdfRenderer";
import { OcrTableViewer } from "./OcrTableViewer";

// Scans the current page's vector text layer (not OCR — only text that's
// actually selectable in the source PDF) for concrete-related keywords and
// drops each hit into the checklist as a 'pending' candidate. Rendering is
// handled entirely by the existing takeoff pipeline (Engine.drawTakeoffBox),
// which already draws a dashed outline for 'pending' items.
export function VectorExtractionAssistant() {
  const blueprintUrl = useBlueprintStore((s) => s.blueprintUrl);
  const currentPage = useBlueprintStore((s) => s.currentPage);
  const addExtractedTakeoffs = useTakeoffStore((s) => s.addExtractedTakeoffs);
  const activeDomain = useTakeoffStore((s) => s.activeDomain);

  const [open, setOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [imageRegions, setImageRegions] = useState<DetectedImageRegion[]>([]);
  const [ocrTarget, setOcrTarget] = useState<{ region: DetectedImageRegion; pageNumber: number } | null>(null);

  if (!blueprintUrl) return null;

  const scan = async () => {
    setIsScanning(true);
    setLastResult(null);
    setImageRegions([]);
    try {
      // Run both scans — text keywords and raster-image detection — since
      // they cover disjoint content. A schedule authored in Excel and
      // pasted into the sheet as a picture (confirmed on a real cold-
      // storage permit set) has zero real text behind it, so the keyword
      // scan below will never see it no matter how the regex is tuned;
      // detectImageRegions flags that blind spot instead of leaving it
      // silently unmentioned.
      const [hits, foundImageRegions] = await Promise.all([
        extractHighlights(blueprintUrl, currentPage, activeDomain),
        detectImageRegions(blueprintUrl, currentPage),
      ]);
      addExtractedTakeoffs(hits);
      setImageRegions(foundImageRegions);

      const textSummary =
        hits.length > 0
          ? `Found ${hits.length} ${activeDomain.displayName} callout${hits.length === 1 ? "" : "s"} on Page ${currentPage}.`
          : `No ${activeDomain.displayName} keywords found on Page ${currentPage}.`;

      const imageSummary =
        foundImageRegions.length > 0
          ? ` Also found ${foundImageRegions.length} image region${foundImageRegions.length === 1 ? "" : "s"} on this page (logos, stamps, or a pasted-in schedule/table) — this scan can't read text inside them directly, but you can try reading one with OCR below.`
          : "";

      setLastResult(textSummary + imageSummary);
    } catch (err) {
      console.error("Vector text extraction failed:", err);
      setLastResult("Scan failed — see console for details.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <>
      <ToolbarPopoverButton
        label="Scan Text"
        description="Finds slab/footing/grade-beam callouts already embedded as text in this sheet's PDF."
        variant={isScanning ? "busy" : open ? "open" : "default"}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        panel={
          <div className="flex flex-col gap-2 bg-slate-900/95 backdrop-blur-sm border border-slate-800 rounded-lg shadow-lg p-3 text-white w-64">
            <p className="text-xs font-semibold">Vector Text Scan</p>

            <button
              onClick={scan}
              disabled={isScanning}
              className={`w-full py-1.5 rounded text-xs font-semibold ${
                isScanning
                  ? "bg-amber-500 text-slate-950"
                  : "bg-blue-600 hover:bg-blue-500"
              }`}
            >
              {isScanning ? "Scanning…" : `Scan Page ${currentPage} for Callouts`}
            </button>

            {lastResult && (
              <p className="text-[11px] text-emerald-400">{lastResult}</p>
            )}

            {imageRegions.length > 0 && (
              <div className="flex flex-col gap-1 pt-1 border-t border-slate-800">
                <p className="text-[10px] uppercase font-bold text-slate-500">
                  Try reading one with OCR (draft only, see viewer for caveats)
                </p>
                {imageRegions.map((region, i) => (
                  <button
                    key={i}
                    onClick={() => setOcrTarget({ region, pageNumber: currentPage })}
                    className="w-full py-1 rounded text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-left px-2"
                  >
                    Region {i + 1} ({Math.round(region.boundingBox.width)}×
                    {Math.round(region.boundingBox.height)}px) — Read Table
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

      {ocrTarget && (
        <OcrTableViewer
          blueprintUrl={blueprintUrl}
          pageNumber={ocrTarget.pageNumber}
          region={ocrTarget.region}
          regionScale={PDF_RENDER_SCALE}
          onClose={() => setOcrTarget(null)}
        />
      )}
    </>
  );
}
