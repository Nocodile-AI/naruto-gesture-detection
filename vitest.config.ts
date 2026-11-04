import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Browser-global adapters and CSS imports have no logic to measure.
      exclude: ["src/runtime/**", "src/design-system.ts"],
      reporter: ["text", "html"],
    },
  },
});
