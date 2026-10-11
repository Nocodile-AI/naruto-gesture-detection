# Contributing

Use Bun for dependency management and scripts, with Node.js 24 available for tooling.

```sh
bun install --frozen-lockfile
bun run dev
```

Before opening a change, run the checks relevant to what you touched. For broad or structural changes, use:

```sh
bun run check
```

`bun run lint` runs Oxlint, HTML accessibility rules, and Knip's unused-code and dependency checks.
`bun run check` also builds the site and runs all Playwright tests, including axe accessibility scans.
For focused browser accessibility checks, run `bun run build && bun run test:a11y`.
Install Chromium once with `bunx playwright install chromium` before running browser tests.
Pull requests and Pages deployments run the full check in CI.

Keep webcam/model data client-side unless a product requirement explicitly calls for server storage. Preserve the single-camera architecture and the foreground-person clone rendering stack.

Generated dependencies, build output, MediaPipe vendor files, Playwright artifacts, tunnel logs, and local downloads should not be committed.

See `AGENTS.md` for implementation invariants and `docs/ARCHITECTURE.md` for the technical overview.
