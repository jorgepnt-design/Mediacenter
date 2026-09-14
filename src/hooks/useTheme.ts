import { useCallback, useEffect, useState } from 'react';
import { loadTheme, saveTheme, type ThemeChoice } from '../lib/storage';

/** Dunkel-/Hellmodus – folgt standardmaessig dem System. */
export function useTheme(): {
  theme: ThemeChoice;
  resolved: 'light' | 'dark';
  setTheme: (theme: ThemeChoice) => void;
  cycleTheme: () => void;
} {
  const [theme, setThemeState] = useState<ThemeChoice>(() => loadTheme());
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  const resolved: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    saveTheme(next);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: ThemeChoice = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
      saveTheme(next);
      return next;
    });
  }, []);

  return { theme, resolved, setTheme, cycleTheme };
}
