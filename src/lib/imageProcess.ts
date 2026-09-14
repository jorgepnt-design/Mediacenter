import type { ImageFormat, ImageSettings } from '../types';
import { extractJpegExif, injectJpegExif } from './exif';
import { imageMime, isHeic } from './formats';
import { hasOffscreenCanvas, supportsAvifEncode, supportsWebpEncode } from './platform';

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Drawable = CanvasImageSource & { width: number; height: number };

export interface EncodedImage {
  blob: Blob;
  width: number;
  height: number;
  quality: number;
  /** Tatsaechlich verwendetes Format – kann vom Wunsch abweichen (Fallback). */
  format: ImageFormat;
  fallbackNote?: string;
}

/** Ein einmal dekodiertes Bild, das fuer Vorschau und Export wiederverwendet wird. */
export class ImageSource {
  private constructor(
    private readonly drawable: Drawable,
    readonly width: number,
    readonly height: number,
    readonly exif: Uint8Array | null,
    readonly sourceIsJpeg: boolean,
  ) {}

  static async from(file: File): Promise<ImageSource> {
    let blob: Blob = file;
    if (isHeic(file)) blob = await decodeHeic(file);

    const sourceIsJpeg = /jpe?g/i.test(blob.type) || /\.jpe?g$/i.test(file.name);
    let exif: Uint8Array | null = null;
    if (sourceIsJpeg) {
      try {
        exif = extractJpegExif(await blob.arrayBuffer());
      } catch {
        exif = null;
      }
    }

    const drawable = await toDrawable(blob);
    return new ImageSource(drawable, drawable.width, drawable.height, exif, sourceIsJpeg);
  }

  close(): void {
    if (typeof ImageBitmap !== 'undefined' && this.drawable instanceof ImageBitmap) {
      this.drawable.close();
    }
  }

  /** Zielabmessungen aus den Einstellungen berechnen. */
  targetSize(settings: ImageSettings): { width: number; height: number } {
    const ratio = this.width / this.height;
    let width = this.width;
    let height = this.height;

    switch (settings.resizeMode) {
      case 'width':
        width = Math.max(1, Math.round(settings.width));
        height = settings.lockAspect
          ? Math.max(1, Math.round(width / ratio))
          : Math.max(1, Math.round(settings.height));
        break;
      case 'height':
        height = Math.max(1, Math.round(settings.height));
        width = settings.lockAspect
          ? Math.max(1, Math.round(height * ratio))
          : Math.max(1, Math.round(settings.width));
        break;
      case 'percent': {
        const factor = Math.max(1, settings.percent) / 100;
        width = Math.max(1, Math.round(this.width * factor));
        height = Math.max(1, Math.round(this.height * factor));
        break;
      }
      default:
        break;
    }

    if (settings.noUpscale && (width > this.width || height > this.height)) {
      const shrink = Math.min(this.width / width, this.height / height);
      width = Math.max(1, Math.round(width * shrink));
      height = Math.max(1, Math.round(height * shrink));
    }
    return { width, height };
  }

  render(width: number, height: number, background: string | null): AnyCanvas {
    // Grosse Verkleinerungen schrittweise halbieren – das erhaelt Details.
    let currentSource: Drawable | AnyCanvas = this.drawable;
    let currentWidth = this.width;
    let currentHeight = this.height;

    while (currentWidth / 2 >= width && currentHeight / 2 >= height && currentWidth > 2) {
      const halfWidth = Math.max(width, Math.floor(currentWidth / 2));
      const halfHeight = Math.max(height, Math.floor(currentHeight / 2));
      const step = makeCanvas(halfWidth, halfHeight);
      const stepCtx = context2d(step);
      stepCtx.imageSmoothingEnabled = true;
      stepCtx.imageSmoothingQuality = 'high';
      stepCtx.drawImage(currentSource as CanvasImageSource, 0, 0, halfWidth, halfHeight);
      currentSource = step;
      currentWidth = halfWidth;
      currentHeight = halfHeight;
    }

    const canvas = makeCanvas(width, height);
    const ctx = context2d(canvas);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(currentSource as CanvasImageSource, 0, 0, width, height);
    return canvas;
  }
}

async function decodeHeic(file: File): Promise<Blob> {
  const { default: heic2any } = await import('heic2any');
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
  return Array.isArray(converted) ? converted[0] : converted;
}

async function toDrawable(blob: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      return (await createImageBitmap(blob, { imageOrientation: 'from-image' })) as Drawable;
    } catch {
      try {
        return (await createImageBitmap(blob)) as Drawable;
      } catch {
        /* auf <img> ausweichen */
      }
    }
  }
  return loadViaImageElement(blob);
}

function loadViaImageElement(blob: Blob): Promise<Drawable> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image as unknown as Drawable);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Das Bildformat konnte von diesem Browser nicht gelesen werden.'));
    };
    image.src = url;
  });
}

function makeCanvas(width: number, height: number): AnyCanvas {
  if (hasOffscreenCanvas) return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: AnyCanvas): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Canvas konnte nicht initialisiert werden.');
  return ctx;
}

function canvasToBlob(canvas: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht kodiert werden.'))),
      type,
      quality,
    );
  });
}

/** Zielformat gegen die Browserfaehigkeiten pruefen und notfalls ausweichen. */
export async function resolveImageFormat(
  format: ImageFormat,
): Promise<{ format: ImageFormat; note?: string }> {
  if (format === 'avif' && !(await supportsAvifEncode())) {
    if (await supportsWebpEncode()) {
      return { format: 'webp', note: 'AVIF wird von diesem Browser nicht kodiert – WebP verwendet.' };
    }
    return { format: 'jpeg', note: 'AVIF wird von diesem Browser nicht kodiert – JPEG verwendet.' };
  }
  if (format === 'webp' && !(await supportsWebpEncode())) {
    return { format: 'jpeg', note: 'WebP wird von diesem Browser nicht kodiert – JPEG verwendet.' };
  }
  return { format };
}

export async function encodeImage(
  source: ImageSource,
  settings: ImageSettings,
  onProgress?: (ratio: number) => void,
): Promise<EncodedImage> {
  const { format, note } = await resolveImageFormat(settings.format);
  const { width, height } = source.targetSize(settings);
  const needsBackground = format === 'jpeg';
  const canvas = source.render(width, height, needsBackground ? settings.background : null);
  const mime = imageMime(format);
  const lossless = format === 'png';

  onProgress?.(0.3);

  let quality = lossless ? 1 : settings.quality;
  let blob = await canvasToBlob(canvas, mime, quality);

  // Zielgroesse in kB: Qualitaet per Intervallhalbierung suchen.
  if (!lossless && settings.targetKB && settings.targetKB > 0) {
    const targetBytes = settings.targetKB * 1024;
    let low = 0.05;
    let high = 0.98;
    let best = blob;
    let bestQuality = quality;
    for (let step = 0; step < 8; step += 1) {
      const mid = (low + high) / 2;
      // eslint-disable-next-line no-await-in-loop
      const candidate = await canvasToBlob(canvas, mime, mid);
      onProgress?.(0.3 + (step / 8) * 0.6);
      if (candidate.size > targetBytes) {
        high = mid;
      } else {
        best = candidate;
        bestQuality = mid;
        low = mid;
      }
      if (Math.abs(candidate.size - targetBytes) / targetBytes < 0.03) {
        best = candidate;
        bestQuality = mid;
        break;
      }
    }
    blob = best;
    quality = bestQuality;
  }

  // Metadaten behalten: nur JPEG -> JPEG laesst sich verlustfrei uebertragen.
  let finalNote = note;
  if (!settings.stripMetadata) {
    if (format === 'jpeg' && source.exif) {
      blob = await injectJpegExif(blob, source.exif);
    } else if (source.sourceIsJpeg && format !== 'jpeg') {
      finalNote = [note, 'Metadaten lassen sich nur bei JPEG→JPEG übernehmen.']
        .filter(Boolean)
        .join(' ');
    }
  }

  onProgress?.(1);
  return { blob, width, height, quality, format, fallbackNote: finalNote };
}
