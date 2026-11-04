import { readyToDebugTrain } from "../classifier";
import { COLLECTION, classCounts, readyToTrain, type ClassLabel } from "../collection";
import { beginClip, cancelClip, persistClips, removeLast } from "../app/recording";
import { session } from "../app/session";
import { useApp } from "../app/store";
import { train } from "../app/training";
import { StartOverButton } from "./StartOver";
import { Button, ProgressBar, StatusLine } from "./ui";

function ClassCard({
  label,
  title,
  countId,
  primary,
}: {
  label: ClassLabel;
  title: string;
  countId: string;
  primary?: boolean;
}) {
  const clips = useApp((state) => classCounts(state.dataset.clips, label).clips);
  const idle = useApp(
    (state) =>
      state.busy === "idle" && !state.staleExternal && !state.dirty && !state.storageBlocked,
  );
  const cameraReady = useApp((state) => state.cameraReady);
  return (
    <article className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 rounded-card border border-line bg-surface px-3 py-2.5">
      <h3>{title}</h3>
      <Button
        variant={primary ? "brand" : "outlined"}
        disabled={!idle || !cameraReady || clips >= COLLECTION.maxClipsPerClass}
        onClick={() => beginClip(label)}
      >
        Record
      </Button>
      <p className="text-muted tabular-nums">
        <strong id={countId}>{clips} clips</strong>
      </p>
      <Button
        variant="plain"
        small
        disabled={!idle || !clips}
        onClick={() => void removeLast(label)}
      >
        Remove last
      </Button>
    </article>
  );
}

export function TrainingControls() {
  const clips = useApp((state) => state.dataset.clips);
  const busy = useApp((state) => state.busy);
  const dirty = useApp((state) => state.dirty);
  const blocked = useApp((state) => state.staleExternal || state.storageBlocked);
  const staleExternal = useApp((state) => state.staleExternal);
  const trainingProgress = useApp((state) => state.trainingProgress);
  const collectionStatus = useApp((state) => state.collectionStatus);
  const trainStatus = useApp((state) => state.trainStatus);
  const canTrain = busy === "idle" && !dirty && !blocked;

  return (
    <section id="training-controls" aria-labelledby="training-title" className="grid gap-2.5">
      <h2 id="training-title">Examples</h2>
      <div className="grid gap-2">
        <ClassCard label="clone_sign" title="Clone sign" countId="count-clone" primary />
        <ClassCard label="not_sign" title="Not clone sign" countId="count-other" />
      </div>
      <StatusLine id="collection-status" text={collectionStatus} />
      <div className="grid gap-2">
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="brand"
            disabled={!canTrain || !readyToTrain(clips)}
            onClick={() => void train()}
          >
            Train model
          </Button>
          <Button
            disabled={!canTrain || !readyToDebugTrain(clips)}
            onClick={() => void train(true)}
          >
            Debug train
          </Button>
          <StartOverButton />
        </div>
        {busy === "recording" && (
          <Button variant="plain" className="w-fit" onClick={cancelClip}>
            Cancel recording
          </Button>
        )}
        {dirty && (
          <Button
            small
            className="w-fit"
            disabled={busy !== "idle" || staleExternal}
            onClick={() => void persistClips()}
          >
            Retry save
          </Button>
        )}
        {busy === "training" && (
          <Button variant="plain" className="w-fit" onClick={() => session.trainingAbort?.abort()}>
            Cancel training
          </Button>
        )}
        <ProgressBar id="training-progress" label="Training progress" value={trainingProgress} />
        <StatusLine id="train-status" text={trainStatus} />
      </div>
    </section>
  );
}
