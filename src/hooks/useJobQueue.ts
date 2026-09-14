import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  EngineOutputFile,
  Job,
  JobResult,
  MediaKind,
  SettingsState,
  TaskType,
} from '../types';
import { buildConcat, buildJob, effectiveDuration, inputExt } from '../lib/ffmpegArgs';
import { CanceledError, ffmpegClient, type EngineInfo } from '../lib/ffmpegClient';
import { ImageSource, encodeImage } from '../lib/imageProcess';
import { baseName, safeName } from '../lib/format';
import { detectKind, imageExtension } from '../lib/formats';
import { explainError } from '../lib/errors';
import { isIOS, preferSingleThreadFor } from '../lib/platform';
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock';
import { probeMedia } from '../lib/probe';
import { runRemote, shouldUseRemote } from '../lib/remote';
import { createZip } from '../lib/zip';

export interface Rejection {
  name: string;
  reason: string;
}

export interface CoreLoadState {
  active: boolean;
  ratio: number;
}

const MAX_LOG_LINES = 600;

function uid(): string {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultTask(kind: MediaKind): TaskType {
  if (kind === 'image') return 'image';
  if (kind === 'audio') return 'audio';
  return 'video';
}

export function useJobQueue(settings: SettingsState) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [coreLoad, setCoreLoad] = useState<CoreLoadState>({ active: false, ratio: 0 });
  const [engine, setEngine] = useState<EngineInfo | null>(null);

  const jobsRef = useRef<Job[]>(jobs);
  const settingsRef = useRef(settings);
  const canceledRef = useRef(false);
  const runningRef = useRef(false);

  jobsRef.current = jobs;
  settingsRef.current = settings;

  useEffect(
    () => () => {
      jobsRef.current.forEach((job) => {
        if (job.result) URL.revokeObjectURL(job.result.url);
      });
    },
    [],
  );

  const patch = useCallback((id: string, changes: Partial<Job> | ((job: Job) => Partial<Job>)) => {
    setJobs((current) =>
      current.map((job) =>
        job.id === id ? { ...job, ...(typeof changes === 'function' ? changes(job) : changes) } : job,
      ),
    );
  }, []);

  /* ------------------------------- Hinzufuegen ------------------------------ */

  const addFiles = useCallback(async (incoming: File[]): Promise<Rejection[]> => {
    const rejected: Rejection[] = [];
    const accepted: Job[] = [];

    for (const file of incoming) {
      if (file.size === 0) {
        rejected.push({ name: file.name, reason: 'Die Datei ist leer.' });
        continue;
      }
      const kind = detectKind(file);
      if (!kind) {
        rejected.push({
          name: file.name,
          reason: 'Dieses Dateiformat wird nicht unterstützt.',
        });
        continue;
      }
      accepted.push({
        id: uid(),
        file,
        name: file.name,
        kind,
        task: defaultTask(kind),
        status: 'pending',
        progress: 0,
        info: {},
        trim: { start: 0, end: null },
        transform: { rotate: 0, flipH: false, flipV: false },
        mute: false,
        log: [],
      });
    }

    if (accepted.length > 0) setJobs((current) => [...current, ...accepted]);

    // Metadaten nachreichen – blockiert den Import nicht.
    void Promise.all(
      accepted.map(async (job) => {
        const info = await probeMedia(job.file, job.kind);
        patch(job.id, { info });
      }),
    );

    return rejected;
  }, [patch]);

  /* -------------------------------- Ausfuehren ------------------------------ */

  const runFfmpegJob = useCallback(async (job: Job): Promise<JobResult> => {
    const built = buildJob(job, settingsRef.current);
    const logBuffer: string[] = [];
    let lastFlush = 0;
    let lastProgress = 0;

    const flushLog = () => {
      if (logBuffer.length === 0) return;
      const lines = logBuffer.splice(0, logBuffer.length);
      patch(job.id, (current) => ({
        log: [...current.log, ...lines].slice(-MAX_LOG_LINES),
      }));
    };

    // Sehr grosse Dateien koennen – wenn ausdruecklich eingeschaltet – an die
    // eigene API gehen. Standardmaessig bleibt alles auf dem Geraet.
    if (shouldUseRemote(job.file, settingsRef.current.advanced.useRemoteForLargeFiles)) {
      try {
        const blob = await runRemote(built, job.file, effectiveDuration(job), {
          onLog: (message) => logBuffer.push(message),
          onProgress: (ratio) => patch(job.id, { progress: Math.min(Math.max(ratio, 0), 1) }),
        });
        return {
          blob,
          url: URL.createObjectURL(blob),
          name: built.outName,
          size: blob.size,
        };
      } finally {
        flushLog();
      }
    }

    const data = new Uint8Array(await job.file.arrayBuffer());

    try {
      const files = await ffmpegClient.run(
        {
          inputs: [{ name: built.inputName, data }],
          passes: built.passes,
          fallbackPasses: built.fallbackPasses,
          strategy: built.strategy,
          outputs: built.outputs,
          outputPrefix: built.outputPrefix,
          temps: built.temps,
        },
        {
          onLog: (message) => {
            logBuffer.push(message);
            const now = Date.now();
            if (now - lastFlush > 400) {
              lastFlush = now;
              flushLog();
            }
          },
          onProgress: (ratio) => {
            const clamped = Math.min(Math.max(ratio, 0), 1);
            const now = Date.now();
            if (clamped - lastProgress < 0.005 && clamped < 1) return;
            lastProgress = clamped;
            patch(job.id, (current) => {
              const elapsed = now - (current.startedAt ?? now);
              const etaMs = clamped > 0.02 ? (elapsed / clamped) * (1 - clamped) : undefined;
              return { progress: clamped, etaMs };
            });
          },
        },
      );

      return await materialize(files, built.outName, built.mime, !!built.outputPrefix);
    } finally {
      // Auch im Fehlerfall muss das Protokoll vollstaendig in der Oberflaeche landen.
      flushLog();
    }
  }, [patch]);

  const runImageJob = useCallback(async (job: Job): Promise<JobResult> => {
    const source = await ImageSource.from(job.file);
    try {
      const encoded = await encodeImage(source, settingsRef.current.image, (ratio) =>
        patch(job.id, { progress: ratio }),
      );
      const name = `${safeName(baseName(job.name))}.${imageExtension(encoded.format)}`;
      if (encoded.fallbackNote) {
        patch(job.id, (current) => ({ log: [...current.log, encoded.fallbackNote!] }));
      }
      return {
        blob: encoded.blob,
        url: URL.createObjectURL(encoded.blob),
        name,
        size: encoded.blob.size,
      };
    } finally {
      source.close();
    }
  }, [patch]);

  const processJob = useCallback(
    async (job: Job) => {
      patch(job.id, {
        status: 'running',
        progress: 0,
        startedAt: Date.now(),
        error: undefined,
        etaMs: undefined,
        log: [],
        usedSettings: settingsRef.current,
      });

      try {
        const result = job.task === 'image' ? await runImageJob(job) : await runFfmpegJob(job);
        patch(job.id, {
          status: 'done',
          progress: 1,
          result,
          finishedAt: Date.now(),
          etaMs: undefined,
        });
      } catch (error) {
        if (error instanceof CanceledError || canceledRef.current) {
          patch(job.id, { status: 'canceled', progress: 0, etaMs: undefined });
        } else {
          const raw = error instanceof Error ? error.message : String(error);
          if (
            /undefined is not an object|is not a function|Cannot read propert|out of memory|memory access out of bounds/i.test(
              raw,
            )
          ) {
            // Nach einem WASM-/Worker-Abbruch ist die geladene Instanz nicht
            // mehr zuverlässig. Der nächste Versuch startet mit einem frischen Core.
            ffmpegClient.cancel();
          }
          patch(job.id, (current) => ({
            status: 'error',
            error: explainError(error, current.log),
            log: [...current.log, `FEHLER: ${raw}`].slice(-MAX_LOG_LINES),
            etaMs: undefined,
          }));
        }
      }
    },
    [patch, runFfmpegJob, runImageJob],
  );

  const start = useCallback(async () => {
    if (runningRef.current) return;
    if (!jobsRef.current.some((job) => job.status === 'pending')) return;

    runningRef.current = true;
    canceledRef.current = false;
    setIsRunning(true);
    await acquireWakeLock();

    try {
      const needsFfmpeg = jobsRef.current.some(
        (job) => job.status === 'pending' && job.task !== 'image',
      );
      if (needsFfmpeg && !ffmpegClient.loaded) {
        const largest = jobsRef.current
          .filter((job) => job.status === 'pending' && job.task !== 'image')
          .reduce((max, job) => Math.max(max, job.file.size), 0);
        setCoreLoad({ active: true, ratio: 0 });
        try {
          const animationJobOnIOS =
            isIOS &&
            jobsRef.current.some(
              (job) => job.status === 'pending' && job.task === 'gif',
            );
          const info = await ffmpegClient.ensureLoaded(
            (ratio) => setCoreLoad({ active: true, ratio }),
            { preferSingleThread: preferSingleThreadFor(largest) || animationJobOnIOS },
          );
          setEngine(info);
        } finally {
          setCoreLoad({ active: false, ratio: 1 });
        }
      }

      // Strikt sequentiell: schont den Arbeitsspeicher (iOS Safari beendet den
      // Tab sonst schon bei wenigen hundert MB).
      for (;;) {
        if (canceledRef.current) break;
        const next = jobsRef.current.find((job) => job.status === 'pending');
        if (!next) break;
        // eslint-disable-next-line no-await-in-loop
        await processJob(next);
      }
    } catch (error) {
      const message = explainError(error);
      setJobs((current) =>
        current.map((job) =>
          job.status === 'pending' || job.status === 'running'
            ? { ...job, status: 'error', error: message }
            : job,
        ),
      );
    } finally {
      await releaseWakeLock();
      runningRef.current = false;
      setIsRunning(false);
    }
  }, [processJob]);

  const cancelAll = useCallback(() => {
    canceledRef.current = true;
    ffmpegClient.cancel();
    setJobs((current) =>
      current.map((job) =>
        job.status === 'running' || job.status === 'pending'
          ? { ...job, status: 'canceled', progress: 0, etaMs: undefined }
          : job,
      ),
    );
  }, []);

  const cancelJob = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((entry) => entry.id === id);
      if (!job) return;
      if (job.status === 'running') {
        canceledRef.current = true;
        ffmpegClient.cancel();
      }
      patch(id, { status: 'canceled', progress: 0, etaMs: undefined });
    },
    [patch],
  );

  const retryJob = useCallback(
    (id: string) => {
      const job = jobsRef.current.find((entry) => entry.id === id);
      if (job?.result) URL.revokeObjectURL(job.result.url);
      patch(id, { status: 'pending', progress: 0, error: undefined, result: undefined, log: [] });
      canceledRef.current = false;
      void start();
    },
    [patch, start],
  );

  const removeJob = useCallback((id: string) => {
    setJobs((current) => {
      const job = current.find((entry) => entry.id === id);
      if (job?.result) URL.revokeObjectURL(job.result.url);
      return current.filter((entry) => entry.id !== id);
    });
  }, []);

  const clear = useCallback((which: 'all' | 'done') => {
    setJobs((current) => {
      const keep = current.filter((job) =>
        which === 'all' ? false : job.status !== 'done',
      );
      current
        .filter((job) => !keep.includes(job))
        .forEach((job) => job.result && URL.revokeObjectURL(job.result.url));
      return keep;
    });
  }, []);

  const setTask = useCallback(
    (id: string, task: TaskType) => patch(id, { task, status: 'pending', progress: 0, error: undefined }),
    [patch],
  );

  const applyTaskToAll = useCallback((task: TaskType, kind: MediaKind) => {
    setJobs((current) =>
      current.map((job) => (job.kind === kind && job.status !== 'running' ? { ...job, task } : job)),
    );
  }, []);

  /** Zuschnitt/Drehung eines Jobs auf alle Dateien derselben Art uebertragen. */
  const applyJobOptionsToAll = useCallback((id: string) => {
    setJobs((current) => {
      const source = current.find((job) => job.id === id);
      if (!source) return current;
      return current.map((job) =>
        job.kind === source.kind && job.status !== 'running'
          ? { ...job, task: source.task, transform: source.transform, mute: source.mute }
          : job,
      );
    });
  }, []);

  /* ------------------------------ Zusammenfuegen ---------------------------- */

  const mergeJobs = useCallback(
    async (ids: string[]) => {
      const selected = ids
        .map((id) => jobsRef.current.find((job) => job.id === id))
        .filter((job): job is Job => !!job);
      if (selected.length < 2) return;

      const kind = selected[0].kind;
      if (selected.some((job) => job.kind !== kind) || kind === 'image') return;

      const container = kind === 'video' ? 'mp4' : 'mp3';
      const names = selected.map((job, index) => `merge_${index}.${inputExt(job)}`);
      const outName = `${safeName(baseName(selected[0].name))}-zusammengefuegt.${container}`;
      const built = buildConcat(names, container, outName);

      const mergedJob: Job = {
        id: uid(),
        file: selected[0].file,
        name: outName,
        kind,
        task: kind === 'video' ? 'video' : 'audio',
        status: 'running',
        progress: 0,
        info: {},
        trim: { start: 0, end: null },
        transform: { rotate: 0, flipH: false, flipV: false },
        mute: false,
        log: [],
        merged: true,
        sourceNames: selected.map((job) => job.name),
        startedAt: Date.now(),
      };
      setJobs((current) => [...current, mergedJob]);

      runningRef.current = true;
      setIsRunning(true);
      await acquireWakeLock();

      try {
        if (!ffmpegClient.loaded) {
          setCoreLoad({ active: true, ratio: 0 });
          const info = await ffmpegClient.ensureLoaded((ratio) => setCoreLoad({ active: true, ratio }));
          setEngine(info);
          setCoreLoad({ active: false, ratio: 1 });
        }

        const inputs = await Promise.all(
          selected.map(async (job, index) => ({
            name: names[index],
            data: new Uint8Array(await job.file.arrayBuffer()),
          })),
        );
        const list = names.map((name) => `file '${name}'`).join('\n');
        inputs.push({ name: 'concat.txt', data: new TextEncoder().encode(`${list}\n`) });

        const files = await ffmpegClient.run(
          {
            inputs,
            passes: built.passes,
            strategy: built.strategy,
            outputs: built.outputs,
            temps: built.temps,
          },
          {
            onLog: (message) =>
              patch(mergedJob.id, (current) => ({ log: [...current.log, message].slice(-MAX_LOG_LINES) })),
            onProgress: (ratio) => patch(mergedJob.id, { progress: Math.min(Math.max(ratio, 0), 1) }),
          },
        );

        const result = await materialize(files, built.outName, built.mime, false);
        patch(mergedJob.id, { status: 'done', progress: 1, result, finishedAt: Date.now() });
      } catch (error) {
        patch(mergedJob.id, { status: 'error', error: explainError(error) });
      } finally {
        await releaseWakeLock();
        runningRef.current = false;
        setIsRunning(false);
      }
    },
    [patch],
  );

  const pending = jobs.filter((job) => job.status === 'pending').length;
  const done = jobs.filter((job) => job.status === 'done');
  const overallProgress =
    jobs.length === 0
      ? 0
      : jobs.reduce((sum, job) => sum + (job.status === 'done' ? 1 : job.progress), 0) / jobs.length;

  return {
    jobs,
    pending,
    done,
    isRunning,
    coreLoad,
    engine,
    overallProgress,
    addFiles,
    start,
    cancelAll,
    cancelJob,
    retryJob,
    removeJob,
    clear,
    patch,
    setTask,
    applyTaskToAll,
    applyJobOptionsToAll,
    mergeJobs,
  };
}

function countAsciiChunks(data: Uint8Array, marker: string): number {
  const bytes = [...marker].map((character) => character.charCodeAt(0));
  let count = 0;
  for (let index = 0; index <= data.length - bytes.length; index += 1) {
    if (bytes.every((byte, offset) => data[index + offset] === byte)) count += 1;
  }
  return count;
}

async function materialize(
  files: EngineOutputFile[],
  outName: string,
  mime: string,
  asZip: boolean,
): Promise<JobResult> {
  if (asZip || files.length > 1) {
    const zip = await createZip(
      files.map((file) => ({ name: file.name, blob: new Blob([file.data as BlobPart]) })),
      outName,
    );
    return {
      blob: zip,
      url: URL.createObjectURL(zip),
      name: outName,
      size: zip.size,
      extras: files.map((file) => ({ name: file.name, blob: new Blob([file.data as BlobPart]) })),
    };
  }

  if (
    mime === 'image/webp' &&
    (!files[0] || countAsciiChunks(files[0].data, 'ANIM') === 0 ||
      countAsciiChunks(files[0].data, 'ANMF') < 2)
  ) {
    throw new Error(
      'Die WebP-Datei enthält nur ein Standbild. Nutze für WhatsApp bitte den neuen MP4-Export.',
    );
  }

  const blob = new Blob([files[0].data as BlobPart], { type: mime });
  return { blob, url: URL.createObjectURL(blob), name: outName, size: blob.size };
}
