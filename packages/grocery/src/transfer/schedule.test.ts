// When the phone listens and when it retries (item 31 design 2.3; HS-14, C52, C79, C80, L11, L12;
// K6, K7, K8).
import { describe, expect, it } from 'vitest';
import { ackPollDelayMs, ackWindowOpen, parseRetryAfterMs, retryDelayMs } from './schedule';

describe('K6 HS-14 C79: ackPollDelayMs', () => {
  it('5 s for 2 minutes, then 15 s, longer for a Retry-After up to 60 s, and nothing at 15 minutes', () => {
    const rows: [number, number | null, number | null][] = [
      [0, null, 5_000],
      [119_999, null, 5_000],
      [120_000, null, 15_000],
      [200_000, 30_000, 30_000],
      [200_000, 600_000, 60_000],
      [884_999, null, 15_000],
      [885_000, null, null],
      [900_000, null, null],
      [-1, null, null],
      [Number.NaN, null, null],
    ];
    for (const [elapsed, retryAfter, expected] of rows) {
      expect(ackPollDelayMs(elapsed, retryAfter), String(elapsed)).toBe(expected);
    }
  });
});

describe('K7 C80 L12: parseRetryAfterMs and retryDelayMs', () => {
  it('reads delta-seconds only, and retries once only for a busy relay asking for at most 5 s', () => {
    expect(parseRetryAfterMs('2')).toBe(2_000);
    expect(parseRetryAfterMs('0')).toBe(0);
    for (const bad of ['', ' 2', '1.5', 'Wed, 21 Oct 2015 07:28:00 GMT', '-1', null]) {
      expect(parseRetryAfterMs(bad), String(bad)).toBeNull();
    }
    expect(retryDelayMs(429, '5')).toBe(5_000);
    expect(retryDelayMs(429, '6')).toBeNull();
    expect(retryDelayMs(503, '2')).toBe(2_000);
    expect(retryDelayMs(500, '2')).toBeNull();
    expect(retryDelayMs(null, '2')).toBeNull();
  });
});

describe('K8 HS-14: ackWindowOpen', () => {
  it('is open for 15 minutes after the send, and while the clock reads earlier', () => {
    const sent = '2000-01-05T10:00:00.000Z';
    expect(ackWindowOpen(sent, sent)).toBe(true);
    expect(ackWindowOpen(sent, '2000-01-05T10:14:59.999Z')).toBe(true);
    expect(ackWindowOpen(sent, '2000-01-05T10:15:00.000Z')).toBe(false);
    expect(ackWindowOpen(sent, '2000-01-05T09:00:00.000Z')).toBe(true);
  });
});
