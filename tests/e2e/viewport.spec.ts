import { expect, test } from "@playwright/test";

test("the page fits the screen without sideways scrolling", async ({ page }) => {
  await page.goto("/");
  await page.locator("#diagnostics-panel summary").click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

// Browser bars take height from the page, so these windows are shorter than the screens.
const shortWindows = [
  { name: "laptop with browser bars", width: 1366, height: 620 },
  { name: "large laptop with browser bars", width: 1728, height: 900 },
  { name: "iPad landscape with Safari bars", width: 1180, height: 700 },
  { name: "iPad portrait with Safari bars", width: 820, height: 1050 },
  { name: "iPad split view", width: 678, height: 500 },
  { name: "phone with browser bars", width: 390, height: 660 },
];

for (const { name, width, height } of shortWindows) {
  test(`Start camera is visible without scrolling on a ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const startCamera = page.getByRole("button", { name: "Start camera", exact: true });
    await expect(startCamera).toBeVisible();
    await expect(startCamera).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });
}
