import { expect, test, type Page } from "@playwright/test";
import { composePersonLayer } from "../../src/clone-effect";

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
function emulateAppleVideoCompositing() {
  // oxlint-disable-next-line typescript/unbound-method -- called below through apply(this).
  const drawImage = CanvasRenderingContext2D.prototype.drawImage as (
    this: CanvasRenderingContext2D,
    ...args: unknown[]
  ) => void;
  CanvasRenderingContext2D.prototype.drawImage = function (
    this: CanvasRenderingContext2D,
    ...args: unknown[]
  ) {
    if (!(args[0] instanceof HTMLVideoElement)) return drawImage.apply(this, args);
    const operation = this.globalCompositeOperation;
    this.globalCompositeOperation = "source-over";
    drawImage.apply(this, args);
    this.globalCompositeOperation = operation;
  } as typeof CanvasRenderingContext2D.prototype.drawImage;
}

// Green video, with a mask that keeps only the left half of the frame.
async function samplePersonLayer(page: Page) {
  await page.evaluate(`window.composePersonLayer = ${composePersonLayer.toString()}`);
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
    (window as unknown as { composePersonLayer: typeof composePersonLayer }).composePersonLayer(
      ctx,
      video,
      mask,
      64,
      48,
    );
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
  }) => {
    if (apple) await page.addInitScript(emulateAppleVideoCompositing);
    await page.goto("/");
    const { person, background, composite } = await samplePersonLayer(page);
    // An opaque background here covers every clone and smoke puff on the canvas.
    expect(background[3]).toBe(0);
    expect(person[3]).toBe(255);
    expect(person[1]).toBeGreaterThan(150);
    expect(composite).toBe("source-over");
  });
}
