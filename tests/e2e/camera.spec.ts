import { test, expect } from "@playwright/test";
import { seedDataset, trainSeededModel } from "./seed";

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--enable-unsafe-swiftshader",
    ],
  },
});

async function expectSharedCameraReady(page: import("@playwright/test").Page) {
  await expect(page.getByRole("button", { name: "Stop camera" })).toBeEnabled({ timeout: 45000 });
  await expect(page.locator("#viewfinder-note")).toBeHidden({ timeout: 45000 });
  await expect
    .poll(
      () =>
        page
          .locator("#trainer-canvas")
          .evaluate((canvas: HTMLCanvasElement) => canvas.width, undefined),
      {
        timeout: 45000,
      },
    )
    .toBe(640);
}

test("shared camera supports collection stop and restart", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");

  await page.getByRole("button", { name: "Start camera" }).click();
  await expectSharedCameraReady(page);
  await expect(page.getByRole("button", { name: "Record" }).first()).toBeEnabled();

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#viewfinder-note")).toContainText("Camera paused");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#viewfinder-note")).toBeHidden({ timeout: 45000 });

  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(page.locator("#viewfinder-note")).toHaveText("Camera is off");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expectSharedCameraReady(page);

  await page.getByRole("button", { name: "Record" }).first().click();
  await expect(page.locator("#rec-badge")).toBeVisible();
  await expect(page.locator("#collection-status")).toContainText("0 usable frames", {
    timeout: 7000,
  });
  await expect(page.locator("#count-clone")).toHaveText("0 clips");
  expect(errors).toEqual([]);
});

test("training pauses tracking but not the video, then reports the run", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("/");
  await seedDataset(page);
  await page.reload();
  await page.locator("#diagnostics-panel summary").click();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expectSharedCameraReady(page);
  await expect(page.locator("#diagnostics-verdict")).toHaveText(/Clones (can|may not) trigger/, {
    timeout: 30000,
  });

  await page.getByRole("button", { name: "Train model" }).click();
  await expect(page.locator("#train-status")).toHaveText(/Starting training|Training \d+/);
  await expect(page.locator("#diagnostics-verdict")).toHaveText(/Tracking is paused/);
  const videoTime = () =>
    page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime, undefined);
  const playedFrom = await videoTime();
  await expect.poll(videoTime).toBeGreaterThan(playedFrom);

  await expect(page.locator("#trained-controls")).toBeVisible({ timeout: 90000 });
  await expect(page.locator('[data-event="tracking-resumed"]')).toHaveCount(1);
  await expect(page.locator("#diagnostics-training")).toContainText("Until the first progress");
  await expect(page.locator("#diagnostics-training-note")).toContainText("Full train with");
  await expect(page.locator("#diagnostics-verdict")).toHaveText(/Clones (can|may not) trigger/, {
    timeout: 30000,
  });
});

test("trained model uses the same camera for live score and clone runtime", async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await trainSeededModel(page);
  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.locator("#viewfinder canvas")).toHaveCount(1);
  await expect(page.locator("#trained-controls")).toBeVisible();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expectSharedCameraReady(page);
  await expect(page.locator("#conf-label")).toBeVisible();

  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(page.locator("#viewfinder-note")).toHaveText("Camera is off");
  expect(errors).toEqual([]);
});
