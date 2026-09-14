/**
 * Kopiert die ffmpeg.wasm-Cores nach public/ffmpeg, damit sie unveraendert und
 * unter einer stabilen URL ausgeliefert werden (gut fuer den Service-Worker-Cache).
 * Laeuft automatisch vor "dev" und "build".
 */
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { from: 'node_modules/@ffmpeg/core/dist/esm', to: 'public/ffmpeg/st' },
  { from: 'node_modules/@ffmpeg/core-mt/dist/esm', to: 'public/ffmpeg/mt' },
];

for (const { from, to } of targets) {
  const source = resolve(root, from);
  const destination = resolve(root, to);
  if (!existsSync(source)) {
    console.warn(`[ffmpeg-core] ${from} nicht gefunden – übersprungen.`);
    continue;
  }
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
  console.log(`[ffmpeg-core] ${from} -> ${to}`);
}
