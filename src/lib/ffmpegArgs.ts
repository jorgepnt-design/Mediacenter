import type {
  EnginePass,
  ExtractSettings,
  GifSettings,
  Job,
  SettingsState,
  Transform,
  TrimRange,
} from '../types';
import { audioExtension, audioMime, videoMime } from './formats';
import { baseName, safeName, toFfmpegTime } from './format';

export interface BuiltJob {
  inputName: string;
  passes: EnginePass[];
  strategy: 'all' | 'firstSuccess';
  fallbackPasses?: EnginePass[];
  outputs: string[];
  outputPrefix?: string;
  temps?: string[];
  /** Dateiname fuer Download / Teilen. */
  outName: string;
  mime: string;
  /** Hinweis fuer die Oberflaeche, falls eine Einstellung angepasst wurde. */
  note?: string;
}

const RESOLUTION_VALUES: Record<string, number> = {
  '2160': 2160,
  '1440': 1440,
  '1080': 1080,
  '720': 720,
  '480': 480,
  '360': 360,
};

/** Kommas muessen im Filtergraph maskiert werden. */
const esc = (expression: string) => expression.replace(/,/g, '\\,');

/**
 * Begrenzt die *kuerzere* Kante – so wird aus einem 1080x1920-Hochformat vom
 * iPhone bei "720p" korrekt 720x1280 und nicht 405x720.
 */
function scaleFilter(shortSide: number): string {
  const even = (expr: string) => `trunc(${expr}/2)*2`;
  const w = esc(`if(gt(iw,ih),-2,${even(`min(iw,${shortSide})`)})`);
  const h = esc(`if(gt(iw,ih),${even(`min(ih,${shortSide})`)},-2)`);
  return `scale=w=${w}:h=${h}`;
}

function customWidthFilter(width: number): string {
  return `scale=w=${esc(`trunc(min(iw,${Math.max(2, Math.round(width))})/2)*2`)}:h=-2`;
}

function transformFilters(transform: Transform): string[] {
  const filters: string[] = [];
  if (transform.rotate === 90) filters.push('transpose=1');
  if (transform.rotate === 180) filters.push('transpose=1', 'transpose=1');
  if (transform.rotate === 270) filters.push('transpose=2');
  if (transform.flipH) filters.push('hflip');
  if (transform.flipV) filters.push('vflip');
  return filters;
}

/** -ss vor -i (schneller Sprung) und -t danach (exakte Laenge). */
function trimArgs(trim: TrimRange): { before: string[]; after: string[] } {
  const before = trim.start > 0 ? ['-ss', toFfmpegTime(trim.start)] : [];
  const after =
    trim.end !== null && trim.end > trim.start
      ? ['-t', toFfmpegTime(trim.end - trim.start)]
      : [];
  return { before, after };
}

export function effectiveDuration(job: Job): number | undefined {
  const total = job.info.durationSec;
  const end = job.trim.end ?? total;
  if (end === undefined) return undefined;
  return Math.max(0.1, end - job.trim.start);
}

function videoEncoderArgs(
  codec: SettingsState['video']['codec'],
  container: string,
): { encoder: string; extra: string[] } {
  switch (codec) {
    case 'h265':
      return {
        encoder: 'libx265',
        extra: container === 'mp4' || container === 'mov' ? ['-tag:v', 'hvc1'] : [],
      };
    case 'vp9':
      return { encoder: 'libvpx-vp9', extra: ['-row-mt', '1', '-deadline', 'good'] };
    case 'av1':
      return { encoder: 'libaom-av1', extra: ['-row-mt', '1', '-cpu-used', '8'] };
    default:
      return { encoder: 'libx264', extra: [] };
  }
}

/** Welcher Audio-Codec passt in den gewaehlten Container? */
function audioCodecFor(container: string): { encoder: string; note?: string } {
  if (container === 'webm') {
    return { encoder: 'libopus', note: 'WebM benötigt Opus – die Tonspur wird neu kodiert.' };
  }
  return { encoder: 'aac' };
}

function rateControlArgs(
  settings: SettingsState['video'],
  encoder: string,
  durationSec: number | undefined,
  sourceKbit: number | undefined,
): { args: string[]; twoPassBitrate: number | null; note?: string } {
  if (settings.rateMode === 'bitrate') {
    return { args: ['-b:v', `${settings.videoBitrate}k`], twoPassBitrate: null };
  }

  if (settings.rateMode === 'size') {
    if (!durationSec || durationSec <= 0) {
      return {
        args: ['-b:v', `${settings.videoBitrate}k`],
        twoPassBitrate: null,
        note: 'Die Laufzeit konnte nicht bestimmt werden – es wird die eingestellte Bitrate verwendet.',
      };
    }
    const audioKbit = settings.audioMode === 'none' ? 0 : settings.audioBitrate;
    // 2 % Reserve fuer Container-Overhead
    const totalKbit = (settings.targetSizeMB * 8192) / durationSec;
    let videoKbit = Math.max(80, Math.round(totalKbit * 0.98 - audioKbit));
    let note: string | undefined;

    // Mehr Bitrate als das Original hat bringt nichts – und der 2-Pass-Regler
    // von x264 scheitert daran ("2pass curve failed to converge").
    if (sourceKbit && videoKbit > sourceKbit * 0.9) {
      videoKbit = Math.max(80, Math.round(sourceKbit * 0.9));
      note =
        'Die Datei ist bereits kleiner als die Zielgröße – die Bitrate wurde auf das Niveau des Originals begrenzt.';
    }
    return { args: ['-b:v', `${videoKbit}k`], twoPassBitrate: videoKbit, note };
  }

  // CRF
  if (encoder === 'libvpx-vp9' || encoder === 'libaom-av1') {
    return { args: ['-crf', String(settings.crf), '-b:v', '0'], twoPassBitrate: null };
  }
  return { args: ['-crf', String(settings.crf)], twoPassBitrate: null };
}

function speedArgs(encoder: string, speed: string): string[] {
  if (encoder === 'libvpx-vp9') {
    const map: Record<string, string> = {
      ultrafast: '8', veryfast: '6', fast: '4', medium: '2', slow: '1',
    };
    return ['-cpu-used', map[speed] ?? '4'];
  }
  if (encoder === 'libaom-av1') {
    const map: Record<string, string> = {
      ultrafast: '8', veryfast: '8', fast: '7', medium: '6', slow: '4',
    };
    return ['-cpu-used', map[speed] ?? '8'];
  }
  return ['-preset', speed];
}

function buildVideo(job: Job, settings: SettingsState): BuiltJob {
  const video = settings.video;
  const container = video.container;
  const input = `input.${inputExt(job)}`;
  const output = `output.${container}`;
  const { before, after } = trimArgs(job.trim);
  const { encoder, extra } = videoEncoderArgs(video.codec, container);
  const duration = effectiveDuration(job);
  const sourceKbit =
    job.info.durationSec && job.info.durationSec > 0
      ? (job.file.size * 8) / 1000 / job.info.durationSec
      : undefined;
  const rate = rateControlArgs(video, encoder, duration, sourceKbit);

  const filters: string[] = [];
  if (video.resolution === 'custom') filters.push(customWidthFilter(video.customWidth));
  else if (video.resolution !== 'original') filters.push(scaleFilter(RESOLUTION_VALUES[video.resolution]));
  if (video.fps !== 'original') filters.push(`fps=${video.fps}`);
  filters.push(...transformFilters(job.transform));

  const audioNote = audioCodecFor(container);
  const audioArgs: string[] = [];
  if (video.audioMode === 'none' || job.mute) {
    audioArgs.push('-an');
  } else if (video.audioMode === 'copy' && container !== 'webm') {
    audioArgs.push('-c:a', 'copy');
  } else {
    audioArgs.push('-c:a', audioNote.encoder, '-b:a', `${video.audioBitrate}k`);
  }

  const common = [
    ...before,
    '-i', input,
    ...after,
    '-c:v', encoder,
    ...extra,
    ...speedArgs(encoder, video.speed),
    ...(filters.length ? ['-vf', filters.join(',')] : []),
    ...(encoder === 'libx264' || encoder === 'libx265' ? ['-pix_fmt', 'yuv420p'] : []),
  ];

  const tail = [
    ...(video.stripExtras ? ['-map_metadata', '-1', '-sn', '-dn'] : []),
    ...(container === 'mp4' || container === 'mov' ? ['-movflags', '+faststart'] : []),
    '-y',
  ];

  const passes: EnginePass[] = [];
  const temps: string[] = [];
  let fallbackPasses: EnginePass[] | undefined;

  if (rate.twoPassBitrate) {
    passes.push({
      label: 'Durchgang 1 von 2 (Analyse)',
      weight: 0.45,
      args: [...common, ...rate.args, '-pass', '1', '-passlogfile', 'pass', '-an', '-f', 'null', '/dev/null'],
    });
    passes.push({
      label: 'Durchgang 2 von 2 (Kodieren)',
      weight: 0.55,
      args: [...common, ...rate.args, '-pass', '2', '-passlogfile', 'pass', ...audioArgs, ...tail, output],
    });
    temps.push('pass-0.log', 'pass-0.log.mbtree', 'pass-0.log.temp');

    // Reissaus fuer den Fall, dass die 2-Pass-Kurve nicht konvergiert:
    // ein einzelner Durchgang mit VBV-Begrenzung trifft die Zielgroesse
    // ebenfalls gut genug.
    fallbackPasses = [
      {
        label: 'Ein Durchgang mit begrenzter Bitrate',
        args: [
          ...common,
          ...rate.args,
          '-maxrate', `${Math.round(rate.twoPassBitrate * 1.2)}k`,
          '-bufsize', `${Math.round(rate.twoPassBitrate * 2)}k`,
          ...audioArgs,
          ...tail,
          output,
        ],
      },
    ];
  } else {
    passes.push({ args: [...common, ...rate.args, ...audioArgs, ...tail, output] });
  }

  return {
    inputName: input,
    passes,
    fallbackPasses,
    strategy: 'all',
    outputs: [output],
    temps,
    outName: `${safeName(baseName(job.name))}.${container}`,
    mime: videoMime(container),
    note: [rate.note, video.audioMode === 'copy' && container === 'webm' ? audioNote.note : undefined]
      .filter(Boolean)
      .join(' ') || undefined,
  };
}

function audioEncoderArgs(settings: ExtractSettings): string[] {
  const args: string[] = [];
  switch (settings.format) {
    case 'mp3':
      args.push('-c:a', 'libmp3lame');
      if (settings.bitrate === 0) args.push('-q:a', String(settings.vbrQuality));
      else args.push('-b:a', `${settings.bitrate}k`);
      break;
    case 'wav':
      args.push('-c:a', 'pcm_s16le');
      break;
    case 'flac':
      args.push('-c:a', 'flac');
      break;
    case 'aac':
    case 'm4a':
      args.push('-c:a', 'aac', '-b:a', `${settings.bitrate || 192}k`);
      break;
    case 'ogg':
      args.push('-c:a', 'libvorbis', '-b:a', `${settings.bitrate || 192}k`);
      break;
    case 'opus':
      args.push('-c:a', 'libopus', '-b:a', `${settings.bitrate || 128}k`);
      break;
    default:
      break;
  }
  if (settings.sampleRate !== 'original') args.push('-ar', String(settings.sampleRate));
  if (settings.channels !== 'original') args.push('-ac', String(settings.channels));
  return args;
}

function buildAudioLike(job: Job, settings: ExtractSettings, dropVideo: boolean): BuiltJob {
  const input = `input.${inputExt(job)}`;
  const ext = audioExtension(settings.format);
  const output = `output.${ext}`;
  const { before, after } = trimArgs(job.trim);

  const filters: string[] = [];
  if (settings.normalize) filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');

  const base = [...before, '-i', input, ...after, ...(dropVideo ? ['-vn'] : []), '-map_metadata', '-1'];

  const encodePass: EnginePass = {
    label: 'Kodieren',
    args: [
      ...base,
      ...(filters.length ? ['-af', filters.join(',')] : []),
      ...audioEncoderArgs(settings),
      '-y',
      output,
    ],
  };

  // "Ohne Neukodierung kopieren": klappt nur, wenn Codec und Container passen.
  // Schlaegt der Versuch fehl, uebernimmt automatisch der Kodier-Durchgang.
  if (settings.copyIfPossible && !settings.normalize && settings.channels === 'original' && settings.sampleRate === 'original') {
    return {
      inputName: input,
      passes: [
        { label: 'Verlustfrei kopieren', args: [...base, '-c:a', 'copy', '-y', output] },
        encodePass,
      ],
      strategy: 'firstSuccess',
      outputs: [output],
      outName: `${safeName(baseName(job.name))}.${ext}`,
      mime: audioMime(settings.format),
    };
  }

  return {
    inputName: input,
    passes: [encodePass],
    strategy: 'all',
    outputs: [output],
    outName: `${safeName(baseName(job.name))}.${ext}`,
    mime: audioMime(settings.format),
  };
}

function buildGif(job: Job, settings: GifSettings): BuiltJob {
  const input = `input.${inputExt(job)}`;
  const { before, after } = trimArgs(job.trim);
  const chain = [
    `fps=${settings.fps}`,
    `scale=${Math.max(2, Math.round(settings.width))}:-2:flags=lanczos`,
    ...transformFilters(job.transform),
  ].join(',');

  if (settings.format === 'webp') {
    return {
      inputName: input,
      passes: [
        {
          args: [
            ...before, '-i', input, ...after,
            '-vf', chain,
            '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', '75',
            '-compression_level', '4',
            '-loop', settings.loop ? '0' : '1',
            '-an', '-y', 'output.webp',
          ],
        },
      ],
      strategy: 'all',
      outputs: ['output.webp'],
      outName: `${safeName(baseName(job.name))}.webp`,
      mime: 'image/webp',
    };
  }

  if (!settings.optimizePalette) {
    return {
      inputName: input,
      passes: [
        {
          args: [
            ...before, '-i', input, ...after,
            '-vf', chain,
            '-loop', settings.loop ? '0' : '-1',
            '-an', '-y', 'output.gif',
          ],
        },
      ],
      strategy: 'all',
      outputs: ['output.gif'],
      outName: `${safeName(baseName(job.name))}.gif`,
      mime: 'image/gif',
    };
  }

  return {
    inputName: input,
    passes: [
      {
        label: 'Farbpalette berechnen',
        weight: 0.35,
        args: [...before, '-i', input, ...after, '-vf', `${chain},palettegen=stats_mode=diff`, '-y', 'palette.png'],
      },
      {
        label: 'GIF schreiben',
        weight: 0.65,
        args: [
          ...before, '-i', input, ...after, '-i', 'palette.png',
          '-lavfi', `${chain}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
          '-loop', settings.loop ? '0' : '-1',
          '-an', '-y', 'output.gif',
        ],
      },
    ],
    strategy: 'all',
    outputs: ['output.gif'],
    temps: ['palette.png'],
    outName: `${safeName(baseName(job.name))}.gif`,
    mime: 'image/gif',
  };
}

function buildFrame(job: Job, settings: SettingsState['frame']): BuiltJob {
  const input = `input.${inputExt(job)}`;
  const ext = settings.format;
  const filters = [
    ...(settings.width !== 'original' ? [customWidthFilter(settings.width)] : []),
    ...transformFilters(job.transform),
  ];

  if (settings.mode === 'single') {
    const time = Math.max(0, settings.time || job.trim.start);
    return {
      inputName: input,
      passes: [
        {
          args: [
            '-ss', toFfmpegTime(time), '-i', input,
            ...(filters.length ? ['-vf', filters.join(',')] : []),
            '-frames:v', '1', '-update', '1', '-q:v', '2', '-y', `output.${ext}`,
          ],
        },
      ],
      strategy: 'all',
      outputs: [`output.${ext}`],
      outName: `${safeName(baseName(job.name))}.${ext}`,
      mime: ext === 'png' ? 'image/png' : 'image/jpeg',
    };
  }

  const { before, after } = trimArgs(job.trim);
  return {
    inputName: input,
    passes: [
      {
        args: [
          ...before, '-i', input, ...after,
          '-vf', [`fps=${settings.fps}`, ...filters].join(','),
          '-q:v', '3', '-y', `frame_%04d.${ext}`,
        ],
      },
    ],
    strategy: 'all',
    outputs: [],
    outputPrefix: 'frame_',
    outName: `${safeName(baseName(job.name))}-bilder.zip`,
    mime: 'application/zip',
  };
}

export function inputExt(job: Job): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(job.name);
  if (match) return match[1].toLowerCase();
  return job.kind === 'video' ? 'mp4' : job.kind === 'audio' ? 'mp3' : 'bin';
}

export function buildJob(job: Job, settings: SettingsState): BuiltJob {
  switch (job.task) {
    case 'extract':
      return buildAudioLike(job, settings.extract, true);
    case 'audio':
      return buildAudioLike(job, settings.audio, true);
    case 'gif':
      return buildGif(job, settings.gif);
    case 'frame':
      return buildFrame(job, settings.frame);
    case 'video':
    default:
      return buildVideo(job, settings);
  }
}

/** Mehrere Dateien aneinanderhaengen (concat). */
export function buildConcat(
  names: string[],
  container: 'mp4' | 'mkv' | 'webm' | 'mp3' | 'm4a' | 'wav',
  outName: string,
): Omit<BuiltJob, 'inputName'> {
  const output = `output.${container}`;
  const listArgs = ['-f', 'concat', '-safe', '0', '-i', 'concat.txt'];
  const isAudio = container === 'mp3' || container === 'm4a' || container === 'wav';
  const reencode = isAudio
    ? ['-c:a', container === 'wav' ? 'pcm_s16le' : container === 'mp3' ? 'libmp3lame' : 'aac']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k'];

  return {
    passes: [
      { label: 'Verlustfrei zusammenfügen', args: [...listArgs, '-c', 'copy', '-y', output] },
      { label: 'Zusammenfügen mit Neukodierung', args: [...listArgs, ...reencode, '-y', output] },
    ],
    strategy: 'firstSuccess',
    outputs: [output],
    temps: ['concat.txt', ...names],
    outName,
    mime: isAudio ? audioMime(container === 'm4a' ? 'm4a' : container === 'wav' ? 'wav' : 'mp3') : videoMime(container as 'mp4'),
  };
}
