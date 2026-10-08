import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Canvas and finite clone tests work independently when segmentation CDN is unavailable", async ({
  page,
}) => {
  await page.route("**/@mediapipe/selfie_segmentation@*/**", (route) => route.abort());
  await page.goto("/");
  await page.locator("#diagnostics-panel summary").click();
  await page.getByRole("button", { name: "Test Canvas", exact: true }).click();
  expect(
    await page.locator("#trainer-canvas").evaluate((node) => {
      const canvas = node as HTMLCanvasElement;
      return Array.from(canvas.getContext("2d")!.getImageData(30, 30, 1, 1).data);
    }),
  ).toEqual([103, 232, 249, 255]);
  await expect(page.locator("#diagnostics-log")).toHaveValue(/manual-test-drawn/);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole("button", { name: "Test clone effect", exact: true }).click();
    await expect
      .poll(async () => {
        const log = JSON.parse(await page.locator("#diagnostics-log").inputValue()) as {
          entries: { event: string }[];
        };
        return log.entries.filter((entry) => entry.event === "first-clones-rendered").length;
      })
      .toBe(attempt + 1);
    await expect
      .poll(
        async () => {
          const log = JSON.parse(await page.locator("#diagnostics-log").inputValue()) as {
            entries: { stage: string; event: string }[];
          };
          return log.entries.filter((entry) => entry.stage === "clone" && entry.event === "reset")
            .length;
        },
        { timeout: 8000 },
      )
      .toBe(attempt + 1);
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
  const history = page.locator("#diagnostics-log");
  await expect(history).toHaveValue(/canvas test failure/);
  const original = JSON.parse(await history.inputValue()) as {
    entries: { event: string; details: unknown }[];
  };
  const uncaught = original.entries.find((entry) => entry.event === "uncaught error");
  expect(JSON.stringify(uncaught)).toContain("device-test.js");
  expect(JSON.stringify(uncaught)).toContain("original cause " + "x".repeat(12_000));
  expect(JSON.stringify(uncaught)).toContain("stack");
  await page.reload();
  await page.locator("#diagnostics-panel summary").click();
  await expect(history).toHaveValue(/rejection test failure/);
  await expect(history).toHaveValue(/canvas test failure/);
});

test("expanded diagnostics are accessible and usable on narrow screens with clipboard unavailable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#diagnostics-panel summary").click();
  await expect(page.locator("#diagnostics-metrics")).toContainText("GPU utilization: Unavailable");
  await expect(page.locator("#diagnostics-metrics")).toContainText("TensorFlow.js backend:");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }),
  );
  await page.getByRole("button", { name: "Copy logs" }).click();
  await expect(page.locator("#diagnostics-status")).toHaveText("Select and copy the log below.");
  await expect(page.locator("#diagnostics-log")).toBeFocused();
  expect(
    await page.locator("#diagnostics-log").evaluate((node) => {
      const textarea = node as HTMLTextAreaElement;
      return textarea.selectionEnd - textarea.selectionStart === textarea.value.length;
    }),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
