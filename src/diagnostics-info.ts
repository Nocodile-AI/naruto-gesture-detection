import * as tf from "@tensorflow/tfjs";
import { logDiagnostic } from "./diagnostics";

const CDN_HOST = "cdn.jsdelivr.net";
export const SOFTWARE_GRAPHICS = /swiftshader|llvmpipe|software|basic render/i;

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function formatMb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

let chip = "";

export function graphicsChip(): string {
  if (chip) return chip;
  const gl = document.createElement("canvas").getContext("webgl");
  if (!gl) return (chip = "WebGL unavailable");
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  chip = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "Not reported";
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return chip;
}

export function downloadSummary() {
  const files = performance
    .getEntriesByType("resource")
    .filter(
      (file): file is PerformanceResourceTiming =>
        file instanceof PerformanceResourceTiming && file.name.includes(CDN_HOST),
    );
  if (!files.length) return null;
  return {
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.transferSize, 0),
    cached: files.filter((file) => file.transferSize === 0 && file.decodedBodySize > 0).length,
    slowestMs: Math.max(...files.map((file) => file.duration)),
  };
}

export function downloadText(): string {
  const summary = downloadSummary();
  if (!summary) return "";
  const size = summary.bytes || summary.cached;
  return (
    `${summary.files} files from the CDN` +
    (size ? `: ${formatMb(summary.bytes)} downloaded, ${summary.cached} from cache` : "") +
    `. Slowest ${formatMs(summary.slowestMs)}.`
  );
}

let memoryFailed = false;

function memoryFacts(): [string, string][] {
  try {
    const memory = tf.memory();
    memoryFailed = false;
    return [["Model memory", `${memory.numTensors} tensors, ${formatMb(memory.numBytes)}`]];
  } catch (error) {
    if (!memoryFailed) logDiagnostic("diagnostics", "TensorFlow memory unavailable", error, "warn");
    memoryFailed = true;
    return [];
  }
}

export function deviceFacts(video: HTMLVideoElement): [string, string][] {
  const ram = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return [
    ["Graphics", graphicsChip()],
    ["Model runs on", tf.getBackend() || "Not started"],
    ...memoryFacts(),
    ["Camera", video.videoWidth ? `${video.videoWidth} × ${video.videoHeight}` : "Off"],
    [
      "Processors",
      `${navigator.hardwareConcurrency} cores${ram ? `, at least ${ram} GB memory` : ""}`,
    ],
  ];
}
