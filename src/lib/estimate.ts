import type { ExtractSettings, Job, SettingsState, VideoSettings } from '../types';
import { effectiveDuration } from './ffmpegArgs';

export interface SizeEstimate {
  bytes: number;
  /**
   * 'exact' – Bitrate oder Zielgröße sind vorgegeben, die Rechnung geht auf.
   * 'rough' – bei CRF hängt das Ergebnis vom Bildinhalt ab; ruhige Aufnahmen
   *           werden kleiner, viel Bewegung größer.
   */
  accuracy: 'exact' | 'rough';
}

const RESOLUTION_VALUES: Record<string, number> = {
  '2160': 2160, '1440': 1440, '1080': 1080, '720': 720, '480': 480, '360': 360,
};

/**
 * Bits pro Pixel und Bild bei CRF 23. Grober, aber brauchbarer Erfahrungswert;
 * je 6 CRF-Stufen halbiert bzw. verdoppelt sich die Bitrate ungefähr.
 */
const BITS_PER_PIXEL_AT_CRF23: Record<VideoSettings['codec'], number> = {
  h264: 0.095,
  h265: 0.06,
  vp9: 0.065,
  av1: 0.05,
};

/** Bildrate, wenn sie sich aus der Datei nicht ablesen ließ. */
const ASSUMED_FPS = 30;

/** Untergrenze, damit die Schätzung nie auf null fällt. */
const MIN_VIDEO_KBIT = 32;

/**
 * Letzter Rueckfall, wenn der Browser keine Mediendauer liefert. Aus Dateityp
 * und Aufloesung wird eine typische Quellbitrate angenommen. Das Ergebnis wird
 * spaeter immer als grober Schaetzwert gekennzeichnet.
 */
function estimatedDurationFromFile(job: Job): number {
  const sourceKbit = (() => {
    if (job.kind === 'audio') {
      const extension = job.name.split('.').pop()?.toLowerCase();
      if (extension === 'wav') return 1411;
      if (extension === 'flac') return 850;
      if (extension === 'aac' || extension === 'm4a' || extension === 'ogg' || extension === 'opus') {
        return 160;
      }
      return 192;
    }

    const pixels = (job.info.width ?? 0) * (job.info.height ?? 0);
    if (pixels === 0) return 5000;
    if (pixels <= 640 * 480) return 1500;
    if (pixels <= 1280 * 720) return 3000;
    if (pixels <= 1920 * 1080) return 6000;
    if (pixels <= 2560 * 1440) return 10_000;
    return 18_000;
  })();

  return Math.max(0.1, (job.file.size * 8) / 1000 / sourceKbit);
}

/** Zielabmessungen aus Quellgröße und Auflösungseinstellung. */
export function targetDimensions(
  job: Job,
  video: VideoSettings,
): { width: number; height: number } | null {
  const sourceWidth = job.info.width;
  const sourceHeight = job.info.height;
  if (!sourceWidth || !sourceHeight) return null;

  if (video.resolution === 'original') return { width: sourceWidth, height: sourceHeight };

  if (video.resolution === 'custom') {
    const width = Math.min(sourceWidth, Math.max(2, video.customWidth));
    return { width, height: Math.round((width / sourceWidth) * sourceHeight) };
  }

  // Begrenzt die kürzere Kante – genau wie der Skalierungsfilter.
  const limit = RESOLUTION_VALUES[video.resolution];
  const shortSide = Math.min(sourceWidth, sourceHeight);
  if (shortSide <= limit) return { width: sourceWidth, height: sourceHeight };
  const factor = limit / shortSide;
  return {
    width: Math.round(sourceWidth * factor),
    height: Math.round(sourceHeight * factor),
  };
}

function audioKbitFor(settings: ExtractSettings): number {
  switch (settings.format) {
    case 'wav': {
      const rate = settings.sampleRate === 'original' ? 44100 : settings.sampleRate;
      const channels = settings.channels === 'original' ? 2 : settings.channels;
      return (rate * 16 * channels) / 1000;
    }
    case 'flac': {
      const rate = settings.sampleRate === 'original' ? 44100 : settings.sampleRate;
      const channels = settings.channels === 'original' ? 2 : settings.channels;
      return (rate * 16 * channels * 0.6) / 1000;
    }
    default:
      // VBR: -q:a 2 landet bei MP3 ungefähr bei 190 kbit/s.
      return settings.bitrate === 0 ? 190 : settings.bitrate;
  }
}

function videoKbitFor(job: Job, video: VideoSettings, durationSec: number): number | null {
  if (video.rateMode === 'bitrate') return video.videoBitrate;

  const dimensions = targetDimensions(job, video);
  if (!dimensions) {
    const sourceKbit = (job.file.size * 8) / 1000 / durationSec;
    const codecRatio =
      BITS_PER_PIXEL_AT_CRF23[video.codec] / BITS_PER_PIXEL_AT_CRF23.h264;
    const qualityRatio = 2 ** ((23 - video.crf) / 6);
    return Math.max(
      MIN_VIDEO_KBIT,
      Math.min(sourceKbit * 1.25, sourceKbit * codecRatio * qualityRatio * 0.85),
    );
  }

  const fps = video.fps === 'original' ? ASSUMED_FPS : video.fps;
  const bitsPerPixel =
    BITS_PER_PIXEL_AT_CRF23[video.codec] * 2 ** ((23 - video.crf) / 6);
  const estimated = (dimensions.width * dimensions.height * fps * bitsPerPixel) / 1000;

  // Nach oben durch die Quelle begrenzen: aus einem stark komprimierten Video
  // wird beim Verkleinern nicht plötzlich ein größeres.
  const sourcePixels = (job.info.width ?? 0) * (job.info.height ?? 0);
  if (sourcePixels > 0) {
    const sourceKbit = (job.file.size * 8) / 1000 / (job.info.durationSec ?? durationSec);
    const pixelRatio = (dimensions.width * dimensions.height) / sourcePixels;
    // Die untere Schranke muss klein bleiben, sonst sticht sie die Begrenzung
    // durch die Quelle aus und ohnehin winzige Dateien werden zu groß geschätzt.
    return Math.max(MIN_VIDEO_KBIT, Math.min(estimated, sourceKbit * pixelRatio));
  }
  return Math.max(MIN_VIDEO_KBIT, estimated);
}

/**
 * Schätzt die Dateigröße nach der Umwandlung. Gibt null zurück, wenn dafür
 * Angaben fehlen (etwa die Laufzeit) oder das Ergebnis zu stark vom Bildinhalt
 * abhängt (GIF, Einzelbilder) – dann lieber nichts anzeigen als etwas Falsches.
 */
export function estimateOutputSize(job: Job, settings: SettingsState): SizeEstimate | null {
  // Eine vorgegebene Zielgroesse ist auch ohne auslesbare Laufzeit exakt.
  if (job.task === 'video' && settings.video.rateMode === 'size') {
    return { bytes: settings.video.targetSizeMB * 1024 * 1024, accuracy: 'exact' };
  }

  const measuredDuration = effectiveDuration(job);
  const duration = measuredDuration ?? estimatedDurationFromFile(job);
  if (!duration || duration <= 0) return null;
  const durationIsEstimated = measuredDuration === undefined;

  if (job.task === 'extract' || job.task === 'audio') {
    const audio = job.task === 'extract' ? settings.extract : settings.audio;
    if (audio.copyIfPossible && !audio.normalize) {
      // Kopieren ändert die Größe kaum – aber ob kopiert werden kann, steht
      // erst beim Lauf fest. Deshalb hier die Kodier-Schätzung.
      return { bytes: (audioKbitFor(audio) * 1000 * duration) / 8, accuracy: 'rough' };
    }
    return {
      bytes: (audioKbitFor(audio) * 1000 * duration) / 8,
      accuracy: durationIsEstimated ? 'rough' : 'exact',
    };
  }

  if (job.task !== 'video') return null;

  const video = settings.video;

  const videoKbit = videoKbitFor(job, video, duration);
  if (videoKbit === null) return null;

  const audioKbit =
    video.audioMode === 'none' || job.mute
      ? 0
      : video.audioMode === 'encode'
        ? video.audioBitrate
        : 128; // "behalten" – der Wert der Quelle ist unbekannt

  const bytes = (((videoKbit + audioKbit) * 1000 * duration) / 8) * 1.02; // Container-Overhead

  if (video.rateMode === 'bitrate') {
    return { bytes, accuracy: durationIsEstimated ? 'rough' : 'exact' };
  }

  // Ohne Vergrößerung wird eine Datei beim Neukodieren praktisch nie größer als
  // die Quelle. Der Deckel fängt Ausreißer bei ohnehin kleinen oder tonlosen
  // Dateien ab – dort schlägt die angenommene Tonspur sonst voll durch.
  const dimensions = targetDimensions(job, video);
  const sourcePixels = (job.info.width ?? 0) * (job.info.height ?? 0);
  const pixelRatio =
    dimensions && sourcePixels > 0
      ? (dimensions.width * dimensions.height) / sourcePixels
      : 1;

  return {
    bytes: pixelRatio <= 1 ? Math.min(bytes, job.file.size) : bytes,
    accuracy: 'rough',
  };
}
