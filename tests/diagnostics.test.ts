import { afterEach, expect, test, vi } from "vitest";
import { serializeDiagnostic } from "../src/diagnostics";

afterEach(() => vi.unstubAllGlobals());

test("diagnostics preserve full errors, stack traces, causes and circular details", () => {
  const cause = new Error("original failure " + "x".repeat(20_000));
  const error = new Error("segmentation failed", { cause });
  const details: { error: Error; self?: unknown } = { error };
  details.self = details;
  expect(serializeDiagnostic(details)).toMatchObject({
    error: {
      message: error.message,
      stack: error.stack,
      cause: { message: cause.message, stack: cause.stack },
    },
    self: "[Circular]",
  });
});

test("history survives reload, stays bounded and tolerates unavailable storage", async () => {
  vi.resetModules();
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    addEventListener: vi.fn<() => void>(),
    setInterval: vi.fn<() => void>(),
  });
  vi.stubGlobal("document", { addEventListener: vi.fn<() => void>() });
  vi.stubGlobal("navigator", { userAgent: "test" });
  let diagnostics = await import("../src/diagnostics");
  diagnostics.initializeDiagnostics();
  for (let index = 0; index < 300; index++) diagnostics.logDiagnostic("effect", `event ${index}`);
  diagnostics.flushDiagnostics();
  expect(diagnostics.getDiagnosticSnapshot().entries).toHaveLength(250);
  vi.resetModules();
  diagnostics = await import("../src/diagnostics");
  diagnostics.initializeDiagnostics();
  expect(
    diagnostics.getDiagnosticSnapshot().entries.some((entry) => entry.event === "event 299"),
  ).toBe(true);
  storage.setItem = () => {
    throw new Error("storage disabled");
  };
  diagnostics.logDiagnostic("effect", "still retained");
  diagnostics.flushDiagnostics();
  expect(diagnostics.getDiagnosticSnapshot().persistenceAvailable).toBe(false);
  expect(diagnostics.diagnosticText()).toContain("still retained");
});
