import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@mediapipe/selfie_segmentation", () => ({ SelfieSegmentation: vi.fn() }));
vi.mock("../src/diagnostics", () => ({
  logDiagnostic: vi.fn(),
  recordMetric: vi.fn(),
  serializeDiagnostic: (value: unknown) =>
    value instanceof Error ? { message: value.message, stack: value.stack } : value,
}));
import { loadImage } from "../src/clone-effect";

class ImmediateImage extends EventTarget {
  static fails = false;
  complete = false;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(_value: string) {
    this.complete = true;
    if (!ImmediateImage.fails) this.naturalWidth = this.naturalHeight = 32;
    this.dispatchEvent(new Event(ImmediateImage.fails ? "error" : "load"));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("clone asset loading", () => {
  it("handles a load firing immediately when src is assigned without decode", async () => {
    ImmediateImage.fails = false;
    vi.stubGlobal("Image", ImmediateImage);
    expect((await loadImage("cached.png")).naturalWidth).toBe(32);
  });
  it("preserves immediate loading failures instead of waiting for a missed event", async () => {
    ImmediateImage.fails = true;
    vi.stubGlobal("Image", ImmediateImage);
    await expect(loadImage("missing.png")).rejects.toMatchObject({
      message: "Failed to load missing.png",
      cause: expect.any(Event),
    });
  });
});

import { CloneEffect } from "../src/clone-effect";
import { logDiagnostic } from "../src/diagnostics";

function canvasContext() {
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    globalCompositeOperation: "source-over",
  };
}

it("rejects unready normal effects and independently renders a synthetic clone test", async () => {
  ImmediateImage.fails = false;
  vi.stubGlobal("Image", ImmediateImage);
  const personCtx = canvasContext();
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => personCtx }),
  });
  const effect = new CloneEffect({ dataset: {}, src: "" } as HTMLImageElement);
  expect(effect.start(10)).toBe(false);
  expect(logDiagnostic).toHaveBeenCalledWith(
    "clone",
    "start-rejected",
    expect.objectContaining({ assetsReady: false, maskReady: false }),
    "warn",
  );
  const ctx = canvasContext();
  expect(await effect.startTest(0)).toBe(true);
  vi.spyOn(performance, "now").mockReturnValue(1500);
  effect.drawTest(ctx as unknown as CanvasRenderingContext2D, 640, 480);
  expect(personCtx.fillRect).toHaveBeenCalled();
  expect(ctx.drawImage.mock.calls.length).toBeGreaterThan(1);
  effect.reset();
  expect(effect.isActive()).toBe(false);
});

it("restores Canvas transforms after clone rendering throws", async () => {
  ImmediateImage.fails = false;
  vi.stubGlobal("Image", ImmediateImage);
  const personCtx = canvasContext();
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => personCtx }),
  });
  const effect = new CloneEffect({ dataset: {}, src: "" } as HTMLImageElement);
  await effect.startTest(0);
  vi.spyOn(performance, "now").mockReturnValue(1500);
  const ctx = canvasContext();
  const error = new Error("drawImage failure");
  ctx.drawImage.mockImplementation(() => {
    throw error;
  });
  expect(() => effect.drawTest(ctx as unknown as CanvasRenderingContext2D, 640, 480)).toThrow(
    error,
  );
  expect(() => effect.drawTest(ctx as unknown as CanvasRenderingContext2D, 640, 480)).toThrow(
    error,
  );
  expect(ctx.restore).toHaveBeenCalledTimes(ctx.save.mock.calls.length);
  expect(personCtx.globalCompositeOperation).toBe("source-over");
  expect(
    vi.mocked(logDiagnostic).mock.calls.filter((call) => call[1] === "clone-render-failed"),
  ).toHaveLength(1);
  ctx.drawImage.mockImplementation(() => {});
  effect.drawTest(ctx as unknown as CanvasRenderingContext2D, 640, 480);
  expect(logDiagnostic).toHaveBeenCalledWith("canvas", "clone-render-recovered");
  expect(logDiagnostic).toHaveBeenCalledWith(
    "canvas",
    "clone-render-failed",
    expect.objectContaining({ error }),
    "error",
  );
});
