import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function normalizeBasePath(basePath: string | undefined): string {
  const trimmed = basePath?.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
}

export default defineConfig({
  base: normalizeBasePath(process.env.PAGES_BASE_PATH),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: Object.fromEntries(
      ["holistic", "selfie_segmentation"].map((name) => [
        `@mediapipe/${name}`,
        fileURLToPath(new URL(`./src/runtime/${name}.ts`, import.meta.url)),
      ]),
    ),
  },
  preview: {
    // Allows ephemeral Cloudflare Quick Tunnel hostnames during demos.
    allowedHosts: [".trycloudflare.com"],
  },
  build: {
    target: "es2022",
  },
});
