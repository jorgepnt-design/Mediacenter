import { downloadZip } from 'client-zip';
import { safeName } from './format';

export interface ZipEntry {
  name: string;
  blob: Blob;
}

/** Erstellt ein ZIP im Arbeitsspeicher – ohne Server, ohne Zwischenspeicher. */
export async function createZip(entries: ZipEntry[], zipName = 'mediacenter.zip'): Promise<File> {
  const used = new Set<string>();
  const unique = entries.map((entry) => {
    let name = safeName(entry.name);
    let counter = 2;
    while (used.has(name)) {
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      name = `${stem}-${counter}${ext}`;
      counter += 1;
    }
    used.add(name);
    return { name, input: entry.blob, lastModified: new Date() };
  });

  const blob = await downloadZip(unique).blob();
  return new File([blob], zipName, { type: 'application/zip' });
}
