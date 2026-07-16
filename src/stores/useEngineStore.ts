import { create } from 'zustand';
import type { TakeoffEngine } from '@/canvas/Engine';

interface EngineStore {
  engine: TakeoffEngine | null;
  setEngine: (engine: TakeoffEngine | null) => void;
}

// Lets React components (Toolbar, AlignmentWizard) reach the imperative canvas
// engine instance owned by useCanvas() without threading refs through props.
export const useEngineStore = create<EngineStore>((set) => ({
  engine: null,
  setEngine: (engine) => set({ engine }),
}));
