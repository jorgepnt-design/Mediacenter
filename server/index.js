/**
 * Optionale Server-Variante von Mediacenter.
 *
 * Nimmt dieselben Presets wie die Web-App entgegen und fuehrt sie mit nativem
 * ffmpeg aus – sinnvoll fuer sehr grosse Dateien (> 2 GB) oder AV1 in
 * brauchbarer Geschwindigkeit. Die Web-App nutzt diese API nur, wenn sie
 * ausdruecklich konfiguriert und eingeschaltet wurde.
 */
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { ValidationError, validatePasses } from './validate.js';

const PORT = Number(process.env.PORT ?? 8080);
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 8 * 1024 ** 3);
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS ?? 30 * 60 * 1000);

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? true }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (request, file, done) => done(null, request.jobDir),
    filename: (request, file, done) => done(null, file.originalname),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 20 },
});

/** @type {Map<string, {status: string, progress: number, error?: string, dir: string, output?: string, mime?: string, outName?: string, created: number}>} */
const jobs = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.created > JOB_TTL_MS) {
      void rm(job.dir, { recursive: true, force: true });
      jobs.delete(id);
    }
  }
}, 60_000).unref();

app.get('/api/health', (request, response) => {
  response.json({ ok: true, ffmpeg: FFMPEG, maxUploadBytes: MAX_UPLOAD_BYTES });
});

app.post(
  '/api/jobs',
  async (request, response, next) => {
    try {
      request.jobDir = await mkdtemp(path.join(tmpdir(), 'mediacenter-'));
      next();
    } catch (error) {
      next(error);
    }
  },
  (request, response, next) => upload.array('files')(request, response, next),
  async (request, response) => {
    const dir = request.jobDir;
    let spec;
    try {
      spec = JSON.parse(request.body.job ?? '{}');
      const inputs = (request.files ?? []).map((file) => file.filename);
      if (inputs.length === 0) throw new ValidationError('Keine Datei empfangen.');
      validatePasses(spec.passes, {
        inputs,
        outputs: spec.outputs ?? [],
        temps: spec.temps ?? [],
      });
    } catch (error) {
      await rm(dir, { recursive: true, force: true });
      const message = error instanceof ValidationError ? error.message : 'Ungültige Anfrage.';
      response.status(400).json({ error: message });
      return;
    }

    const id = randomUUID();
    jobs.set(id, { status: 'running', progress: 0, dir, created: Date.now() });
    response.status(202).json({ id });

    void runJob(id, spec);
  },
);

app.get('/api/jobs/:id', (request, response) => {
  const job = jobs.get(request.params.id);
  if (!job) {
    response.status(404).json({ error: 'Unbekannter Auftrag.' });
    return;
  }
  response.json({ status: job.status, progress: job.progress, error: job.error });
});

app.get('/api/jobs/:id/result', async (request, response) => {
  const job = jobs.get(request.params.id);
  if (!job || job.status !== 'done' || !job.output) {
    response.status(404).json({ error: 'Kein Ergebnis vorhanden.' });
    return;
  }
  const file = path.join(job.dir, job.output);
  const info = await stat(file);
  response.setHeader('Content-Type', job.mime ?? 'application/octet-stream');
  response.setHeader('Content-Length', String(info.size));
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(job.outName ?? job.output)}"`,
  );
  createReadStream(file).pipe(response);
});

app.delete('/api/jobs/:id', async (request, response) => {
  const job = jobs.get(request.params.id);
  if (job) {
    await rm(job.dir, { recursive: true, force: true });
    jobs.delete(request.params.id);
  }
  response.status(204).end();
});

async function runJob(id, spec) {
  const job = jobs.get(id);
  if (!job) return;

  const durationSec = Number(spec.durationSec) || 0;
  const passes = spec.passes;

  try {
    for (let index = 0; index < passes.length; index += 1) {
      const base = index / passes.length;
      // eslint-disable-next-line no-await-in-loop
      const code = await runFfmpeg(job.dir, passes[index].args, (seconds) => {
        job.progress = durationSec
          ? Math.min(1, base + (seconds / durationSec) * (1 / passes.length))
          : base;
      });
      if (code !== 0) {
        if (spec.strategy === 'firstSuccess' && index < passes.length - 1) continue;
        throw new Error(`ffmpeg endete mit Code ${code}.`);
      }
      if (spec.strategy === 'firstSuccess') break;
    }

    job.output = (spec.outputs ?? [])[0];
    job.outName = spec.outName ?? job.output;
    job.mime = spec.mime;
    job.progress = 1;
    job.status = 'done';
  } catch (error) {
    job.status = 'error';
    job.error = error instanceof Error ? error.message : String(error);
  }
}

function runFfmpeg(cwd, args, onProgress) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-progress', 'pipe:1', ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      const match = /out_time_us=(\d+)/.exec(chunk);
      if (match) onProgress(Number(match[1]) / 1_000_000);
    });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  response.status(500).json({ error: error?.message ?? 'Serverfehler.' });
});

app.listen(PORT, () => {
  console.log(`Mediacenter-API läuft auf Port ${PORT}`);
});
