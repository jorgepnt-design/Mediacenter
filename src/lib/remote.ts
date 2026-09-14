import type { BuiltJob } from './ffmpegArgs';

/**
 * Optionale Server-Variante (siehe server/). Sie ist nur aktiv, wenn
 * VITE_API_URL gesetzt ist UND die Nutzerin sie in den Einstellungen
 * eingeschaltet hat – ohne das bleibt jede Datei auf dem Gerät.
 */
const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const remoteConfigured = API_URL.length > 0;

export const remoteThresholdBytes =
  Number(import.meta.env.VITE_API_THRESHOLD_MB ?? '2048') * 1024 * 1024;

export function shouldUseRemote(file: File, enabled: boolean): boolean {
  return remoteConfigured && enabled && file.size >= remoteThresholdBytes;
}

export interface RemoteHandlers {
  onLog?: (message: string) => void;
  onProgress?: (ratio: number) => void;
}

export async function runRemote(
  built: BuiltJob,
  file: File,
  durationSec: number | undefined,
  handlers: RemoteHandlers = {},
): Promise<Blob> {
  if (!remoteConfigured) throw new Error('Es ist keine API konfiguriert.');

  handlers.onLog?.(`Datei wird an ${API_URL} übertragen …`);

  const form = new FormData();
  form.append('files', file, built.inputName);
  form.append(
    'job',
    JSON.stringify({
      passes: built.passes.map((pass) => ({ args: pass.args })),
      strategy: built.strategy,
      outputs: built.outputs,
      temps: built.temps ?? [],
      outName: built.outName,
      mime: built.mime,
      durationSec,
    }),
  );

  const created = await fetch(`${API_URL}/api/jobs`, { method: 'POST', body: form });
  if (!created.ok) {
    const detail = await created.json().catch(() => ({ error: created.statusText }));
    throw new Error(detail.error ?? 'Der Server hat die Anfrage abgelehnt.');
  }
  const { id } = (await created.json()) as { id: string };

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 1500));
    // eslint-disable-next-line no-await-in-loop
    const status = (await (await fetch(`${API_URL}/api/jobs/${id}`)).json()) as {
      status: string;
      progress: number;
      error?: string;
    };
    handlers.onProgress?.(status.progress ?? 0);
    if (status.status === 'done') break;
    if (status.status === 'error') throw new Error(status.error ?? 'Serverfehler.');
  }

  const result = await fetch(`${API_URL}/api/jobs/${id}/result`);
  if (!result.ok) throw new Error('Das Ergebnis konnte nicht geladen werden.');
  const blob = await result.blob();
  void fetch(`${API_URL}/api/jobs/${id}`, { method: 'DELETE' }).catch(() => undefined);
  handlers.onLog?.('Ergebnis vom Server empfangen.');
  return blob;
}
