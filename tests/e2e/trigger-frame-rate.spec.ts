import { expect, test, type Page } from "@playwright/test";
import { COLLECTION } from "../../src/collection";
import { extractFeatures } from "../../src/features";
import { crossed, separated } from "../fixtures/landmarks";
import { seedDataset } from "./seed";

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

// Chromium's fake camera shows no hands, so real MediaPipe would never produce a score.
// These stand-ins keep everything after MediaPipe real: features, model, trigger and effect.
async function fakeMediaPipe(page: Page, sendMs: number): Promise<void> {
  const holistic = `
    window.Holistic = class {
      setOptions() {}
      onResults(callback) { this.callback = callback; }
      async send() {
        await new Promise((resolve) => setTimeout(resolve, ${sendMs}));
        this.callback(${JSON.stringify({
          rightHandLandmarks: crossed.right,
          leftHandLandmarks: crossed.left,
        })});
      }
      async close() {}
    };`;
  const segmentation = `
    window.SelfieSegmentation = class {
      setOptions() {}
      onResults(callback) { this.callback = callback; }
      async send() { this.callback({ segmentationMask: document.createElement("canvas") }); }
      async close() {}
    };`;
  await page.route("**/holistic.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: holistic }),
  );
  await page.route("**/selfie_segmentation.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: segmentation }),
  );
}

function clips(label: "clone_sign" | "not_sign", features: number[]) {
  return Array.from({ length: COLLECTION.minClipsPerClass }, (_, clip) => ({
    id: `${label}-${clip}`,
    label,
    frames: Array.from({ length: COLLECTION.minFramesPerClass }, () => features),
    createdAt: clip + 1,
  }));
}

async function trainAndStartCamera(page: Page, sendMs: number): Promise<void> {
  await fakeMediaPipe(page, sendMs);
  await page.goto("/");
  await seedDataset(page, {
    revision: 1,
    clips: [
      ...clips("clone_sign", extractFeatures(crossed.right, crossed.left)!),
      ...clips("not_sign", extractFeatures(separated.right, separated.left)!),
    ],
  });
  await page.reload();
  await page.getByRole("button", { name: "Train model" }).click();
  await expect(page.locator("#trained-controls")).toBeVisible({ timeout: 45000 });
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.locator("#conf-label")).toHaveText("100%", { timeout: 20000 });
}

// About 133 ms per frame: 117 ms here, then the wait for the next 60 Hz animation frame.
// The old 150 ms scoring wait skipped every second frame at this speed, so scores arrived
// 266 ms apart, over the 250 ms limit, and the clones never appeared.
test("the clones trigger at about 8 frames a second", async ({ page }) => {
  test.setTimeout(90000);
  await trainAndStartCamera(page, 117);
  await expect(page.locator("#practice-status")).toHaveText("Clone sequence active.", {
    timeout: 10000,
  });
  await page.locator("#diagnostics-panel summary").click();
  await expect(page.locator("#diagnostics-legend")).toContainText(/Hand tracking\s*\d/);
  await expect(page.locator("#diagnostics-verdict")).toHaveCount(0);
});

test("the clones do not trigger when frames are further apart than the limit", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1180, height: 820 });
  await trainAndStartCamera(page, 300);
  await page.waitForTimeout(3000);
  await expect(page.locator("#practice-status")).not.toHaveText("Clone sequence active.");
  await page.locator("#diagnostics-panel summary").click();
  const verdict = page.locator("#diagnostics-verdict");
  await expect(verdict).toHaveText("Clones may not trigger on this device.");
  const { height, lineHeight } = await verdict.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight),
  }));
  expect(height).toBeLessThan(lineHeight * 1.5);
});
