import { useRef, useState } from 'react';
import type { TrimRange } from '../types';
import { Button } from './ui';
import { formatDuration } from '../lib/format';
import { useObjectUrl } from '../hooks/useObjectUrl';

export function TrimControl({
  file,
  kind,
  duration,
  trim,
  onChange,
}: {
  file: File;
  kind: 'video' | 'audio';
  duration?: number;
  trim: TrimRange;
  onChange: (trim: TrimRange) => void;
}) {
  const url = useObjectUrl(file);
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(duration ?? 0);

  const total = duration && duration > 0 ? duration : length;
  const end = trim.end ?? total;

  const seek = (seconds: number) => {
    if (mediaRef.current) mediaRef.current.currentTime = seconds;
  };

  return (
    <div className="space-y-3">
      {url ? (
        kind === 'video' ? (
          <video
            ref={mediaRef}
            src={url}
            controls
            playsInline
            muted
            preload="metadata"
            onLoadedMetadata={(event) => setLength(event.currentTarget.duration || 0)}
            onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
            className="max-h-64 w-full rounded-xl bg-black"
          />
        ) : (
          <audio
            ref={mediaRef}
            src={url}
            controls
            preload="metadata"
            onLoadedMetadata={(event) => setLength(event.currentTarget.duration || 0)}
            onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
            className="w-full"
          />
        )
      ) : null}

      {total > 0 ? (
        <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-200">Start</span>
              <span className="tabular-nums text-slate-600 dark:text-slate-300">
                {formatDuration(trim.start)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, total)}
              step={0.1}
              value={trim.start}
              aria-label="Startpunkt"
              onChange={(event) => {
                const value = Math.min(Number(event.target.value), end - 0.1);
                onChange({ ...trim, start: Math.max(0, value) });
                seek(Math.max(0, value));
              }}
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-200">Ende</span>
              <span className="tabular-nums text-slate-600 dark:text-slate-300">
                {formatDuration(end)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, total)}
              step={0.1}
              value={end}
              aria-label="Endpunkt"
              onChange={(event) => {
                const value = Math.max(Number(event.target.value), trim.start + 0.1);
                onChange({ ...trim, end: Math.min(total, value) });
                seek(Math.min(total, value));
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => onChange({ ...trim, start: position })}>
              Start hier ({formatDuration(position)})
            </Button>
            <Button variant="secondary" onClick={() => onChange({ ...trim, end: position })}>
              Ende hier
            </Button>
            <Button variant="ghost" onClick={() => onChange({ start: 0, end: null })}>
              Zurücksetzen
            </Button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ausschnitt: {formatDuration(Math.max(0, end - trim.start))} von {formatDuration(total)}
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Die Laufzeit konnte noch nicht ermittelt werden – zum Zuschneiden das Video kurz
          abspielen.
        </p>
      )}
    </div>
  );
}
