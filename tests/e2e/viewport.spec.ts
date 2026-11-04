import { expect, test } from "@playwright/test";

test("the page fits the screen without sideways scrolling", async ({ page }) => {
  await page.goto("/");
  await page.locator("#diagnostics-panel summary").click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("Start camera is visible without scrolling", async ({ page }) => {
  await page.goto("/");
  const startCamera = page.getByRole("button", { name: "Start camera", exact: true });
  await expect(startCamera).toBeVisible();
  await expect(startCamera).toBeInViewport({ ratio: 1 });
});
