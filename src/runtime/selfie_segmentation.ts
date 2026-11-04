import type { SelfieSegmentation as Constructor } from "@mediapipe/selfie_segmentation";
import { SELFIE_SEGMENTATION_BASE } from "./urls";
import { loadScript } from "./load-script";
await loadScript(`${SELFIE_SEGMENTATION_BASE}/selfie_segmentation.js`);
declare global {
  interface Window {
    SelfieSegmentation: typeof Constructor;
  }
}
export const SelfieSegmentation = window.SelfieSegmentation;
