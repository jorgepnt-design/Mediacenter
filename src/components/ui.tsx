import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

/* --------------------------------- Button --------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  full?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500',
  secondary:
    'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

export function Button({ variant = 'secondary', full, className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${full ? 'w-full' : ''} ${className}`}
    />
  );
}

/* --------------------------------- Feldrahmen ------------------------------ */

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-semibold text-slate-700 dark:text-slate-200"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------- Segmented -------------------------------- */

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  columns,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  columns?: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns ?? Math.min(options.length, 3)}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`min-h-touch rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
              active
                ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-400 dark:bg-brand-900/40 dark:text-brand-100'
                : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            <span className="block">{option.label}</span>
            {option.hint ? (
              <span className="mt-0.5 block text-[11px] font-normal leading-tight text-slate-500 dark:text-slate-400">
                {option.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- Select ---------------------------------- */

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  id,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  id?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={String(value)}
      onChange={(event) => {
        const next = options.find((option) => String(option.value) === event.target.value);
        if (next) onChange(next.value);
      }}
      className="min-h-touch w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/* --------------------------------- Slider ---------------------------------- */

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  display,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  display: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </label>
        <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

/* -------------------------------- NumberInput ------------------------------ */

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  id,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  id?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        aria-label={ariaLabel}
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-h-touch w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      {suffix ? <span className="text-sm text-slate-500 dark:text-slate-400">{suffix}</span> : null}
    </div>
  );
}

/* --------------------------------- Toggle ---------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </label>
        {hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

/* ------------------------------- Bottom-Sheet ------------------------------ */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <div
          className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="relative flex max-h-[88dvh] w-full animate-sheet-up flex-col rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900 sm:max-w-2xl sm:rounded-3xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <span className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <Button variant="ghost" onClick={onClose} aria-label="Einstellungen schließen">
              Fertig
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer ? (
            <div className="border-t border-slate-200 px-4 py-3 pb-safe dark:border-slate-800">
              {footer}
            </div>
          ) : (
            <div className="pb-safe" />
          )}
      </div>
    </div>
  );
}

/* --------------------------------- Fortschritt ----------------------------- */

export function ProgressBar({
  value,
  indeterminate,
  label,
}: {
  value: number;
  indeterminate?: boolean;
  label?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
    >
      <div
        className={`h-full rounded-full bg-brand-600 transition-[width] duration-300 ${
          indeterminate ? 'w-1/3 animate-pulse' : ''
        }`}
        style={indeterminate ? undefined : { width: `${Math.min(Math.max(value, 0), 1) * 100}%` }}
      />
    </div>
  );
}

/* --------------------------------- Badge ----------------------------------- */

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'error' | 'busy' }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    error: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
    busy: 'bg-brand-100 text-brand-800 dark:bg-brand-900/50 dark:text-brand-100',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
