import { useApp } from "../app/store";
import { CameraPanel } from "./CameraPanel";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { PracticeControls } from "./PracticeControls";
import { StartOverDialog } from "./StartOver";
import { TrainingControls } from "./TrainingControls";
import { Button, StatusLine } from "./ui";

function SyncWarning() {
  const stale = useApp((state) => state.staleExternal);
  const status = useApp((state) => state.syncStatus);
  return (
    <section
      id="sync-warning"
      aria-labelledby="sync-warning-title"
      hidden={!stale}
      className="my-2 items-center justify-between gap-5 border border-line bg-amber-100 px-3 py-2.5 not-[[hidden]]:flex max-[650px]:flex-col max-[650px]:items-stretch"
    >
      <div>
        <h2 id="sync-warning-title">Saved work changed</h2>
        <p id="sync-status" role="alert" className="mt-1">
          {status}
        </p>
      </div>
      <Button variant="warning" onClick={() => location.reload()}>
        Reload
      </Button>
    </section>
  );
}

export function App() {
  const bootStatus = useApp((state) => state.bootStatus);
  const showPractice = useApp((state) => state.hasModel && !state.editingExamples);
  return (
    <>
      <main className="mx-auto w-[min(calc(100%-16px),1180px)] pt-2 pb-5 max-[820px]:w-[min(calc(100%-12px),680px)]">
        <header className="pt-2.5 pb-3">
          <h1 className="text-[clamp(28px,4vw,44px)] leading-none font-bold tracking-[-0.04em]">
            Train your <span className="text-brand">clone sign.</span>
          </h1>
        </header>
        <StatusLine id="boot-status" text={bootStatus} />
        <SyncWarning />
        <div className="grid items-start gap-4 min-[821px]:grid-cols-[min(67%,var(--camera-max-width))_minmax(280px,1fr)]">
          <CameraPanel />
          <aside className="grid min-w-0 content-start gap-2.5">
            {showPractice ? <PracticeControls /> : <TrainingControls />}
          </aside>
        </div>
        <DiagnosticsPanel />
      </main>
      <StartOverDialog />
    </>
  );
}
