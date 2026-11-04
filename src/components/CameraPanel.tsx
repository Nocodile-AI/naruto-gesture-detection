import { useEffect, useRef } from "react";
import { startApp } from "../app/lifecycle";
import { useApp } from "../app/store";
import { startCamera, stopCamera } from "../app/vision";
import { publicUrl } from "../public-url";
import { Button, StatusLine } from "./ui";

function ViewfinderNote() {
  const note = useApp((state) => state.viewfinderNote);
  const loading = useApp((state) => state.viewfinderLoading);
  if (!note) return null;
  return (
    <span
      id="viewfinder-note"
      className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2.5 bg-slate-900/35 text-slate-50"
    >
      {loading && (
        <span className="size-[18px] animate-spin rounded-full border-2 border-slate-50/40 border-t-slate-50" />
      )}
      {note}
    </span>
  );
}

function RecordingBadge() {
  const badge = useApp((state) => state.recBadge);
  if (badge === null) return null;
  return (
    <span
      id="rec-badge"
      className="absolute top-3 left-3 bg-danger px-2.5 py-1 font-bold text-white"
    >
      {badge}
    </span>
  );
}

export function CameraPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLImageElement>(null);
  const cameraStarted = useApp((state) => state.cameraStarted);
  const blocked = useApp((state) => state.staleExternal || state.busy === "booting");
  const cameraStatus = useApp((state) => state.cameraStatus);

  useEffect(() => {
    if (videoRef.current && canvasRef.current && overlayRef.current)
      startApp({
        video: videoRef.current,
        canvas: canvasRef.current,
        overlay: overlayRef.current,
      });
  }, []);

  return (
    <section
      aria-labelledby="camera-title"
      className="mx-auto grid w-full max-w-(--camera-max-width) min-w-0 gap-2.5"
    >
      <h2 id="camera-title">Camera</h2>
      <div
        id="viewfinder"
        className="relative aspect-[4/3] overflow-hidden rounded-card border border-slate-700 bg-slate-900"
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="block size-full -scale-x-100 object-cover"
        />
        <canvas
          id="trainer-canvas"
          ref={canvasRef}
          width={640}
          height={480}
          role="img"
          aria-label="Camera preview with hand tracking and shadow clones"
          className="pointer-events-none absolute inset-0 block size-full"
        />
        <ViewfinderNote />
        <RecordingBadge />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2"
        >
          <img
            ref={overlayRef}
            id="effect-overlay"
            src={publicUrl("assets/state-1.png")}
            data-state="1"
            alt=""
            width={510}
            height={500}
            className="block w-[clamp(64px,14vw,96px)] -scale-x-100"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="neutral" disabled={blocked || cameraStarted} onClick={startCamera}>
          Start camera
        </Button>
        <Button disabled={!cameraStarted} onClick={stopCamera}>
          Stop camera
        </Button>
      </div>
      <StatusLine id="camera-status" text={cameraStatus} />
    </section>
  );
}
