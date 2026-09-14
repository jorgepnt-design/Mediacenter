import { useCallback, useEffect, useState } from 'react';
import type { SettingsState } from '../types';
import { loadSettings, saveSettings } from '../lib/storage';

export function useSettings() {
  const [settings, setSettings] = useState<SettingsState>(() => loadSettings());

  useEffect(() => {
    const timer = window.setTimeout(() => saveSettings(settings), 250);
    return () => window.clearTimeout(timer);
  }, [settings]);

  const update = useCallback(
    <K extends keyof SettingsState>(key: K, patch: Partial<SettingsState[K]>) => {
      setSettings((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
    },
    [],
  );

  return { settings, setSettings, update };
}
