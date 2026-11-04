import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { FrameSample } from "../performance-report";
import { TRIGGER_CONFIG } from "../trigger";

export const SERIES = [
  { key: "hands", summaryKey: "handsMs", label: "Hand tracking", color: "#075985" },
  { key: "mask", summaryKey: "maskMs", label: "Clone mask", color: "#ea580c" },
  { key: "draw", summaryKey: "drawMs", label: "Drawing and score", color: "#7c3aed" },
] as const;
export const WAIT_COLOR = "#cbd5e1";
const LIMIT_COLOR = "#b91c1c";
const INK_COLOR = "#475569";
const BAR_PITCH = 5;
const MIN_SCALE_MS = 400;
const MAX_SCALE_MS = 1000;

function drawRibbon(
  ribbon: HTMLCanvasElement,
  frames: FrameSample[],
  selected: FrameSample | null,
) {
  const scale = window.devicePixelRatio || 1;
  const width = ribbon.clientWidth;
  const height = ribbon.clientHeight;
  if (ribbon.width !== Math.round(width * scale)) ribbon.width = Math.round(width * scale);
  if (ribbon.height !== Math.round(height * scale)) ribbon.height = Math.round(height * scale);
  const ctx = ribbon.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const visible = frames.slice(-Math.floor(width / BAR_PITCH));
  const intervals = visible.map((frame, index) =>
    index ? frame.at - visible[index - 1].at : frame.hands + frame.mask + frame.draw,
  );
  const top = Math.min(MAX_SCALE_MS, Math.max(MIN_SCALE_MS, ...intervals));
  const y = (ms: number) => (ms / top) * (height - 1);
  visible.forEach((frame, index) => {
    const x = width - (visible.length - index) * BAR_PITCH;
    let stacked = 0;
    for (const series of SERIES) {
      ctx.fillStyle = series.color;
      ctx.fillRect(x, height - y(stacked + frame[series.key]), BAR_PITCH - 1, y(frame[series.key]));
      stacked += frame[series.key];
    }
    if (intervals[index] > stacked) {
      ctx.fillStyle = WAIT_COLOR;
      ctx.fillRect(x, height - y(intervals[index]), BAR_PITCH - 1, y(intervals[index] - stacked));
    }
    if (frame === selected) {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(x, height - 1, BAR_PITCH - 1, 1);
      ctx.fillRect(x, 0, BAR_PITCH - 1, 2);
    }
  });
  const limit = height - y(TRIGGER_CONFIG.maxPositiveGapMs);
  ctx.strokeStyle = LIMIT_COLOR;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(0, limit);
  ctx.lineTo(width, limit);
  ctx.stroke();
  ctx.setLineDash([]);
  const limitLabel = `Trigger limit ${TRIGGER_CONFIG.maxPositiveGapMs} ms`;
  ctx.font = "13px 'Source Sans Pro', sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, limit - 18, ctx.measureText(limitLabel).width + 6, 16);
  ctx.fillStyle = INK_COLOR;
  ctx.fillText(limitLabel, 2, limit - 5);
  ctx.fillStyle = WAIT_COLOR;
  ctx.fillRect(0, height - 1, width, 1);
}

export function FrameRibbon({
  frames,
  selected,
  label,
  onSelect,
}: {
  frames: FrameSample[];
  selected: FrameSample | null;
  label: string;
  onSelect: (frame: FrameSample | null) => void;
}) {
  const ribbonRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (ribbonRef.current) drawRibbon(ribbonRef.current, frames, selected);
  });

  const selectFromPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const width = event.currentTarget.clientWidth;
    const visible = frames.slice(-Math.floor(width / BAR_PITCH));
    const fromRight = Math.ceil((width - event.nativeEvent.offsetX) / BAR_PITCH);
    onSelect(visible[visible.length - fromRight] ?? null);
  };

  return (
    <canvas
      ref={ribbonRef}
      id="diagnostics-ribbon"
      role="img"
      aria-label={label}
      className="block h-[132px] w-full touch-pan-y"
      onPointerMove={selectFromPointer}
      onPointerDown={selectFromPointer}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onSelect(null);
      }}
    />
  );
}
