import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { ActionBar } from './components/ActionBar';
import { DropOverlay, ImportZone } from './components/ImportZone';
import { JobCard } from './components/JobCard';
import { SettingsSheet } from './components/SettingsSheet';
import {
  CoreLoading,
  InstallHint,
  MemoryWarning,
  PrivacyNote,
  Toasts,
  type ToastMessage,
} from './components/Notices';
import { Button } from './components/ui';
import { useGlobalImport } from './hooks/useGlobalImport';
import { useJobQueue } from './hooks/useJobQueue';
import { useSettings } from './hooks/useSettings';
import { useTheme } from './hooks/useTheme';
import { memoryWarning } from './lib/errors';
import { SIZE_HARD_HINT_BYTES, SIZE_WARN_BYTES, canShareFiles, isIOS } from './lib/platform';
import { blobToFile, downloadBlob, shareFiles } from './lib/share';
import { createZip } from './lib/zip';

export default function App() {
  const { theme, cycleTheme } = useTheme();
  const { settings, update } = useSettings();
  const queue = useJobQueue(settings);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [warning, setWarning] = useState<{ text: string; offerResolution: boolean } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const openPicker = useRef<(() => void) | null>(null);
  const toastId = useRef(0);

  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((current) => [...current, { id, text, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 7000);
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const rejected = await queue.addFiles(files);
      rejected.forEach((entry) => notify(`${entry.name}: ${entry.reason}`, 'error'));

      const largest = files.reduce((max, file) => Math.max(max, file.size), 0);
      const text = memoryWarning(largest, SIZE_HARD_HINT_BYTES, SIZE_WARN_BYTES);
      if (text) {
        setWarning({
          text,
          offerResolution: files.some((file) => (file.type || '').startsWith('video/') || /\.(mp4|mov|mkv|avi|webm|m4v)$/i.test(file.name)),
        });
      }
    },
    [notify, queue],
  );

  const dragging = useGlobalImport(handleFiles);

  /* --------------------------- Verlassen der Seite -------------------------- */

  useEffect(() => {
    if (!queue.isRunning) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [queue.isRunning]);

  /* ------------------------------ Ergebnisse -------------------------------- */

  const doneJobs = queue.done;

  const resultFiles = useMemo(
    () => doneJobs.filter((job) => job.result).map((job) => blobToFile(job.result!.blob, job.result!.name)),
    [doneJobs],
  );

  const canShareAll = resultFiles.length > 0 && canShareFiles(resultFiles);

  const downloadAll = useCallback(async () => {
    if (doneJobs.length === 0) return;
    if (doneJobs.length === 1 && doneJobs[0].result) {
      downloadBlob(doneJobs[0].result.blob, doneJobs[0].result.name);
      return;
    }
    const zip = await createZip(
      doneJobs.filter((job) => job.result).map((job) => ({ name: job.result!.name, blob: job.result!.blob })),
      'mediacenter-ergebnisse.zip',
    );
    downloadBlob(zip, zip.name);
  }, [doneJobs]);

  const shareAll = useCallback(async () => {
    if (resultFiles.length === 0) return;
    const outcome = await shareFiles(resultFiles, 'Mediacenter');
    if (outcome === 'unsupported') notify('Teilen wird hier nicht unterstützt – bitte herunterladen.', 'error');
  }, [notify, resultFiles]);

  /* ------------------------------ Tastenkürzel ------------------------------ */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey) {
        if (event.key === 'Enter') {
          event.preventDefault();
          void queue.start();
        }
        return;
      }
      switch (event.key.toLowerCase()) {
        case 'o':
          event.preventDefault();
          openPicker.current?.();
          break;
        case 's':
          event.preventDefault();
          setSheetOpen(true);
          break;
        case 'd':
          event.preventDefault();
          void downloadAll();
          break;
        case 'enter':
          event.preventDefault();
          void queue.start();
          break;
        case 'escape':
          if (queue.isRunning) queue.cancelAll();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [downloadAll, queue]);

  /* ------------------------------ Zusammenfügen ----------------------------- */

  const mergeCandidates = queue.jobs.filter((job) => job.kind !== 'image' && !job.merged);
  const canMerge = mergeCandidates.length >= 2;

  const startMerge = async () => {
    const chosen = queue.jobs.filter((job) => selected.includes(job.id));
    if (chosen.length < 2) {
      notify('Bitte mindestens zwei Dateien auswählen.', 'error');
      return;
    }
    if (new Set(chosen.map((job) => job.kind)).size > 1) {
      notify('Es lassen sich nur Dateien derselben Art zusammenfügen.', 'error');
      return;
    }
    setSelectMode(false);
    setSelected([]);
    await queue.mergeJobs(chosen.map((job) => job.id));
  };

  const engineLabel = queue.engine
    ? queue.engine.multithread
      ? 'Multi-Thread'
      : 'Single-Thread'
    : null;

  return (
    <div className="min-h-full">
      <AppHeader theme={theme} onCycleTheme={cycleTheme} engineLabel={engineLabel} />

      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-4 px-safe pb-action">
        <PrivacyNote />
        <InstallHint />

        {warning ? (
          <MemoryWarning
            text={warning.text}
            onDismiss={() => setWarning(null)}
            onLowerResolution={
              warning.offerResolution
                ? () => {
                    update('video', { resolution: '720', preset: 'custom' });
                    setWarning(null);
                    notify('Zielauflösung auf 720p gesetzt.');
                  }
                : undefined
            }
          />
        ) : null}

        <ImportZone onFiles={handleFiles} compact={queue.jobs.length > 0} openRef={openPicker} />

        {queue.coreLoad.active ? <CoreLoading ratio={queue.coreLoad.ratio} /> : null}

        {queue.jobs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="w-full text-sm text-slate-500 dark:text-slate-400 sm:w-auto sm:flex-1">
              {queue.jobs.length} {queue.jobs.length === 1 ? 'Datei' : 'Dateien'} in der
              Warteschlange
            </p>
            {canMerge ? (
              <Button
                variant={selectMode ? 'primary' : 'ghost'}
                onClick={() => {
                  setSelectMode((value) => !value);
                  setSelected([]);
                }}
              >
                {selectMode ? 'Auswahl beenden' : 'Zusammenfügen'}
              </Button>
            ) : null}
            {doneJobs.length > 0 ? (
              <Button variant="ghost" onClick={() => queue.clear('done')}>
                Fertige entfernen
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => queue.clear('all')}>
              Alle entfernen
            </Button>
          </div>
        ) : null}

        {selectMode ? (
          <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="mr-auto">
              {selected.length} ausgewählt – Reihenfolge entspricht der Liste.
            </span>
            <Button variant="primary" onClick={startMerge} disabled={selected.length < 2}>
              Zusammenfügen
            </Button>
          </div>
        ) : null}

        <div className="space-y-3">
          {queue.jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              selectable={selectMode && job.kind !== 'image' && !job.merged}
              selected={selected.includes(job.id)}
              onSelect={(checked) =>
                setSelected((current) =>
                  checked ? [...current, job.id] : current.filter((id) => id !== job.id),
                )
              }
              onPatch={(changes) => queue.patch(job.id, changes)}
              onTask={(task) => queue.setTask(job.id, task)}
              onRemove={() => queue.removeJob(job.id)}
              onRetry={() => queue.retryJob(job.id)}
              onCancel={() => queue.cancelJob(job.id)}
              onApplyToAll={() => {
                queue.applyJobOptionsToAll(job.id);
                notify('Einstellungen auf alle Dateien dieser Art übertragen.');
              }}
            />
          ))}
        </div>

        {queue.jobs.length === 0 ? <StartHints /> : null}

        <footer className="pt-2 text-center text-xs text-slate-400 dark:text-slate-500">
          Mediacenter · läuft vollständig offline im Browser · ffmpeg.wasm
        </footer>
      </main>

      <ActionBar
        pending={queue.pending}
        isRunning={queue.isRunning}
        overallProgress={queue.overallProgress}
        doneCount={doneJobs.length}
        onOpenSettings={() => setSheetOpen(true)}
        onStart={() => void queue.start()}
        onCancel={queue.cancelAll}
        onDownloadAll={() => void downloadAll()}
        onShareAll={() => void shareAll()}
        canShareAll={canShareAll}
      />

      <SettingsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        settings={settings}
        update={update}
        jobs={queue.jobs}
        encoders={queue.engine?.encoders ?? null}
        onStart={() => void queue.start()}
        canStart={queue.pending > 0 && !queue.isRunning}
      />

      <DropOverlay visible={dragging} />
      <Toasts messages={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />
    </div>
  );
}

function StartHints() {
  return (
    <section className="card p-4 text-sm">
      <h2 className="font-semibold">Was geht hier?</h2>
      <ul className="mt-2 space-y-1.5 text-slate-600 dark:text-slate-300">
        <li>• Videos umwandeln und verkleinern – MP4, WebM, MKV, MOV</li>
        <li>• Tonspur aus Video herausziehen – MP3, M4A, WAV, FLAC, OGG, Opus</li>
        <li>• Audio umwandeln, normalisieren, Bitrate ändern</li>
        <li>• Bilder konvertieren und komprimieren – JPG, PNG, WebP, AVIF, HEIC-Import</li>
        <li>• Zuschneiden, drehen, GIF erstellen, Einzelbilder exportieren, zusammenfügen</li>
      </ul>
      {isIOS ? (
        <p className="mt-3 rounded-xl bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Tipp fürs iPhone: Bildschirm während der Umwandlung anlassen und die App im Vordergrund
          behalten – iOS pausiert sonst die Berechnung. Große Videos vorher auf 720p stellen.
        </p>
      ) : (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Tastenkürzel: <kbd>O</kbd> Dateien öffnen · <kbd>S</kbd> Einstellungen ·{' '}
          <kbd>Enter</kbd> starten · <kbd>D</kbd> Ergebnisse laden · <kbd>Esc</kbd> abbrechen
        </p>
      )}
    </section>
  );
}
