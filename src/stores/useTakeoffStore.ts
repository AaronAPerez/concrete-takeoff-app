import { create } from 'zustand';
import { Point, TakeoffChecklistItem } from '@/types/takeoff';
import {
  calculateRealWorldArea,
  calculateRealWorldLength,
  calculateBoundingBox
} from '@/utils/geometry';
import { useBlueprintStore } from '@/stores/useBlueprintStore';

export type ToolType = 'select' | 'pan' | 'area' | 'linear' | 'calibrate' | 'align';

interface TakeoffState {
  // Active Tool state
  activeTool: ToolType;
  
  // Points currently being drawn by the user (not yet saved)
  draftPoints: Point[];
  
  // Confirmed, permanent takeoff drawings
  takeoffs: TakeoffChecklistItem[];
  
  // Selected item for sidebar inspection or modification
  selectedTakeoffId: string | null;

  // Actions
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
  updateItemStatus: (id: string, status: TakeoffChecklistItem['status']) => void;
  updateItemDimensions: (id: string, dimensions: Partial<TakeoffChecklistItem['dimensions']>) => void;
}

export const useTakeoffStore = create<TakeoffState>((set, get) => ({
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

    // Pull scale configuration dynamically from the blueprint store
    const scaleFactor = useBlueprintStore.getState().scaleFactor;

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
