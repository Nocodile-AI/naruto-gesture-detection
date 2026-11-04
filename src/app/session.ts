import type * as tf from "@tensorflow/tfjs";
import type { ModelRecord } from "../storage";
import { setApp } from "./store";

// Runtime objects that the interface never renders.
export const session = {
  model: null as tf.LayersModel | null,
  record: null as ModelRecord | null,
  persistedRevision: 0,
  trainingAbort: null as AbortController | null,
  disposed: false,
};

export function setModel(model: tf.LayersModel | null, record: ModelRecord | null): void {
  session.model = model;
  session.record = record;
  setApp({ hasModel: model !== null });
}
