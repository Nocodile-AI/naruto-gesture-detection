# Contributing

Use Bun for dependencies and scripts, with Node.js 24 available for tooling.

```sh
bun install --frozen-lockfile
bun run dev
```

Install the test browsers once:

```sh
bunx playwright install chromium firefox webkit
```

Before you open a change, run the checks for what you touched. For broad changes, run everything:

```sh
bun run check
```

This covers formatting, linting, types, unit tests, the production build, and all Playwright tests. CI runs it on pull requests and on pushes to `main`.

Keep webcam and model data in the browser, keep the single camera stream, and keep the real person in front of the clones. `AGENTS.md` has the full list and `docs/ARCHITECTURE.md` has the overview.

Do not commit dependencies, build output, Playwright output, tunnel logs, or local downloads.
