/**
 * Haelt den Bildschirm waehrend eines Jobs wach. iOS gibt den Wake Lock beim
 * Wechsel in den Hintergrund frei – deshalb bei Rueckkehr erneut anfordern.
 */
let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function request(): Promise<void> {
  if (!wanted || sentinel || !navigator.wakeLock) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    sentinel = null;
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') void request();
}

export async function acquireWakeLock(): Promise<void> {
  if (wanted) return;
  wanted = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
  await request();
}

export async function releaseWakeLock(): Promise<void> {
  wanted = false;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  const current = sentinel;
  sentinel = null;
  try {
    await current?.release();
  } catch {
    /* egal */
  }
}
