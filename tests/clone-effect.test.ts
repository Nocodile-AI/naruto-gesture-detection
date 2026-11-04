import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@mediapipe/selfie_segmentation", () => ({ SelfieSegmentation: vi.fn<() => void>() }));
vi.mock("../src/diagnostics", () => ({
  logDiagnostic: vi.fn<() => void>(),
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

import { SelfieSegmentation, type ResultsListener } from "@mediapipe/selfie_segmentation";
import { CloneEffect } from "../src/clone-effect";
import { logDiagnostic } from "../src/diagnostics";

function imageSource(width: number): ImageBitmap {
  return { width, height: 1, close: () => {} };
}

function canvasContext() {
  return {
    clearRect: vi.fn<() => void>(),
    drawImage: vi.fn<(source: unknown) => void>(),
    save: vi.fn<() => void>(),
    restore: vi.fn<() => void>(),
    translate: vi.fn<() => void>(),
    scale: vi.fn<() => void>(),
    beginPath: vi.fn<() => void>(),
    arc: vi.fn<() => void>(),
    fill: vi.fn<() => void>(),
    fillRect: vi.fn<() => void>(),
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
  };
}

it("rejects unready normal effects and independently renders a synthetic clone test", async () => {
  ImmediateImage.fails = false;
  vi.stubGlobal("Image", ImmediateImage);
  const personCtx = canvasContext();
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => personCtx }),
  });
  const effect = new CloneEffect({ dataset: {}, src: "" });
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
  effect.drawTest(ctx, 640, 480);
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
  const effect = new CloneEffect({ dataset: {}, src: "" });
  await effect.startTest(0);
  vi.spyOn(performance, "now").mockReturnValue(1500);
  const ctx = canvasContext();
  const error = new Error("drawImage failure");
  ctx.drawImage.mockImplementation(() => {
    throw error;
  });
  expect(() => effect.drawTest(ctx, 640, 480)).toThrow(error);
  expect(() => effect.drawTest(ctx, 640, 480)).toThrow(error);
  expect(ctx.restore).toHaveBeenCalledTimes(ctx.save.mock.calls.length);
  expect(personCtx.globalCompositeOperation).toBe("source-over");
  expect(
    vi.mocked(logDiagnostic).mock.calls.filter((call) => call[1] === "clone-render-failed"),
  ).toHaveLength(1);
  ctx.drawImage.mockImplementation(() => {});
  effect.drawTest(ctx, 640, 480);
  expect(logDiagnostic).toHaveBeenCalledWith("canvas", "clone-render-recovered");
  expect(logDiagnostic).toHaveBeenCalledWith(
    "canvas",
    "clone-render-failed",
    expect.objectContaining({ error }),
    "error",
  );
});

it("masks the live person without drawing the video under a composite mode", async () => {
  ImmediateImage.fails = false;
  vi.stubGlobal("Image", ImmediateImage);
  const personCtx = canvasContext();
  const draws: [unknown, string][] = [];
  personCtx.drawImage.mockImplementation((source: unknown) => {
    draws.push([source, personCtx.globalCompositeOperation]);
  });
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => personCtx }),
  });
  const listeners: ResultsListener[] = [];
  vi.mocked(SelfieSegmentation).mockImplementation(function () {
    return {
      close: async () => {},
      initialize: async () => {},
      reset: () => {},
      send: async () => {},
      setOptions: () => {},
      onResults: (listener: ResultsListener) => {
        listeners.push(listener);
      },
    };
  });
  const effect = new CloneEffect({ dataset: {}, src: "" });
  await effect.prepareAssets();
  await effect.enableSegmentation();
  const mask = imageSource(2);
  void listeners[0]({ image: mask, segmentationMask: mask });
  expect(effect.start(0)).toBe(true);
  vi.spyOn(performance, "now").mockReturnValue(1500);
  const video = imageSource(1);
  effect.draw(canvasContext(), video, 640, 480);
  expect(draws).toEqual([
    [video, "source-over"],
    [mask, "destination-in"],
  ]);
  expect(personCtx.globalCompositeOperation).toBe("source-over");
  effect.reset();
});
