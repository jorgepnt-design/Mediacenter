import type { MediaInfo, MediaKind } from '../types';

/**
 * Liest Dauer und Abmessungen ohne Dekodierung der gesamten Datei.
 * Safari meldet bei lokalen iPhone-Videos gelegentlich zunaechst Infinity als
 * Dauer. Ein Sprung ans Dateiende zwingt WebKit, die echte Dauer nachzuladen.
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

    let settled = false;
    let durationRecoveryStarted = false;

    const readInfo = (): MediaInfo => ({
      durationSec:
        Number.isFinite(element.duration) && element.duration > 0
          ? element.duration
          : undefined,
      width: element.videoWidth || undefined,
      height: element.videoHeight || undefined,
    });

    const finish = (info: MediaInfo) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      element.onloadedmetadata = null;
      element.ondurationchange = null;
      element.ontimeupdate = null;
      element.onloadeddata = null;
      element.onerror = null;
      element.removeAttribute('src');
      element.load?.();
      URL.revokeObjectURL(url);
      resolve(info);
    };

    const finishIfDurationKnown = () => {
      const info = readInfo();
      if (!info.durationSec) return false;
      finish(info);
      return true;
    };

    const recoverSafariDuration = () => {
      if (settled || durationRecoveryStarted) return;
      durationRecoveryStarted = true;
      try {
        // WebKit ermittelt bei einigen MOV/MP4-Dateien die Dauer erst nach
        // einem Seek. Sobald sie bekannt ist, feuert durationchange/timeupdate.
        element.currentTime = 1e101;
      } catch {
        // Der zeitbasierte Fallback in estimate.ts sorgt trotzdem fuer eine
        // sichtbare, als ungefaehr gekennzeichnete Groessenschaetzung.
      }
    };

    const timer = window.setTimeout(() => finish(readInfo()), 12_000);

    element.onloadedmetadata = () => {
      if (!finishIfDurationKnown()) recoverSafariDuration();
    };
    element.ondurationchange = () => {
      finishIfDurationKnown();
    };
    element.ontimeupdate = () => {
      finishIfDurationKnown();
    };
    element.onloadeddata = () => {
      if (!finishIfDurationKnown()) recoverSafariDuration();
    };
    element.onerror = () => finish(readInfo());

    element.src = url;
    // Explizites load() ist fuer Blob-URLs auf iOS zuverlaessiger.
    element.load();
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
