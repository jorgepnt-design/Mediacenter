import { useMemo, useState } from 'react';
import type { Job, SettingsState, TaskType } from '../types';
import { Button, Sheet, Toggle } from './ui';
import { remoteConfigured, remoteThresholdBytes } from '../lib/remote';
import { formatBytes } from '../lib/format';
import { VideoPanel } from './panels/VideoPanel';
import { AudioPanel } from './panels/AudioPanel';
import { FramePanel, GifPanel } from './panels/GifPanel';
import { ImagePanel } from './panels/ImagePanel';

const TAB_LABELS: Record<TaskType, string> = {
  video: 'Video',
  extract: 'Audio extrahieren',
  audio: 'Audio',
  gif: 'GIF',
  frame: 'Einzelbild',
  image: 'Bild',
};

const ALL_TABS: TaskType[] = ['video', 'extract', 'gif', 'frame', 'audio', 'image'];

export function SettingsSheet({
  open,
  onClose,
  settings,
  update,
  jobs,
  encoders,
  onStart,
  canStart,
}: {
  open: boolean;
  onClose: () => void;
  settings: SettingsState;
  update: <K extends keyof SettingsState>(key: K, patch: Partial<SettingsState[K]>) => void;
  jobs: Job[];
  encoders: string[] | null;
  onStart: () => void;
  canStart: boolean;
}) {
  const tabs = useMemo(() => {
    const present = new Set(jobs.filter((job) => !job.merged).map((job) => job.task));
    const list = ALL_TABS.filter((tab) => present.has(tab));
    return list.length > 0 ? list : ALL_TABS;
  }, [jobs]);

  const [active, setActive] = useState<TaskType>(tabs[0]);
  const current = tabs.includes(active) ? active : tabs[0];

  const sampleImage = useMemo(
    () => jobs.find((job) => job.task === 'image')?.file ?? null,
    [jobs],
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Einstellungen"
      footer={
        <Button
          variant="primary"
          full
          disabled={!canStart}
          onClick={() => {
            onClose();
            onStart();
          }}
        >
          Einstellungen anwenden und starten
        </Button>
      }
    >
      {tabs.length > 1 ? (
        <div
          role="tablist"
          aria-label="Einstellungsbereiche"
          className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1"
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={tab === current}
              onClick={() => setActive(tab)}
              className={`min-h-touch shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                tab === current
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      ) : null}

      <div role="tabpanel">
        {current === 'video' ? (
          <VideoPanel
            settings={settings.video}
            encoders={encoders}
            onChange={(patch) => update('video', patch)}
          />
        ) : null}
        {current === 'extract' ? (
          <AudioPanel
            mode="extract"
            settings={settings.extract}
            onChange={(patch) => update('extract', patch)}
          />
        ) : null}
        {current === 'audio' ? (
          <AudioPanel
            mode="convert"
            settings={settings.audio}
            onChange={(patch) => update('audio', patch)}
          />
        ) : null}
        {current === 'gif' ? (
          <GifPanel settings={settings.gif} onChange={(patch) => update('gif', patch)} />
        ) : null}
        {current === 'frame' ? (
          <FramePanel settings={settings.frame} onChange={(patch) => update('frame', patch)} />
        ) : null}
        {current === 'image' ? (
          <ImagePanel
            settings={settings.image}
            sample={sampleImage}
            onChange={(patch) => update('image', patch)}
          />
        ) : null}
      </div>

      {remoteConfigured ? (
        <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
          <h3 className="mb-1 text-sm font-semibold">Server-Variante</h3>
          <Toggle
            label="Sehr große Dateien über die eigene API verarbeiten"
            hint={`Ab ${formatBytes(remoteThresholdBytes, 0)} wird die Datei an den konfigurierten Server übertragen – nur dann verlässt sie dein Gerät. Standardmäßig ausgeschaltet.`}
            checked={settings.advanced.useRemoteForLargeFiles}
            onChange={(useRemoteForLargeFiles) => update('advanced', { useRemoteForLargeFiles })}
          />
        </div>
      ) : null}
    </Sheet>
  );
}
