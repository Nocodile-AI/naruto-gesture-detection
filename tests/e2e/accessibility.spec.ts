import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { trainSeededModel } from "./seed";

test.describe("accessibility @a11y", () => {
  for (const width of [390, 1280]) {
    test(`collection and diagnostics at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Start camera", exact: true })).toBeEnabled();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.getByText("Diagnostics", { exact: true }).click();
      await expect(page.getByLabel("Diagnostic history")).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }

  test("trained score screen", async ({ page }) => {
    await trainSeededModel(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
