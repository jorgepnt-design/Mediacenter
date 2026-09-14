/**
 * Minimaler EXIF-Transfer fuer JPEG. Canvas verwirft beim Neukodieren saemtliche
 * Metadaten – wer sie behalten moechte, bekommt das APP1-Segment zurueck in die
 * Zieldatei gespleisst.
 */

const SOI = 0xffd8;

export function extractJpegExif(buffer: ArrayBuffer): Uint8Array | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== SOI) return null;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null; // Bilddaten erreicht
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    if (marker === 0xe1) {
      const header = new Uint8Array(buffer, offset + 4, Math.min(6, length - 2));
      const isExif =
        header[0] === 0x45 && header[1] === 0x78 && header[2] === 0x69 && header[3] === 0x66;
      if (isExif) return new Uint8Array(buffer.slice(offset, offset + 2 + length));
    }
    offset += 2 + length;
  }
  return null;
}

export async function injectJpegExif(jpeg: Blob, exif: Uint8Array): Promise<Blob> {
  const buffer = await jpeg.arrayBuffer();
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== SOI) return jpeg;

  // Hinter SOI einfuegen, ein vorhandenes APP0/JFIF aber stehen lassen.
  let insertAt = 2;
  if (view.byteLength > 4 && view.getUint8(2) === 0xff && view.getUint8(3) === 0xe0) {
    insertAt = 4 + view.getUint16(4);
  }

  return new Blob(
    [buffer.slice(0, insertAt), exif as unknown as BlobPart, buffer.slice(insertAt)],
    { type: 'image/jpeg' },
  );
}
