import * as tf from "@tensorflow/tfjs";
import {
  diagnosticText,
  getDiagnosticSnapshot,
  initializeDiagnostics,
  logDiagnostic,
  recordMetric,
} from "./diagnostics";

export function initializeDiagnosticsPanel(): void {
  initializeDiagnostics();
  const panel = document.querySelector<HTMLDetailsElement>("#diagnostics-panel");
  const log = document.querySelector<HTMLTextAreaElement>("#diagnostics-log");
  const output = document.querySelector<HTMLElement>("#diagnostics-metrics");
  const status = document.querySelector<HTMLElement>("#diagnostics-status");
  const copy = document.querySelector<HTMLElement>("#btn-copy-diagnostics");
  if (!panel || !log || !output || !status || !copy) return;
  let memoryFailed = false;
  copy.addEventListener("click", () => {
    log.value = diagnosticText();
    void navigator.clipboard
      ?.writeText(log.value)
      .then(() => {
        status.textContent = "Diagnostics copied.";
      })
      .catch(() => {
        log.focus();
        log.select();
        status.textContent = "Select and copy the log below.";
      });
    if (!navigator.clipboard) {
      log.focus();
      log.select();
      status.textContent = "Select and copy the log below.";
    }
  });
  const refresh = () => {
    if (!panel.open) return;
    recordMetric("TensorFlow.js backend", tf.getBackend() || "Not initialized");
    try {
      const memory = tf.memory();
      recordMetric("TF tensors", memory.numTensors);
      recordMetric("TF bytes", memory.numBytes);
      recordMetric(
        "TF memory accuracy",
        memory.unreliable
          ? `Estimate: ${memory.reasons?.join("; ") ?? "backend limitations"}`
          : "Reliable",
      );
      memoryFailed = false;
    } catch (error) {
      if (!memoryFailed)
        logDiagnostic("diagnostics", "TensorFlow memory unavailable", error, "warn");
      memoryFailed = true;
      recordMetric("TF tensors", null);
      recordMetric("TF bytes", null);
      recordMetric("TF memory accuracy", null);
    }
    const browserMemory = (performance as Performance & { memory?: { usedJSHeapSize: number } })
      .memory;
    recordMetric("JS heap bytes", browserMemory?.usedJSHeapSize ?? null);
    recordMetric(
      "Device RAM GiB",
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    );
    const snapshot = getDiagnosticSnapshot();
    output.textContent = Object.entries({
      FPS: null,
      "Inference ms": null,
      "Render ms": null,
      "GPU utilization": null,
      "CPU utilization": null,
      ...snapshot.metrics,
    })
      .map(
        ([name, value]) =>
          `${name}: ${value === null ? "Unavailable" : typeof value === "number" ? Math.round(value * 10) / 10 : value}`,
      )
      .join(" · ");
    if (document.activeElement !== log) log.value = diagnosticText();
    if (!snapshot.persistenceAvailable)
      status.textContent = "Browser storage unavailable; logs remain available in this tab.";
  };
  panel.addEventListener("toggle", refresh);
  window.setInterval(refresh, 1000);
}
