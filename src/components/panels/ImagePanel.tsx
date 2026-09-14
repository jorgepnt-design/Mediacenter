import { useEffect, useRef, useState } from 'react';
import type { ImageSettings } from '../../types';
import { Field, NumberInput, Segmented, Slider, Toggle } from '../ui';
import { ImageSource, encodeImage } from '../../lib/imageProcess';
import { formatBytes, savings } from '../../lib/format';

interface PreviewState {
  url: string;
  size: number;
  width: number;
  height: number;
  note?: string;
}

export function ImagePanel({
  settings,
  onChange,
  sample,
}: {
  settings: ImageSettings;
  onChange: (patch: Partial<ImageSettings>) => void;
  sample: File | null;
}) {
  const [source, setSource] = useState<ImageSource | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<PreviewState | null>(null);
  previewRef.current = preview;

  useEffect(() => {
    if (!sample) {
      setSource(null);
      return undefined;
    }
    let active = true;
    let created: ImageSource | null = null;
    setError(null);
    ImageSource.from(sample)
      .then((next) => {
        created = next;
        if (active) setSource(next);
        else next.close();
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
      created?.close();
    };
  }, [sample]);

  useEffect(() => {
    if (!source) return undefined;
    setBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const encoded = await encodeImage(source, settings);
        const next: PreviewState = {
          url: URL.createObjectURL(encoded.blob),
          size: encoded.blob.size,
          width: encoded.width,
          height: encoded.height,
          note: encoded.fallbackNote,
        };
        if (previewRef.current) URL.revokeObjectURL(previewRef.current.url);
        setPreview(next);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [source, settings]);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current.url);
    },
    [],
  );

  const ratio = sample && preview ? savings(sample.size, preview.size) : 0;

  return (
    <div className="space-y-6">
      {sample ? (
        <div className="card overflow-hidden">
          <div className="relative bg-slate-100 dark:bg-slate-800">
            {preview ? (
              <img
                src={preview.url}
                alt="Vorschau der aktuellen Einstellungen"
                className="mx-auto max-h-56 w-full object-contain"
              />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                Vorschau wird erstellt …
              </div>
            )}
            {busy ? (
              <span className="absolute right-2 top-2 rounded-full bg-slate-900/70 px-2 py-1 text-xs text-white">
                berechnet …
              </span>
            ) : null}
          </div>
          <div className="px-3 py-2 text-sm">
            {preview ? (
              <p>
                <span className="font-medium">{formatBytes(preview.size)}</span>{' '}
                <span className="text-slate-500 dark:text-slate-400">
                  statt {formatBytes(sample.size)}
                  {ratio > 0.005 ? ` · ${Math.round(ratio * 100)} % kleiner` : ''} ·{' '}
                  {preview.width}×{preview.height}
                </span>
              </p>
            ) : null}
            {preview?.note ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{preview.note}</p>
            ) : null}
            {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
          </div>
        </div>
      ) : null}

      <Field label="Zielformat">
        <Segmented
          ariaLabel="Zielformat"
          columns={4}
          value={settings.format}
          options={[
            { value: 'jpeg', label: 'JPG' },
            { value: 'png', label: 'PNG' },
            { value: 'webp', label: 'WebP' },
            { value: 'avif', label: 'AVIF' },
          ]}
          onChange={(format) => onChange({ format })}
        />
      </Field>

      {settings.format !== 'png' ? (
        <>
          <Slider
            label="Qualität"
            min={5}
            max={98}
            value={Math.round(settings.quality * 100)}
            display={`${Math.round(settings.quality * 100)} %`}
            onChange={(value) => onChange({ quality: value / 100, targetKB: null })}
          />

          <Toggle
            label="Zielgröße vorgeben"
            hint="Die Qualität wird automatisch passend gesucht."
            checked={settings.targetKB !== null}
            onChange={(checked) => onChange({ targetKB: checked ? 300 : null })}
          />
          {settings.targetKB !== null ? (
            <NumberInput
              ariaLabel="Zielgröße in Kilobyte"
              value={settings.targetKB}
              min={10}
              max={20000}
              step={10}
              suffix="kB"
              onChange={(targetKB) => onChange({ targetKB })}
            />
          ) : null}
        </>
      ) : null}

      <Field label="Größe ändern">
        <Segmented
          ariaLabel="Größe ändern"
          columns={4}
          value={settings.resizeMode}
          options={[
            { value: 'none', label: 'Original' },
            { value: 'width', label: 'Breite' },
            { value: 'height', label: 'Höhe' },
            { value: 'percent', label: 'Prozent' },
          ]}
          onChange={(resizeMode) => onChange({ resizeMode })}
        />
      </Field>

      {settings.resizeMode === 'width' || settings.resizeMode === 'height' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Breite">
            <NumberInput
              ariaLabel="Breite in Pixel"
              value={settings.width}
              min={1}
              max={20000}
              suffix="px"
              onChange={(width) => onChange({ width })}
            />
          </Field>
          <Field label="Höhe">
            <NumberInput
              ariaLabel="Höhe in Pixel"
              value={settings.height}
              min={1}
              max={20000}
              suffix="px"
              onChange={(height) => onChange({ height })}
            />
          </Field>
        </div>
      ) : null}

      {settings.resizeMode === 'percent' ? (
        <Slider
          label="Skalierung"
          min={5}
          max={200}
          value={settings.percent}
          display={`${settings.percent} %`}
          onChange={(percent) => onChange({ percent })}
        />
      ) : null}

      {settings.resizeMode !== 'none' ? (
        <>
          <Toggle
            label="Seitenverhältnis beibehalten"
            checked={settings.lockAspect}
            onChange={(lockAspect) => onChange({ lockAspect })}
          />
          <Toggle
            label="Nicht vergrößern"
            hint="Kleinere Bilder bleiben unverändert."
            checked={settings.noUpscale}
            onChange={(noUpscale) => onChange({ noUpscale })}
          />
        </>
      ) : null}

      <Toggle
        label="EXIF & Metadaten entfernen"
        hint="Empfohlen: entfernt unter anderem Aufnahmeort und Kameramodell."
        checked={settings.stripMetadata}
        onChange={(stripMetadata) => onChange({ stripMetadata })}
      />

      {settings.format === 'jpeg' ? (
        <Field label="Hintergrund bei Transparenz" hint="JPG kann keine Transparenz speichern.">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings.background}
              onChange={(event) => onChange({ background: event.target.value })}
              aria-label="Hintergrundfarbe"
              className="h-11 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white dark:border-slate-700"
            />
            <span className="text-sm text-slate-600 dark:text-slate-300">{settings.background}</span>
          </div>
        </Field>
      ) : null}
    </div>
  );
}
