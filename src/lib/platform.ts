/** Geraete- und Feature-Erkennung. Alles defensiv – nichts davon darf werfen. */

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;

export const isIOS =
  /iPad|iPhone|iPod/.test(ua) ||
  // iPadOS meldet sich als Macintosh mit Touch-Unterstuetzung
  (/Macintosh/.test(ua) && typeof document !== 'undefined' && navigator.maxTouchPoints > 1);

export const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);

export const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true);

export const isTouchPrimary =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

/** Mobil = sequentielle Warteschlange und konservative Speichergrenzen. */
export const isMobile = isIOS || /Android/i.test(ua) || isTouchPrimary;

export const hasSharedArrayBuffer =
  typeof SharedArrayBuffer !== 'undefined' &&
  typeof crossOriginIsolated !== 'undefined' &&
  crossOriginIsolated === true;

export const hasOffscreenCanvas =
  typeof OffscreenCanvas !== 'undefined' &&
  typeof OffscreenCanvas.prototype.convertToBlob === 'function';

export const hasWakeLock = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

export function canShareFiles(files: File[]): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

/**
 * Warnschwelle fuer die Eingangsdateigroesse. iOS Safari beendet den Tab schon
 * bei wenigen hundert MB WASM-Speicher – deshalb dort deutlich frueher warnen.
 */
export const SIZE_WARN_BYTES = isIOS ? 120 * 1024 * 1024 : 1024 * 1024 * 1024;
export const SIZE_HARD_HINT_BYTES = isIOS ? 400 * 1024 * 1024 : 2048 * 1024 * 1024;

/**
 * Der Multithread-Core ist schneller, belegt aber deutlich mehr Speicher (jeder
 * Thread bekommt eigenen Stack, und die WASM-Speichergrenze steht bei geteiltem
 * Speicher schon beim Start fest). Auf dem iPhone ist Speicher der Engpass,
 * nicht Tempo – ab dieser Eingangsgroesse ist der Single-Thread-Core die
 * verlaesslichere Wahl.
 */
export const SINGLE_THREAD_ABOVE_BYTES = 80 * 1024 * 1024;

export function preferSingleThreadFor(largestInputBytes: number): boolean {
  return isIOS && largestInputBytes >= SINGLE_THREAD_ABOVE_BYTES;
}

let avifSupport: Promise<boolean> | null = null;

/** Prueft, ob der Browser AVIF *kodieren* kann (Safari kann es meist nicht). */
export function supportsAvifEncode(): Promise<boolean> {
  if (avifSupport) return avifSupport;
  avifSupport = (async () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/avif', 0.8),
      );
      return !!blob && blob.type === 'image/avif';
    } catch {
      return false;
    }
  })();
  return avifSupport;
}

let webpSupport: Promise<boolean> | null = null;

export function supportsWebpEncode(): Promise<boolean> {
  if (webpSupport) return webpSupport;
  webpSupport = (async () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.8),
      );
      return !!blob && blob.type === 'image/webp';
    } catch {
      return false;
    }
  })();
  return webpSupport;
}
