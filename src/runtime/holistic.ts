import type { Holistic as Constructor } from "@mediapipe/holistic";
import { HOLISTIC_BASE } from "./urls";
import { loadScript } from "./load-script";
await loadScript(`${HOLISTIC_BASE}/holistic.js`);
export const Holistic = (window as unknown as { Holistic: typeof Constructor }).Holistic;
