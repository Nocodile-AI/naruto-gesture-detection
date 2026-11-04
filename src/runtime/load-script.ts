import { logDiagnostic } from "../diagnostics";
let leavingPage = false;
window.addEventListener("beforeunload", () => {
  leavingPage = true;
});

// Legacy MediaPipe npm files expose browser globals, not ESM named exports.
export async function loadScript(src: string): Promise<void> {
  logDiagnostic("mediapipe", "script-loading", { src });
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.addEventListener("load", () => {
      logDiagnostic("mediapipe", "script-ready", { src });
      resolve();
    });
    script.addEventListener("error", (event) => {
      // WebKit reports a load cancelled by a reload as a failed load.
      if (leavingPage) return;
      const error = new Error(`Unable to load vision resource: ${src}. Reload to retry.`, {
        cause: event,
      });
      logDiagnostic("mediapipe", "script-failed", { src, error }, "error");
      reject(error);
    });
    document.head.append(script);
  });
}
