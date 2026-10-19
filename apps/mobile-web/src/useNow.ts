/**
 * The current instant for a screen that reads the clock: re-renders every `intervalMs` (aligned to
 * the next whole interval), when the app comes back into view and on window focus, so midnight
 * boundaries and "hidden for the day" dismissals are re-evaluated without a reload. The time comes
 * from the storage environment, so tests control it.
 */
import { useEffect, useState } from 'react';
import type { Instant } from '@diet/core';

export function useNow(env: { readonly now: () => Instant }, intervalMs = 60_000): Instant {
  const [, setTick] = useState(0);
  useEffect(() => {
    const tick = () => {
      setTick((n) => n + 1);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    let interval: ReturnType<typeof setInterval> | undefined;
    const untilNext = intervalMs - (Date.parse(env.now()) % intervalMs);
    const first = setTimeout(() => {
      tick();
      interval = setInterval(tick, intervalMs);
    }, untilNext);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    return () => {
      clearTimeout(first);
      if (interval !== undefined) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
    };
  }, [env, intervalMs]);
  return env.now();
}
