import * as tf from "@tensorflow/tfjs";
import { readyToDebugTrain, trainClassifier, TRAINING_EPOCHS } from "../classifier";
import { readyToTrain } from "../collection";
import { logDiagnostic } from "../diagnostics";
import { watchFreezes, type TrainingRun } from "../performance-report";
import { publishCandidate } from "../storage";
import { session, setModel } from "./session";
import { getApp, setApp } from "./store";
import { armTrigger, clearCanvas, enableTestingRuntime, getCamera } from "./vision";

export async function train(debug = false): Promise<void> {
  const { busy, staleExternal, dirty, storageBlocked, dataset } = getApp();
  if (
    busy !== "idle" ||
    staleExternal ||
    dirty ||
    storageBlocked ||
    !(debug ? readyToDebugTrain(dataset.clips) : readyToTrain(dataset.clips))
  )
    return;
  logDiagnostic("training", "requested", {
    debug,
    revision: dataset.revision,
    clips: dataset.clips.length,
  });
  const abort = new AbortController();
  session.trainingAbort = abort;
  armTrigger();
  getCamera().setTrackingPaused(true);
  clearCanvas();
  setApp({
    busy: "training",
    score: null,
    trainingProgress: 0,
    trainStatus: "Starting training…",
  });
  const startedAt = performance.now();
  const stopFreezeWatch = watchFreezes();
  let firstProgressAt: number | null = null;
  let fitEndedAt: number | null = null;
  let savedAt: number | null = null;
  let outcome: TrainingRun["outcome"] = "failed";
  let candidate: tf.LayersModel | null = null;
  try {
    // Two frames guarantee one paint of the status above before TensorFlow.js starts.
    await tf.nextFrame();
    await tf.nextFrame();
    candidate = await trainClassifier(
      dataset.clips.filter((clip) => clip.label === "clone_sign").map((clip) => clip.frames),
      dataset.clips.filter((clip) => clip.label === "not_sign").map((clip) => clip.frames),
      (epoch) => {
        firstProgressAt ??= performance.now();
        setApp({
          trainStatus: `Training ${epoch}/${TRAINING_EPOCHS}`,
          trainingProgress: (epoch / TRAINING_EPOCHS) * 100,
        });
      },
      abort.signal,
    );
    fitEndedAt = performance.now();
    if (session.disposed) {
      candidate.dispose();
      candidate = null;
      return;
    }

    setApp({ busy: "saving", trainStatus: "Saving model…" });
    const published = await publishCandidate(candidate, dataset.revision);
    savedAt = performance.now();
    outcome = "complete";
    session.model?.dispose();
    setModel(candidate, published);
    candidate = null;
    armTrigger();
    setApp({ editingExamples: false, trainStatus: "", practiceStatus: "" });
    enableTestingRuntime();
  } catch (error) {
    logDiagnostic("training", "workflow-failed", error, "error");
    candidate?.dispose();
    const cancelled = error instanceof DOMException && error.name === "AbortError";
    if (cancelled) outcome = "cancelled";
    setApp({
      trainStatus: cancelled
        ? "Training cancelled."
        : `Training failed. ${error instanceof Error ? error.message : "Try again."}`,
    });
  } finally {
    const run: TrainingRun = {
      debug,
      examples: dataset.clips.reduce((total, clip) => total + clip.frames.length, 0) * 3,
      outcome,
      backend: tf.getBackend(),
      firstProgressMs: firstProgressAt && firstProgressAt - startedAt,
      trainMs: firstProgressAt && fitEndedAt && fitEndedAt - firstProgressAt,
      saveMs: fitEndedAt && savedAt && savedAt - fitEndedAt,
      longestFreezeMs: stopFreezeWatch(),
    };
    logDiagnostic("training", "run", run);
    getCamera().setTrackingPaused(false);
    session.trainingAbort = null;
    if (session.disposed) {
      session.model?.dispose();
      setModel(null, null);
    }
    setApp({ busy: "idle" });
  }
}
