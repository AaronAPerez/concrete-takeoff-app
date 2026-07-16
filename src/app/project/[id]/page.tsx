'use client';

import React from 'react';
import { CanvasContainer } from '@/components/workspace/CanvasContainer';
import { Toolbar } from '@/components/workspace/Toolbar';
import { AlignmentWizard } from '@/components/workspace/AlignmentWizard';
import { SummaryTakeoffChecklist } from '@/components/sidebar/Checklist';
import { TakeoffSummaryHeader } from '@/components/workspace/TakeoffSummaryHeader';

export default function ProjectWorkspacePage() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950">
      
      {/* 1. Global Live Calculation Header */}
      <div className="h-16 flex-shrink-0 z-30">
        <TakeoffSummaryHeader />
      </div>

      {/* 2. Main Estimating Workspace */}
      <div className="flex flex-1 relative overflow-hidden">
        
        {/* Floating Tool Bar (Left Overlay) */}
        <div className="absolute top-4 left-4 z-20">
          <Toolbar />
        </div>

        {/* Revision-alignment wizard (only shows once a comparison sheet is loaded) */}
        <AlignmentWizard />

        {/* Centered Canvas Viewport */}
        <main className="flex-1 h-full w-full relative bg-slate-900 overflow-hidden">
          {/* The canvas component stretches to fill the main screen container */}
          <CanvasContainer />
        </main>

        {/* Interactive Side Panels (Right) */}
        <aside className="w-96 h-full flex-shrink-0 bg-white border-l border-slate-200 z-10 flex flex-col">
          <SummaryTakeoffChecklist />
        </aside>
        
      </div>
    </div>
  );
}