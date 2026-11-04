import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { getVideo, testCanvas, testCloneEffect } from "../app/vision";
import { diagnosticText, getDiagnosticSnapshot } from "../diagnostics";
import {
  deviceFacts,
  downloadSummary,
  downloadText,
  formatMs,
  graphicsChip,
  SOFTWARE_GRAPHICS,
} from "../diagnostics-info";
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
} from "../performance-report";
import { EventHistory } from "./EventHistory";
import { FrameRibbon, SERIES, WAIT_COLOR } from "./FrameRibbon";
import { Button } from "./ui";

const REFRESH_MS = 500;
const FREEZE_WINDOW_MS = 10_000;

function useRefresh(): void {
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);
}

// Safari on iPad may never fire the frame callback, so a rate of zero means unknown.
function useLiveStats() {
  const [live, setLive] = useState(() => ({
    now: performance.now(),
    camera: null as number | null,
    longestFreeze: null as number | null,
  }));
  useEffect(() => {
    const video = getVideo();
    const frames = { count: 0, callback: 0 };
    if ("requestVideoFrameCallback" in video) {
      const countFrame = () => {
        frames.count++;
        frames.callback = video.requestVideoFrameCallback(countFrame);
      };
      frames.callback = video.requestVideoFrameCallback(countFrame);
    }
    const started = performance.now();
    const watch = { stop: watchFreezes(), startedAt: started };
    const rate = { at: started, frames: 0 };
    const timer = window.setInterval(() => {
      const now = performance.now();
      const longestFreeze = now - watch.startedAt >= FREEZE_WINDOW_MS ? watch.stop() : null;
      if (longestFreeze !== null) {
        watch.stop = watchFreezes();
        watch.startedAt = now;
      }
      const camera =
        now - rate.at >= 1000
          ? ((frames.count - rate.frames) * 1000) / (now - rate.at) || null
          : undefined;
      if (camera !== undefined) {
        rate.at = now;
        rate.frames = frames.count;
      }
      setLive((previous) => ({
        now,
        camera: camera === undefined ? previous.camera : camera,
        longestFreeze: longestFreeze ?? previous.longestFreeze,
      }));
    }, REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      watch.stop();
      if ("cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(frames.callback);
    };
  }, []);
  return live;
}

function Stages({ id, stages, empty }: { id: string; stages: Stage[]; empty: string }) {
  if (!stages.length)
    return (
      <div id={id}>
        <p className="text-muted">{empty}</p>
      </div>
    );
  const total = Math.max(
    stages.reduce((sum, stage) => sum + stage.ms, 0),
    1,
  );
  return (
    <div id={id}>
      {stages.map((stage, index) => {
        const elapsed = stages.slice(0, index).reduce((sum, earlier) => sum + earlier.ms, 0);
        const marginInlineStart = `${(elapsed / total) * 100}%`;
        return (
          <div
            key={stage.label}
            className="mb-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[15px]"
          >
            <span>{stage.label}</span>
            <span className="tabular-nums">{formatMs(stage.ms)}</span>
            <span className="col-span-full block h-1.5 bg-slate-200">
              <span
                className="block h-full min-w-0.5 bg-info"
                style={{ marginInlineStart, width: `${(stage.ms / total) * 100}%` }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Facts({ id, facts, empty }: { id: string; facts: [string, string][]; empty: string }) {
  return (
    <div id={id}>
      {facts.length ? (
        <dl>
          {facts.map(([name, value]) => (
            <div key={name} className="flex justify-between gap-4 py-[3px] text-[15px]">
              <dt className="flex-none text-muted">{name}</dt>
              <dd className="min-w-0 text-right wrap-anywhere tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted">{empty}</p>
      )}
    </div>
  );
}

function Note({ id, children }: { id?: string; children: ReactNode }) {
  return children ? (
    <p id={id} className="mt-1.5 max-w-[68ch] text-[15px] text-muted">
      {children}
    </p>
  ) : null;
}

function Warning({ children }: { children: ReactNode }) {
  return <p className="mt-2 font-semibold text-danger">{children}</p>;
}

function Report({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="mb-2.5">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Legend({
  frames,
  selected,
  summary,
}: {
  frames: FrameSample[];
  selected: FrameSample | null;
  summary: FrameSummary | null;
}) {
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
  return (
    <ul
      id="diagnostics-legend"
      aria-label="Time spent per frame"
      data-scope={frame ? "frame" : "typical"}
      className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[15px]"
    >
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: item.color }} />
          <span>{item.label}</span>
          {item.ms !== undefined && (
            <span className="font-bold tabular-nums">{formatMs(item.ms)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

const TONES: Record<string, string> = {
  idle: "text-muted",
  warn: "text-danger before:content-['!_']",
};

function DiagnosticsBody() {
  const live = useLiveStats();
  const video = getVideo();
  const [selected, setSelected] = useState<FrameSample | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [fallbackLog, setFallbackLog] = useState<string | null>(null);
  const logRef = useRef<HTMLTextAreaElement>(null);

  const { entries, persistenceAvailable } = getDiagnosticSnapshot();
  const frames = recentFrames();
  const summary = summarizeFrames(frames, live.now);
  const verdict = frameVerdict(summary, getTrackingState());
  const run = latestTrainingRun(entries);
  const stats = latestCloneStats(entries);
  const device = deviceFacts(video);
  const problems = entries.filter((entry) => entry.level !== "info").length;

  const liveNote = [
    summary &&
      (live.camera
        ? `The camera sends ${Math.round(live.camera)} frames a second and tracking handles ${Math.round(summary.framesPerSecond)}.`
        : `Tracking handles ${Math.round(summary.framesPerSecond)} frames a second.`),
    live.longestFreeze !== null &&
      `Longest freeze in the last 10 seconds: ${formatMs(live.longestFreeze)}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const cloneFacts: [string, string][] = [];
  if (stats?.triggerToEffectMs != null)
    cloneFacts.push(["Trigger to effect start", formatMs(stats.triggerToEffectMs)]);
  if (stats?.personCoverage != null)
    cloneFacts.push(["Person layer", `${Math.round(stats.personCoverage * 100)}% of the frame`]);

  useEffect(() => {
    if (fallbackLog === null || !logRef.current) return;
    logRef.current.focus();
    logRef.current.select();
  }, [fallbackLog]);

  const copyLogs = () => {
    const log = diagnosticText({
      verdict,
      frames: summary,
      cameraFramesPerSecond: live.camera,
      longestFreezeMs: live.longestFreeze,
      startup: startupStages(entries),
      downloads: downloadSummary(),
      training: run,
      clone: stats,
      device: Object.fromEntries(device),
    });
    const askToSelect = () => {
      setFallbackLog(log);
      setCopyStatus("Select and copy the log below.");
    };
    if (!navigator.clipboard) {
      askToSelect();
      return;
    }
    void navigator.clipboard.writeText(log).then(() => {
      setFallbackLog(null);
      setCopyStatus("Logs copied.");
    }, askToSelect);
  };

  const status =
    copyStatus ||
    (persistenceAvailable ? "" : "Browser storage is off, so these logs end with this tab.");

  return (
    <>
      <section aria-labelledby="diagnostics-verdict" className="mt-5">
        <h2
          id="diagnostics-verdict"
          data-tone={verdict.tone}
          className={`text-[clamp(19px,5vw,38px)] leading-[1.05] font-black tracking-[-0.03em] text-balance ${TONES[verdict.tone] ?? ""}`}
        >
          {verdict.title}
        </h2>
        <p className="mt-2 mb-4 max-w-[62ch] text-muted">{verdict.detail}</p>
        <FrameRibbon
          frames={frames}
          selected={selected}
          label={`Time per tracked frame. ${verdict.title} ${verdict.detail}`}
          onSelect={setSelected}
        />
        <Legend frames={frames} selected={selected} summary={summary} />
        <Note>{liveNote}</Note>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button small onClick={testCanvas}>
            Test Canvas
          </Button>
          <Button small onClick={() => void testCloneEffect()}>
            Test clone effect
          </Button>
        </div>
      </section>

      <div className="mt-8 grid grid-cols-2 gap-x-10 gap-y-7 max-[640px]:grid-cols-1">
        <Report id="diagnostics-startup-title" title="Startup">
          <Stages
            id="diagnostics-startup"
            stages={startupStages(entries)}
            empty="Start the camera to time this."
          />
          <Note id="diagnostics-downloads">{downloadText()}</Note>
        </Report>
        <Report id="diagnostics-training-title" title="Last training">
          <Stages
            id="diagnostics-training"
            stages={run ? trainingStages(run) : []}
            empty="Train a model to time this."
          />
          <Note id="diagnostics-training-note">
            {run &&
              `${run.outcome === "complete" ? "" : `Training ${run.outcome}. `}${run.debug ? "Debug train" : "Full train"} with ${run.examples} examples on ${run.backend}. Longest freeze ${formatMs(run.longestFreezeMs)}.`}
          </Note>
        </Report>
        <Report id="diagnostics-clone-title" title="Clone effect">
          <Facts
            id="diagnostics-clone"
            facts={cloneFacts}
            empty="Trigger the clones to time this."
          />
          {Boolean(stats?.personCoverage) && stats!.personCoverage! >= PERSON_LAYER_LIMIT && (
            <Warning>The person layer covers the frame, so it hides the clones and smoke.</Warning>
          )}
        </Report>
        <Report id="diagnostics-device-title" title="This device">
          <Facts id="diagnostics-device" facts={device} empty="" />
          {SOFTWARE_GRAPHICS.test(graphicsChip()) && (
            <Warning>
              Graphics are running in software, so tracking and training will be slow.
            </Warning>
          )}
        </Report>
      </div>

      <section aria-labelledby="diagnostics-history-title" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="diagnostics-history-title">Event history</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="plain" small onClick={() => setProblemsOnly(!problemsOnly)}>
              {problemsOnly ? "Show all events" : `Show problems only (${problems})`}
            </Button>
            <Button small onClick={copyLogs}>
              Copy logs
            </Button>
          </div>
        </div>
        <Note>Logs stay in this browser. No camera images or recorded landmarks are included.</Note>
        <p
          id="diagnostics-status"
          role="status"
          hidden={!status}
          className="mt-1.5 text-[15px] text-muted"
        >
          {status}
        </p>
        <EventHistory entries={entries} problemsOnly={problemsOnly} />
        {fallbackLog !== null && (
          <div className="mt-3">
            <label htmlFor="diagnostics-log">Log to copy</label>
            <textarea
              ref={logRef}
              id="diagnostics-log"
              readOnly
              spellCheck={false}
              rows={6}
              value={fallbackLog}
              className="mt-1.5 block w-full resize-y border border-line font-mono text-xs"
            />
          </div>
        )}
      </section>
    </>
  );
}

function ErrorFlag() {
  useRefresh();
  const { entries } = getDiagnosticSnapshot();
  const errors = currentSession(entries).filter((entry) => entry.level === "error").length;
  if (!errors) return null;
  return (
    <span id="diagnostics-flag" className="float-right text-danger tabular-nums">
      {errors === 1 ? "1 error" : `${errors} errors`}
    </span>
  );
}

export function DiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  return (
    <details
      id="diagnostics-panel"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="mt-3 rounded-lg border border-slate-300 px-3 py-2.5 open:pb-6"
    >
      <summary className="cursor-pointer font-semibold">
        <span>Diagnostics</span>
        <ErrorFlag />
      </summary>
      {open && <DiagnosticsBody />}
    </details>
  );
}
