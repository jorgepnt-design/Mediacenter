/** Formatierungs-Hilfen (deutsche Schreibweise). */

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  const formatted = value.toFixed(exp === 0 ? 0 : digits).replace('.', ',');
  return `${formatted} ${units[exp]}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '–';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Zeitangabe fuer ffmpeg (HH:MM:SS.mmm). */
export function toFfmpegTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${s.toFixed(3).padStart(6, '0')}`;
}

export function formatEta(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `noch ca. ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return `noch ca. ${minutes} min`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

/** Ersparnis in Prozent (positiv = kleiner geworden). */
export function savings(before: number, after: number): number {
  if (before <= 0) return 0;
  return (before - after) / before;
}

export function baseName(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index > 0 ? fileName.slice(0, index) : fileName;
}

export function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index > 0 ? fileName.slice(index + 1).toLowerCase() : '';
}

/** Dateinamen fuer das Betriebssystem entschaerfen. */
export function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
}
