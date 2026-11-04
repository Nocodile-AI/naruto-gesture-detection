import { createStore, useStore } from "zustand";
import type { Dataset } from "../storage";

type Busy = "booting" | "idle" | "recording" | "saving" | "training";

export interface AppState {
  busy: Busy;
  dataset: Dataset;
  dirty: boolean;
  storageBlocked: boolean;
  staleExternal: boolean;
  cameraStarted: boolean;
  cameraReady: boolean;
  viewfinderNote: string;
  viewfinderLoading: boolean;
  recBadge: string | null;
  hasModel: boolean;
  editingExamples: boolean;
  effectActive: boolean;
  score: number | null;
  trainingProgress: number;
  startOverOpen: boolean;
  bootStatus: string;
  syncStatus: string;
  cameraStatus: string;
  collectionStatus: string;
  trainStatus: string;
  practiceStatus: string;
}

const appStore = createStore<AppState>(() => ({
  busy: "booting",
  dataset: { revision: 0, clips: [] },
  dirty: false,
  storageBlocked: false,
  staleExternal: false,
  cameraStarted: false,
  cameraReady: false,
  viewfinderNote: "Camera is off",
  viewfinderLoading: false,
  recBadge: null,
  hasModel: false,
  editingExamples: true,
  effectActive: false,
  score: null,
  trainingProgress: 0,
  startOverOpen: false,
  bootStatus: "",
  syncStatus: "",
  cameraStatus: "",
  collectionStatus: "",
  trainStatus: "",
  practiceStatus: "",
}));

export const setApp = appStore.setState;
export const getApp = appStore.getState;

// Components select single fields, so a new score re-renders only the score meter.
export function useApp<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}
