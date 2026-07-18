import { create } from 'zustand';
import { Point, TakeoffChecklistItem, BoundingBox } from '@/types/takeoff';
import {
  calculateRealWorldArea,
  calculateRealWorldLength,
  calculateBoundingBox,
  getActivePageScale
} from '@/utils/geometry';
import type { EstimatingDomain } from '@/types/estimatingDomain';
import { concreteDomain } from '@/domains/concrete';
import { getDomainById } from '@/domains/registry';


export type ToolType = 'select' | 'pan' | 'area' | 'linear' | 'calibrate' | 'align' | 'magic';


export interface PageScaleConfig {
  pixelsPerFoot: number; // The scale multiplier
  unit: 'ft' | 'm';
  isCalibrated: boolean;
  rawViewportWidth: number;  // Helps adjust scales if the page window resizes
  rawViewportHeight: number;
}

// A scale auto-detected from a sheet's "SCALE: 1/4" = 1'-0"" text annotation,
// awaiting user confirmation before it's written into pageScales. Captures
// the page it was detected on so confirming still calibrates the right page
// even if the user has since navigated elsewhere.
export interface PendingScaleConfig {
  pageNumber: number;
  pixelsPerFoot: number;
  label: string;
  // Where the scale text itself was found on the page, so the UI can
  // highlight exactly what the detector read (see Engine.drawPendingScaleHighlight).
  boundingBox: BoundingBox;
}

interface TakeoffState {
  currentPage: number;
  // Map page number to its distinct configuration
  pageScales: Record<number, PageScaleConfig>;
  // An auto-detected scale awaiting user confirmation (see ScaleDetectorToast)
  pendingScaleConfig: PendingScaleConfig | null;
  totalPages: number;
  pdfDoc: any | null; // Stores the loaded PDFDocumentProxy
  pdfFilename: string | null;
  
  // Active Tool state
  activeTool: ToolType;
  
  // Points currently being drawn by the user (not yet saved)
  draftPoints: Point[];
  
  // Confirmed, permanent takeoff drawings
  takeoffs: TakeoffChecklistItem[];
  
  // Selected item for sidebar inspection or modification
  selectedTakeoffId: string | null;
  activeDomain: EstimatingDomain;


  setActiveDomain: (domain: EstimatingDomain) => void; // used starting Phase 4 (IMP)


  // Actions
  setPdfDoc: (doc: any, filename: string) => void;
  setCurrentPage: (page: number) => void;
  calibratePage: (pageNumber: number, config: PageScaleConfig) => void;
  setPendingScale: (config: PendingScaleConfig | null) => void;
  confirmPendingScale: () => void;
  setActiveTool: (tool: ToolType) => void;
  addDraftPoint: (point: Point) => void;
  undoLastDraftPoint: () => void;
  clearDraft: () => void;

  // Bulk-sets the draft polygon in one shot — used by AI-traced (magic wand)
  // commits, where the whole outline arrives at once rather than one
  // addDraftPoint call per click.
  setDraftPoints: (points: Point[]) => void;

  // Finalizes the current draft points into a real material takeoff item.
  // `kind` drives which real-world measurement gets computed (area vs
  // length) — passed explicitly rather than read off `activeTool`, since
  // AI-traced commits happen while activeTool is 'magic', not 'area'.
  saveCurrentDraft: (
    projectId: string,
    pageNumber: number,
    kind: 'area' | 'linear',
    category: TakeoffChecklistItem['category'],
    label: string,
    thicknessInches?: number,
    extractedTextOverride?: string
  ) => void;
  
  deleteTakeoff: (id: string) => void;
  selectTakeoff: (id: string | null) => void;

  // Bulk-load takeoffs (e.g. from a future OCR/vector-text extraction pipeline)
  setChecklistItems: (items: TakeoffChecklistItem[]) => void;

  // Appends candidate items found by the vector-text extraction scan without
  // clobbering existing (hand-drawn or already-reviewed) takeoffs; skips any
  // hit that looks like a duplicate of one already on the same page.
  addExtractedTakeoffs: (items: TakeoffChecklistItem[]) => void;
  updateItemStatus: (id: string, status: TakeoffChecklistItem['status']) => void;
  updateItemDimensions: (id: string, dimensions: Partial<TakeoffChecklistItem['dimensions']>) => void;
}


export const useTakeoffStore = create<TakeoffState>((set, get) => ({
  currentPage: 1,
  pageScales: {}, // Starts empty. Default fallback used if uncalibrated.
  pendingScaleConfig: null,

  activeDomain: concreteDomain,
  setActiveDomain: (domain) => set({ activeDomain: domain }),

  calibratePage: (pageNumber, config) => set((state) => ({
    pageScales: {
      ...state.pageScales,
      [pageNumber]: config
    }
  })),

  setPendingScale: (config) => set({ pendingScaleConfig: config }),

  confirmPendingScale: () => {
    const { pendingScaleConfig, calibratePage } = get();
    if (!pendingScaleConfig) return;

    calibratePage(pendingScaleConfig.pageNumber, {
      pixelsPerFoot: pendingScaleConfig.pixelsPerFoot,
      unit: 'ft',
      isCalibrated: true,
      rawViewportWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
      rawViewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0
    });
    set({ pendingScaleConfig: null });
  },

  totalPages: 1,
  pdfDoc: null,
  pdfFilename: null,

  setPdfDoc: (doc, filename) => set({ 
    pdfDoc: doc, 
    totalPages: doc.numPages, 
    pdfFilename: filename,
    currentPage: 1 // Reset to page 1 on fresh upload
  }),
  
  setCurrentPage: (page) => set((state) => ({
    // Guard boundaries
    currentPage: Math.max(1, Math.min(page, state.totalPages))
  })),

  activeTool: 'select',
  draftPoints: [],
  takeoffs: [],
  selectedTakeoffId: null,

  setActiveTool: (tool) => set({ 
    activeTool: tool,
    // Automatically clear any unfinished drafting points when switching tools
    draftPoints: [] 
  }),

  addDraftPoint: (point) => set((state) => ({
    draftPoints: [...state.draftPoints, point]
  })),

  undoLastDraftPoint: () => set((state) => ({
    draftPoints: state.draftPoints.slice(0, -1)
  })),

  clearDraft: () => set({ draftPoints: [] }),

  setDraftPoints: (points) => set({ draftPoints: points }),

saveCurrentDraft: (projectId, pageNumber, kind, category, label, thicknessInches = 4, extractedTextOverride) => {
  const { draftPoints, activeDomain } = get();
  if (draftPoints.length === 0) return;

  const scaleFactor = getActivePageScale(pageNumber).pixelsPerFoot;
  const id = crypto.randomUUID();
  const boundingBox = calculateBoundingBox(draftPoints);

  let areaSqFt = 0;
  let linearFt = 0;
  if (kind === 'area') {
    areaSqFt = calculateRealWorldArea(draftPoints, scaleFactor);
  } else if (kind === 'linear') {
    linearFt = calculateRealWorldLength(draftPoints, scaleFactor);
  }

  const dimensions = {
    thicknessInches,
    areaSqFt: areaSqFt > 0 ? Math.round(areaSqFt * 100) / 100 : undefined,
    linearFt: linearFt > 0 ? Math.round(linearFt * 100) / 100 : undefined,
  };

  const calculatedQuantity = activeDomain.calculateQuantity({
    id,
    pageNumber,
    category,
    domainId: activeDomain.id,
    label,
    extractedText: extractedTextOverride ?? '',
    boundingBox,
    points: draftPoints,
    status: 'verified',
    dimensions
  });

  const newTakeoffItem: TakeoffChecklistItem = {
    id,
    pageNumber,
    category,
    domainId: activeDomain.id,
    label,
    extractedText: extractedTextOverride ?? `Manually drawn ${kind} takeoff`,
    boundingBox,
    points: [...draftPoints],
    status: 'verified',
    dimensions,
    calculatedQuantity: calculatedQuantity.value > 0 ? calculatedQuantity : undefined
  };

  set((state) => ({
    takeoffs: [...state.takeoffs, newTakeoffItem],
    draftPoints: [],
    activeTool: 'select',
    selectedTakeoffId: id
  }));
},

  deleteTakeoff: (id) => set((state) => ({
    takeoffs: state.takeoffs.filter((item) => item.id !== id),
    selectedTakeoffId: state.selectedTakeoffId === id ? null : state.selectedTakeoffId
  })),

  selectTakeoff: (id) => set({ selectedTakeoffId: id }),

  setChecklistItems: (items) => set({ takeoffs: items }),

  addExtractedTakeoffs: (items) => set((state) => {
    const existingKeys = new Set(
      state.takeoffs.map(
        (t) => `${t.pageNumber}|${t.extractedText}|${Math.round(t.boundingBox.x)}|${Math.round(t.boundingBox.y)}`
      )
    );

    const newItems = items.filter(
      (item) =>
        !existingKeys.has(
          `${item.pageNumber}|${item.extractedText}|${Math.round(item.boundingBox.x)}|${Math.round(item.boundingBox.y)}`
        )
    );

    return { takeoffs: [...state.takeoffs, ...newItems] };
  }),

  updateItemStatus: (id, status) => set((state) => ({
    takeoffs: state.takeoffs.map((item) => (item.id === id ? { ...item, status } : item))
  })),

updateItemDimensions: (id, dims) => set((state) => ({
  takeoffs: state.takeoffs.map((item) => {
    if (item.id !== id) return item;
    const updatedDims = { ...item.dimensions, ...dims };
    const domain = getDomainById(item.domainId);
    const calculatedQuantity = domain.calculateQuantity({ ...item, dimensions: updatedDims });
    return { ...item, dimensions: updatedDims, calculatedQuantity };
  })
})),
}));
