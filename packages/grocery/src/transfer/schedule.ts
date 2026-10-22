/**
 * When the phone listens for the laptop's acknowledgement, and when it retries a send (item 31
 * design 2.3; C52, C79, C80; HS-14). Pure: the poller and the send pass the times in.
 */
import { type Instant, instantMs, RELAY_MIN_POLL_INTERVAL_MS, RELAY_TTL_MS } from '@diet/core';

/** Never faster than the relay's minimum (C79). */
export const ACK_POLL_FAST_MS = RELAY_MIN_POLL_INTERVAL_MS;
export const ACK_POLL_FAST_PERIOD_MS = 120_000;
export const ACK_POLL_SLOW_MS = 15_000;
/** The relay's longest Retry-After (rate limited). */
export const ACK_POLL_MAX_WAIT_MS = 60_000;
/** Item 29 section 6: retry once after a Retry-After of 5 s or less. */
export const POST_RETRY_MAX_MS = 5_000;

/** Delta-seconds only (1 to 4 digits), in milliseconds; anything else is null. */
export function parseRetryAfterMs(header: string | null): number | null {
  if (header === null || !/^\d{1,4}$/.test(header)) return null;
  return Number(header) * 1_000;
}

/** The wait before the one retry: a 429 or 503 asking for 0–5 seconds; otherwise null. */
export function retryDelayMs(status: number | null, retryAfter: string | null): number | null {
  if (status !== 429 && status !== 503) return null;
  const ms = parseRetryAfterMs(retryAfter);
  return ms !== null && ms <= POST_RETRY_MAX_MS ? ms : null;
}

/**
 * The wait before the next poll, `elapsedMs` after the send was stored: 5 s for 2 minutes, then
 * 15 s, lengthened by a Retry-After up to 60 s; null when that poll would fall at or after 15
 * minutes, or when the elapsed time is not a number at or above 0.
 */
export function ackPollDelayMs(elapsedMs: number, retryAfterMs: number | null): number | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  const base = elapsedMs < ACK_POLL_FAST_PERIOD_MS ? ACK_POLL_FAST_MS : ACK_POLL_SLOW_MS;
  const wait =
    retryAfterMs === null ? base : Math.max(base, Math.min(retryAfterMs, ACK_POLL_MAX_WAIT_MS));
  return elapsedMs + wait < RELAY_TTL_MS ? wait : null;
}

/** The wall clock's bound: open for 15 minutes after sentAt (a clock set back counts as open). */
export function ackWindowOpen(sentAt: Instant, now: Instant): boolean {
  return instantMs(now) - instantMs(sentAt) < RELAY_TTL_MS;
}
