import { logDiagnostic } from "../diagnostics";
// Legacy MediaPipe npm files expose browser globals, not ESM named exports.
export async function loadScript(src: string): Promise<void> {
  logDiagnostic("mediapipe", "script-loading", { src });
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      logDiagnostic("mediapipe", "script-ready", { src });
      resolve();
    };
    script.onerror = (event) => {
      const error = new Error(`Unable to load vision resource: ${src}. Reload to retry.`, {
        cause: event,
      });
      logDiagnostic("mediapipe", "script-failed", { src, error }, "error");
      reject(error);
    };
    document.head.append(script);
  });
}
