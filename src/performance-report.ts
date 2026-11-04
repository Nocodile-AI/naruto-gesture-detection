import type { DiagnosticEntry } from "./diagnostics";
import { TRIGGER_CONFIG } from "./trigger";

export interface FrameSample {
  at: number;
  mask: number;
  hands: number;
  draw: number;
}

export type TrackingState = "off" | "running" | "paused";

export interface FrameSummary {
  framesPerSecond: number;
  frameMs: number;
  maskMs: number;
  handsMs: number;
  drawMs: number;
  scoreGapMs: number;
}

export interface Verdict {
  tone: "idle" | "good" | "warn";
  title: string;
  detail: string;
}

export interface Stage {
  label: string;
  ms: number;
}

export interface TrainingRun {
  debug: boolean;
  examples: number;
  outcome: "complete" | "cancelled" | "failed";
  backend: string;
  firstProgressMs: number | null;
  trainMs: number | null;
  saveMs: number | null;
  longestFreezeMs: number;
}

export interface CloneStats {
  triggerToEffectMs: number | null;
  personCoverage: number | null;
}

const MAX_FRAMES = 300;
const WINDOW_MS = 10_000;
const STALE_MS = 2000;
/** A person layer this opaque hides the clones: the symptom of WebKit bug 221542. */
export const PERSON_LAYER_LIMIT = 0.98;

let frames: FrameSample[] = [];
let maskMs = 0;
let drawMs = 0;
let trackingState: TrackingState = "off";

export function addMaskTime(ms: number): void {
  maskMs += ms;
}

export function addDrawTime(ms: number): void {
  drawMs += ms;
}

/** `sendMs` wraps the result callback, so drawing and scoring are taken back out of it. */
export function endFrame(sendMs: number, at = performance.now()): void {
  frames.push({ at, mask: maskMs, hands: Math.max(0, sendMs - drawMs), draw: drawMs });
  if (frames.length > MAX_FRAMES) frames.shift();
  maskMs = 0;
  drawMs = 0;
}

export function recentFrames(): FrameSample[] {
  return frames;
}

export function setTrackingState(state: TrackingState): void {
  trackingState = state;
  frames = [];
  maskMs = 0;
  drawMs = 0;
}

export function getTrackingState(): TrackingState {
  return trackingState;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function summarizeFrames(samples: FrameSample[], now: number): FrameSummary | null {
  const recent = samples.filter((sample) => sample.at >= now - WINDOW_MS);
  const last = recent.at(-1);
  if (recent.length < 4 || !last || now - last.at > STALE_MS) return null;
  const elapsed = last.at - recent[0].at;
  // Every frame is scored, so the wait between scores is the wait between frames.
  const gaps = recent
    .slice(1)
    .map((sample, index) => sample.at - recent[index].at)
    .sort((a, b) => a - b);
  return {
    framesPerSecond: ((recent.length - 1) * 1000) / elapsed,
    frameMs: elapsed / (recent.length - 1),
    maskMs: median(recent.map((sample) => sample.mask)),
    handsMs: median(recent.map((sample) => sample.hands)),
    drawMs: median(recent.map((sample) => sample.draw)),
    scoreGapMs: gaps[Math.floor(gaps.length * 0.9)] ?? 0,
  };
}

export function frameVerdict(summary: FrameSummary | null, state: TrackingState): Verdict {
  if (state === "paused")
    return {
      tone: "idle",
      title: "Tracking is paused while the model trains.",
      detail: "The camera stays on. Tracking resumes when training ends.",
    };
  if (state === "off")
    return {
      tone: "idle",
      title: "Start the camera to measure this device.",
      detail: "This checks whether scores arrive fast enough to trigger the clones.",
    };
  if (!summary)
    return {
      tone: "idle",
      title: "Measuring this device.",
      detail: "This takes a few seconds once hand tracking has loaded.",
    };
  const gap = Math.round(summary.scoreGapMs);
  const limit = TRIGGER_CONFIG.maxPositiveGapMs;
  return gap <= limit
    ? {
        tone: "good",
        title: "Clones can trigger on this device.",
        detail: `A new score arrives every ${gap} ms. The trigger allows up to ${limit} ms.`,
      }
    : {
        tone: "warn",
        title: "Clones may not trigger on this device.",
        detail: `A new score arrives every ${gap} ms, and the trigger allows up to ${limit} ms. Close other tabs or apps and watch this again.`,
      };
}

/** Longest gap between animation frames until the returned function is called. */
export function watchFreezes(): () => number {
  let longest = 0;
  let last = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    if (!document.hidden) longest = Math.max(longest, now - last);
    last = now;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    return longest;
  };
}

function isSessionStart(entry: DiagnosticEntry): boolean {
  return entry.stage === "diagnostics" && entry.event === "session started";
}

export function currentSession(entries: DiagnosticEntry[]): DiagnosticEntry[] {
  return entries.slice(Math.max(0, entries.findLastIndex(isSessionStart)));
}

function findEvent(
  entries: DiagnosticEntry[],
  stage: string,
  event: string,
): DiagnosticEntry | undefined {
  return entries.findLast((entry) => entry.stage === stage && entry.event === event);
}

function between(start: DiagnosticEntry | undefined, end: DiagnosticEntry | undefined) {
  if (!start || !end) return null;
  const ms = Date.parse(end.time) - Date.parse(start.time);
  return ms >= 0 ? ms : null;
}

function knownStages(stages: [string, number | null][]): Stage[] {
  return stages.flatMap(([label, ms]) => (ms === null ? [] : [{ label, ms }]));
}

export function startupStages(entries: DiagnosticEntry[]): Stage[] {
  const session = currentSession(entries);
  const playing = findEvent(session, "camera", "video-playing");
  return knownStages([
    ["Camera permission", between(findEvent(session, "camera", "requesting-stream"), playing)],
    [
      "Hand tracking download and start",
      between(playing, findEvent(session, "mediapipe", "first-hand-result")),
    ],
    [
      "Clone mask download and start",
      between(
        findEvent(session, "segmentation", "first-send"),
        findEvent(session, "segmentation", "first-mask"),
      ),
    ],
  ]);
}

export function latestTrainingRun(entries: DiagnosticEntry[]): TrainingRun | null {
  return (findEvent(entries, "training", "run")?.details as TrainingRun | undefined) ?? null;
}

export function trainingStages(run: TrainingRun): Stage[] {
  return knownStages([
    ["Until the first progress", run.firstProgressMs],
    ["Training", run.trainMs],
    ["Saving", run.saveMs],
  ]);
}

export function latestCloneStats(entries: DiagnosticEntry[]): CloneStats | null {
  const session = currentSession(entries);
  const rendered = session.findLast(
    (entry) =>
      entry.stage === "canvas" &&
      entry.event === "first-clones-rendered" &&
      !(entry.details as { testMode?: boolean } | undefined)?.testMode,
  );
  if (!rendered) return null;
  const before = session.slice(0, session.indexOf(rendered));
  const requested = before.findLast(
    (entry) => entry.stage === "gesture" && entry.event === "clone-start-requested",
  );
  // The first clone waits 1 s by design, so timing to it would hide the real delay.
  const effectStarted = before.findLast(
    (entry) =>
      entry.stage === "canvas" &&
      entry.event === "render-state" &&
      (entry.details as { stage?: string } | undefined)?.stage === "clone-effect",
  );
  const { personCoverage = null } = rendered.details as { personCoverage?: number | null };
  return { triggerToEffectMs: between(requested, effectStarted), personCoverage };
}
