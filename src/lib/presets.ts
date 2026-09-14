import type { SettingsState, VideoSettings } from '../types';
import { isIOS } from './platform';

export interface VideoPresetDefinition {
  id: 'small' | 'balanced' | 'high';
  label: string;
  hint: string;
  apply: Pick<VideoSettings, 'crf' | 'resolution' | 'speed' | 'audioBitrate' | 'codec' | 'fps'>;
}

export const VIDEO_PRESETS: VideoPresetDefinition[] = [
  {
    id: 'small',
    label: 'Klein',
    hint: 'Für Web & WhatsApp – 720p, starke Kompression',
    apply: { crf: 30, resolution: '720', speed: 'veryfast', audioBitrate: 96, codec: 'h264', fps: 30 },
  },
  {
    id: 'balanced',
    label: 'Ausgewogen',
    hint: 'Gute Qualität bei deutlich kleinerer Datei – 1080p',
    apply: { crf: 24, resolution: '1080', speed: 'fast', audioBitrate: 128, codec: 'h264', fps: 'original' },
  },
  {
    id: 'high',
    label: 'Hohe Qualität',
    hint: 'Nahe am Original – Auflösung bleibt erhalten',
    apply: { crf: 20, resolution: 'original', speed: 'medium', audioBitrate: 192, codec: 'h264', fps: 'original' },
  },
];

export const RESOLUTION_OPTIONS = [
  { value: 'original', label: 'Original' },
  { value: '2160', label: '2160p (4K)' },
  { value: '1440', label: '1440p' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' },
  { value: 'custom', label: 'Eigene Breite' },
] as const;

export const CODEC_OPTIONS = [
  { value: 'h264', label: 'H.264', hint: 'Überall abspielbar, schnell' },
  { value: 'h265', label: 'H.265 / HEVC', hint: 'Kleiner, langsamer' },
  { value: 'vp9', label: 'VP9', hint: 'Für WebM' },
  { value: 'av1', label: 'AV1', hint: 'Kleinste Dateien, sehr langsam' },
] as const;

export const SPEED_OPTIONS = [
  { value: 'ultrafast', label: 'Sehr schnell' },
  { value: 'veryfast', label: 'Schnell' },
  { value: 'fast', label: 'Zügig' },
  { value: 'medium', label: 'Normal' },
  { value: 'slow', label: 'Klein (langsam)' },
] as const;

export const AUDIO_BITRATES = [320, 256, 192, 128, 96, 64];

/** Standardwerte – auf dem iPhone bewusst konservativer. */
export function defaultSettings(): SettingsState {
  return {
    advanced: {
      useRemoteForLargeFiles: false,
    },
    video: {
      container: 'mp4',
      preset: 'balanced',
      rateMode: 'crf',
      crf: 24,
      videoBitrate: 2500,
      targetSizeMB: 25,
      resolution: isIOS ? '720' : '1080',
      customWidth: 1280,
      fps: 'original',
      codec: 'h264',
      speed: isIOS ? 'veryfast' : 'fast',
      audioMode: 'encode',
      audioBitrate: 128,
      stripExtras: true,
    },
    extract: {
      format: 'mp3',
      bitrate: 192,
      vbrQuality: 2,
      copyIfPossible: true,
      sampleRate: 'original',
      channels: 'original',
      normalize: false,
    },
    gif: {
      format: 'gif',
      fps: 12,
      width: 480,
      loop: true,
      optimizePalette: true,
    },
    frame: {
      mode: 'single',
      time: 0,
      fps: 1,
      format: 'jpg',
      width: 'original',
    },
    audio: {
      format: 'mp3',
      bitrate: 192,
      vbrQuality: 2,
      copyIfPossible: false,
      sampleRate: 'original',
      channels: 'original',
      normalize: false,
    },
    image: {
      format: 'jpeg',
      quality: 0.8,
      targetKB: null,
      resizeMode: 'none',
      width: 1920,
      height: 1080,
      percent: 100,
      lockAspect: true,
      noUpscale: true,
      stripMetadata: true,
      background: '#ffffff',
    },
  };
}

export function applyVideoPreset(settings: VideoSettings, id: 'small' | 'balanced' | 'high'): VideoSettings {
  const preset = VIDEO_PRESETS.find((entry) => entry.id === id);
  if (!preset) return settings;
  return { ...settings, ...preset.apply, preset: id, rateMode: 'crf' };
}
