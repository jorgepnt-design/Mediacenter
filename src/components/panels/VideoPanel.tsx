import type { VideoSettings } from '../../types';
import { Field, NumberInput, Segmented, Select, Slider, Toggle } from '../ui';
import {
  AUDIO_BITRATES,
  CODEC_OPTIONS,
  RESOLUTION_OPTIONS,
  SPEED_OPTIONS,
  VIDEO_PRESETS,
  applyVideoPreset,
} from '../../lib/presets';
import { ENCODER_BY_CODEC } from '../../lib/ffmpegClient';

export function VideoPanel({
  settings,
  onChange,
  encoders,
}: {
  settings: VideoSettings;
  onChange: (patch: Partial<VideoSettings>) => void;
  encoders: string[] | null;
}) {
  const expert = settings.preset === 'custom';
  const codecAvailable = (codec: string) =>
    !encoders || encoders.length === 0 || encoders.includes(ENCODER_BY_CODEC[codec]);

  return (
    <div className="space-y-6">
      <Field label="Voreinstellung" hint="Schneller Start – Feinheiten im Experten-Modus.">
        <Segmented
          ariaLabel="Voreinstellung"
          columns={2}
          value={settings.preset}
          options={[
            ...VIDEO_PRESETS.map((preset) => ({
              value: preset.id as VideoSettings['preset'],
              label: preset.label,
              hint: preset.hint,
            })),
            { value: 'custom' as const, label: 'Experten-Modus', hint: 'Alles selbst einstellen' },
          ]}
          onChange={(value) =>
            value === 'custom'
              ? onChange({ preset: 'custom' })
              : onChange(applyVideoPreset(settings, value))
          }
        />
      </Field>

      <Field label="Format">
        <Segmented
          ariaLabel="Zielformat"
          columns={4}
          value={settings.container}
          options={[
            { value: 'mp4', label: 'MP4' },
            { value: 'webm', label: 'WebM' },
            { value: 'mkv', label: 'MKV' },
            { value: 'mov', label: 'MOV' },
          ]}
          onChange={(container) => onChange({ container })}
        />
      </Field>

      <Field label="Auflösung" hint="Begrenzt die kürzere Kante – Hochformat bleibt Hochformat.">
        <Select
          ariaLabel="Auflösung"
          value={settings.resolution}
          options={RESOLUTION_OPTIONS.map((option) => ({ ...option }))}
          onChange={(resolution) => onChange({ resolution, preset: 'custom' })}
        />
        {settings.resolution === 'custom' ? (
          <div className="mt-2">
            <NumberInput
              ariaLabel="Eigene Breite in Pixel"
              value={settings.customWidth}
              min={64}
              max={7680}
              step={2}
              suffix="px breit"
              onChange={(customWidth) => onChange({ customWidth })}
            />
          </div>
        ) : null}
      </Field>

      {expert ? (
        <>
          <Field label="Qualitätssteuerung">
            <Segmented
              ariaLabel="Qualitätssteuerung"
              columns={3}
              value={settings.rateMode}
              options={[
                { value: 'crf', label: 'CRF' },
                { value: 'bitrate', label: 'Bitrate' },
                { value: 'size', label: 'Zielgröße' },
              ]}
              onChange={(rateMode) => onChange({ rateMode })}
            />
          </Field>

          {settings.rateMode === 'crf' ? (
            <Slider
              label="CRF (kleiner = bessere Qualität)"
              min={14}
              max={40}
              value={settings.crf}
              display={String(settings.crf)}
              onChange={(crf) => onChange({ crf })}
            />
          ) : null}

          {settings.rateMode === 'bitrate' ? (
            <Field label="Video-Bitrate">
              <NumberInput
                ariaLabel="Video-Bitrate"
                value={settings.videoBitrate}
                min={100}
                max={100000}
                step={100}
                suffix="kbit/s"
                onChange={(videoBitrate) => onChange({ videoBitrate })}
              />
            </Field>
          ) : null}

          {settings.rateMode === 'size' ? (
            <Field
              label="Zielgröße"
              hint="Die Bitrate wird aus Laufzeit und Zielgröße berechnet (2-Pass-Kodierung)."
            >
              <NumberInput
                ariaLabel="Zielgröße in Megabyte"
                value={settings.targetSizeMB}
                min={1}
                max={4096}
                step={1}
                suffix="MB"
                onChange={(targetSizeMB) => onChange({ targetSizeMB })}
              />
            </Field>
          ) : null}

          <Field label="Codec">
            <Segmented
              ariaLabel="Codec"
              columns={2}
              value={settings.codec}
              options={CODEC_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
                hint: codecAvailable(option.value) ? option.hint : 'in dieser Version nicht enthalten',
                disabled: !codecAvailable(option.value),
              }))}
              onChange={(codec) => onChange({ codec })}
            />
          </Field>

          <Field label="Encoder-Tempo" hint="Langsamer bedeutet kleinere Dateien.">
            <Select
              ariaLabel="Encoder-Tempo"
              value={settings.speed}
              options={SPEED_OPTIONS.map((option) => ({ ...option }))}
              onChange={(speed) => onChange({ speed })}
            />
          </Field>

          <Field label="Bildrate">
            <Select
              ariaLabel="Bildrate"
              value={String(settings.fps)}
              options={[
                { value: 'original', label: 'Original' },
                { value: '60', label: '60 fps' },
                { value: '30', label: '30 fps' },
                { value: '25', label: '25 fps' },
                { value: '24', label: '24 fps' },
                { value: '15', label: '15 fps' },
              ]}
              onChange={(value) => onChange({ fps: value === 'original' ? 'original' : Number(value) })}
            />
          </Field>
        </>
      ) : null}

      <Field label="Tonspur">
        <Segmented
          ariaLabel="Tonspur"
          columns={3}
          value={settings.audioMode}
          options={[
            { value: 'copy', label: 'Behalten' },
            { value: 'encode', label: 'Neu kodieren' },
            { value: 'none', label: 'Entfernen' },
          ]}
          onChange={(audioMode) => onChange({ audioMode })}
        />
        {settings.audioMode === 'encode' ? (
          <div className="mt-2">
            <Select
              ariaLabel="Audio-Bitrate"
              value={settings.audioBitrate}
              options={AUDIO_BITRATES.map((rate) => ({ value: rate, label: `${rate} kbit/s` }))}
              onChange={(audioBitrate) => onChange({ audioBitrate })}
            />
          </div>
        ) : null}
      </Field>

      <Toggle
        label="Untertitel- und Metadatenspuren entfernen"
        hint="Macht die Datei kleiner und entfernt Aufnahmeort und -gerät."
        checked={settings.stripExtras}
        onChange={(stripExtras) => onChange({ stripExtras })}
      />
    </div>
  );
}
