import * as tf from "@tensorflow/tfjs";
import { predictScore } from "../classifier";
import { logDiagnostic } from "../diagnostics";
import { FEATURE_SIZE } from "../features";
import { storageFailureMessage } from "../recovery";
import { subscribeAppStateChanges } from "../state-sync";
import { clearAppState, loadActiveRecord, loadDataset, loadStateStamp } from "../storage";
import { cancelClip } from "./recording";
import { session, setModel } from "./session";
import { getApp, setApp } from "./store";
import {
  armTrigger,
  attachVision,
  clearEffectTimer,
  enableTestingRuntime,
  getCamera,
  getCloneEffect,
  stopDiagnosticTest,
  type VisionElements,
} from "./vision";

const CAMERA_OFF = {
  cameraStarted: false,
  cameraReady: false,
  viewfinderNote: "Camera is off",
  viewfinderLoading: false,
};

async function restoreSavedWork(): Promise<void> {
  void getCamera().prepare();
  void getCloneEffect()
    .prepareAssets()
    .catch((error) => {
      logDiagnostic("assets", "prepare-failed", error, "error");
      setApp({
        practiceStatus: `Effect assets failed to load. ${error instanceof Error ? error.message : ""}`,
      });
    });

  let revision = 0;
  try {
    const dataset = await loadDataset();
    revision = dataset.revision;
    session.persistedRevision = dataset.revision;
    setApp({ dataset });
  } catch (error) {
    logDiagnostic("storage", "dataset-restore-failed", error, "error");
    setApp({
      storageBlocked: true,
      bootStatus:
        error instanceof Error ? error.message : "Saved work could not open. Reload or start over.",
    });
  }

  let record = null;
  try {
    record = await loadActiveRecord();
  } catch (error) {
    logDiagnostic("storage", "model-metadata-restore-failed", error, "error");
    setApp({
      storageBlocked: true,
      trainStatus: "Saved model data cannot be opened safely. Start over to clear it.",
    });
  }

  if (record) {
    try {
      const restored = await tf.loadLayersModel(record.url);
      try {
        predictScore(
          restored,
          Array.from({ length: FEATURE_SIZE }, () => 0),
        );
      } catch (error) {
        restored.dispose();
        throw error;
      }
      const editingExamples = record.datasetRevision !== revision;
      setModel(restored, record);
      armTrigger();
      setApp({ editingExamples });
      if (editingExamples)
        setApp({ trainStatus: "Examples changed after this model. Train again." });
      else enableTestingRuntime();
    } catch (error) {
      logDiagnostic("storage", "model-restore-failed", error, "error");
      setModel(null, null);
      setApp({
        editingExamples: true,
        trainStatus: "Saved model could not be restored. Train again.",
      });
    }
  }

  setApp({ busy: "idle" });
}

async function markExternalChange(): Promise<void> {
  if (session.disposed || getApp().staleExternal) return;
  stopDiagnosticTest();
  setApp({ staleExternal: true });
  session.trainingAbort?.abort();
  cancelClip();
  setApp(CAMERA_OFF);
  await getCamera().stop();
  clearEffectTimer();
  getCloneEffect().reset();
  session.model?.dispose();
  setModel(null, null);
  setApp({ effectActive: false, score: null, syncStatus: "Reload before continuing." });
}

async function checkStateFreshness(): Promise<void> {
  const { staleExternal, busy } = getApp();
  if (session.disposed || staleExternal || busy === "booting") return;
  try {
    const stamp = await loadStateStamp();
    if (
      stamp.datasetRevision !== session.persistedRevision ||
      stamp.modelId !== (session.record?.id ?? null)
    ) {
      await markExternalChange();
    }
  } catch (error) {
    logDiagnostic("storage", "freshness-check-failed", error, "error");
    await markExternalChange();
  }
}

export async function confirmStartOver(): Promise<void> {
  if (getApp().busy !== "idle") return;
  setApp({ busy: "saving", startOverOpen: false });
  session.trainingAbort?.abort();
  cancelClip();
  setApp(CAMERA_OFF);
  await getCamera().stop();
  try {
    const result = await clearAppState();
    session.persistedRevision = result.dataset.revision;
    session.model?.dispose();
    setModel(null, null);
    setApp({ dataset: result.dataset, dirty: false, storageBlocked: false });
    if (result.cleanupFailures > 0) {
      setApp({ bootStatus: "Old model cleanup failed. Try Start over again.", busy: "idle" });
      return;
    }
    location.reload();
  } catch (error) {
    logDiagnostic("storage", "reset-failed", error, "error");
    setApp({ bootStatus: `Reset failed. ${storageFailureMessage(error)}`, busy: "idle" });
  }
}

let started = false;

export function startApp(elements: VisionElements): void {
  if (started) return;
  started = true;
  attachVision(elements);

  const unsubscribe = subscribeAppStateChanges(() => void markExternalChange());
  window.addEventListener("focus", () => void checkStateFreshness());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void checkStateFreshness();
  });
  window.addEventListener("pagehide", () => {
    session.disposed = true;
    stopDiagnosticTest();
    unsubscribe();
    cancelClip();
    session.trainingAbort?.abort();
    clearEffectTimer();
    getCamera().dispose();
    void getCloneEffect().dispose();
    if (!session.trainingAbort) {
      session.model?.dispose();
      session.model = null;
    }
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) location.reload();
  });

  void restoreSavedWork();
}
