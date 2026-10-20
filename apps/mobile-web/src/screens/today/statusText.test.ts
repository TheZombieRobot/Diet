import { describe, expect, it } from 'vitest';
import { statusText } from './statusText';

// Item 16 design section 1.2, every row of the table with its example (U12; TD-07). Zone
// Pacific/Auckland, 15 March 2000 (NZDT): 05:00Z is 6:00 pm, 04:00Z 5:00 pm, 06:00Z 7:00 pm.
const NZ = 'Pacific/Auckland';

describe('statusText (U12; TD-07, HS-02, HS-03, HS-18)', () => {
  it.each([
    [
      'over 24 hours',
      { kind: 'over-ceiling', elapsedMinutes: 1503 },
      'Fasting 25 h 3 m. Fasts over 24 hours are outside what this app supports. Break the fast if you feel unwell, and talk to a GP before fasting this long again.',
    ],
    [
      'gated with a fast open',
      { kind: 'open-while-off', elapsedMinutes: 120 },
      'A fast you started is still open (2 h). You can end it below.',
    ],
    [
      'fasting, window open',
      {
        kind: 'fasting',
        elapsedMinutes: 1300,
        window: { kind: 'open-until', at: '2000-03-15T06:00:00.000Z' },
      },
      'Fasting 21 h 40 m. Eating window open until 7:00 pm.',
    ],
    [
      'fasting, past 24 hours by the window',
      { kind: 'fasting', elapsedMinutes: 120, window: { kind: 'widen' } },
      "Fasting 2 h. It's fine to widen the window.",
    ],
    [
      'fasting, close to 24 hours (the Fast card says to eat now)',
      { kind: 'fasting', elapsedMinutes: 1420, window: { kind: 'eat-now' } },
      "Fasting 23 h 40 m. It's fine to eat now.",
    ],
    [
      'fasting, a window open that ends past 24 hours',
      { kind: 'fasting', elapsedMinutes: 1140, window: { kind: 'open-now' } },
      "Fasting 19 h. Your eating window is open. It's fine to eat now.",
    ],
    [
      'fasting, the snack window later today',
      {
        kind: 'fasting',
        elapsedMinutes: 860,
        window: { kind: 'snack-opens', at: '2000-03-15T04:00:00.000Z' },
      },
      'Fasting 14 h 20 m. Snack window opens 5:00 pm.',
    ],
    [
      'fasting, a window later today',
      {
        kind: 'fasting',
        elapsedMinutes: 1160,
        window: { kind: 'opens-today', at: '2000-03-15T05:00:00.000Z' },
      },
      'Fasting 19 h 20 m. Eating window opens 6:00 pm.',
    ],
    [
      'fasting, the window tomorrow',
      {
        kind: 'fasting',
        elapsedMinutes: 45,
        window: { kind: 'opens-tomorrow', at: '2000-03-16T05:00:00.000Z' },
      },
      "Fasting 45 m. Tomorrow's eating window opens at 6:00 pm.",
    ],
    ['fasting, no window', { kind: 'fasting', elapsedMinutes: 120, window: null }, 'Fasting 2 h.'],
    [
      'not fasting, window open',
      { kind: 'not-fasting', window: { kind: 'open-until', at: '2000-03-15T06:00:00.000Z' } },
      'Eating window open until 7:00 pm.',
    ],
    [
      'not fasting, the snack window',
      { kind: 'not-fasting', window: { kind: 'snack-opens', at: '2000-03-15T04:00:00.000Z' } },
      'Snack window opens 5:00 pm.',
    ],
  ] as const)('%s', (_, status, line) => {
    expect(statusText(status, NZ)).toBe(line);
  });

  it('no line with nothing to report', () => {
    expect(statusText({ kind: 'none' }, NZ)).toBeNull();
  });
});
