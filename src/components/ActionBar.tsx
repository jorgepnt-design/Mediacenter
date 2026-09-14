import { Button, ProgressBar } from './ui';
import { formatPercent } from '../lib/format';

export function ActionBar({
  pending,
  isRunning,
  overallProgress,
  doneCount,
  onOpenSettings,
  onStart,
  onCancel,
  onDownloadAll,
  onShareAll,
  canShareAll,
}: {
  pending: number;
  isRunning: boolean;
  overallProgress: number;
  doneCount: number;
  onOpenSettings: () => void;
  onStart: () => void;
  onCancel: () => void;
  onDownloadAll: () => void;
  onShareAll: () => void;
  canShareAll: boolean;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur pb-safe dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto w-full max-w-3xl pb-3">
        {isRunning ? (
          <div className="mb-2 space-y-1">
            <ProgressBar value={overallProgress} label="Gesamtfortschritt" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gesamt {formatPercent(overallProgress)} · Bildschirm anlassen und App im
              Vordergrund lassen
            </p>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={onOpenSettings}
            aria-label="Einstellungen"
            className="shrink-0"
          >
            <span aria-hidden="true">⚙︎</span>
            <span className="hidden sm:inline">Einstellungen</span>
          </Button>

          {isRunning ? (
            <Button variant="danger" full onClick={onCancel}>
              Abbrechen
            </Button>
          ) : pending > 0 ? (
            <Button variant="primary" full onClick={onStart}>
              {pending === 1 ? 'Konvertieren' : `${pending} Dateien konvertieren`}
            </Button>
          ) : doneCount > 0 ? (
            <>
              {canShareAll ? (
                <Button variant="primary" full onClick={onShareAll}>
                  Alle teilen
                </Button>
              ) : null}
              <Button variant={canShareAll ? 'secondary' : 'primary'} full onClick={onDownloadAll}>
                {doneCount === 1 ? 'Herunterladen' : 'Alle als ZIP'}
              </Button>
            </>
          ) : (
            <Button variant="primary" full disabled>
              Konvertieren
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
