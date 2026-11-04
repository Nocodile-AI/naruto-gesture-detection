import { memo, useState } from "react";
import type { DiagnosticEntry } from "../diagnostics";

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

const LINE =
  "flex items-baseline gap-2.5 px-1.5 py-[3px] text-sm max-[560px]:flex-wrap max-[560px]:gap-x-2 max-[560px]:gap-y-0.5";

function EventLine({ entry }: { entry: DiagnosticEntry }) {
  const started = entry.event === "session started";
  const date = new Date(entry.time);
  return (
    <>
      <time className="flex-none text-muted tabular-nums">
        {started
          ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
          : date.toLocaleTimeString([], { hour12: false })}
      </time>
      <span className="flex-none text-muted">{entry.stage}</span>
      <span className="flex-none font-semibold">{entry.event.replaceAll("-", " ")}</span>
      {entry.level !== "info" && (
        <span
          className={`flex-none font-bold ${entry.level === "error" ? "text-danger" : "text-warning"}`}
        >
          {entry.level === "error" ? "Error" : "Warning"}
        </span>
      )}
      {!started && (
        <span className="min-w-0 truncate text-muted max-[560px]:basis-full">
          {detailPreview(entry.details)}
        </span>
      )}
    </>
  );
}

const EventRow = memo(function EventRow({ entry }: { entry: DiagnosticEntry }) {
  const [open, setOpen] = useState(false);
  const shade = entry.event === "session started" ? "bg-slate-200" : "";
  const plain = entry.details === undefined || entry.details === "undefined";
  return (
    <li data-level={entry.level} data-stage={entry.stage} data-event={entry.event}>
      {plain ? (
        <div className={`${LINE} ${shade}`}>
          <EventLine entry={entry} />
        </div>
      ) : (
        <details onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary
            className={`${LINE} ${shade} cursor-pointer list-none hover:bg-slate-100 [&::-webkit-details-marker]:hidden`}
          >
            <EventLine entry={entry} />
          </summary>
          {open && (
            <pre className="max-h-64 overflow-auto bg-slate-100 px-2.5 py-2 text-xs wrap-anywhere whitespace-pre-wrap">
              {JSON.stringify(entry.details, null, 2)}
            </pre>
          )}
        </details>
      )}
    </li>
  );
});

export function EventHistory({
  entries,
  problemsOnly,
}: {
  entries: DiagnosticEntry[];
  problemsOnly: boolean;
}) {
  // Entries can share a millisecond, so count repeats to keep each row's key stable.
  const seen = new Map<string, number>();
  const keyed = entries.map((entry) => {
    const base = `${entry.time} ${entry.stage} ${entry.event}`;
    const repeat = seen.get(base) ?? 0;
    seen.set(base, repeat + 1);
    return { entry, key: `${base} ${repeat}` };
  });
  const shown = problemsOnly ? keyed.filter(({ entry }) => entry.level !== "info") : keyed;
  return (
    <section
      id="diagnostics-events"
      aria-label="Events, newest first"
      tabIndex={0}
      className="mt-2.5 max-h-88 overflow-y-auto border-y border-slate-300"
    >
      <ol id="diagnostics-event-list">
        {shown.toReversed().map(({ entry, key }) => (
          <EventRow key={key} entry={entry} />
        ))}
      </ol>
      {problemsOnly && !shown.length && <p className="text-muted">No problems logged.</p>}
    </section>
  );
}
