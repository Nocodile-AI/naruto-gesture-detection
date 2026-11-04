# naruto-gesture-detection

Teach a small TensorFlow.js model your clone sign in the browser, test it live, and trigger a Naruto-inspired shadow-clone effect from the same webcam view.

Camera frames, gesture examples, training, and prediction stay in your browser. The app has no per-user backend storage.

## Run locally

Requires Bun. Node.js 24 is the tested runtime.

```sh
bun install --frozen-lockfile
bun run dev
```

Open `http://127.0.0.1:5173/`. Webcam access requires localhost or HTTPS.

## How to use it

1. Start the camera.
2. Record examples of the clone sign and examples that are not the clone sign.
3. Train the model.
4. Show the sign to see the live score and trigger the effect.

Each recording has a one-second lead-in and then five seconds of capture. Saved examples and the model restore automatically in the same browser.

## Diagnostics

The Diagnostics panel on the page shows logs, errors, and timing without DevTools. After you reproduce a problem, use Copy logs. Logs never include camera frames or gesture examples.

To narrow down a rendering problem, run Test Canvas and then Test clone effect. The clone test uses a synthetic person, so it works without the camera or a trained model.

Debug train runs the normal training and save steps with one valid clip per class, even below the normal frame counts.

## Project layout

- `src/` — application code
- `public/assets/` — smoke and hand-sign artwork
- `tests/` — unit and browser tests
- `docs/ARCHITECTURE.md` — how the app fits together
- `docs/PROVENANCE.md` — attribution and asset licensing notes
- `AGENTS.md` — maintenance notes and values to preserve
- `CONTRIBUTING.md` — commands and checks

## Attribution

The shadow-clone concept and visual assets are adapted from Nasha Wanich's `naruto-shadow-clone-jutsu` project. See `docs/PROVENANCE.md` before redistributing the assets.
