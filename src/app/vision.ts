import { predictScore } from "../classifier";
import { CloneEffect, CLONE_EFFECT_DURATION_MS } from "../clone-effect";
import { logDiagnostic } from "../diagnostics";
import { extractFeatures } from "../features";
import { HandCamera } from "../hand-camera";
import { addDrawTime } from "../performance-report";
import { GestureTrigger } from "../trigger";
import { cancelClip, captureFrame } from "./recording";
import { session } from "./session";
import { getApp, setApp } from "./store";

type CameraResult = NonNullable<Parameters<ConstructorParameters<typeof HandCamera>[1]>[0]>;

export interface VisionElements {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  overlay: HTMLImageElement;
}

// Camera frames stay imperative. React only sees the score and status text they produce.
let parts: {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: HandCamera;
  cloneEffect: CloneEffect;
} | null = null;
const trigger = new GestureTrigger();
let effectTimer: ReturnType<typeof setTimeout> | null = null;
let diagnosticFrame: number | null = null;
let canvasTestUntil = 0;
let diagnosticTestGeneration = 0;
let handsValid: boolean | null = null;
let lastPredictionGate = "";
let lastRenderingGate = "";
let renderingFailed = false;
let predictionFailed = false;

function vision() {
  if (!parts) throw new Error("The camera view is not ready.");
  return parts;
}

export function getCamera(): HandCamera {
  return vision().camera;
}

export function getCloneEffect(): CloneEffect {
  return vision().cloneEffect;
}

export function getVideo(): HTMLVideoElement {
  return vision().video;
}

export function armTrigger(): void {
  trigger.arm();
}

export function clearCanvas(): void {
  const { ctx, canvas } = vision();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function sizeCanvas(): void {
  const { video, canvas } = vision();
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function syncEffect(): void {
  setApp({ effectActive: vision().cloneEffect.isActive() });
}

export function stopDiagnosticTest(): void {
  diagnosticTestGeneration += 1;
  if (diagnosticFrame !== null) cancelAnimationFrame(diagnosticFrame);
  diagnosticFrame = null;
  canvasTestUntil = 0;
}

export function clearEffectTimer(): void {
  if (effectTimer) clearTimeout(effectTimer);
  effectTimer = null;
}

export function enableTestingRuntime(): void {
  const { cloneEffect, camera } = vision();
  void cloneEffect
    .enableSegmentation()
    .then(() => {
      if (!session.disposed && !getApp().editingExamples)
        camera.setFrameProcessor((frame) => cloneEffect.process(frame));
    })
    .catch((error) => {
      logDiagnostic("segmentation", "testing-runtime-failed", error, "error");
      setApp({ practiceStatus: "Segmentation failed. Open Diagnostics for details." });
    });
}

export function finishCloneEffect(): void {
  stopDiagnosticTest();
  logDiagnostic("clone", "finished");
  clearEffectTimer();
  vision().cloneEffect.reset();
  trigger.requireRelease(performance.now());
  setApp({ practiceStatus: "Release to re-arm." });
  syncEffect();
}

function startCloneEffect(now: number): void {
  logDiagnostic("gesture", "clone-start-requested");
  if (!vision().cloneEffect.start(now)) {
    logDiagnostic("gesture", "clone-start-rejected", undefined, "warn");
    trigger.arm();
    setApp({ practiceStatus: "Effect loading." });
    return;
  }
  logDiagnostic("gesture", "clone-started");
  clearEffectTimer();
  effectTimer = setTimeout(finishCloneEffect, CLONE_EFFECT_DURATION_MS);
  setApp({ practiceStatus: "Clone sequence active." });
  syncEffect();
}

function drawLandmarks(result: CameraResult): void {
  const { ctx, canvas } = vision();
  for (const hand of [result.rightHandLandmarks, result.leftHandLandmarks]) {
    if (!hand) continue;
    ctx.fillStyle = "#67e8f9";
    for (const point of hand) {
      ctx.beginPath();
      ctx.arc((1 - point.x) * canvas.width, point.y * canvas.height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawResult(result: CameraResult): void {
  const { ctx, canvas, video, cloneEffect } = vision();
  sizeCanvas();
  const renderStart = performance.now();
  try {
    if (diagnosticFrame === null && performance.now() >= canvasTestUntil) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (cloneEffect.isActive()) cloneEffect.draw(ctx, video, canvas.width, canvas.height);
      else drawLandmarks(result);
    }
    if (renderingFailed) logDiagnostic("canvas", "render-recovered");
    renderingFailed = false;
  } catch (error) {
    if (!renderingFailed) logDiagnostic("canvas", "render-failed", error, "error");
    renderingFailed = true;
  }
  addDrawTime(performance.now() - renderStart);
}

function logRenderingGate(result: CameraResult | null): void {
  const gate = !result
    ? "no-camera-result"
    : diagnosticFrame !== null
      ? "manual-clone-test"
      : performance.now() < canvasTestUntil
        ? "manual-canvas-test"
        : vision().cloneEffect.isActive()
          ? "clone-effect"
          : "landmarks";
  if (gate === lastRenderingGate) return;
  lastRenderingGate = gate;
  logDiagnostic("canvas", "render-state", { stage: gate });
}

function observeNoHands(): void {
  const previousPhase = trigger.getPhase();
  const state = trigger.observe(null, performance.now());
  if (previousPhase !== state.phase || state.released) {
    logDiagnostic("gesture", "state", { ...state, score: null });
  }
  setApp({ score: null });
  if (state.released && session.model && !getApp().editingExamples) setApp({ practiceStatus: "" });
}

function scoreFrame(features: number[], now: number): void {
  const { busy, editingExamples } = getApp();
  const gate = !session.model
    ? "no-model"
    : editingExamples
      ? "editing-examples"
      : busy === "training" || busy === "saving"
        ? busy
        : "ready";
  if (gate !== lastPredictionGate) {
    lastPredictionGate = gate;
    logDiagnostic("prediction", "readiness", { reason: gate });
  }
  if (gate !== "ready" || !session.model) return;

  try {
    const inferenceStart = performance.now();
    const score = predictScore(session.model, features);
    if (predictionFailed) logDiagnostic("prediction", "recovered");
    predictionFailed = false;
    addDrawTime(performance.now() - inferenceStart);
    setApp({ score });
    if (vision().cloneEffect.isActive()) return;

    const previousPhase = trigger.getPhase();
    const state = trigger.observe(score, now);
    if (previousPhase !== state.phase || state.triggered || state.released) {
      logDiagnostic("gesture", "state", { ...state, score });
    }
    if (state.triggered) {
      startCloneEffect(now);
    } else if (state.phase === "holding") {
      setApp({ practiceStatus: `Hold ${Math.round(state.positiveProgress * 100)}%` });
    } else if (state.phase === "latched" || state.phase === "release-required") {
      setApp({ practiceStatus: "Release to re-arm." });
    } else {
      setApp({ practiceStatus: "" });
    }
  } catch (error) {
    if (!predictionFailed) logDiagnostic("prediction", "failed", error, "error");
    predictionFailed = true;
    setApp({ score: null, practiceStatus: "Prediction failed. Retrain the model." });
  }
}

function onCameraResult(result: CameraResult | null): void {
  const features = result
    ? extractFeatures(result.rightHandLandmarks, result.leftHandLandmarks)
    : null;
  logRenderingGate(result);
  if (result) drawResult(result);

  if (handsValid !== Boolean(features)) {
    handsValid = Boolean(features);
    logDiagnostic("features", handsValid ? "both-hands-valid" : "missing-or-invalid-hands");
  }
  if (!features) {
    observeNoHands();
    return;
  }
  const now = performance.now();
  captureFrame(features, now);
  scoreFrame(features, now);
}

function onCameraStatus(message: string, ready: boolean): void {
  if (!ready) {
    setApp({ score: null });
    cancelClip();
  }
  const { cameraStarted } = getApp();
  const loading = /loading|starting|allow camera/i.test(message);
  const failed = /denied|could not|stopped|requires|does not provide|no usable|busy|failed/i.test(
    message,
  );
  setApp({
    cameraReady: ready,
    viewfinderNote: ready
      ? ""
      : cameraStarted
        ? loading
          ? "Loading…"
          : "Camera paused"
        : "Camera is off",
    viewfinderLoading: !ready && cameraStarted && loading,
    cameraStatus: failed ? message : "",
    cameraStarted: failed ? false : cameraStarted,
  });
}

export function attachVision({ video, canvas, overlay }: VisionElements): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
  parts = {
    video,
    canvas,
    ctx,
    camera: new HandCamera(video, onCameraResult, onCameraStatus),
    cloneEffect: new CloneEffect(overlay),
  };
}

export function startCamera(): void {
  setApp({ cameraStarted: true, viewfinderNote: "Loading…", viewfinderLoading: true });
  void vision().camera.start();
}

export function stopCamera(): void {
  cancelClip();
  setApp({ cameraStarted: false, cameraReady: false });
  void vision().camera.stop();
  setApp({ cameraStatus: "", viewfinderNote: "Camera is off", viewfinderLoading: false });
}

export function editExamples(): void {
  const { busy, staleExternal } = getApp();
  if (busy !== "idle" || staleExternal) return;
  if (vision().cloneEffect.isActive()) finishCloneEffect();
  stopDiagnosticTest();
  vision().camera.setFrameProcessor(null);
  setApp({ editingExamples: true, practiceStatus: "" });
}

export function testCanvas(): void {
  const { ctx, canvas, cloneEffect } = vision();
  if (cloneEffect.isActive()) finishCloneEffect();
  stopDiagnosticTest();
  sizeCanvas();
  canvasTestUntil = performance.now() + 3000;
  try {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#67e8f9";
    ctx.fillRect(20, 20, canvas.width - 40, canvas.height - 40);
    ctx.fillStyle = "#111827";
    ctx.font = "24px sans-serif";
    ctx.fillText("Canvas test", 40, 60);
    logDiagnostic("canvas", "manual-test-drawn", { width: canvas.width, height: canvas.height });
  } catch (error) {
    logDiagnostic("canvas", "manual-test-failed", error, "error");
  }
}

export async function testCloneEffect(): Promise<void> {
  const { ctx, canvas, cloneEffect } = vision();
  finishCloneEffect();
  const generation = diagnosticTestGeneration;
  try {
    if (!(await cloneEffect.startTest())) return;
    if (session.disposed || generation !== diagnosticTestGeneration) {
      cloneEffect.reset();
      return;
    }
    effectTimer = setTimeout(finishCloneEffect, CLONE_EFFECT_DURATION_MS);
    const endsAt = performance.now() + CLONE_EFFECT_DURATION_MS;
    syncEffect();
    sizeCanvas();
    const draw = () => {
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cloneEffect.drawTest(ctx, canvas.width, canvas.height);
        if (cloneEffect.isActive() && !session.disposed && performance.now() < endsAt)
          diagnosticFrame = requestAnimationFrame(draw);
        else finishCloneEffect();
      } catch (error) {
        diagnosticFrame = null;
        logDiagnostic("clone", "manual-test-render-failed", error, "error");
        finishCloneEffect();
      }
    };
    diagnosticFrame = requestAnimationFrame(draw);
  } catch (error) {
    logDiagnostic("clone", "manual-test-failed", error, "error");
  }
}
