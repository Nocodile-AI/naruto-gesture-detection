import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

test("Canvas and finite clone tests work independently when segmentation CDN is unavailable", async ({
  page,
}) => {
  await page.route("**/@mediapipe/selfie_segmentation@*/**", (route) => route.abort());
  await page.goto("/");
  await page.locator("#diagnostics-panel summary").click();
  await page.getByRole("button", { name: "Test Canvas", exact: true }).click();
  expect(
    await page
      .locator("#trainer-canvas")
      .evaluate(
        (canvas: HTMLCanvasElement) =>
          Array.from(canvas.getContext("2d")!.getImageData(30, 30, 1, 1).data),
        undefined,
      ),
  ).toEqual([103, 232, 249, 255]);
  await expect(page.locator('[data-event="manual-test-drawn"]')).toHaveCount(1);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole("button", { name: "Test clone effect", exact: true }).click();
    await expect(page.locator('[data-event="first-clones-rendered"]')).toHaveCount(attempt + 1);
    await expect(page.locator('[data-stage="clone"][data-event="reset"]')).toHaveCount(
      attempt + 1,
      {
        timeout: 8000,
      },
    );
  }
  await expect(page.getByRole("button", { name: "Start camera", exact: true })).toBeEnabled();
  await expect(page.locator("#count-clone")).toHaveText("0 clips");
});

test("production diagnostics capture full nested errors and rejection history across reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#diagnostics-panel summary").click();
  await page.evaluate(() => {
    const cause = new Error("original cause " + "x".repeat(12_000));
    const error = new Error("canvas test failure", { cause });
    window.dispatchEvent(
      new ErrorEvent("error", {
        error,
        message: error.message,
        filename: "device-test.js",
        lineno: 42,
      }),
    );
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: new Error("rejection test failure", { cause }),
      }),
    );
  });
  const uncaught = page.locator('[data-event="uncaught error"]');
  await expect(uncaught).toContainText("canvas test failure");
  await expect(page.locator("#diagnostics-flag")).toHaveText("2 errors");
  await uncaught.locator("summary").click();
  const details = uncaught.locator("pre");
  await expect(details).toContainText("device-test.js");
  await expect(details).toContainText("original cause " + "x".repeat(12_000));
  await expect(details).toContainText("stack");
  await page.reload();
  await page.locator("#diagnostics-panel summary").click();
  await expect(page.locator('[data-event="unhandled rejection"]')).toContainText(
    "rejection test failure",
  );
  await expect(uncaught).toContainText("canvas test failure");
  await expect(page.locator("#diagnostics-flag")).toBeHidden();
});

test("the verdict stays on one line on an iPad", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/");
  await page.locator("#diagnostics-panel summary").click();
  const verdict = page.locator("#diagnostics-verdict");
  await expect(verdict).toHaveText(/Start the camera/);
  const { height, lineHeight } = await verdict.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight),
  }));
  expect(height).toBeLessThan(lineHeight * 1.5);
});

test("expanded diagnostics are accessible and usable on narrow screens with clipboard unavailable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#diagnostics-panel summary").click();
  await expect(page.locator("#diagnostics-verdict")).toHaveText(/Start the camera/);
  await expect(page.locator("#diagnostics-device")).toContainText(/Model runs on\s*cpu/);
  await expect(page.locator("#diagnostics-training")).toHaveText("Train a model to time this.");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }),
  );
  await page.getByRole("button", { name: "Copy logs" }).click();
  await expect(page.locator("#diagnostics-status")).toHaveText("Select and copy the log below.");
  await expect(page.locator("#diagnostics-log")).toBeFocused();
  expect(
    await page
      .locator("#diagnostics-log")
      .evaluate(
        (textarea: HTMLTextAreaElement) =>
          textarea.selectionEnd - textarea.selectionStart === textarea.value.length,
        undefined,
      ),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
