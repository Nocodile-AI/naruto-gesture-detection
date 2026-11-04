import { describe, expect, test } from "vitest";
import type { DiagnosticEntry } from "../src/diagnostics";
import {
  frameVerdict,
  latestCloneStats,
  latestTrainingRun,
  startupStages,
  summarizeFrames,
  trainingStages,
  type FrameSample,
  type TrainingRun,
} from "../src/performance-report";
import { GestureTrigger } from "../src/trigger";

const frameTimes = (intervalMs: number, count = 60) =>
  Array.from({ length: count }, (_, index) => 1000 + index * intervalMs);
const samples = (times: number[]): FrameSample[] =>
  times.map((at) => ({ at, mask: 17, hands: 71, draw: 2 }));

function entry(seconds: number, stage: string, event: string, details?: unknown): DiagnosticEntry {
  return {
    time: new Date(Date.UTC(2026, 10, 4, 0, 0, seconds)).toISOString(),
    stage,
    event,
    level: "info",
    details,
  };
}

/** Runs the real trigger on the scores a uniform frame rate would produce. */
function triggerFires(intervalMs: number): boolean {
  const trigger = new GestureTrigger();
  return frameTimes(intervalMs).some((at) => trigger.observe(1, at).triggered);
}

describe("frame verdict", () => {
  test.each([33, 90, 110, 130, 145, 160, 240, 260, 300])(
    "agrees with the real trigger at %i ms per frame",
    (intervalMs) => {
      const times = frameTimes(intervalMs);
      const verdict = frameVerdict(summarizeFrames(samples(times), times.at(-1)!), "running");
      expect(verdict.tone === "good").toBe(triggerFires(intervalMs));
    },
  );

  test("explains the states that have no measurement", () => {
    expect(frameVerdict(null, "off").title).toMatch(/Start the camera/);
    expect(frameVerdict(null, "running").title).toMatch(/Measuring/);
    expect(frameVerdict(null, "paused").title).toMatch(/paused/);
  });
});

describe("frame summary", () => {
  test("reports the rate and the typical cost of each step", () => {
    const times = frameTimes(100);
    expect(summarizeFrames(samples(times), times.at(-1)!)).toMatchObject({
      framesPerSecond: 10,
      frameMs: 100,
      maskMs: 17,
      handsMs: 71,
      drawMs: 2,
      scoreGapMs: 100,
    });
  });

  test("drops out when frames stop arriving", () => {
    const times = frameTimes(100);
    expect(summarizeFrames(samples(times), times.at(-1)! + 2001)).toBeNull();
  });
});

describe("log reports", () => {
  test("startup uses the latest session only", () => {
    const entries = [
      entry(0, "camera", "requesting-stream"),
      entry(50, "camera", "video-playing"),
      entry(60, "diagnostics", "session started"),
      entry(61, "camera", "requesting-stream"),
      entry(63, "camera", "video-playing"),
      entry(68, "mediapipe", "first-hand-result"),
    ];
    expect(startupStages(entries)).toEqual([
      { label: "Camera permission", ms: 2000 },
      { label: "Hand tracking download and start", ms: 5000 },
    ]);
  });

  test("the latest training run survives a reload and skips stages that never ran", () => {
    const run: TrainingRun = {
      debug: true,
      examples: 165,
      outcome: "cancelled",
      backend: "webgl",
      firstProgressMs: 400,
      trainMs: null,
      saveMs: null,
      longestFreezeMs: 120,
    };
    const entries = [entry(0, "training", "run", run), entry(1, "diagnostics", "session started")];
    expect(latestTrainingRun(entries)).toEqual(run);
    expect(trainingStages(run)).toEqual([{ label: "Until the first progress", ms: 400 }]);
  });

  test("clone stats ignore the test button", () => {
    const entries = [
      entry(0, "gesture", "clone-start-requested"),
      entry(2, "canvas", "render-state", { stage: "clone-effect" }),
      entry(3, "canvas", "first-clones-rendered", { testMode: false, personCoverage: 0.28 }),
      entry(5, "canvas", "first-clones-rendered", { testMode: true, personCoverage: 0.1 }),
    ];
    expect(latestCloneStats(entries)).toEqual({ triggerToEffectMs: 2000, personCoverage: 0.28 });
  });
});
