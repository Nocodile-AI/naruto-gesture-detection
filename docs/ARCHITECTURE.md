# Architecture

naruto-gesture-detection is a static browser application. Webcam capture, feature extraction, training, storage, prediction, and rendering all happen in the browser. A static host can serve many students because each student's examples and model stay in their own browser.

## Data flow

```text
webcam
  -> MediaPipe Holistic
  -> two-hand feature vector
  -> recorded clips
  -> TensorFlow.js classifier
  -> browser IndexedDB
  -> live score
  -> gesture trigger
  -> Selfie Segmentation + clone renderer
```

Collection, prediction, segmentation, and rendering share one camera stream.

## Code structure

The page has two parts that meet in a small store:

- **React components** (`src/components/`) draw the controls and read single fields from the Zustand store (`src/app/store.ts`).
- **Imperative code** (`src/app/vision.ts`, `src/hand-camera.ts`, `src/clone-effect.ts`) runs the camera loop, MediaPipe, and canvas drawing. It writes only the values the page shows into the store, so camera frames never go through React.

`src/app/` also holds recording, training, and the startup, cross-tab, and reset logic. The other files in `src/` are plain logic with no React: features, classifier, trigger, and storage.

## Rendering

The clone effect draws three layers on one canvas:

1. webcam background
2. clones and smoke
3. segmented real person

The last layer keeps the real person in front of the clones.

## Runtime dependencies

MediaPipe's browser scripts and its model and WASM files load from version-pinned jsDelivr URLs in `src/runtime/urls.ts`. This keeps large files out of the deployment, but the app needs access to jsDelivr at runtime. Camera frames and training data stay in the browser.

`AGENTS.md` lists the exact values to preserve, such as the feature schema, network layers, and trigger timing.
