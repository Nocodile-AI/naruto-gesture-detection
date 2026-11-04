import * as tf from "@tensorflow/tfjs";
import {
  diagnosticText,
  getDiagnosticSnapshot,
  initializeDiagnostics,
  logDiagnostic,
  type DiagnosticEntry,
} from "./diagnostics";
import { element } from "./dom";
import {
  currentSession,
  frameVerdict,
  getTrackingState,
  latestCloneStats,
  latestTrainingRun,
  PERSON_LAYER_LIMIT,
  recentFrames,
  startupStages,
  summarizeFrames,
  trainingStages,
  watchFreezes,
  type FrameSample,
  type FrameSummary,
  type Stage,
} from "./performance-report";
import { TRIGGER_CONFIG } from "./trigger";

const SERIES = [
  { key: "hands", summaryKey: "handsMs", label: "Hand tracking", color: "#075985" },
  { key: "mask", summaryKey: "maskMs", label: "Clone mask", color: "#ea580c" },
  { key: "draw", summaryKey: "drawMs", label: "Drawing and score", color: "#7c3aed" },
] as const;
const WAIT_COLOR = "#cbd5e1";
const LIMIT_COLOR = "#b91c1c";
const INK_COLOR = "#475569";
const BAR_PITCH = 5;
const RIBBON_MIN_SCALE_MS = 400;
const RIBBON_MAX_SCALE_MS = 1000;
const SOFTWARE_GRAPHICS = /swiftshader|llvmpipe|software|basic render/i;
const REFRESH_MS = 500;
const FREEZE_WINDOW_MS = 10_000;
const CDN_HOST = "cdn.jsdelivr.net";

function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function formatMb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderStages(host: HTMLElement, stages: Stage[], emptyText: string): void {
  if (!stages.length) {
    host.replaceChildren(make("p", "diag-empty", emptyText));
    return;
  }
  const total = stages.reduce((sum, stage) => sum + stage.ms, 0);
  let elapsed = 0;
  const rows = stages.map((stage) => {
    const row = make("div", "diag-stage");
    const label = make("span", "", stage.label);
    const value = make("span", "diag-number", formatMs(stage.ms));
    const track = make("span", "diag-stage-track");
    const bar = make("span", "diag-stage-bar");
    bar.style.marginInlineStart = `${(elapsed / Math.max(total, 1)) * 100}%`;
    bar.style.width = `${(stage.ms / Math.max(total, 1)) * 100}%`;
    track.append(bar);
    row.append(label, value, track);
    elapsed += stage.ms;
    return row;
  });
  host.replaceChildren(...rows);
}

function renderFacts(host: HTMLElement, facts: [string, string][], emptyText: string): void {
  if (!facts.length) {
    host.replaceChildren(make("p", "diag-empty", emptyText));
    return;
  }
  const list = make("dl", "diag-facts");
  list.append(
    ...facts.map(([name, value]) => {
      const row = make("div", "diag-fact");
      row.append(make("dt", "", name), make("dd", "diag-number", value));
      return row;
    }),
  );
  host.replaceChildren(list);
}

function graphicsChip(): string {
  const gl = document.createElement("canvas").getContext("webgl");
  if (!gl) return "WebGL unavailable";
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "Not reported";
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return name;
}

function downloadSummary() {
  const files = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter(
    (file) => file.name.includes(CDN_HOST),
  );
  if (!files.length) return null;
  return {
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.transferSize, 0),
    cached: files.filter((file) => file.transferSize === 0 && file.decodedBodySize > 0).length,
    slowestMs: Math.max(...files.map((file) => file.duration)),
  };
}

function downloadText(): string {
  const summary = downloadSummary();
  if (!summary) return "";
  const size = summary.bytes || summary.cached;
  return (
    `${summary.files} files from the CDN` +
    (size ? `: ${formatMb(summary.bytes)} downloaded, ${summary.cached} from cache` : "") +
    `. Slowest ${formatMs(summary.slowestMs)}.`
  );
}

function detailPreview(details: unknown): string {
  if (typeof details !== "object" || details === null) return "";
  const { message, error } = details as { message?: unknown; error?: { message?: unknown } };
  if (typeof message === "string") return message;
  if (typeof error?.message === "string") return error.message;
  return Object.entries(details)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .map(([key, value]) => `${key} ${typeof value === "number" ? Math.round(value) : value}`)
    .join(", ");
}

function eventKey(entry: DiagnosticEntry): string {
  return `${entry.time} ${entry.stage} ${entry.event}`;
}

function eventRow(entry: DiagnosticEntry, open: boolean): HTMLElement {
  const row = make("li", "diag-event");
  row.dataset.level = entry.level;
  row.dataset.stage = entry.stage;
  row.dataset.event = entry.event;
  row.dataset.key = eventKey(entry);
  const started = entry.event === "session started";
  const date = new Date(entry.time);
  const line = [
    make(
      "time",
      "diag-number",
      started
        ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
        : date.toLocaleTimeString([], { hour12: false }),
    ),
    make("span", "diag-event-stage", entry.stage),
    make("span", "diag-event-name", entry.event.replaceAll("-", " ")),
  ];
  if (entry.level !== "info")
    line.push(make("span", "diag-event-level", entry.level === "error" ? "Error" : "Warning"));
  line.push(make("span", "diag-event-preview", detailPreview(entry.details)));
  if (entry.details === undefined || entry.details === "undefined") {
    const plain = make("div", "diag-event-line");
    plain.append(...line);
    row.append(plain);
    return row;
  }
  const details = make("details");
  const summary = make("summary", "diag-event-line");
  summary.append(...line);
  const body = make("pre");
  const fill = () => {
    if (details.open && !body.textContent)
      body.textContent = JSON.stringify(entry.details, null, 2);
  };
  details.addEventListener("toggle", fill);
  details.append(summary, body);
  details.open = open;
  fill();
  row.append(details);
  return row;
}

export function initializeDiagnosticsPanel(): void {
  initializeDiagnostics();
  const panel = element<HTMLDetailsElement>("diagnostics-panel");
  const flag = element("diagnostics-flag");
  const verdictTitle = element("diagnostics-verdict");
  const verdictDetail = element("diagnostics-verdict-detail");
  const ribbon = element<HTMLCanvasElement>("diagnostics-ribbon");
  const legend = element("diagnostics-legend");
  const liveNote = element("diagnostics-live-note");
  const startup = element("diagnostics-startup");
  const downloads = element("diagnostics-downloads");
  const training = element("diagnostics-training");
  const trainingNote = element("diagnostics-training-note");
  const clone = element("diagnostics-clone");
  const cloneNote = element("diagnostics-clone-note");
  const device = element("diagnostics-device");
  const deviceNote = element("diagnostics-device-note");
  const events = element("diagnostics-events");
  const eventList = element("diagnostics-event-list");
  const eventsEmpty = element("diagnostics-events-empty");
  const filter = element("btn-filter-diagnostics");
  const copy = element("btn-copy-diagnostics");
  const status = element("diagnostics-status");
  const fallback = element("diagnostics-copy-fallback");
  const log = element<HTMLTextAreaElement>("diagnostics-log");
  const video = element<HTMLVideoElement>("trainer-video");

  let selected: FrameSample | null = null;
  let chip = "";
  let memoryFailed = false;
  let renderedLast: DiagnosticEntry | undefined;
  let renderedLength = 0;
  let problemsOnly = false;
  let stopFreezeWatch: (() => number) | null = null;
  let freezeWindowStarted = 0;
  let longestFreeze: number | null = null;
  let cameraFrames = 0;
  let cameraRateAt = performance.now();
  let cameraRateFrames = 0;
  let cameraRate: number | null = null;

  if ("requestVideoFrameCallback" in video) {
    const countFrame = () => {
      cameraFrames++;
      video.requestVideoFrameCallback(countFrame);
    };
    video.requestVideoFrameCallback(countFrame);
  }

  const drawRibbon = (frames: FrameSample[]) => {
    const scale = window.devicePixelRatio || 1;
    const width = ribbon.clientWidth;
    const height = ribbon.clientHeight;
    if (ribbon.width !== Math.round(width * scale)) ribbon.width = Math.round(width * scale);
    if (ribbon.height !== Math.round(height * scale)) ribbon.height = Math.round(height * scale);
    const ctx = ribbon.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const visible = frames.slice(-Math.floor(width / BAR_PITCH));
    const intervals = visible.map((frame, index) =>
      index ? frame.at - visible[index - 1].at : frame.hands + frame.mask + frame.draw,
    );
    const top = Math.min(RIBBON_MAX_SCALE_MS, Math.max(RIBBON_MIN_SCALE_MS, ...intervals));
    const y = (ms: number) => (ms / top) * (height - 1);
    visible.forEach((frame, index) => {
      const x = width - (visible.length - index) * BAR_PITCH;
      let stacked = 0;
      for (const series of SERIES) {
        ctx.fillStyle = series.color;
        ctx.fillRect(
          x,
          height - y(stacked + frame[series.key]),
          BAR_PITCH - 1,
          y(frame[series.key]),
        );
        stacked += frame[series.key];
      }
      if (intervals[index] > stacked) {
        ctx.fillStyle = WAIT_COLOR;
        ctx.fillRect(x, height - y(intervals[index]), BAR_PITCH - 1, y(intervals[index] - stacked));
      }
      if (frame === selected) {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(x, height - 1, BAR_PITCH - 1, 1);
        ctx.fillRect(x, 0, BAR_PITCH - 1, 2);
      }
    });
    const limit = height - y(TRIGGER_CONFIG.maxPositiveGapMs);
    ctx.strokeStyle = LIMIT_COLOR;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, limit);
    ctx.lineTo(width, limit);
    ctx.stroke();
    ctx.setLineDash([]);
    const limitLabel = `Trigger limit ${TRIGGER_CONFIG.maxPositiveGapMs} ms`;
    ctx.font = "13px 'Source Sans Pro', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, limit - 18, ctx.measureText(limitLabel).width + 6, 16);
    ctx.fillStyle = INK_COLOR;
    ctx.fillText(limitLabel, 2, limit - 5);
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(0, height - 1, width, 1);
  };

  const renderLegend = (summary: FrameSummary | null) => {
    const frames = recentFrames();
    const index = selected ? frames.indexOf(selected) : -1;
    const frame = index >= 0 ? frames[index] : null;
    const items: { color: string; label: string; ms: number | undefined }[] = SERIES.map(
      (series) => ({
        color: series.color,
        label: series.label,
        ms: frame ? frame[series.key] : summary?.[series.summaryKey],
      }),
    );
    const work = items.reduce((sum, item) => sum + (item.ms ?? 0), 0);
    const interval = frame && index > 0 ? frame.at - frames[index - 1].at : summary?.frameMs;
    items.push({
      color: WAIT_COLOR,
      label: "Waiting",
      ms: interval === undefined ? undefined : Math.max(0, interval - work),
    });
    legend.replaceChildren(
      ...items.map((item) => {
        const row = make("li");
        const swatch = make("span", "diag-swatch");
        swatch.style.background = item.color;
        row.append(swatch, make("span", "", item.label));
        if (item.ms !== undefined) row.append(make("span", "diag-number", formatMs(item.ms)));
        return row;
      }),
    );
    legend.dataset.scope = frame ? "frame" : "typical";
  };

  const memoryFacts = (): [string, string][] => {
    try {
      const memory = tf.memory();
      memoryFailed = false;
      return [["Model memory", `${memory.numTensors} tensors, ${formatMb(memory.numBytes)}`]];
    } catch (error) {
      if (!memoryFailed)
        logDiagnostic("diagnostics", "TensorFlow memory unavailable", error, "warn");
      memoryFailed = true;
      return [];
    }
  };

  const deviceFacts = (): [string, string][] => {
    chip ||= graphicsChip();
    const ram = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    return [
      ["Graphics", chip],
      ["Model runs on", tf.getBackend() || "Not started"],
      ...memoryFacts(),
      ["Camera", video.videoWidth ? `${video.videoWidth} × ${video.videoHeight}` : "Off"],
      [
        "Processors",
        `${navigator.hardwareConcurrency} cores${ram ? `, at least ${ram} GB memory` : ""}`,
      ],
    ];
  };

  const renderHistory = (entries: DiagnosticEntry[]) => {
    const problems = entries.filter((entry) => entry.level !== "info").length;
    filter.textContent = problemsOnly ? "Show all events" : `Show problems only (${problems})`;
    events.dataset.filter = problemsOnly ? "problems" : "all";
    eventsEmpty.hidden = !problemsOnly || problems > 0;
    const last = entries.at(-1);
    if (last === renderedLast && entries.length === renderedLength) return;
    if (events.contains(document.activeElement)) return;
    const open = new Set(
      [...eventList.querySelectorAll<HTMLElement>("li:has(> details[open])")].map(
        (row) => row.dataset.key,
      ),
    );
    const scroll = events.scrollTop;
    eventList.replaceChildren(
      ...entries.toReversed().map((entry) => eventRow(entry, open.has(eventKey(entry)))),
    );
    events.scrollTop = scroll;
    renderedLast = last;
    renderedLength = entries.length;
  };

  const buildReport = () => {
    const { entries } = getDiagnosticSnapshot();
    const summary = summarizeFrames(recentFrames(), performance.now());
    return {
      verdict: frameVerdict(summary, getTrackingState()),
      frames: summary,
      cameraFramesPerSecond: cameraRate,
      longestFreezeMs: longestFreeze,
      startup: startupStages(entries),
      downloads: downloadSummary(),
      training: latestTrainingRun(entries),
      clone: latestCloneStats(entries),
      device: Object.fromEntries(deviceFacts()),
    };
  };

  const refresh = () => {
    const now = performance.now();
    const { entries, persistenceAvailable } = getDiagnosticSnapshot();
    const errors = currentSession(entries).filter((entry) => entry.level === "error").length;
    flag.hidden = errors === 0;
    flag.textContent = errors === 1 ? "1 error" : `${errors} errors`;
    if (!panel.open) {
      if (stopFreezeWatch) stopFreezeWatch();
      stopFreezeWatch = null;
      return;
    }
    if (!stopFreezeWatch) {
      stopFreezeWatch = watchFreezes();
      freezeWindowStarted = now;
      cameraRateAt = now;
      cameraRateFrames = cameraFrames;
    }
    if (now - freezeWindowStarted >= FREEZE_WINDOW_MS) {
      longestFreeze = stopFreezeWatch();
      stopFreezeWatch = watchFreezes();
      freezeWindowStarted = now;
    }
    if (now - cameraRateAt >= 1000) {
      cameraRate = ((cameraFrames - cameraRateFrames) * 1000) / (now - cameraRateAt);
      cameraRateAt = now;
      cameraRateFrames = cameraFrames;
    }

    const frames = recentFrames();
    const state = getTrackingState();
    const summary = summarizeFrames(frames, now);
    const verdict = frameVerdict(summary, state);
    verdictTitle.textContent = verdict.title;
    verdictTitle.dataset.tone = verdict.tone;
    verdictDetail.textContent = verdict.detail;
    ribbon.setAttribute("aria-label", `Time per tracked frame. ${verdict.title} ${verdict.detail}`);
    drawRibbon(frames);
    renderLegend(summary);
    const notes: string[] = [];
    if (summary) {
      const tracked = Math.round(summary.framesPerSecond);
      notes.push(
        cameraRate
          ? `The camera sends ${Math.round(cameraRate)} frames a second and tracking handles ${tracked}.`
          : `Tracking handles ${tracked} frames a second.`,
      );
    }
    if (longestFreeze !== null)
      notes.push(`Longest freeze in the last 10 seconds: ${formatMs(longestFreeze)}.`);
    liveNote.textContent = notes.join(" ");

    renderStages(startup, startupStages(entries), "Start the camera to time this.");
    downloads.textContent = downloadText();

    const run = latestTrainingRun(entries);
    renderStages(training, run ? trainingStages(run) : [], "Train a model to time this.");
    trainingNote.textContent = run
      ? `${run.outcome === "complete" ? "" : `Training ${run.outcome}. `}${run.debug ? "Debug train" : "Full train"} with ${run.examples} examples on ${run.backend}. Longest freeze ${formatMs(run.longestFreezeMs)}.`
      : "";

    const stats = latestCloneStats(entries);
    renderFacts(
      clone,
      stats
        ? [
            ...(stats.triggerToCloneMs === null
              ? []
              : ([["Trigger to first clone", formatMs(stats.triggerToCloneMs)]] as [
                  string,
                  string,
                ][])),
            ...(stats.personCoverage === null
              ? []
              : ([["Person layer", `${Math.round(stats.personCoverage * 100)}% of the frame`]] as [
                  string,
                  string,
                ][])),
          ]
        : [],
      "Trigger the clones to time this.",
    );
    cloneNote.hidden = !stats?.personCoverage || stats.personCoverage < PERSON_LAYER_LIMIT;

    renderFacts(device, deviceFacts(), "");
    deviceNote.hidden = !SOFTWARE_GRAPHICS.test(chip);
    renderHistory(entries);
    if (!persistenceAvailable)
      status.textContent = "Browser storage is off, so these logs end with this tab.";
  };

  const selectFromPointer = (event: PointerEvent) => {
    const frames = recentFrames();
    const visible = frames.slice(-Math.floor(ribbon.clientWidth / BAR_PITCH));
    const fromRight = Math.ceil((ribbon.clientWidth - event.offsetX) / BAR_PITCH);
    selected = visible[visible.length - fromRight] ?? null;
    drawRibbon(frames);
    renderLegend(summarizeFrames(frames, performance.now()));
  };
  ribbon.addEventListener("pointermove", selectFromPointer);
  ribbon.addEventListener("pointerdown", selectFromPointer);
  ribbon.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") selected = null;
  });

  filter.addEventListener("click", () => {
    problemsOnly = !problemsOnly;
    refresh();
  });

  copy.addEventListener("click", () => {
    log.value = diagnosticText(buildReport());
    const askToSelect = () => {
      fallback.hidden = false;
      log.focus();
      log.select();
      status.textContent = "Select and copy the log below.";
    };
    if (!navigator.clipboard) {
      askToSelect();
      return;
    }
    void navigator.clipboard.writeText(log.value).then(() => {
      fallback.hidden = true;
      status.textContent = "Logs copied.";
    }, askToSelect);
  });

  panel.addEventListener("toggle", refresh);
  window.setInterval(refresh, REFRESH_MS);
}
