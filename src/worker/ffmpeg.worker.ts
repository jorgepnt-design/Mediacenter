/// <reference lib="webworker" />
import type { EngineMessage, EngineRequest } from '../types';
import { loadEngine, runRequest, terminateEngine } from './engine';

type Incoming =
  | { type: 'load'; id: string }
  | { type: 'run'; id: string; request: EngineRequest }
  | { type: 'terminate' };

const post = (message: EngineMessage) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const data = event.data;

  if (data.type === 'terminate') {
    terminateEngine();
    return;
  }

  if (data.type === 'load') {
    try {
      const info = await loadEngine({
        log: (message) => post({ type: 'log', id: null, message }),
        loadProgress: (ratio) => post({ type: 'load-progress', ratio }),
      });
      post({ type: 'ready', multithread: info.multithread, encoders: info.encoders });
    } catch (error) {
      post({ type: 'error', id: data.id, message: String(error) });
    }
    return;
  }

  if (data.type === 'run') {
    try {
      const files = await runRequest(data.request, {
        log: (message) => post({ type: 'log', id: data.id, message }),
        progress: (ratio) => post({ type: 'progress', id: data.id, ratio }),
      });
      const transfer = files.map((file) => file.data.buffer as ArrayBuffer);
      (self as unknown as DedicatedWorkerGlobalScope).postMessage(
        { type: 'done', id: data.id, files } satisfies EngineMessage,
        transfer,
      );
    } catch (error) {
      post({
        type: 'error',
        id: data.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
