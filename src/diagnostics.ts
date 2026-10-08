export type DiagnosticLevel = "info" | "warn" | "error";
export interface DiagnosticEntry {
  time: string;
  stage: string;
  event: string;
  level: DiagnosticLevel;
  details?: unknown;
}

const STORAGE_KEY = "naruto-diagnostics-v1";
const MAX_ENTRIES = 250;
const MAX_STORED_CHARS = 500_000;
let entries: DiagnosticEntry[] = [];
const metrics: Record<string, number | string | null> = {};
let initialized = false;
let dirty = false;
let persistenceAvailable = true;

// Preserve non-enumerable Error fields and nested causes without retaining runtime objects.
export function serializeDiagnostic(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "bigint" || typeof value === "symbol") return value.toString();
  if (typeof value === "function") return "[Function]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => serializeDiagnostic(item, seen));
  const result: Record<string, unknown> = {};
  const keys = new Set(Object.keys(value));
  if (value instanceof Error) {
    keys.add("name");
    keys.add("message");
    keys.add("stack");
    if ("cause" in value) keys.add("cause");
    if ("errors" in value) keys.add("errors");
  }
  for (const key of keys) {
    try {
      result[key] = serializeDiagnostic((value as Record<string, unknown>)[key], seen);
    } catch {
      result[key] = "[Unreadable property]";
    }
  }
  return result;
}

export function logDiagnostic(
  stage: string,
  event: string,
  details?: unknown,
  level: DiagnosticLevel = "info",
): void {
  entries.push({
    time: new Date().toISOString(),
    stage,
    event,
    level,
    details: serializeDiagnostic(details),
  });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  dirty = true;
}

export function recordMetric(name: string, value: number | string | null): void {
  metrics[name] = value;
}

export function getDiagnosticSnapshot() {
  return { entries: [...entries], metrics: { ...metrics }, persistenceAvailable };
}

export function diagnosticText(): string {
  return JSON.stringify(getDiagnosticSnapshot(), null, 2);
}

export function flushDiagnostics(): void {
  if (!dirty) return;
  try {
    let serialized = JSON.stringify(entries);
    while (serialized.length > MAX_STORED_CHARS && entries.length > 1) {
      entries.shift();
      serialized = JSON.stringify(entries);
    }
    localStorage.setItem(STORAGE_KEY, serialized);
    persistenceAvailable = true;
    dirty = false;
  } catch (error) {
    if (persistenceAvailable)
      logDiagnostic("diagnostics", "history persistence failed", error, "warn");
    persistenceAvailable = false;
  }
}

export function initializeDiagnostics(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (Array.isArray(saved)) {
      const restored = saved.filter(
        (item): item is DiagnosticEntry =>
          item !== null &&
          typeof item === "object" &&
          typeof item.time === "string" &&
          typeof item.stage === "string" &&
          typeof item.event === "string" &&
          ["info", "warn", "error"].includes(item.level),
      );
      entries = [...restored, ...entries].slice(-MAX_ENTRIES);
    }
  } catch (error) {
    persistenceAvailable = false;
    logDiagnostic("diagnostics", "history restore failed", error, "warn");
  }
  window.addEventListener("error", (event) => {
    logDiagnostic(
      "window",
      "uncaught error",
      {
        error: event.error,
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      },
      "error",
    );
    flushDiagnostics();
  });
  window.addEventListener("unhandledrejection", (event) => {
    logDiagnostic("window", "unhandled rejection", event.reason, "error");
    flushDiagnostics();
  });
  window.addEventListener("pagehide", flushDiagnostics);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushDiagnostics();
  });
  window.setInterval(flushDiagnostics, 2000);
  logDiagnostic("diagnostics", "session started", { userAgent: navigator.userAgent });
}

initializeDiagnostics();
