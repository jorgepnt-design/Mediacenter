import type { EngineMessage, EngineOutputFile, EngineRequest } from '../types';

export interface EngineInfo {
  multithread: boolean;
  encoders: string[];
}

export interface RunHandlers {
  onLog?: (message: string) => void;
  onProgress?: (ratio: number) => void;
}

interface Pending {
  resolve: (files: EngineOutputFile[]) => void;
  reject: (error: Error) => void;
  handlers: RunHandlers;
}

export class CanceledError extends Error {
  constructor() {
    super('Der Vorgang wurde abgebrochen.');
    this.name = 'CanceledError';
  }
}

type Fallback = typeof import('../worker/engine');

/**
 * Zugriff auf ffmpeg.wasm. Bevorzugt ein eigener Web Worker; scheitert dessen
 * Erzeugung (manche iOS-Versionen mögen verschachtelte Worker nicht), wird die
 * gleiche Engine direkt im Hauptthread genutzt – ffmpeg.wasm rechnet dann
 * immer noch in seinem eigenen internen Worker, die Oberfläche bleibt flüssig.
 */
class FfmpegClient {
  private worker: Worker | null = null;
  private fallback: Fallback | null = null;
  private pending = new Map<string, Pending>();
  private loadPromise: Promise<EngineInfo> | null = null;
  private counter = 0;

  info: EngineInfo | null = null;
  usesFallback = false;

  get loaded(): boolean {
    return this.info !== null;
  }

  private nextId(): string {
    this.counter += 1;
    return `req-${this.counter}`;
  }

  private createWorker(): Worker | null {
    try {
      return new Worker(new URL('../worker/ffmpeg.worker.ts', import.meta.url), {
        type: 'module',
        name: 'mediacenter-ffmpeg',
      });
    } catch {
      return null;
    }
  }

  private attach(worker: Worker): void {
    worker.onmessage = (event: MessageEvent<EngineMessage>) => {
      const message = event.data;
      switch (message.type) {
        case 'log': {
          if (message.id) this.pending.get(message.id)?.handlers.onLog?.(message.message);
          break;
        }
        case 'progress': {
          this.pending.get(message.id)?.handlers.onProgress?.(message.ratio);
          break;
        }
        case 'done': {
          const entry = this.pending.get(message.id);
          this.pending.delete(message.id);
          entry?.resolve(message.files);
          break;
        }
        case 'error': {
          const entry = this.pending.get(message.id);
          this.pending.delete(message.id);
          entry?.reject(new Error(message.message));
          break;
        }
        default:
          break;
      }
    };
  }

  async ensureLoaded(onLoadProgress?: (ratio: number) => void): Promise<EngineInfo> {
    if (this.info) return this.info;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const worker = this.usesFallback ? null : this.createWorker();
      if (worker) {
        this.attach(worker);
        try {
          const info = await new Promise<EngineInfo>((resolve, reject) => {
            const id = this.nextId();
            const timer = window.setTimeout(
              () => reject(new Error('Zeitüberschreitung beim Laden des ffmpeg-Kerns.')),
              180_000,
            );
            const onMessage = (event: MessageEvent<EngineMessage>) => {
              const message = event.data;
              if (message.type === 'ready') {
                window.clearTimeout(timer);
                worker.removeEventListener('message', onMessage);
                resolve({ multithread: message.multithread, encoders: message.encoders });
              } else if (message.type === 'load-progress') {
                onLoadProgress?.(message.ratio);
              } else if (message.type === 'error' && message.id === id) {
                window.clearTimeout(timer);
                worker.removeEventListener('message', onMessage);
                reject(new Error(message.message));
              }
            };
            worker.addEventListener('message', onMessage);
            worker.addEventListener(
              'error',
              (event) => {
                window.clearTimeout(timer);
                reject(new Error(event.message || 'Worker konnte nicht gestartet werden.'));
              },
              { once: true },
            );
            worker.postMessage({ type: 'load', id });
          });
          this.worker = worker;
          this.info = info;
          return info;
        } catch (error) {
          worker.terminate();
          this.worker = null;
          this.usesFallback = true;
          console.warn('ffmpeg-Worker nicht verfügbar, nutze Hauptthread-Engine.', error);
        }
      } else {
        this.usesFallback = true;
      }

      const engine = await this.loadFallback();
      const info = await engine.loadEngine({ loadProgress: onLoadProgress });
      this.info = info;
      return info;
    })();

    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private async loadFallback(): Promise<Fallback> {
    if (!this.fallback) this.fallback = await import('../worker/engine');
    return this.fallback;
  }

  async run(request: Omit<EngineRequest, 'id'>, handlers: RunHandlers = {}): Promise<EngineOutputFile[]> {
    await this.ensureLoaded();
    const id = this.nextId();
    const full: EngineRequest = { ...request, id };

    if (this.worker) {
      const worker = this.worker;
      return new Promise<EngineOutputFile[]>((resolve, reject) => {
        this.pending.set(id, { resolve, reject, handlers });
        const transfer = full.inputs
          .map((input) => input.data.buffer)
          .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
        worker.postMessage({ type: 'run', id, request: full }, transfer);
      });
    }

    const engine = await this.loadFallback();
    return engine.runRequest(full, {
      log: handlers.onLog,
      progress: handlers.onProgress,
    });
  }

  /**
   * ffmpeg.wasm kennt keinen sauberen Abbruch eines laufenden Durchgangs –
   * deshalb wird die Engine beendet und beim naechsten Job neu geladen
   * (der Core liegt dann bereits im Cache).
   */
  cancel(): void {
    for (const [, entry] of this.pending) entry.reject(new CanceledError());
    this.pending.clear();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    } else if (this.fallback) {
      this.fallback.terminateEngine();
    }
    this.info = null;
    this.loadPromise = null;
  }

  supportsEncoder(name: string): boolean {
    if (!this.info || this.info.encoders.length === 0) return true;
    return this.info.encoders.includes(name);
  }
}

export const ffmpegClient = new FfmpegClient();

export const ENCODER_BY_CODEC: Record<string, string> = {
  h264: 'libx264',
  h265: 'libx265',
  vp9: 'libvpx-vp9',
  av1: 'libaom-av1',
};
