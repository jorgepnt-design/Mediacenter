import { useMemo, useState } from 'react';
import type { Job, SettingsState, TaskType } from '../types';
import { Badge, Button, ProgressBar, Segmented, Toggle } from './ui';
import { TrimControl } from './TrimControl';
import { EstimateLine } from './SizeEstimate';
import { formatBytes, formatDuration, formatEta, savings } from '../lib/format';
import { blobToFile, downloadBlob, shareFiles } from '../lib/share';
import { canShareFiles, isIOS } from '../lib/platform';
import { useObjectUrl } from '../hooks/useObjectUrl';

const KIND_ICON: Record<Job['kind'], string> = { video: '🎬', audio: '🎵', image: '🖼️' };

const TASKS: Record<Job['kind'], { value: TaskType; label: string }[]> = {
  video: [
    { value: 'video', label: 'Video' },
    { value: 'extract', label: 'Audio' },
    { value: 'gif', label: 'GIF' },
    { value: 'frame', label: 'Bild' },
  ],
  audio: [{ value: 'audio', label: 'Audio konvertieren' }],
  image: [{ value: 'image', label: 'Bild konvertieren' }],
};

const STATUS: Record<Job['status'], { label: string; tone: 'neutral' | 'success' | 'error' | 'busy' }> = {
  pending: { label: 'Wartend', tone: 'neutral' },
  running: { label: 'Läuft', tone: 'busy' },
  done: { label: 'Fertig', tone: 'success' },
  error: { label: 'Fehler', tone: 'error' },
  canceled: { label: 'Abgebrochen', tone: 'neutral' },
};

export function JobCard({
  job,
  settings,
  selected,
  selectable,
  onSelect,
  onPatch,
  onTask,
  onRemove,
  onRetry,
  onCancel,
  onApplyToAll,
}: {
  job: Job;
  settings: SettingsState;
  selected: boolean;
  selectable: boolean;
  onSelect: (checked: boolean) => void;
  onPatch: (changes: Partial<Job>) => void;
  onTask: (task: TaskType) => void;
  onRemove: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onApplyToAll: () => void;
}) {
  const [showOptions, setShowOptions] = useState(false);
  const status = STATUS[job.status];
  const running = job.status === 'running';

  return (
    <article className="card p-4">
      <header className="flex items-start gap-3">
        {selectable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
            aria-label={`${job.name} auswählen`}
            className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300"
          />
        ) : null}
        <span className="text-2xl" aria-hidden="true">
          {KIND_ICON[job.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={job.name}>
            {job.name}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {formatBytes(job.file.size)}
            {job.info.durationSec ? ` · ${formatDuration(job.info.durationSec)}` : ''}
            {job.info.width ? ` · ${job.info.width}×${job.info.height}` : ''}
            {job.merged && job.sourceNames ? ` · aus ${job.sourceNames.length} Dateien` : ''}
            {job.status === 'pending' && !job.merged ? (
              <EstimateLine job={job} settings={settings} />
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${job.name} entfernen`}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </header>

      {!job.merged && TASKS[job.kind].length > 1 && job.status !== 'done' ? (
        <div className="mt-3">
          <Segmented
            ariaLabel="Was soll mit dieser Datei passieren?"
            value={job.task}
            columns={TASKS[job.kind].length}
            options={TASKS[job.kind]}
            onChange={onTask}
          />
        </div>
      ) : null}

      {running ? (
        <div className="mt-3 space-y-2">
          <ProgressBar
            value={job.progress}
            indeterminate={job.progress <= 0.001}
            label={`Fortschritt ${job.name}`}
          />
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{job.progress > 0 ? `${Math.round(job.progress * 100)} %` : 'wird vorbereitet …'}</span>
            <span>{formatEta(job.etaMs)}</span>
          </div>
          <Button variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      ) : null}

      {job.status === 'error' ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-900 dark:bg-rose-950/40">
          <p className="font-medium text-rose-800 dark:text-rose-200">{job.error}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onRetry}>
              Erneut versuchen
            </Button>
          </div>
          {job.log.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-rose-700 dark:text-rose-300">
                Technisches Protokoll anzeigen
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-[11px] leading-snug text-slate-100">
                {job.log.slice(-200).join('\n')}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {job.status === 'canceled' ? (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
          <span>Abgebrochen.</span>
          <Button variant="secondary" onClick={onRetry}>
            Erneut starten
          </Button>
        </div>
      ) : null}

      {job.status === 'done' && job.result ? (
        <ResultView job={job} onRetry={onRetry} />
      ) : null}

      {job.status !== 'done' && !job.merged ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowOptions((value) => !value)}
            aria-expanded={showOptions}
            className="min-h-touch text-sm font-medium text-brand-700 dark:text-brand-300"
          >
            {showOptions ? 'Optionen ausblenden' : 'Optionen für diese Datei'}
          </button>

          {showOptions ? (
            <div className="mt-3 space-y-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              {job.kind !== 'image' ? (
                <TrimControl
                  file={job.file}
                  kind={job.kind}
                  duration={job.info.durationSec}
                  trim={job.trim}
                  onChange={(trim) => onPatch({ trim })}
                />
              ) : null}

              {job.kind === 'video' ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        onPatch({
                          transform: {
                            ...job.transform,
                            rotate: (((job.transform.rotate + 90) % 360) as 0 | 90 | 180 | 270),
                          },
                        })
                      }
                    >
                      ↻ Drehen ({job.transform.rotate}°)
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        onPatch({ transform: { ...job.transform, flipH: !job.transform.flipH } })
                      }
                    >
                      ⇄ Spiegeln {job.transform.flipH ? '(an)' : ''}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        onPatch({ transform: { ...job.transform, flipV: !job.transform.flipV } })
                      }
                    >
                      ⇅ Kippen {job.transform.flipV ? '(an)' : ''}
                    </Button>
                  </div>
                  <Toggle
                    label="Stummschalten"
                    hint="Entfernt die Tonspur aus dem Ergebnis."
                    checked={job.mute}
                    onChange={(mute) => onPatch({ mute })}
                  />
                </>
              ) : null}

              <Button variant="ghost" onClick={onApplyToAll}>
                Diese Optionen auf alle {job.kind === 'video' ? 'Videos' : job.kind === 'audio' ? 'Audiodateien' : 'Bilder'} anwenden
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ResultView({ job, onRetry }: { job: Job; onRetry: () => void }) {
  const result = job.result!;
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const beforeUrl = useObjectUrl(job.kind === 'image' ? job.file : null);

  const shareFile = useMemo(() => blobToFile(result.blob, result.name), [result]);
  const shareable = useMemo(() => canShareFiles([shareFile]), [shareFile]);
  const ratio = savings(job.file.size, result.size);

  const isVideoResult = /\.(mp4|webm|mkv|mov)$/i.test(result.name);
  const isAudioResult = /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(result.name);
  const isImageResult = /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(result.name);

  const onShare = async () => {
    setSharing(true);
    const outcome = await shareFiles([shareFile], result.name);
    setSharing(false);
    if (outcome === 'unsupported') {
      setShareNote('Teilen wird hier nicht unterstützt – nutze stattdessen „Herunterladen".');
    }
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
        <p className="font-medium text-emerald-900 dark:text-emerald-100">
          {formatBytes(job.file.size)} → {formatBytes(result.size)}{' '}
          {ratio > 0.005 ? (
            <span className="font-semibold">({Math.round(ratio * 100)} % kleiner)</span>
          ) : ratio < -0.005 ? (
            <span>({Math.round(-ratio * 100)} % größer)</span>
          ) : (
            <span>(gleich groß)</span>
          )}
        </p>
        <p className="mt-0.5 truncate text-xs text-emerald-800 dark:text-emerald-200">{result.name}</p>
        {result.extras && result.extras.length > 1 ? (
          <p className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-200">
            {result.extras.length} Einzelbilder im ZIP
          </p>
        ) : null}
      </div>

      {isVideoResult ? (
        <video
          src={result.url}
          controls
          playsInline
          preload="metadata"
          className="max-h-72 w-full rounded-xl bg-black"
        />
      ) : null}
      {isAudioResult ? <audio src={result.url} controls className="w-full" /> : null}
      {isImageResult ? (
        <div className="space-y-2">
          <img
            src={showBefore && beforeUrl ? beforeUrl : result.url}
            alt={showBefore ? `${job.name} – vorher` : `${job.name} – nachher`}
            className="max-h-72 w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-800"
          />
          {beforeUrl ? (
            <Segmented
              ariaLabel="Vorher-Nachher-Vergleich"
              value={showBefore ? 'before' : 'after'}
              options={[
                { value: 'after', label: 'Nachher' },
                { value: 'before', label: 'Vorher' },
              ]}
              onChange={(value) => setShowBefore(value === 'before')}
            />
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {shareable ? (
          <Button variant="primary" full onClick={onShare} disabled={sharing}>
            <span aria-hidden="true">📤</span> Teilen
          </Button>
        ) : null}
        <Button
          variant={shareable ? 'secondary' : 'primary'}
          full
          onClick={() => downloadBlob(result.blob, result.name)}
        >
          Herunterladen
        </Button>
      </div>

      {shareNote ? <p className="text-xs text-amber-700 dark:text-amber-300">{shareNote}</p> : null}
      {isIOS ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {shareable
            ? 'Über „Teilen" landet die Datei direkt in Fotos, WhatsApp oder AirDrop. „Herunterladen" legt sie in der Dateien-App ab.'
            : 'Heruntergeladene Dateien findest du in der Dateien-App unter „Downloads".'}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onRetry}
        className="min-h-touch text-sm font-medium text-brand-700 dark:text-brand-300"
      >
        Mit geänderten Einstellungen neu berechnen
      </button>
    </div>
  );
}
