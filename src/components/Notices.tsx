import { useEffect, useState } from 'react';
import { Button } from './ui';
import { dismissHint, isHintDismissed } from '../lib/storage';
import { isIOS, isSafari, isStandalone } from '../lib/platform';

export function PrivacyNote() {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
      <span aria-hidden="true">🔒</span>
      <span>
        <strong className="font-semibold">Alle Dateien bleiben auf deinem Gerät.</strong> Es gibt
        keinen Upload, kein Konto und keine Tracking-Skripte – die Umwandlung läuft komplett im
        Browser.
      </span>
    </p>
  );
}

export function InstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone || isHintDismissed('install')) return;
    if (isIOS && isSafari) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="card flex items-start gap-3 p-3 text-sm">
      <span aria-hidden="true" className="text-lg">
        📲
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Zum Home-Bildschirm hinzufügen</p>
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
          Teilen-Symbol antippen → „Zum Home-Bildschirm". Danach startet Mediacenter wie eine
          normale App – ohne Safari-Leisten.
        </p>
      </div>
      <Button
        variant="ghost"
        onClick={() => {
          dismissHint('install');
          setVisible(false);
        }}
        aria-label="Hinweis ausblenden"
      >
        ✕
      </Button>
    </div>
  );
}

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export function Toasts({ messages, onDismiss }: { messages: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-safe"
      aria-live="polite"
      aria-atomic="false"
    >
      {messages.map((message) => (
        <div
          key={message.id}
          className={`pointer-events-auto mt-2 w-full max-w-md rounded-xl px-4 py-3 text-sm shadow-lg ${
            message.tone === 'error'
              ? 'bg-rose-600 text-white'
              : 'bg-slate-900 text-white dark:bg-slate-700'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="min-w-0 flex-1">{message.text}</span>
            <button
              type="button"
              onClick={() => onDismiss(message.id)}
              aria-label="Meldung schließen"
              className="shrink-0 opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CoreLoading({ ratio }: { ratio: number }) {
  return (
    <div className="card p-4 text-sm">
      <p className="font-medium">ffmpeg wird geladen …</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
        Rund 30 MB werden einmalig geladen und danach im Browser zwischengespeichert. Beim
        nächsten Mal geht es sofort los.
      </p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-brand-600 transition-[width]"
          style={{ width: `${Math.round(Math.min(Math.max(ratio, 0.05), 1) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function MemoryWarning({
  text,
  onLowerResolution,
  onDismiss,
}: {
  text: string;
  onLowerResolution?: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="card border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
      <p className="font-medium text-amber-900 dark:text-amber-100">{text}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {onLowerResolution ? (
          <Button variant="secondary" onClick={onLowerResolution}>
            Auf 720p stellen
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onDismiss}>
          Verstanden
        </Button>
      </div>
    </div>
  );
}
