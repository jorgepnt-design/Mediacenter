import type { FrameSettings, GifSettings } from '../../types';
import { Field, NumberInput, Segmented, Select, Slider, Toggle } from '../ui';

export function GifPanel({
  settings,
  onChange,
}: {
  settings: GifSettings;
  onChange: (patch: Partial<GifSettings>) => void;
}) {
  return (
    <div className="space-y-6">
      <Field label="Format">
        <Segmented
          ariaLabel="Format"
          columns={3}
          value={settings.format}
          options={[
            { value: 'gif', label: 'GIF', hint: 'überall abspielbar' },
            { value: 'webp', label: 'WebP', hint: 'kleiner, nicht für WhatsApp' },
            { value: 'mp4', label: 'WhatsApp', hint: 'kleines MP4-Video' },
          ]}
          onChange={(format) => onChange({ format })}
        />
      </Field>

      <Slider
        label="Bilder pro Sekunde"
        min={5}
        max={30}
        value={settings.fps}
        display={`${settings.fps} fps`}
        onChange={(fps) => onChange({ fps })}
      />

      <Field label="Breite" hint="Die Höhe passt sich automatisch an.">
        <NumberInput
          ariaLabel="Breite in Pixel"
          value={settings.width}
          min={64}
          max={1920}
          step={10}
          suffix="px"
          onChange={(width) => onChange({ width })}
        />
      </Field>

      {settings.format !== 'mp4' ? (
        <Toggle
          label="Endlos wiederholen"
          checked={settings.loop}
          onChange={(loop) => onChange({ loop })}
        />
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          MP4 wird von WhatsApp zuverlässig angenommen und bleibt deutlich kleiner als GIF.
        </p>
      )}

      {settings.format === 'gif' ? (
        <Toggle
          label="Farbpalette optimieren"
          hint="Zwei Durchgänge: sichtbar bessere Farben bei kleinerer Datei."
          checked={settings.optimizePalette}
          onChange={(optimizePalette) => onChange({ optimizePalette })}
        />
      ) : null}
    </div>
  );
}

export function FramePanel({
  settings,
  onChange,
}: {
  settings: FrameSettings;
  onChange: (patch: Partial<FrameSettings>) => void;
}) {
  return (
    <div className="space-y-6">
      <Field label="Art">
        <Segmented
          ariaLabel="Art"
          columns={2}
          value={settings.mode}
          options={[
            { value: 'single', label: 'Einzelbild', hint: 'Thumbnail' },
            { value: 'sequence', label: 'Bildsequenz', hint: 'als ZIP' },
          ]}
          onChange={(mode) => onChange({ mode })}
        />
      </Field>

      {settings.mode === 'single' ? (
        <Field label="Zeitpunkt" hint="Sekunde im Video; 0 nimmt den Startpunkt des Zuschnitts.">
          <NumberInput
            ariaLabel="Zeitpunkt in Sekunden"
            value={settings.time}
            min={0}
            step={0.5}
            suffix="s"
            onChange={(time) => onChange({ time })}
          />
        </Field>
      ) : (
        <Field label="Bilder pro Sekunde">
          <Select
            ariaLabel="Bilder pro Sekunde"
            value={String(settings.fps)}
            options={[
              { value: '0.2', label: 'alle 5 Sekunden' },
              { value: '0.5', label: 'alle 2 Sekunden' },
              { value: '1', label: '1 pro Sekunde' },
              { value: '2', label: '2 pro Sekunde' },
              { value: '5', label: '5 pro Sekunde' },
            ]}
            onChange={(value) => onChange({ fps: Number(value) })}
          />
        </Field>
      )}

      <Field label="Bildformat">
        <Segmented
          ariaLabel="Bildformat"
          columns={2}
          value={settings.format}
          options={[
            { value: 'jpg', label: 'JPG' },
            { value: 'png', label: 'PNG' },
          ]}
          onChange={(format) => onChange({ format })}
        />
      </Field>

      <Field label="Breite">
        <Select
          ariaLabel="Breite"
          value={String(settings.width)}
          options={[
            { value: 'original', label: 'Original' },
            { value: '1920', label: '1920 px' },
            { value: '1280', label: '1280 px' },
            { value: '640', label: '640 px' },
          ]}
          onChange={(value) => onChange({ width: value === 'original' ? 'original' : Number(value) })}
        />
      </Field>
    </div>
  );
}
