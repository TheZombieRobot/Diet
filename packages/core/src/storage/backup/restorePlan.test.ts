// A restore merges the Kickstart history of the phone and the file (D27; full review F1, F12;
// re-check V1, V2): nothing either side recorded or lived is dropped, and histories that cannot be
// combined refuse the file.
import { describe, expect, it } from 'vitest';
import { defaultSnapshot } from '../defaults';
import type {
  CardStateRecord,
  KickstartCheckRecord,
  KickstartPeriodRecord,
  Snapshot,
} from '../records';
import { BackupError, KICKSTART_MERGE_RULE } from './errors';
import { type MergeSeen, mergeKickstartHistory } from './restorePlan';

const ZONE = 'Pacific/Auckland';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = defaultSnapshot({ now: '2000-01-01T00:00:00.000Z', randomId: () => id(999) });

/** A period starting on 1 February 2000 (New Zealand), open unless an end is given. */
const period = (n: number, startedAt: string, endedAt: string | null): KickstartPeriodRecord => ({
  id: id(n),
  startedAt,
  timeZone: ZONE,
  endedAt,
  endedTimeZone: endedAt === null ? null : ZONE,
  endReason: endedAt === null ? null : 'user-ended',
});
const START = '2000-01-31T20:00:00.000Z';
/** 09:00 in New Zealand on day `n` of the period starting at START. */
const day = (n: number) => new Date(Date.parse(START) + (n - 1) * 86_400_000).toISOString();
/** The phone is on day 25; the file was made on day 5. */
const seen: MergeSeen = { phone: day(25), deviceTimeZone: ZONE, file: day(5) };
const open = period(1, START, null);
const endedDay19 = period(1, START, '2000-02-19T01:00:00.000Z');
const endedDay20 = period(1, START, '2000-02-20T01:00:00.000Z');
/** A palpitations "yes" on day 19, in the extension window. */
const stopSign: KickstartCheckRecord = {
  id: id(11),
  periodId: id(1),
  askedAt: '2000-02-19T00:00:00.000Z',
  timeZone: ZONE,
  dizzyOnStanding: 'no',
  palpitations: 'yes',
  crampsNotSettling: 'no',
  faintAtWork: 'no',
  energyRating: null,
  sleepRating: null,
  outcome: 'stop-sign',
};
const preStart = (date: string, firstShownAt: string): CardStateRecord => ({
  cardId: 'kickstart-stop-signs',
  trigger: `date:${date}`,
  firstShownAt,
  dismissedAt: null,
  dismissedTimeZone: null,
  doneAt: null,
});

const refusal = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
};
const REFUSED = { code: 'inconsistent', rule: KICKSTART_MERGE_RULE };

const side = (
  periods: KickstartPeriodRecord[],
  checks: KickstartCheckRecord[] = [],
  cards: CardStateRecord[] = [],
): Snapshot => ({
  ...base,
  kickstart_periods: periods,
  kickstart_checks: checks,
  card_state: cards,
});

describe('mergeKickstartHistory (F1, F12)', () => {
  it('an older file with the period still open: the phone’s end and stop-sign check are kept', () => {
    const merged = mergeKickstartHistory(side([endedDay19], [stopSign]), side([open]), seen);
    expect(merged.keptFromPhone).toBe(true);
    expect(merged.snapshot.kickstart_periods).toEqual([endedDay19]);
    expect(merged.snapshot.kickstart_checks).toEqual([stopSign]);
  });

  it('the same history on both sides is the file’s, with nothing marked as kept', () => {
    const merged = mergeKickstartHistory(
      side([endedDay19], [stopSign]),
      side([endedDay19], [stopSign]),
      seen,
    );
    expect(merged.keptFromPhone).toBe(false);
    expect(merged.snapshot.kickstart_periods).toEqual([endedDay19]);
  });

  it('a period ended on both sides keeps the later end, so every check still falls before it', () => {
    const merged = mergeKickstartHistory(side([endedDay19]), side([endedDay20], [stopSign]), seen);
    expect(merged.snapshot.kickstart_periods).toEqual([endedDay20]);
    expect(merged.snapshot.kickstart_checks).toEqual([stopSign]);
  });

  it('pre-start answers from both sides, the later "yes" of a date winning; other cards are the file’s', () => {
    const phoneOnly = preStart('2000-02-03', '2000-02-02T20:00:00.000Z');
    const earlier = preStart('2000-02-05', '2000-02-04T20:00:00.000Z');
    const later = preStart('2000-02-05', '2000-02-05T02:00:00.000Z');
    const fileCard: CardStateRecord = { ...preStart('x', START), trigger: `period:${id(1)}` };
    const merged = mergeKickstartHistory(
      side([], [], [phoneOnly, later]),
      side([], [], [earlier, fileCard]),
      seen,
    );
    expect(merged.keptFromPhone).toBe(true);
    expect(merged.snapshot.card_state).toEqual(
      expect.arrayContaining([phoneOnly, later, fileCard]),
    );
    expect(merged.snapshot.card_state).toHaveLength(3);
  });

  it('two unrelated histories that overlap refuse the file instead of dropping either', () => {
    const other = period(2, '2000-02-09T20:00:00.000Z', null);
    const refused = refusal(() => mergeKickstartHistory(side([other]), side([open]), seen));
    expect(refused).toBeInstanceOf(BackupError);
    expect(refused).toMatchObject(REFUSED);
  });

  // Re-check V2: an end is kept only where it cuts no day the other copy had already lived, so
  // neither a second copy nor a hand-edited plain backup can lower the 42-day count.
  it.each([
    ['the phone’s open copy is past the file’s end', [open], [period(1, START, day(3))], seen],
    [
      'the file’s open copy was past the phone’s end when it was made',
      [period(1, START, day(3))],
      [open],
      { ...seen, file: day(10) },
    ],
    ['the copies start on different days', [endedDay19], [period(1, day(15), day(20))], seen],
  ] as const)('the same Kickstart, where %s: the file is refused', (_, phone, file, at) => {
    const refused = refusal(() => mergeKickstartHistory(side([...phone]), side([...file]), at));
    expect(refused).toMatchObject(REFUSED);
  });

  // Re-check V1: a Kickstart of one side may not start within 336 hours of a stop-sign check of
  // the other, or on the date of a pre-start "yes" (W31), as on the phone itself.
  const startingAt = (n: number, startedAt: string) => period(n, startedAt, null);
  it.each([
    [
      'a check on the phone, a start in the file',
      side([endedDay19], [stopSign]),
      side([startingAt(2, day(22))]),
    ],
    [
      'a check in the file, a start on the phone',
      side([startingAt(2, day(22))]),
      side([endedDay19], [stopSign]),
    ],
    [
      'a file holding the phone’s check too, and a start',
      side([endedDay19], [stopSign]),
      side([endedDay19, startingAt(2, day(22))], [stopSign]),
    ],
    [
      'a pre-start "yes" on the phone, a start that day in the file',
      side([], [], [preStart('2000-02-05', day(5))]),
      side([startingAt(2, '2000-02-05T02:00:00.000Z')]),
    ],
  ])('%s: the file is refused', (_, phone, file) => {
    expect(refusal(() => mergeKickstartHistory(phone, file, seen))).toMatchObject(REFUSED);
  });

  it('a start 336 hours after the other side’s stop-sign check is merged', () => {
    const later = startingAt(2, '2000-03-04T00:00:00.000Z');
    const merged = mergeKickstartHistory(side([endedDay19], [stopSign]), side([later]), seen);
    expect(merged.snapshot.kickstart_periods).toEqual(expect.arrayContaining([endedDay19, later]));
  });
});
