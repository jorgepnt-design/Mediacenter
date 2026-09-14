import { canShareFiles } from './platform';

/** Ergebnis ueber das System-Share-Sheet teilen (iOS: Fotos, WhatsApp, AirDrop). */
export async function shareFiles(files: File[], title: string): Promise<'shared' | 'unsupported' | 'canceled'> {
  if (!canShareFiles(files)) return 'unsupported';
  try {
    await navigator.share({ files, title });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'canceled';
    return 'unsupported';
  }
}

export function blobToFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || 'application/octet-stream' });
}

/** Klassischer Download – auf iOS landet die Datei in der Dateien-App. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Etwas Luft lassen, damit Safari den Download noch starten kann.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
