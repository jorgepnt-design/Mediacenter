import { useEffect, useRef, useState } from 'react';

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  file: (cb: (file: File) => void, err?: (error: unknown) => void) => void;
  createReader: () => { readEntries: (cb: (entries: FileSystemEntryLike[]) => void, err?: (e: unknown) => void) => void };
};

async function readDirectory(entry: FileSystemEntryLike): Promise<File[]> {
  const reader = entry.createReader();
  const collected: File[] = [];
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const batch = await new Promise<FileSystemEntryLike[]>((resolve) =>
      reader.readEntries(resolve, () => resolve([])),
    );
    if (batch.length === 0) break;
    // eslint-disable-next-line no-await-in-loop
    const nested = await Promise.all(batch.map((child) => entryToFiles(child)));
    nested.forEach((files) => collected.push(...files));
  }
  return collected;
}

async function entryToFiles(entry: FileSystemEntryLike | null): Promise<File[]> {
  if (!entry) return [];
  if (entry.isFile) {
    return new Promise<File[]>((resolve) =>
      entry.file(
        (file) => resolve([file]),
        () => resolve([]),
      ),
    );
  }
  if (entry.isDirectory) return readDirectory(entry);
  return [];
}

/** Dateien aus einem Drop lesen – inklusive kompletter Ordner. */
export async function filesFromDataTransfer(transfer: DataTransfer): Promise<File[]> {
  const items = Array.from(transfer.items ?? []);
  const entries = items
    .filter((item) => item.kind === 'file')
    .map((item) =>
      'webkitGetAsEntry' in item
        ? (item.webkitGetAsEntry() as unknown as FileSystemEntryLike | null)
        : null,
    );

  if (entries.some(Boolean)) {
    const nested = await Promise.all(entries.map((entry) => entryToFiles(entry)));
    const files = nested.flat();
    if (files.length > 0) return files;
  }
  return Array.from(transfer.files ?? []);
}

/**
 * Ganzseitiges Drop-Ziel plus Einfuegen aus der Zwischenablage.
 * Auf Touch-Geraeten spielt das keine Rolle – dort zaehlen die Import-Buttons.
 */
export function useGlobalImport(onFiles: (files: File[]) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handler = useRef(onFiles);
  handler.current = onFiles;

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = async (event: DragEvent) => {
      if (!event.dataTransfer) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = await filesFromDataTransfer(event.dataTransfer);
      if (files.length > 0) handler.current(files);
    };
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        handler.current(files);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  return dragging;
}
