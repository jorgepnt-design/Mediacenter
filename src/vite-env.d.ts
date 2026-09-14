/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_THRESHOLD_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*?url' {
  const src: string;
  export default src;
}

declare module 'heic2any' {
  interface Heic2AnyOptions {
    blob: Blob;
    toType?: string;
    quality?: number;
    multiple?: boolean;
  }
  export default function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>;
}

interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  release(): Promise<void>;
}

interface Navigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> };
  deviceMemory?: number;
}
