import type { SelfieSegmentation } from "@mediapipe/selfie_segmentation";
import { logDiagnostic, recordMetric, serializeDiagnostic } from "./diagnostics";
import { publicUrl } from "./public-url";
import { SELFIE_SEGMENTATION_BASE } from "./runtime/urls";

const SMOKE_FOLDERS = ["smoke_1", "smoke_2", "smoke_3"] as const;
const SMOKE_FRAME_COUNT = 5;
const SMOKE_DURATION = 600;
export const CLONE_EFFECT_DURATION_MS = 4600;

const CLONES = [
  { x: -100, y: 100, scale: 0.9, delay: 1000 },
  { x: 120, y: 100, scale: 0.85, delay: 1150 },
  { x: -180, y: 140, scale: 0.8, delay: 1300 },
  { x: -140, y: 140, scale: 0.45, delay: 1320 },
  { x: 180, y: 160, scale: 0.7, delay: 1450 },
  { x: 140, y: 160, scale: 0.4, delay: 1470 },
  { x: -250, y: 140, scale: 0.7, delay: 1600 },
  { x: -220, y: 140, scale: 0.35, delay: 1620 },
  { x: 260, y: 160, scale: 0.65, delay: 1750 },
  { x: -100, y: 150, scale: 0.6, delay: 2500 },
  { x: 100, y: 150, scale: 0.6, delay: 2650 },
  { x: -120, y: 70, scale: 0.55, delay: 2800 },
  { x: 100, y: 70, scale: 0.5, delay: 2950 },
  { x: -200, y: 85, scale: 0.55, delay: 3100 },
  { x: 230, y: 85, scale: 0.5, delay: 3250 },
  { x: -280, y: 100, scale: 0.4, delay: 3400 },
] as const;

type Smoke = { x: number; y: number; scale: number; start: number; frames: HTMLImageElement[] };

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  logDiagnostic("assets", "image-request", { src });
  // Register listeners before assigning src: cached loads and early errors must
  // settle the promise even when decode() is missing or rejects.
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
    };
    const loaded = () => {
      cleanup();
      if (!image.naturalWidth) reject(new Error(`Image has no pixels: ${src}`));
      else resolve();
    };
    const failed = (event: Event) => {
      cleanup();
      reject(new Error(`Failed to load ${src}`, { cause: event }));
    };
    image.addEventListener("load", loaded, { once: true });
    image.addEventListener("error", failed, { once: true });
    image.src = src;
    if (image.complete) {
      if (image.naturalWidth) loaded();
      else failed(new Event("error"));
    }
  }).catch((error: unknown) => {
    logDiagnostic("assets", "image-failed", { src, error }, "error");
    throw error;
  });
  logDiagnostic("assets", "image-loaded", {
    src,
    width: image.naturalWidth,
    height: image.naturalHeight,
  });
  return image;
}

export class CloneEffect {
  private segmentation: SelfieSegmentation | null = null;
  private segmentationPromise: Promise<void> | null = null;
  private generation = 0;
  private mask: CanvasImageSource | null = null;
  private personCanvas = document.createElement("canvas");
  private personCtx = this.personCanvas.getContext("2d");
  private smokeFrames = new Map<string, HTMLImageElement[]>();
  private activeSmokes: Smoke[] = [];
  private spawned = CLONES.map(() => false);
  private startedAt: number | null = null;
  private assetsReady = false;
  private assetPromise: Promise<void> | null = null;
  private testMode = false;
  private lastReadiness = "";
  private lastSkip = "";
  private firstDraw = false;
  private firstSegmentationSend = false;
  private lastMaskAvailability: boolean | null = null;
  private renderFailure = "";

  constructor(private overlay: HTMLImageElement) {
    if (!this.personCtx) {
      const error = new Error("Canvas 2D context is unavailable.");
      logDiagnostic("canvas", "context-unavailable", error, "error");
      throw error;
    }
    logDiagnostic("canvas", "clone-context-ready");
  }

  async prepareAssets(): Promise<void> {
    if (this.assetsReady) return;
    if (this.assetPromise) return this.assetPromise;
    this.assetPromise = this.loadAssets();
    try {
      await this.assetPromise;
    } finally {
      this.assetPromise = null;
    }
  }

  private async loadAssets(): Promise<void> {
    logDiagnostic("assets", "clone-assets-start");
    for (const folder of SMOKE_FOLDERS) {
      const frames = await Promise.all(
        Array.from({ length: SMOKE_FRAME_COUNT }, (_, index) =>
          loadImage(publicUrl(`assets/${folder}/${index + 1}.png`)),
        ),
      );
      this.smokeFrames.set(folder, frames);
    }
    await Promise.all([
      loadImage(publicUrl("assets/state-1.png")),
      loadImage(publicUrl("assets/state-2.png")),
    ]);
    this.assetsReady = true;
    logDiagnostic("assets", "clone-assets-ready");
  }

  async enableSegmentation(): Promise<void> {
    if (this.segmentation) return;
    if (this.segmentationPromise) return this.segmentationPromise;
    this.segmentationPromise = this.initializeSegmentation();
    try {
      await this.segmentationPromise;
    } finally {
      this.segmentationPromise = null;
    }
  }

  private async initializeSegmentation(): Promise<void> {
    const generation = this.generation;
    logDiagnostic("segmentation", "initializing");
    try {
      const { SelfieSegmentation } = await import("@mediapipe/selfie_segmentation");
      if (generation !== this.generation) return;
      const segmentation = new SelfieSegmentation({
        locateFile: (file) => {
          const src = `${SELFIE_SEGMENTATION_BASE}/${file}`;
          logDiagnostic("segmentation", "resource-request", { src });
          return src;
        },
      });
      segmentation.setOptions({ modelSelection: 1 });
      segmentation.onResults((result) => {
        const available = Boolean(result.segmentationMask);
        if (this.lastMaskAvailability !== available) {
          logDiagnostic(
            "segmentation",
            this.lastMaskAvailability === null ? "first-mask" : "mask-availability",
            { available },
          );
          this.lastMaskAvailability = available;
        }
        this.mask = result.segmentationMask;
      });
      this.segmentation = segmentation;
      logDiagnostic("segmentation", "configured");
    } catch (error) {
      logDiagnostic("segmentation", "initialization-failed", error, "error");
      throw error;
    }
  }

  async process(video: HTMLVideoElement): Promise<void> {
    if (!this.segmentation) return;
    const started = performance.now();
    if (!this.firstSegmentationSend) {
      this.firstSegmentationSend = true;
      logDiagnostic("segmentation", "first-send", {
        width: video.videoWidth,
        height: video.videoHeight,
        readyState: video.readyState,
      });
    }
    try {
      await this.segmentation.send({ image: video });
    } catch (error) {
      logDiagnostic("segmentation", "send-failed", error, "error");
      throw error;
    } finally {
      recordMetric("Segmentation ms", performance.now() - started);
    }
  }

  canStart(): boolean {
    const readiness = JSON.stringify({
      assetsReady: this.assetsReady,
      segmentationEnabled: Boolean(this.segmentation),
      maskReady: Boolean(this.mask),
      active: this.isActive(),
    });
    if (readiness !== this.lastReadiness) {
      this.lastReadiness = readiness;
      logDiagnostic("clone", "readiness", JSON.parse(readiness));
    }
    return this.assetsReady && Boolean(this.mask);
  }

  isActive(): boolean {
    return this.startedAt !== null;
  }

  start(now = performance.now()): boolean {
    if (this.isActive() || (!this.testMode && !this.canStart())) {
      logDiagnostic(
        "clone",
        "start-rejected",
        { active: this.isActive(), assetsReady: this.assetsReady, maskReady: Boolean(this.mask) },
        "warn",
      );
      return false;
    }
    this.firstDraw = false;
    this.lastSkip = "";
    logDiagnostic("clone", "started", { testMode: this.testMode });
    this.startedAt = now;
    this.spawned.fill(false);
    this.activeSmokes.length = 0;
    this.overlay.src = publicUrl("assets/state-2.png");
    this.overlay.dataset.state = "2";
    return true;
  }

  async startTest(now?: number): Promise<boolean> {
    await this.prepareAssets();
    if (this.isActive()) return false;
    this.testMode = true;
    return this.start(now ?? performance.now());
  }

  drawTest(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.draw(ctx, this.personCanvas, width, height);
  }

  reset(): void {
    if (this.isActive()) logDiagnostic("clone", "reset", { testMode: this.testMode });
    this.testMode = false;
    this.startedAt = null;
    this.spawned.fill(false);
    this.activeSmokes.length = 0;
    this.overlay.src = publicUrl("assets/state-1.png");
    this.overlay.dataset.state = "1";
  }

  draw(
    ctx: CanvasRenderingContext2D,
    video: CanvasImageSource,
    width: number,
    height: number,
  ): void {
    try {
      this.drawFrame(ctx, video, width, height);
    } catch (error) {
      const signature = JSON.stringify(serializeDiagnostic(error));
      if (signature !== this.renderFailure) {
        this.renderFailure = signature;
        logDiagnostic(
          "canvas",
          "clone-render-failed",
          { width, height, testMode: this.testMode, error },
          "error",
        );
      }
      throw error;
    }
  }

  private drawFrame(
    ctx: CanvasRenderingContext2D,
    video: CanvasImageSource,
    width: number,
    height: number,
  ): void {
    const skip = !this.isActive()
      ? "inactive"
      : !this.testMode && !this.mask
        ? "mask-unavailable"
        : !this.personCtx
          ? "context-unavailable"
          : width <= 0 || height <= 0
            ? "invalid-dimensions"
            : "";
    if (skip) {
      if (skip !== this.lastSkip)
        logDiagnostic("canvas", "clone-render-skipped", { reason: skip }, "warn");
      this.lastSkip = skip;
      return;
    }
    const renderStarted = performance.now();
    const now = performance.now();
    const elapsed = now - this.startedAt!;
    if (elapsed >= CLONE_EFFECT_DURATION_MS) {
      if (this.lastSkip !== "expired")
        logDiagnostic("canvas", "clone-render-skipped", { reason: "expired", elapsed });
      this.lastSkip = "expired";
      return;
    }
    const personCtx = this.personCtx!;

    const person = this.personCanvas;
    if (person.width !== width || person.height !== height) {
      person.width = width;
      person.height = height;
    }
    personCtx.clearRect(0, 0, width, height);
    personCtx.globalCompositeOperation = "source-over";
    try {
      if (this.testMode) {
        personCtx.fillStyle = "#67e8f9";
        personCtx.beginPath();
        personCtx.arc(width / 2, height * 0.25, height * 0.09, 0, Math.PI * 2);
        personCtx.fill();
        personCtx.fillRect(width * 0.4, height * 0.34, width * 0.2, height * 0.5);
      } else {
        personCtx.drawImage(this.mask!, 0, 0, width, height);
        personCtx.globalCompositeOperation = "source-in";
        personCtx.drawImage(video, 0, 0, width, height);
      }
    } finally {
      personCtx.globalCompositeOperation = "source-over";
    }

    ctx.save();
    try {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      for (const [index, clone] of CLONES.entries()) {
        if (elapsed < clone.delay) continue;
        if (!this.spawned[index]) {
          this.spawned[index] = true;
          const centerX = clone.x + width / 2;
          const centerY = clone.y + height / 2 - 40;
          this.spawnSmoke(centerX - 15, centerY, clone.scale, now);
          this.spawnSmoke(centerX + 15, centerY, clone.scale, now);
        }
        ctx.save();
        try {
          ctx.translate(clone.x + (width * (1 - clone.scale)) / 2, clone.y);
          ctx.scale(clone.scale, clone.scale);
          ctx.drawImage(person, 0, 0);
        } finally {
          ctx.restore();
        }
      }
      this.drawSmokes(ctx, now);
      if (!this.firstDraw && this.spawned.some(Boolean)) {
        this.firstDraw = true;
        logDiagnostic("canvas", "first-clones-rendered", {
          width,
          height,
          testMode: this.testMode,
        });
      }
      // Keep the live segmented person in the foreground, matching the original
      // rendering stack: background video -> clones/smoke -> real person.
      ctx.drawImage(person, 0, 0);
    } finally {
      ctx.restore();
    }
    if (this.renderFailure) {
      logDiagnostic("canvas", "clone-render-recovered");
      this.renderFailure = "";
    }
    recordMetric("Clone render ms", performance.now() - renderStarted);
  }

  private spawnSmoke(x: number, y: number, scale: number, now: number): void {
    const folder = SMOKE_FOLDERS[Math.floor(Math.random() * SMOKE_FOLDERS.length)];
    const frames = this.smokeFrames.get(folder);
    if (!frames) {
      logDiagnostic("assets", "smoke-skipped", { folder }, "warn");
      return;
    }
    this.activeSmokes.push({ x, y, scale: scale * 1.2, start: now, frames });
  }

  private drawSmokes(ctx: CanvasRenderingContext2D, now: number): void {
    const frameDuration = SMOKE_DURATION / SMOKE_FRAME_COUNT;
    for (let index = this.activeSmokes.length - 1; index >= 0; index--) {
      const smoke = this.activeSmokes[index];
      const frameIndex = Math.floor((now - smoke.start) / frameDuration);
      if (frameIndex >= smoke.frames.length) {
        this.activeSmokes.splice(index, 1);
        continue;
      }
      const image = smoke.frames[frameIndex];
      ctx.save();
      try {
        ctx.translate(smoke.x, smoke.y);
        ctx.scale(smoke.scale, smoke.scale);
        ctx.drawImage(image, -image.width / 2, -image.height / 2);
      } finally {
        ctx.restore();
      }
    }
  }

  async dispose(): Promise<void> {
    this.generation++;
    this.reset();
    this.mask = null;
    this.firstSegmentationSend = false;
    this.lastMaskAvailability = null;
    const segmentation = this.segmentation;
    this.segmentation = null;
    await segmentation
      ?.close()
      .catch((error: unknown) => logDiagnostic("segmentation", "close-failed", error, "error"));
  }
}
