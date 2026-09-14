import { useEffect, useRef, type MutableRefObject } from 'react';
import { Button } from './ui';
import { ACCEPT_ATTRIBUTE_FULL } from '../lib/formats';
import { isMobile } from '../lib/platform';

export function ImportZone({
  onFiles,
  compact,
  openRef,
}: {
  onFiles: (files: File[]) => void;
  compact?: boolean;
  /** Erlaubt das Oeffnen des Dateidialogs per Tastenkuerzel. */
  openRef?: MutableRefObject<(() => void) | null>;
}) {
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const pick = (input: HTMLInputElement | null) => {
    if (!input) return;
    input.value = '';
    input.click();
  };

  useEffect(() => {
    if (!openRef) return undefined;
    openRef.current = () => pick(fileInput.current);
    return () => {
      openRef.current = null;
    };
  }, [openRef]);

  const handle = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) onFiles(files);
  };

  return (
    <section
      className={`card ${compact ? 'p-4' : 'p-5 sm:p-8'}`}
      aria-labelledby="import-heading"
    >
      <h2 id="import-heading" className={compact ? 'sr-only' : 'text-xl font-semibold'}>
        Dateien hinzufügen
      </h2>
      {!compact ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Video, Audio oder Bilder auswählen. Die Verarbeitung passiert vollständig auf
          deinem Gerät – nichts wird hochgeladen.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Button variant="primary" full onClick={() => pick(photoInput.current)}>
          <span aria-hidden="true">🖼️</span> Aus Fotos
        </Button>
        <Button variant="secondary" full onClick={() => pick(fileInput.current)}>
          <span aria-hidden="true">📁</span> Aus Dateien
        </Button>
      </div>

      {!isMobile ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Button variant="ghost" full onClick={() => pick(folderInput.current)}>
            Ganzen Ordner wählen
          </Button>
          <p className="flex items-center justify-center text-center text-xs text-slate-500 dark:text-slate-400">
            oder hierher ziehen · Einfügen mit ⌘V bzw. Strg+V
          </p>
        </div>
      ) : (
        <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          Mehrfachauswahl ist möglich. HEIC-Fotos und HEVC-Videos vom iPhone werden
          unterstützt.
        </p>
      )}

      <input
        ref={photoInput}
        type="file"
        multiple
        accept="video/*,image/*,audio/*"
        onChange={handle}
        className="visually-hidden"
        aria-label="Aus Fotos auswählen"
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE_FULL}
        onChange={handle}
        className="visually-hidden"
        aria-label="Aus Dateien auswählen"
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        // @ts-expect-error – nicht standardisiert, aber in Chromium/Safari vorhanden
        webkitdirectory=""
        directory=""
        onChange={handle}
        className="visually-hidden"
        aria-label="Ordner auswählen"
      />
    </section>
  );
}

export function DropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand-600/20 p-6 backdrop-blur-sm"
      aria-hidden="true"
    >
      <div className="rounded-3xl border-4 border-dashed border-brand-500 bg-white/90 px-8 py-10 text-center shadow-xl dark:bg-slate-900/90">
        <p className="text-2xl font-semibold text-brand-700 dark:text-brand-200">
          Dateien hier ablegen
        </p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Ganze Ordner sind ebenfalls möglich.
        </p>
      </div>
    </div>
  );
}
