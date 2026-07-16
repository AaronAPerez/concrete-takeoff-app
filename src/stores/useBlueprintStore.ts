import { create } from 'zustand';
import type { AlignmentMatrix } from '@/utils/alignment';
import { DEFAULT_SCALE_FACTOR } from '@/utils/scale';

const IDENTITY_ALIGNMENT: AlignmentMatrix = {
  translateX: 0,
  translateY: 0,
  scale: 1,
  rotationDeg: 0,
};

interface BlueprintStore {
  blueprintUrl: string | null;
  currentPage: number;
  pageCount: number;
  scaleFactor: number; // pixels per real-world foot, at the blueprint's rendered resolution

  comparisonUrl: string | null;
  comparisonPage: number;
  isComparing: boolean;
  alignmentMatrix: AlignmentMatrix;

  loadBlueprint: (url: string) => void;
  setPage: (page: number) => void;
  setPageCount: (count: number) => void;
  setScaleFactor: (scaleFactor: number) => void;

  loadComparison: (url: string) => void;
  clearComparison: () => void;
  setComparisonPage: (page: number) => void;
  toggleComparison: (visible?: boolean) => void;
  setRevisionAlignment: (matrix: AlignmentMatrix) => void;
}

export const useBlueprintStore = create<BlueprintStore>((set) => ({
  blueprintUrl: null,
  currentPage: 1,
  pageCount: 1,
  scaleFactor: DEFAULT_SCALE_FACTOR,

  comparisonUrl: null,
  comparisonPage: 1,
  isComparing: false,
  alignmentMatrix: IDENTITY_ALIGNMENT,

  loadBlueprint: (url) => set({ blueprintUrl: url, currentPage: 1 }),
  setPage: (page) => set((state) => ({
    currentPage: Math.max(1, Math.min(page, state.pageCount))
  })),
  setPageCount: (count) => set({ pageCount: count }),
  setScaleFactor: (scaleFactor) => set({ scaleFactor }),

  loadComparison: (url) =>
    set({ comparisonUrl: url, comparisonPage: 1, isComparing: true, alignmentMatrix: IDENTITY_ALIGNMENT }),
  clearComparison: () =>
    set({ comparisonUrl: null, isComparing: false, alignmentMatrix: IDENTITY_ALIGNMENT }),
  setComparisonPage: (page) => set({ comparisonPage: page }),
  toggleComparison: (visible) =>
    set((state) => ({ isComparing: visible ?? !state.isComparing })),
  setRevisionAlignment: (matrix) => set({ alignmentMatrix: matrix }),
}));
