import { COLLECTION, classCounts, type ClassLabel } from "../collection";
import { logDiagnostic } from "../diagnostics";
import { storageFailureMessage } from "../recovery";
import { saveDataset, type Clip } from "../storage";
import { session } from "./session";
import { getApp, setApp } from "./store";

let recording: {
  label: ClassLabel;
  frames: number[][];
  lastCapture: number;
  startsAt: number;
  endsAt: number;
  startTimer: ReturnType<typeof setTimeout>;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

export function captureFrame(features: number[], now: number): void {
  if (
    !recording ||
    now < recording.startsAt ||
    now >= recording.endsAt ||
    now - recording.lastCapture < COLLECTION.intervalMs
  )
    return;
  recording.frames.push([...features]);
  recording.lastCapture = now;
  setApp({ recBadge: `${recording.frames.length}` });
}

export async function persistClips(): Promise<void> {
  setApp({ busy: "saving" });
  const { dataset } = getApp();
  try {
    await saveDataset(dataset, session.persistedRevision);
    session.persistedRevision = dataset.revision;
    setApp({ dirty: false, collectionStatus: "" });
  } catch (error) {
    logDiagnostic("storage", "dataset-save-failed", error, "error");
    setApp({
      dirty: true,
      collectionStatus: `Save failed. ${storageFailureMessage(error)} Retry before training.`,
    });
  } finally {
    setApp({ busy: "idle" });
  }
}

export function cancelClip(): void {
  if (!recording) return;
  clearTimeout(recording.startTimer);
  clearTimeout(recording.timer);
  recording = null;
  setApp({ recBadge: null, busy: "idle", collectionStatus: "Recording cancelled." });
}

export function beginClip(label: ClassLabel): void {
  const { busy, cameraReady, dirty, storageBlocked, dataset } = getApp();
  if (
    busy !== "idle" ||
    !cameraReady ||
    dirty ||
    storageBlocked ||
    classCounts(dataset.clips, label).clips >= COLLECTION.maxClipsPerClass
  )
    return;

  const startsAt = performance.now() + COLLECTION.leadInMs;
  recording = {
    label,
    frames: [],
    lastCapture: -Infinity,
    startsAt,
    endsAt: startsAt + COLLECTION.clipMs,
    startTimer: setTimeout(() => {
      if (recording) setApp({ recBadge: "REC" });
    }, COLLECTION.leadInMs),
    timer: setTimeout(() => void finishClip(), COLLECTION.leadInMs + COLLECTION.clipMs),
  };
  setApp({ busy: "recording", recBadge: "1", collectionStatus: "" });
}

async function finishClip(): Promise<void> {
  if (!recording) return;
  const finished = recording;
  clearTimeout(finished.startTimer);
  recording = null;
  setApp({ recBadge: null });
  if (finished.frames.length < COLLECTION.minClipFrames) {
    setApp({
      busy: "idle",
      collectionStatus: `${finished.frames.length} usable frames. Record this clip again.`,
    });
    return;
  }

  const clip: Clip = {
    id: crypto.randomUUID(),
    label: finished.label,
    frames: finished.frames,
    createdAt: Date.now(),
  };
  setApp({
    dataset: {
      revision: session.persistedRevision + 1,
      clips: [...getApp().dataset.clips, clip],
    },
    dirty: true,
    editingExamples: true,
  });
  await persistClips();
}

export async function removeLast(label: ClassLabel): Promise<void> {
  const { busy, dirty, storageBlocked, dataset } = getApp();
  if (busy !== "idle" || dirty || storageBlocked) return;
  const index = dataset.clips.findLastIndex((clip) => clip.label === label);
  if (index < 0) return;
  setApp({
    dataset: {
      revision: session.persistedRevision + 1,
      clips: dataset.clips.filter((_, i) => i !== index),
    },
    dirty: true,
    editingExamples: true,
  });
  await persistClips();
}
