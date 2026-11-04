import { useApp } from "../app/store";
import { editExamples, finishCloneEffect } from "../app/vision";
import { StartOverButton } from "./StartOver";
import { Button, ProgressBar, StatusLine } from "./ui";

function ScoreMeter() {
  const score = useApp((state) => state.score);
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 id="practice-title">Clone-sign score</h2>
        <output
          id="conf-label"
          aria-label="Clone-sign score"
          className="text-[32px] font-bold text-brand tabular-nums"
        >
          {score === null ? "N/A" : `${Math.round(score * 100)}%`}
        </output>
      </div>
      <ProgressBar id="confidence" label="Clone-sign score" value={(score ?? 0) * 100} />
    </>
  );
}

export function PracticeControls() {
  const effectActive = useApp((state) => state.effectActive);
  const canEdit = useApp((state) => state.busy === "idle" && !state.staleExternal);
  const practiceStatus = useApp((state) => state.practiceStatus);
  return (
    <section id="trained-controls" aria-labelledby="practice-title" className="grid gap-2.5">
      <ScoreMeter />
      <div className="flex flex-wrap gap-2 [&>*]:min-w-0 [&>*]:flex-1">
        {effectActive && (
          <Button variant="warning" onClick={finishCloneEffect}>
            Reset effect
          </Button>
        )}
        <Button disabled={!canEdit} onClick={editExamples}>
          Edit examples
        </Button>
        <StartOverButton />
      </div>
      <StatusLine id="practice-status" text={practiceStatus} />
    </section>
  );
}
