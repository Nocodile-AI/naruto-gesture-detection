import { expect, test } from "vitest";
import { GestureTrigger, TRIGGER_CONFIG } from "../src/trigger";

const high = 1;
const low = 0.2;

function triggerAt500(trigger: GestureTrigger) {
  trigger.observe(high, 0);
  trigger.observe(high, 200);
  trigger.observe(high, 400);
  return trigger.observe(high, 500);
}

test("triggers only after sustained fresh positive evidence", () => {
  const trigger = new GestureTrigger();
  expect(trigger.observe(high, 0).triggered).toBe(false);
  expect(trigger.observe(high, 200).triggered).toBe(false);
  expect(trigger.observe(high, 400).triggered).toBe(false);
  const result = trigger.observe(high, 500);
  expect(result.triggered).toBe(true);
  expect(result.phase).toBe("latched");
});

test("a long prediction gap clears positive hold evidence", () => {
  const trigger = new GestureTrigger();
  trigger.observe(high, 0);
  trigger.observe(high, 200);
  expect(trigger.observe(high, 500).triggered).toBe(false); // 300ms gap > maxPositiveGapMs.
  expect(trigger.observe(high, 700).triggered).toBe(false);
  expect(trigger.observe(high, 1000).triggered).toBe(false); // another long gap restarts again.
});

test("missing hands can release but can never trigger", () => {
  const trigger = new GestureTrigger();
  expect(triggerAt500(trigger).triggered).toBe(true);

  expect(trigger.observe(null, 2100).released).toBe(false);
  const released = trigger.observe(null, 2100 + TRIGGER_CONFIG.releaseMs);
  expect(released.released).toBe(true);
  expect(released.phase).toBe("armed");

  expect(trigger.observe(null, 4000).triggered).toBe(false);
  expect(trigger.observe(null, 5000).phase).toBe("armed");
});

test("reset requires a low or absent release and prevents hold-through retrigger", () => {
  const trigger = new GestureTrigger();
  expect(triggerAt500(trigger).triggered).toBe(true);

  expect(trigger.requireRelease(700).phase).toBe("release-required");
  expect(trigger.observe(high, 2500).phase).toBe("release-required");
  expect(trigger.observe(high, 3200).triggered).toBe(false);

  trigger.observe(low, 3300);
  const released = trigger.observe(low, 3300 + TRIGGER_CONFIG.releaseMs);
  expect(released.phase).toBe("armed");
  expect(released.released).toBe(true);

  trigger.observe(high, 4000);
  trigger.observe(high, 4200);
  trigger.observe(high, 4400);
  expect(trigger.observe(high, 4500).triggered).toBe(true);
});

test("low score clears an in-progress positive hold", () => {
  const trigger = new GestureTrigger();
  trigger.observe(high, 0);
  trigger.observe(high, 200);
  expect(trigger.observe(low, 300).phase).toBe("armed");
  trigger.observe(high, 400);
  trigger.observe(high, 600);
  trigger.observe(high, 800);
  expect(trigger.observe(high, 900).triggered).toBe(true);
});

test("the cooldown keeps the trigger latched even after a long enough release", () => {
  const trigger = new GestureTrigger();
  triggerAt500(trigger); // Cooldown ends at 2500.
  trigger.observe(low, 600);
  expect(trigger.observe(low, 600 + TRIGGER_CONFIG.releaseMs).phase).toBe("latched");
  expect(trigger.observe(low, 2499).phase).toBe("latched");
  expect(trigger.observe(low, 2500).released).toBe(true);
});

test("a high score during release restarts the release timer", () => {
  const trigger = new GestureTrigger();
  triggerAt500(trigger);
  trigger.observe(low, 2500);
  trigger.observe(high, 3000);
  expect(trigger.observe(low, 3100).released).toBe(false);
  expect(trigger.observe(low, 3100 + TRIGGER_CONFIG.releaseMs - 1).released).toBe(false);
  expect(trigger.observe(low, 3100 + TRIGGER_CONFIG.releaseMs).released).toBe(true);
});

test("scores exactly on a threshold count, and so does a gap exactly at the limit", () => {
  const { positiveThreshold, releaseThreshold, maxPositiveGapMs } = TRIGGER_CONFIG;
  const trigger = new GestureTrigger();
  trigger.observe(positiveThreshold, 0);
  trigger.observe(positiveThreshold, maxPositiveGapMs);
  expect(trigger.observe(positiveThreshold, maxPositiveGapMs * 2).triggered).toBe(true);
  trigger.observe(releaseThreshold, 3000);
  expect(trigger.observe(releaseThreshold, 3000 + TRIGGER_CONFIG.releaseMs).released).toBe(true);
});

test("the hold time alone is not enough without the minimum number of positives", () => {
  const trigger = new GestureTrigger({ ...TRIGGER_CONFIG, maxPositiveGapMs: 1000 });
  trigger.observe(high, 0);
  expect(trigger.observe(high, 500).triggered).toBe(false);
  expect(trigger.observe(high, 600).triggered).toBe(true);
});

test("hold progress follows whichever of time and count is further behind", () => {
  const trigger = new GestureTrigger();
  expect(trigger.observe(high, 0).positiveProgress).toBe(0);
  expect(trigger.observe(high, 100).positiveProgress).toBe(0.2); // Time 0.2, count 2/3.
  expect(trigger.observe(high, 200).positiveProgress).toBe(0.4); // Time 0.4, count 1.

  const slower = new GestureTrigger({ ...TRIGGER_CONFIG, maxPositiveGapMs: 1000 });
  slower.observe(high, 0);
  expect(slower.observe(high, 400).positiveProgress).toBeCloseTo(2 / 3); // Time 0.8, count 2/3.

  triggerAt500(trigger);
  expect(trigger.observe(low, 1000).positiveProgress).toBe(1); // Stays full while latched.
  expect(trigger.requireRelease(2500).positiveProgress).toBe(0);
});

test("arm drops a latch and its cooldown for a new model", () => {
  const trigger = new GestureTrigger();
  triggerAt500(trigger);
  trigger.arm();
  expect(trigger.getPhase()).toBe("armed");
  expect(triggerAt500(trigger).triggered).toBe(true); // Inside the old cooldown, but it is gone.
});
