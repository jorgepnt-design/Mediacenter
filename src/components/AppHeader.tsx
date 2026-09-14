import type { ThemeChoice } from '../lib/storage';
import { Badge } from './ui';

const THEME_LABEL: Record<ThemeChoice, string> = {
  system: 'System',
  light: 'Hell',
  dark: 'Dunkel',
};

const THEME_ICON: Record<ThemeChoice, string> = {
  system: '🌗',
  light: '☀️',
  dark: '🌙',
};

export function AppHeader({
  theme,
  onCycleTheme,
  engineLabel,
}: {
  theme: ThemeChoice;
  onCycleTheme: () => void;
  engineLabel: string | null;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/90 px-4 backdrop-blur pt-safe dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 py-3">
        <img src="/icons/favicon.png" alt="" aria-hidden="true" className="h-9 w-9 rounded-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-tight">Mediacenter</h1>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            Konvertieren &amp; Komprimieren – direkt auf deinem Gerät
          </p>
        </div>
        {engineLabel ? <Badge tone="neutral">{engineLabel}</Badge> : null}
        <button
          type="button"
          onClick={onCycleTheme}
          aria-label={`Darstellung wechseln – aktuell ${THEME_LABEL[theme]}`}
          title={`Darstellung: ${THEME_LABEL[theme]}`}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-xl hover:bg-slate-200 dark:hover:bg-slate-800"
        >
          <span aria-hidden="true">{THEME_ICON[theme]}</span>
        </button>
      </div>
    </header>
  );
}
