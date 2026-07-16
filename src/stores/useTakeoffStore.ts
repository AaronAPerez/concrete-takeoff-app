import { create } from 'zustand';
import { Point, TakeoffChecklistItem } from '@/types/takeoff';
import {
  calculateRealWorldArea,
  calculateRealWorldLength,
  calculateBoundingBox,
  getActivePageScale
} from '@/utils/geometry';

export type ToolType = 'select' | 'pan' | 'area' | 'linear' | 'calibrate' | 'align';

export interface PageScaleConfig {
  pixelsPerFoot: number; // The scale multiplier
  unit: 'ft' | 'm';
  isCalibrated: boolean;
  rawViewportWidth: number;  // Helps adjust scales if the page window resizes
  rawViewportHeight: number;
}

interface TakeoffState {
  currentPage: number;
  // Map page number to its distinct configuration
  pageScales: Record<number, PageScaleConfig>;
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


  // Actions
  setPdfDoc: (doc: any, filename: string) => void;
  setCurrentPage: (page: number) => void;
  calibratePage: (pageNumber: number, config: PageScaleConfig) => void;
  setActiveTool: (tool: ToolType) => void;
  addDraftPoint: (point: Point) => void;
  undoLastDraftPoint: () => void;
  clearDraft: () => void;

  
  // Finalizes the current draft points into a real material takeoff item
  saveCurrentDraft: (
    projectId: string, 
    pageNumber: number, 
    category: TakeoffChecklistItem['category'], 
    label: string, 
    thicknessInches?: number
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

  calibratePage: (pageNumber, config) => set((state) => ({
    pageScales: {
      ...state.pageScales,
      [pageNumber]: config
    }
  })),
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

  saveCurrentDraft: (projectId, pageNumber, category, label, thicknessInches = 4) => {
    const { draftPoints, activeTool } = get();
    if (draftPoints.length === 0) return;

    // Pull the calibrated scale for the page this item is being saved to
    // (falls back to the toolbar's manual scale factor if uncalibrated).
    const scaleFactor = getActivePageScale(pageNumber).pixelsPerFoot;

    const id = crypto.randomUUID();
    const boundingBox = calculateBoundingBox(draftPoints);

    // Calculate initial dimensions based on the tool used
    let areaSqFt = 0;
    let linearFt = 0;
    let calculatedVolumeCY = 0;

    if (activeTool === 'area') {
      areaSqFt = calculateRealWorldArea(draftPoints, scaleFactor);
      // Volume formula: (Area * Thickness / 12) / 27 (to convert to Cubic Yards)
      calculatedVolumeCY = (areaSqFt * (thicknessInches / 12)) / 27;
    } else if (activeTool === 'linear') {
      linearFt = calculateRealWorldLength(draftPoints, scaleFactor);
    }

    const newTakeoffItem: TakeoffChecklistItem = {
      id,
      pageNumber,
      category,
      label,
      extractedText: `Manually drawn ${activeTool} takeoff`,
      boundingBox,
      points: [...draftPoints],
      status: 'verified',
      dimensions: {
        thicknessInches,
        areaSqFt: areaSqFt > 0 ? Math.round(areaSqFt * 100) / 100 : undefined,
        linearFt: linearFt > 0 ? Math.round(linearFt * 100) / 100 : undefined,
      },
      calculatedVolumeCY: calculatedVolumeCY > 0 ? Math.round(calculatedVolumeCY * 100) / 100 : undefined
    };

    set((state) => ({
      takeoffs: [...state.takeoffs, newTakeoffItem],
      draftPoints: [], // Wipe draft clear
      activeTool: 'select', // Revert cursor back to selection mode
      selectedTakeoffId: id // Highlight the newly created item
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

      let volume = 0;
      if (item.category === 'Slab' && updatedDims.areaSqFt && updatedDims.thicknessInches) {
        volume = (updatedDims.areaSqFt * (updatedDims.thicknessInches / 12)) / 27;
      } else if (
        item.category === 'Grade Beam' &&
        updatedDims.linearFt &&
        updatedDims.widthInches &&
        updatedDims.depthInches
      ) {
        volume = (updatedDims.linearFt * (updatedDims.widthInches / 12) * (updatedDims.depthInches / 12)) / 27;
      }

      return { ...item, dimensions: updatedDims, calculatedVolumeCY: Math.round(volume * 100) / 100 };
    })
  }))
}));
