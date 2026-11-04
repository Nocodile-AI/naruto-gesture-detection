import type { Holistic as Constructor } from "@mediapipe/holistic";
import { HOLISTIC_BASE } from "./urls";
import { loadScript } from "./load-script";
await loadScript(`${HOLISTIC_BASE}/holistic.js`);
declare global {
  interface Window {
    Holistic: typeof Constructor;
  }
}
export const Holistic = window.Holistic;
