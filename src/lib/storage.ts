import type { SettingsState } from '../types';
import { defaultSettings } from './presets';

const SETTINGS_KEY = 'mediacenter.settings.v1';
const THEME_KEY = 'mediacenter.theme.v1';
const HINT_KEY = 'mediacenter.hints.v1';

export type ThemeChoice = 'system' | 'light' | 'dark';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Privater Modus o. Ä. – Einstellungen gehen dann nur nicht verloren. */
  }
}

/** Gespeicherte Einstellungen mit den Standardwerten zusammenführen. */
export function loadSettings(): SettingsState {
  const base = defaultSettings();
  const stored = read<Partial<SettingsState>>(SETTINGS_KEY);
  if (!stored) return base;
  const merged: Record<string, unknown> = { ...base };
  (Object.keys(base) as (keyof SettingsState)[]).forEach((key) => {
    const value = stored[key];
    if (value && typeof value === 'object') {
      merged[key] = { ...base[key], ...value };
    }
  });
  return merged as unknown as SettingsState;
}

export function saveSettings(settings: SettingsState): void {
  write(SETTINGS_KEY, settings);
}

export function loadTheme(): ThemeChoice {
  const stored = read<ThemeChoice>(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export function saveTheme(theme: ThemeChoice): void {
  write(THEME_KEY, theme);
}

export function isHintDismissed(id: string): boolean {
  const stored = read<string[]>(HINT_KEY);
  return Array.isArray(stored) && stored.includes(id);
}

export function dismissHint(id: string): void {
  const stored = read<string[]>(HINT_KEY) ?? [];
  if (!stored.includes(id)) write(HINT_KEY, [...stored, id]);
}
