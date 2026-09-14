import { FFmpeg } from '@ffmpeg/ffmpeg';
import type { EngineOutputFile, EngineRequest } from '../types';

/**
 * Kapselt ffmpeg.wasm. Laeuft sowohl in einem Web Worker (Normalfall) als auch
 * direkt im Hauptthread (Fallback, falls verschachtelte Worker blockiert sind).
 */

export interface EngineEmitter {
  log: (message: string) => void;
  progress: (ratio: number) => void;
  loadProgress: (ratio: number) => void;
}

export interface EngineInfo {
  multithread: boolean;
  encoders: string[];
}

const noop = () => undefined;

let instance: FFmpeg | null = null;
let info: EngineInfo | null = null;
let loading: Promise<EngineInfo> | null = null;

let logSink: (message: string) => void = noop;
let progressSink: (ratio: number) => void = noop;

function coreUrls(multithread: boolean) {
  const base = multithread ? '/ffmpeg/mt' : '/ffmpeg/st';
  const absolute = (path: string) => new URL(path, self.location.origin).href;
  return {
    coreURL: absolute(`${base}/ffmpeg-core.js`),
    wasmURL: absolute(`${base}/ffmpeg-core.wasm`),
    ...(multithread ? { workerURL: absolute(`${base}/ffmpeg-core.worker.js`) } : {}),
  };
}

function canUseMultithread(): boolean {
  try {
    return typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated === true;
  } catch {
    return false;
  }
}

async function createInstance(multithread: boolean): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => logSink(message));
  ffmpeg.on('progress', ({ progress }) => progressSink(progress));
  await ffmpeg.load(coreUrls(multithread));
  return ffmpeg;
}

/** Vorhandene Encoder ermitteln, damit die Oberflaeche nur Moegliches anbietet. */
async function detectEncoders(ffmpeg: FFmpeg): Promise<string[]> {
  const lines: string[] = [];
  const previous = logSink;
  logSink = (message) => lines.push(message);
  try {
    await ffmpeg.exec(['-hide_banner', '-encoders']);
  } catch {
    /* Liste bleibt leer – dann werden alle Optionen angeboten. */
  } finally {
    logSink = previous;
  }
  const found = new Set<string>();
  for (const line of lines) {
    const match = /^\s*[VAS][A-Z.]{5}\s+([A-Za-z0-9_-]+)/.exec(line);
    if (match) found.add(match[1]);
  }
  return [...found];
}

export async function loadEngine(emit: Partial<EngineEmitter> = {}): Promise<EngineInfo> {
  if (info && instance) return info;
  if (loading) return loading;

  logSink = emit.log ?? noop;
  emit.loadProgress?.(0.05);

  loading = (async () => {
    const wantMt = canUseMultithread();
    let multithread = wantMt;
    try {
      instance = await createInstance(wantMt);
    } catch (error) {
      if (!wantMt) throw error;
      // Kein SharedArrayBuffer / Header fehlen -> Single-Thread-Core.
      logSink(`Multithread-Core nicht verfügbar, wechsle auf Single-Thread: ${String(error)}`);
      multithread = false;
      instance = await createInstance(false);
    }
    emit.loadProgress?.(0.85);
    const encoders = await detectEncoders(instance);
    emit.loadProgress?.(1);
    info = { multithread, encoders };
    return info;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export function engineInfo(): EngineInfo | null {
  return info;
}

export function terminateEngine(): void {
  try {
    instance?.terminate();
  } catch {
    /* egal */
  }
  instance = null;
  info = null;
  loading = null;
}

async function safeDelete(ffmpeg: FFmpeg, name: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(name);
  } catch {
    /* Datei existierte nicht – das ist in Ordnung. */
  }
}

async function collectOutputs(
  ffmpeg: FFmpeg,
  request: EngineRequest,
): Promise<EngineOutputFile[]> {
  const names: string[] = [...request.outputs];

  if (request.outputPrefix) {
    const entries = await ffmpeg.listDir('/');
    names.push(
      ...entries
        .filter((entry) => !entry.isDir && entry.name.startsWith(request.outputPrefix!))
        .map((entry) => entry.name)
        .sort(),
    );
  }

  const files: EngineOutputFile[] = [];
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    const data = await ffmpeg.readFile(name);
    if (typeof data === 'string') continue;
    if (data.byteLength === 0) continue;
    files.push({ name, data });
  }
  return files;
}

export async function runRequest(
  request: EngineRequest,
  emit: Partial<EngineEmitter> = {},
): Promise<EngineOutputFile[]> {
  const ffmpeg = instance;
  if (!ffmpeg) throw new Error('ffmpeg wurde noch nicht geladen.');

  logSink = emit.log ?? noop;

  const cleanup = new Set<string>([
    ...request.inputs.map((entry) => entry.name),
    ...request.outputs,
    ...(request.temps ?? []),
  ]);

  try {
    for (const input of request.inputs) {
      // eslint-disable-next-line no-await-in-loop
      await ffmpeg.writeFile(input.name, input.data);
    }

    const weights = request.passes.map((pass) => pass.weight ?? 1 / request.passes.length);
    const total = weights.reduce((sum, value) => sum + value, 0) || 1;

    let lastError = '';
    let succeeded = request.strategy === 'all';

    const runSequence = async (passes: typeof request.passes) => {
      for (let index = 0; index < passes.length; index += 1) {
        const pass = passes[index];
        if (pass.label) emit.log?.(`— ${pass.label} —`);
        // eslint-disable-next-line no-await-in-loop
        const code = await ffmpeg.exec(pass.args);
        if (code !== 0) throw new Error(`ffmpeg endete mit Code ${code}.`);
      }
    };

    for (let index = 0; index < request.passes.length; index += 1) {
      const pass = request.passes[index];
      const before = weights.slice(0, index).reduce((sum, value) => sum + value, 0) / total;
      const share = weights[index] / total;

      progressSink = (ratio) => {
        const clamped = Math.min(Math.max(ratio, 0), 1);
        emit.progress?.(
          request.strategy === 'firstSuccess' ? clamped : Math.min(before + clamped * share, 1),
        );
      };
      if (pass.label) emit.log?.(`— ${pass.label} —`);

      // eslint-disable-next-line no-await-in-loop
      const code = await ffmpeg.exec(pass.args);

      if (request.strategy === 'firstSuccess') {
        // eslint-disable-next-line no-await-in-loop
        const produced = await collectOutputs(ffmpeg, request);
        if (code === 0 && produced.length > 0) {
          emit.progress?.(1);
          await Promise.all([...cleanup].map((name) => safeDelete(ffmpeg, name)));
          return produced;
        }
        lastError = `Durchgang „${pass.label ?? index + 1}" endete mit Code ${code}.`;
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(request.outputs.map((name) => safeDelete(ffmpeg, name)));
        continue;
      }

      if (code !== 0) {
        if (!request.fallbackPasses || request.fallbackPasses.length === 0) {
          throw new Error(`ffmpeg endete mit Code ${code}.`);
        }
        emit.log?.(
          `— Durchgang fehlgeschlagen (Code ${code}), einfacherer Weg wird versucht —`,
        );
        await Promise.all(
          [...request.outputs, ...(request.temps ?? [])].map((name) => safeDelete(ffmpeg, name)),
        );
        progressSink = (ratio) => emit.progress?.(Math.min(Math.max(ratio, 0), 1));
        await runSequence(request.fallbackPasses);
        succeeded = true;
        break;
      }
      succeeded = true;
    }

    if (!succeeded) throw new Error(lastError || 'Keiner der Durchgänge war erfolgreich.');

    emit.progress?.(1);
    const files = await collectOutputs(ffmpeg, request);
    if (files.length === 0) throw new Error('ffmpeg hat keine Ausgabedatei erzeugt.');
    for (const file of files) cleanup.add(file.name);
    return files;
  } finally {
    // Aufraeumen: sonst waechst der WASM-Speicher bei Stapelverarbeitung stetig.
    progressSink = noop;
    await Promise.all([...cleanup].map((name) => safeDelete(ffmpeg, name)));
  }
}
