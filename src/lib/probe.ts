import type { MediaInfo, MediaKind } from '../types';

/**
 * Liest Dauer und Abmessungen ohne Dekodierung der gesamten Datei.
 * Schlaegt das fehl (z. B. HEVC am Desktop), bleiben die Werte leer – ffmpeg
 * ermittelt sie dann selbst.
 */
export function probeMedia(file: File, kind: MediaKind): Promise<MediaInfo> {
  if (kind === 'image') return probeImage(file);
  return probeAv(file, kind);
}

function probeAv(file: File, kind: MediaKind): Promise<MediaInfo> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement(kind === 'video' ? 'video' : 'audio') as HTMLVideoElement;
    element.preload = 'metadata';
    element.muted = true;
    element.playsInline = true;

    const finish = (info: MediaInfo) => {
      element.removeAttribute('src');
      element.load?.();
      URL.revokeObjectURL(url);
      resolve(info);
    };

    const timer = window.setTimeout(() => finish({}), 8000);

    element.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish({
        durationSec: Number.isFinite(element.duration) ? element.duration : undefined,
        width: element.videoWidth || undefined,
        height: element.videoHeight || undefined,
      });
    };
    element.onerror = () => {
      window.clearTimeout(timer);
      finish({});
    };
    element.src = url;
  });
}

function probeImage(file: File): Promise<MediaInfo> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const finish = (info: MediaInfo) => {
      URL.revokeObjectURL(url);
      resolve(info);
    };
    const timer = window.setTimeout(() => finish({}), 8000);
    image.onload = () => {
      window.clearTimeout(timer);
      finish({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      finish({});
    };
    image.src = url;
  });
}
