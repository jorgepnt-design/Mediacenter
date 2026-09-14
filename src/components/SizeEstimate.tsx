import type { Job, SettingsState } from '../types';
import { estimateOutputSize, targetDimensions } from '../lib/estimate';
import { formatBytes, formatDuration, savings } from '../lib/format';

/** Kompakte Zeile für die Job-Karte. */
export function EstimateLine({ job, settings }: { job: Job; settings: SettingsState }) {
  const estimate = estimateOutputSize(job, settings);
  if (!estimate) return null;

  const ratio = savings(job.file.size, estimate.bytes);
  return (
    <span className="text-brand-700 dark:text-brand-300">
      {' · ca. '}
      {formatBytes(estimate.bytes)} danach
      {ratio > 0.02 ? ` (−${Math.round(ratio * 100)} %)` : ''}
    </span>
  );
}

/** Ausführliche Box über den Einstellungen. */
export function EstimateBox({ job, settings }: { job: Job | null; settings: SettingsState }) {
  if (!job) return null;

  const estimate = estimateOutputSize(job, settings);
  const dimensions = job.task === 'video' ? targetDimensions(job, settings.video) : null;

  if (!estimate) {
    return (
      <div className="card p-3 text-sm">
        <p className="text-slate-600 dark:text-slate-300">
          Für eine Größenschätzung fehlt die Laufzeit der Datei. Die genaue Größe siehst du
          nach der Umwandlung.
        </p>
      </div>
    );
  }

  const ratio = savings(job.file.size, estimate.bytes);

  return (
    <div className="card border-brand-200 bg-brand-50 p-3 dark:border-brand-900 dark:bg-brand-950/40">
      <p className="text-xs font-medium uppercase tracking-wide text-brand-700 dark:text-brand-300">
        Voraussichtliche Größe
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-brand-900 dark:text-brand-100">
        {estimate.accuracy === 'rough' ? 'ca. ' : ''}
        {formatBytes(estimate.bytes)}
      </p>
      <p className="mt-0.5 text-sm text-brand-800 dark:text-brand-200">
        statt {formatBytes(job.file.size)}
        {ratio > 0.02 ? ` · ${Math.round(ratio * 100)} % kleiner` : ''}
        {ratio < -0.02 ? ` · ${Math.round(-ratio * 100)} % größer` : ''}
      </p>
      <p className="mt-1 text-xs text-brand-700 dark:text-brand-300">
        {dimensions ? `${dimensions.width}×${dimensions.height} · ` : ''}
        {job.info.durationSec ? `${formatDuration(job.info.durationSec)} · ` : ''}
        {job.name}
      </p>
      {estimate.accuracy === 'rough' ? (
        <p className="mt-2 text-xs text-brand-700 dark:text-brand-300">
          Schätzwert – ruhige Aufnahmen werden kleiner, viel Bewegung etwas größer. Wer die
          Größe exakt festlegen will, nimmt im Experten-Modus „Zielgröße".
        </p>
      ) : null}
    </div>
  );
}
