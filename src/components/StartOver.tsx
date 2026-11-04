import { useEffect, useRef } from "react";
import { confirmStartOver } from "../app/lifecycle";
import { setApp, useApp } from "../app/store";
import { Button } from "./ui";

export function StartOverButton() {
  const canStart = useApp((state) => state.busy === "idle" && !state.staleExternal);
  return (
    <Button
      variant="danger-outlined"
      disabled={!canStart}
      onClick={() => setApp({ startOverOpen: true })}
    >
      Start over
    </Button>
  );
}

export function StartOverDialog() {
  const open = useApp((state) => state.startOverOpen);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      id="start-over-dialog"
      aria-labelledby="start-over-title"
      onClose={() => setApp({ startOverOpen: false })}
      className="m-auto w-[min(calc(100%-32px),440px)] rounded-card bg-surface p-5 text-ink backdrop:bg-slate-900/50"
    >
      <h2 id="start-over-title">Start over</h2>
      <p className="mt-3">
        This clears naruto-gesture-detection examples and model files saved by this site.
      </p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button onClick={() => setApp({ startOverOpen: false })}>Keep work</Button>
        <Button variant="danger" onClick={() => void confirmStartOver()}>
          Clear work
        </Button>
      </div>
    </dialog>
  );
}
