import type { ExtractSettings } from '../../types';
import { Field, Segmented, Select, Toggle } from '../ui';

const FORMATS = [
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A/AAC' },
  { value: 'wav', label: 'WAV' },
  { value: 'flac', label: 'FLAC' },
  { value: 'ogg', label: 'OGG' },
  { value: 'opus', label: 'Opus' },
] as const;

const MP3_BITRATES = [
  { value: 320, label: '320 kbit/s' },
  { value: 256, label: '256 kbit/s' },
  { value: 192, label: '192 kbit/s' },
  { value: 128, label: '128 kbit/s' },
  { value: 96, label: '96 kbit/s' },
  { value: 0, label: 'VBR (variabel)' },
];

export function AudioPanel({
  settings,
  onChange,
  mode,
}: {
  settings: ExtractSettings;
  onChange: (patch: Partial<ExtractSettings>) => void;
  mode: 'extract' | 'convert';
}) {
  const lossless = settings.format === 'wav' || settings.format === 'flac';

  return (
    <div className="space-y-6">
      <Field
        label="Zielformat"
        hint={mode === 'extract' ? 'MP3 ist der Klassiker fürs Teilen und Anhören.' : undefined}
      >
        <Segmented
          ariaLabel="Zielformat"
          columns={3}
          value={settings.format}
          options={FORMATS.map((format) => ({ ...format }))}
          onChange={(format) => onChange({ format })}
        />
      </Field>

      {!lossless ? (
        <Field label="Bitrate">
          <Select
            ariaLabel="Bitrate"
            value={settings.bitrate}
            options={MP3_BITRATES}
            onChange={(bitrate) => onChange({ bitrate })}
          />
          {settings.bitrate === 0 && settings.format === 'mp3' ? (
            <div className="mt-2">
              <Select
                ariaLabel="VBR-Qualität"
                value={settings.vbrQuality}
                options={[0, 1, 2, 3, 4, 5, 6, 7].map((quality) => ({
                  value: quality,
                  label: `VBR-Qualität ${quality}${quality === 0 ? ' (beste)' : quality === 7 ? ' (kleinste)' : ''}`,
                }))}
                onChange={(vbrQuality) => onChange({ vbrQuality })}
              />
            </div>
          ) : null}
        </Field>
      ) : null}

      <Field label="Abtastrate">
        <Select
          ariaLabel="Abtastrate"
          value={String(settings.sampleRate)}
          options={[
            { value: 'original', label: 'Original' },
            { value: '48000', label: '48 kHz' },
            { value: '44100', label: '44,1 kHz' },
            { value: '32000', label: '32 kHz' },
            { value: '22050', label: '22,05 kHz' },
          ]}
          onChange={(value) =>
            onChange({ sampleRate: value === 'original' ? 'original' : Number(value) })
          }
        />
      </Field>

      <Field label="Kanäle">
        <Segmented
          ariaLabel="Kanäle"
          columns={3}
          value={String(settings.channels)}
          options={[
            { value: 'original', label: 'Original' },
            { value: '2', label: 'Stereo' },
            { value: '1', label: 'Mono' },
          ]}
          onChange={(value) =>
            onChange({ channels: value === 'original' ? 'original' : (Number(value) as 1 | 2) })
          }
        />
      </Field>

      <Toggle
        label="Lautstärke normalisieren"
        hint="Gleicht leise und laute Stellen an (loudnorm, EBU R128). Dauert etwas länger."
        checked={settings.normalize}
        onChange={(normalize) => onChange({ normalize })}
      />

      <Toggle
        label="Ohne Neukodierung kopieren, wenn möglich"
        hint="Liegt die Tonspur bereits im Zielformat vor, wird sie verlustfrei übernommen – sehr schnell. Sonst wird automatisch neu kodiert."
        checked={settings.copyIfPossible}
        onChange={(copyIfPossible) => onChange({ copyIfPossible })}
      />
    </div>
  );
}
