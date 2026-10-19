import { useEffect, useState } from 'react';

/** setTimeout cannot wait longer than about 24.8 days; a day at a time is plenty. */
const MAX_WAIT_MS = 86_400_000;

/**
 * Draws a screen again whenever the time can change what it shows (health-rules review): when the
 * app comes back into view (visibilitychange to visible, pageshow, as when Android resumes an
 * installed app or restores a tab), and at `wakeAt`, the next moment a card can come back or go
 * (core backupReminderNextChange, cardNextChange). The screen reads the clock while it draws, so a
 * snooze that ends, or a dismissal dated ahead that comes due, shows without waiting for
 * something else to redraw it. `nowMs` is the clock reading the screen drew with.
 */
export function useRedrawAt(wakeAt: number | null, nowMs: number): void {
  const [, setDrawn] = useState(0);
  useEffect(() => {
    const redraw = (): void => {
      setDrawn((n) => n + 1);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') redraw();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', redraw);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', redraw);
    };
  }, []);
  useEffect(() => {
    if (wakeAt === null) return;
    const timer = setTimeout(
      () => {
        setDrawn((n) => n + 1);
      },
      Math.min(Math.max(wakeAt - nowMs, 0) + 1, MAX_WAIT_MS),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [wakeAt, nowMs]);
}
