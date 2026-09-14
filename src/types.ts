/** Zentrale Typdefinitionen der App. */

export type MediaKind = 'video' | 'audio' | 'image';

/** Was mit einer Datei geschehen soll. */
export type TaskType =
  | 'video' // konvertieren / komprimieren
  | 'extract' // Audiospur aus Video extrahieren
  | 'gif' // Video -> GIF / animiertes WebP
  | 'frame' // Einzelbild / Bildsequenz aus Video
  | 'audio' // Audio konvertieren / komprimieren
  | 'image'; // Bild konvertieren / komprimieren

export type JobStatus = 'pending' | 'running' | 'done' | 'error' | 'canceled';

export type VideoContainer = 'mp4' | 'webm' | 'mkv' | 'mov' | 'gif';
export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'av1';
export type EncoderSpeed = 'ultrafast' | 'veryfast' | 'fast' | 'medium' | 'slow';
export type AudioFormat = 'mp3' | 'wav' | 'aac' | 'm4a' | 'flac' | 'ogg' | 'opus';
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif';
export type ResolutionPreset =
  | 'original'
  | '2160'
  | '1440'
  | '1080'
  | '720'
  | '480'
  | '360'
  | 'custom';

export interface TrimRange {
  /** Sekunden ab Dateianfang. */
  start: number;
  /** Sekunden ab Dateianfang; null = bis zum Ende. */
  end: number | null;
}

export interface Transform {
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface VideoSettings {
  container: Exclude<VideoContainer, 'gif'>;
  preset: 'small' | 'balanced' | 'high' | 'custom';
  rateMode: 'crf' | 'bitrate' | 'size';
  crf: number;
  videoBitrate: number; // kbit/s
  targetSizeMB: number;
  resolution: ResolutionPreset;
  customWidth: number;
  fps: number | 'original';
  codec: VideoCodec;
  speed: EncoderSpeed;
  audioMode: 'copy' | 'encode' | 'none';
  audioBitrate: number; // kbit/s
  stripExtras: boolean; // Untertitel-/Metadatenspuren entfernen
}

export interface ExtractSettings {
  format: AudioFormat;
  /** Konstante Bitrate in kbit/s; 0 = VBR. */
  bitrate: number;
  vbrQuality: number; // libmp3lame -q:a 0..9
  copyIfPossible: boolean;
  sampleRate: number | 'original';
  channels: 'original' | 1 | 2;
  normalize: boolean;
}

export type AudioSettings = ExtractSettings;

export interface GifSettings {
  format: 'gif' | 'webp' | 'mp4';
  fps: number;
  width: number;
  loop: boolean;
  optimizePalette: boolean;
}

export interface FrameSettings {
  mode: 'single' | 'sequence';
  time: number; // Sekunde fuer Einzelbild
  fps: number; // Bilder pro Sekunde fuer Sequenz
  format: 'png' | 'jpg';
  width: number | 'original';
}

export interface ImageSettings {
  format: ImageFormat;
  quality: number; // 0..1
  targetKB: number | null;
  resizeMode: 'none' | 'width' | 'height' | 'percent';
  width: number;
  height: number;
  percent: number;
  lockAspect: boolean;
  noUpscale: boolean;
  stripMetadata: boolean;
  background: string; // Hintergrund bei Transparenz -> JPEG
}

export interface AdvancedSettings {
  /** Sehr grosse Dateien ueber die optionale Server-API verarbeiten. */
  useRemoteForLargeFiles: boolean;
}

export interface SettingsState {
  advanced: AdvancedSettings;
  video: VideoSettings;
  extract: ExtractSettings;
  gif: GifSettings;
  frame: FrameSettings;
  audio: AudioSettings;
  image: ImageSettings;
}

export interface JobResult {
  blob: Blob;
  url: string;
  name: string;
  size: number;
  /** Zusaetzliche Dateien, z. B. eine Bildsequenz. */
  extras?: { name: string; blob: Blob }[];
}

export interface MediaInfo {
  durationSec?: number;
  width?: number;
  height?: number;
}

export interface Job {
  id: string;
  file: File;
  name: string;
  kind: MediaKind;
  task: TaskType;
  status: JobStatus;
  progress: number; // 0..1
  info: MediaInfo;
  trim: TrimRange;
  transform: Transform;
  mute: boolean;
  /** Eingefrorene Einstellungen, mit denen der Job gestartet wurde. */
  usedSettings?: SettingsState;
  result?: JobResult;
  error?: string;
  log: string[];
  startedAt?: number;
  finishedAt?: number;
  etaMs?: number;
  /** Ergebnis eines Zusammenfuegen-Vorgangs (nicht einzeln wiederholbar). */
  merged?: boolean;
  sourceNames?: string[];
}

/** Nachrichten an den ffmpeg-Worker. */
export interface EngineInput {
  name: string;
  data: Uint8Array;
}

export interface EnginePass {
  args: string[];
  /** Gewichtung fuer den Gesamtfortschritt (Summe wird normalisiert). */
  weight?: number;
  /** Kurzbeschreibung fuer die Oberflaeche, z. B. "Durchgang 1 von 2". */
  label?: string;
}

export interface EngineRequest {
  id: string;
  inputs: EngineInput[];
  passes: EnginePass[];
  /**
   * 'all'          – alle Durchgaenge nacheinander (z. B. 2-Pass, GIF-Palette)
   * 'firstSuccess' – Alternativen: der erste erfolgreiche Durchgang gewinnt
   *                  (z. B. erst "kopieren", sonst "neu kodieren")
   */
  strategy: 'all' | 'firstSuccess';
  /**
   * Nur bei strategy 'all': schlaegt die Folge fehl, wird ersatzweise dieser
   * einfachere Weg versucht (z. B. 1-Pass statt 2-Pass).
   */
  fallbackPasses?: EnginePass[];
  /** Erwartete Ausgabedateien. */
  outputs: string[];
  /** Alternativ: alle Dateien, die auf dieses Praefix passen (Bildsequenz). */
  outputPrefix?: string;
  /** Temporaere Hilfsdateien, die nach dem Lauf geloescht werden. */
  temps?: string[];
}

export interface EngineOutputFile {
  name: string;
  data: Uint8Array;
}

export type EngineMessage =
  | { type: 'ready'; multithread: boolean; encoders: string[] }
  | { type: 'load-progress'; ratio: number }
  | { type: 'log'; id: string | null; message: string }
  | { type: 'progress'; id: string; ratio: number }
  | { type: 'done'; id: string; files: EngineOutputFile[] }
  | { type: 'error'; id: string; message: string };
