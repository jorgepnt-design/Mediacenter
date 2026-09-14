/**
 * Die Web-App schickt dieselbe ffmpeg-Argumentliste, die sie sonst lokal
 * ausfuehren wuerde. Damit daraus kein Einfallstor wird, sind nur Dateinamen
 * aus dem Job-Verzeichnis erlaubt – keine Pfade, keine Protokolle.
 */

const ALLOWED_ABSOLUTE = new Set(['/dev/null']);
const NAME_PATTERN = /^[A-Za-z0-9._%-]{1,80}$/;
const MAX_ARGS = 80;
const MAX_ARG_LENGTH = 400;

export class ValidationError extends Error {}

function assertName(value, allowed, what) {
  if (!allowed.has(value)) {
    throw new ValidationError(`Unerlaubter ${what}: ${value}`);
  }
}

export function validatePasses(passes, { inputs, outputs, temps = [] }) {
  if (!Array.isArray(passes) || passes.length === 0 || passes.length > 4) {
    throw new ValidationError('Ungültige Durchgänge.');
  }

  const known = new Set([...inputs, ...outputs, ...temps]);
  for (const name of known) {
    if (!NAME_PATTERN.test(name)) throw new ValidationError(`Ungültiger Dateiname: ${name}`);
  }

  for (const pass of passes) {
    const args = pass?.args;
    if (!Array.isArray(args) || args.length === 0 || args.length > MAX_ARGS) {
      throw new ValidationError('Ungültige Argumentliste.');
    }

    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (typeof arg !== 'string' || arg.length === 0 || arg.length > MAX_ARG_LENGTH) {
        throw new ValidationError('Ungültiges Argument.');
      }
      if (arg.includes('\0')) throw new ValidationError('Ungültiges Argument.');
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(arg) || arg.startsWith('file:')) {
        throw new ValidationError('Protokolle sind nicht erlaubt.');
      }
      if (arg.includes('..')) throw new ValidationError('Relative Pfade sind nicht erlaubt.');
      if (arg.startsWith('/') && !ALLOWED_ABSOLUTE.has(arg)) {
        throw new ValidationError('Absolute Pfade sind nicht erlaubt.');
      }
      if (arg.includes('/') && !ALLOWED_ABSOLUTE.has(arg)) {
        throw new ValidationError('Pfadangaben sind nicht erlaubt.');
      }

      // Jede Eingabe muss eine hochgeladene Datei sein.
      if (arg === '-i') {
        const target = args[index + 1];
        assertName(target, known, 'Eingabename');
      }
    }

    // Letztes Argument ist die Ausgabe (ausser beim Analyse-Durchgang).
    const last = args[args.length - 1];
    if (!ALLOWED_ABSOLUTE.has(last) && last !== '-') {
      if (!NAME_PATTERN.test(last)) throw new ValidationError('Ungültiger Ausgabename.');
      const isKnown = known.has(last) || /^[A-Za-z0-9._-]+%\d*d\.[a-z0-9]+$/.test(last);
      if (!isKnown) throw new ValidationError(`Unerlaubter Ausgabename: ${last}`);
    }
  }
}
