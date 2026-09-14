/**
 * Kopiert die ffmpeg.wasm-Cores nach public/ffmpeg, damit sie unveraendert und
 * unter einer stabilen URL ausgeliefert werden (gut fuer den Service-Worker-Cache).
 * Laeuft automatisch vor "dev" und "build".
 */
import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  patchPrintErr(resolve(destination, 'ffmpeg-core.js'));
  console.log(`[ffmpeg-core] ${from} -> ${to}`);
}

/**
 * Der ausgelieferte Core ruft in printErr() ungeprüft message.startsWith() auf.
 * Bricht ffmpeg intern ab (typischerweise bei Speichermangel), bekommt printErr
 * einen Wert, der kein String ist – der dadurch ausgelöste TypeError überdeckt
 * dann die eigentliche Fehlerursache. Diese Typprüfung stellt sicher, dass die
 * echte ffmpeg-Meldung sichtbar bleibt.
 */
function patchPrintErr(file) {
  const original = 'function printErr(message){if(!message.startsWith(';
  const patched = 'function printErr(message){if(typeof message!=="string"||!message.startsWith(';
  const code = readFileSync(file, 'utf8');

  if (code.includes(patched)) return;
  if (!code.includes(original)) {
    console.warn(`[ffmpeg-core] printErr in ${file} nicht gefunden – Patch übersprungen.`);
    return;
  }
  writeFileSync(file, code.replace(original, patched));
  console.log('[ffmpeg-core] printErr abgesichert (Typprüfung ergänzt)');
}
