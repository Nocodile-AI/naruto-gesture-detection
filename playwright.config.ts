import { defineConfig, devices } from "@playwright/test";

// These specs need a fake webcam, which only Chromium offers through launch flags.
const NEEDS_FAKE_CAMERA = ["**/camera.spec.ts", "**/trigger-frame-rate.spec.ts"];
const LAYOUT_SPECS = ["**/viewport.spec.ts", "**/accessibility.spec.ts", "**/design.spec.ts"];

const screens = {
  phone: { width: 390, height: 844 },
  tablet: { width: 1180, height: 820 },
  laptop: { width: 1366, height: 768 },
};

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: {
    command: "bun run preview --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  workers: 1,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: screens.laptop },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: screens.laptop },
      testIgnore: NEEDS_FAKE_CAMERA,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: screens.laptop },
      testIgnore: NEEDS_FAKE_CAMERA,
    },
    {
      name: "phone",
      use: { ...devices["Desktop Chrome"], viewport: screens.phone, hasTouch: true },
      testMatch: LAYOUT_SPECS,
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: screens.tablet, hasTouch: true },
      testMatch: LAYOUT_SPECS,
    },
  ],
});
