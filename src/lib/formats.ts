import type { AudioFormat, ImageFormat, MediaKind, VideoContainer } from '../types';
import { extensionOf } from './format';

export const VIDEO_INPUT_EXT = [
  'mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv', 'mpeg', 'mpg', 'm4v', '3gp', 'ts', 'ogv', 'm2ts', 'mts',
] as const;

export const AUDIO_INPUT_EXT = [
  'mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'wma', 'aiff', 'aif', 'amr', 'caf',
] as const;

export const IMAGE_INPUT_EXT = [
  'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif',
] as const;

export const ACCEPT_ATTRIBUTE = 'video/*,image/*,audio/*';

/** Ergaenzt den Accept-Filter um Endungen, die iOS nicht per MIME erkennt. */
export const ACCEPT_ATTRIBUTE_FULL = [
  ACCEPT_ATTRIBUTE,
  ...[...VIDEO_INPUT_EXT, ...AUDIO_INPUT_EXT, ...IMAGE_INPUT_EXT].map((ext) => `.${ext}`),
].join(',');

const VIDEO_SET = new Set<string>(VIDEO_INPUT_EXT);
const AUDIO_SET = new Set<string>(AUDIO_INPUT_EXT);
const IMAGE_SET = new Set<string>(IMAGE_INPUT_EXT);

/**
 * Bestimmt die Medienart. MIME-Typ zuerst, danach die Endung – auf iOS ist der
 * MIME-Typ bei HEIC/HEVC-Aufnahmen gelegentlich leer.
 */
export function detectKind(file: File): MediaKind | null {
  const ext = extensionOf(file.name);
  const mime = (file.type || '').toLowerCase();

  if (IMAGE_SET.has(ext)) return 'image';
  if (VIDEO_SET.has(ext)) return 'video';
  if (AUDIO_SET.has(ext)) return 'audio';

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  return null;
}

export function isHeic(file: File): boolean {
  const ext = extensionOf(file.name);
  return ext === 'heic' || ext === 'heif' || /image\/hei[cf]/i.test(file.type);
}

const VIDEO_MIME: Record<VideoContainer, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  gif: 'image/gif',
};

const AUDIO_MIME: Record<AudioFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
};

const IMAGE_MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

export function videoMime(container: VideoContainer): string {
  return VIDEO_MIME[container];
}

export function audioMime(format: AudioFormat): string {
  return AUDIO_MIME[format];
}

export function imageMime(format: ImageFormat): string {
  return IMAGE_MIME[format];
}

export function imageExtension(format: ImageFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

export function audioExtension(format: AudioFormat): string {
  return format === 'opus' ? 'opus' : format;
}
