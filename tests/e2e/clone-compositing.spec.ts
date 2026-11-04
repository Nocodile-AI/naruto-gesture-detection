import { expect, test, type Page } from "@playwright/test";
import { composePersonLayer } from "../../src/clone-effect";

declare global {
  interface Window {
    composePersonLayer: typeof composePersonLayer;
  }
}

// Playwright's Windows WebKit has no canvas.captureStream, and off macOS it has no Apple path.
test.skip(
  ({ browserName }) => browserName === "webkit" && process.platform !== "darwin",
  "WebKit runs this file only on macOS.",
);

// Regression test for a bug where the clone effect never appeared on iPad Safari,
// even though the gesture triggered and no error was logged. The fix was confirmed
// on an iPad Air (5th generation), iPadOS 27.0.1, Safari.
//
// Apple's WebKit draws <video> with its default paint options, so the canvas's
// globalCompositeOperation is ignored and the frame lands with source-over:
// https://bugs.webkit.org/show_bug.cgi?id=221542
// The person layer then becomes an opaque frame that hides the clones and smoke.
//
// That code is compiled only for Apple platforms, so Playwright's Windows and Linux
// WebKit builds cannot show it. This patch applies the same behavior in Chromium, so
// the test runs on any machine with Playwright installed:
//   bun run build && bunx playwright test clone-compositing
// CI also runs this file on macOS, where WebKit needs no patch.
function emulateAppleVideoCompositing() {
  const prototype: object = CanvasRenderingContext2D.prototype;
  const drawImage: (this: CanvasRenderingContext2D, ...args: unknown[]) => void = Reflect.get(
    prototype,
    "drawImage",
  );
  CanvasRenderingContext2D.prototype.drawImage = function (
    this: CanvasRenderingContext2D,
    ...args: unknown[]
  ) {
    if (!(args[0] instanceof HTMLVideoElement)) return drawImage.apply(this, args);
    const operation = this.globalCompositeOperation;
    this.globalCompositeOperation = "source-over";
    drawImage.apply(this, args);
    this.globalCompositeOperation = operation;
  };
}

// The drawing order from before the fix: mask first, then the video as the source.
function oldComposePersonLayer(
  ctx: Parameters<typeof composePersonLayer>[0],
  video: CanvasImageSource,
  mask: CanvasImageSource,
  width: number,
  height: number,
) {
  ctx.drawImage(mask, 0, 0, width, height);
  ctx.globalCompositeOperation = "source-in";
  ctx.drawImage(video, 0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
}

// Green video, with a mask that keeps only the left half of the frame.
async function samplePersonLayer(page: Page, compose: typeof composePersonLayer) {
  await page.evaluate(`window.composePersonLayer = ${compose.toString()}`);
  return page.evaluate(async () => {
    const source = document.createElement("canvas");
    source.width = 64;
    source.height = 48;
    const sourceCtx = source.getContext("2d")!;
    const paint = () => {
      sourceCtx.fillStyle = "rgb(0, 200, 0)";
      sourceCtx.fillRect(0, 0, 64, 48);
    };
    paint();
    const painter = setInterval(paint, 20);
    const video = document.createElement("video");
    video.muted = true;
    const stream = source.captureStream(30);
    video.srcObject = stream;
    await video.play();

    const mask = document.createElement("canvas");
    mask.width = 64;
    mask.height = 48;
    const maskCtx = mask.getContext("2d")!;
    maskCtx.fillRect(0, 0, 32, 48);

    const person = document.createElement("canvas");
    person.width = 64;
    person.height = 48;
    const ctx = person.getContext("2d")!;
    window.composePersonLayer(ctx, video, mask, 64, 48);
    clearInterval(painter);
    stream.getTracks().forEach((track) => track.stop());
    return {
      person: Array.from(ctx.getImageData(10, 24, 1, 1).data),
      background: Array.from(ctx.getImageData(54, 24, 1, 1).data),
      composite: ctx.globalCompositeOperation,
    };
  });
}

for (const apple of [false, true]) {
  test(`person layer keeps the background transparent ${apple ? "when video ignores compositing" : "with standard compositing"}`, async ({
    page,
    browserName,
  }) => {
    test.skip(apple && browserName !== "chromium", "The patch stands in for Apple's WebKit.");
    if (apple) await page.addInitScript(emulateAppleVideoCompositing);
    await page.goto("/");
    const { person, background, composite } = await samplePersonLayer(page, composePersonLayer);
    // An opaque background here covers every clone and smoke puff on the canvas.
    expect(background[3]).toBe(0);
    expect(person[3]).toBe(255);
    expect(person[1]).toBeGreaterThan(150);
    expect(composite).toBe("source-over");
  });
}

// Fails if the macOS build stops showing the bug, which would mean the test above no
// longer exercises Apple's drawing path there.
test("the old drawing order hides the clones on macOS WebKit", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "Apple's video drawing path exists only in WebKit.");
  await page.goto("/");
  const { background } = await samplePersonLayer(page, oldComposePersonLayer);
  expect(background[3]).toBe(255);
});

test("the emulation reproduces the bug with the old drawing order", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "The patch stands in for Apple's WebKit.");
  await page.addInitScript(emulateAppleVideoCompositing);
  await page.goto("/");
  const { background } = await samplePersonLayer(page, oldComposePersonLayer);
  expect(background[3]).toBe(255);
});
