'use client';

import { CanvasContainer } from '@/components/workspace/CanvasContainer';
import { Toolbar } from '@/components/workspace/Toolbar';
import { AlignmentWizard } from '@/components/workspace/AlignmentWizard';
import { TakeoffSummaryHeader } from '@/components/workspace/TakeoffSummaryHeader';
import { ThumbnailStrip } from '@/components/workspace/ThumbnailStrip';
import { PageNavigator } from '@/components/workspace/PageNavigator';
import { CalibrationAssistant } from '@/components/workspace/CalibrationAssistant';
import { VectorExtractionAssistant } from '@/components/workspace/VectorExtractionAssistant';
import { ScaleDetectorToast } from '@/components/workspace/ScaleDetectorToast';
import { DetailCrossReference } from '@/components/workspace/DetailCrossReference';
import { CanvasScrollbars } from '@/components/workspace/CanvasScrollbars';
import { AiSnapTool } from '@/components/workspace/AiSnapTool';
import { SummaryTakeoffChecklist } from '@/components/sidebar/Checklist';
import { useEffect, useRef } from 'react';
import { useTakeoffStore } from '@/stores/useTakeoffStore';

export function usePdfRenderer(canvasRef: React.RefObject<HTMLCanvasElement>) {
  const { pdfDoc, currentPage } = useTakeoffStore();
  
  // Keep a reference to the active PDF.js render task
  const activeRenderTaskRef = useRef<any>(null);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;

      try {
        // 1. Cancel any active render task currently running
        if (activeRenderTaskRef.current) {
          activeRenderTaskRef.current.cancel();
        }

        // 2. Load the requested page proxy
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 2.0 }); // Set render crispness scale

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // 3. Set up render context
        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        // 4. Start and track the new render task
        const renderTask = page.render(renderContext);
        activeRenderTaskRef.current = renderTask;

        await renderTask.promise;
        activeRenderTaskRef.current = null; // Clear on success
      } catch (err: any) {
        // Ignore normal cancelled render exceptions
        if (err.name !== 'RenderingCancelledException') {
          console.error('Failed to render page:', err);
        }
      }
    };

    renderPage();

    return () => {
      if (activeRenderTaskRef.current) {
        activeRenderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, currentPage, canvasRef]);

  
}


export default function Home() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950">
      <div className="h-16 flex-shrink-0 z-30">
        <TakeoffSummaryHeader />
      </div>

      <div className="flex flex-row flex-wrap items-start gap-3 px-4 py-2 flex-shrink-0 z-20 bg-slate-950 border-b border-slate-800">
        <Toolbar />
        <CalibrationAssistant />
        <VectorExtractionAssistant />
        <AiSnapTool />
        <AlignmentWizard />
      </div>

      <div className="flex flex-1 relative overflow-hidden">
        <ThumbnailStrip />

        <main className="flex-1 h-full w-full relative bg-slate-950 overflow-hidden">
          <CanvasContainer />
          <PageNavigator />
          <ScaleDetectorToast />
          <DetailCrossReference />
          <CanvasScrollbars />
        </main>

        <aside className="h-full flex-shrink-0 z-10">
          <SummaryTakeoffChecklist />
        </aside>
      </div>
    </div>
  );
}
