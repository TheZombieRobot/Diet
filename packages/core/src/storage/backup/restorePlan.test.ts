// A restore merges the Kickstart history of the phone and the file (D27; full review F1, F12):
// nothing either side recorded is dropped, and histories that cannot be combined refuse the file.
import { describe, expect, it } from 'vitest';
import { defaultSnapshot } from '../defaults';
import type {
  CardStateRecord,
  KickstartCheckRecord,
  KickstartPeriodRecord,
  Snapshot,
} from '../records';
import { BackupError, KICKSTART_MERGE_RULE } from './errors';
import { mergeKickstartHistory } from './restorePlan';

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
    const merged = mergeKickstartHistory(side([endedDay19], [stopSign]), side([open]));
    expect(merged.keptFromPhone).toBe(true);
    expect(merged.snapshot.kickstart_periods).toEqual([endedDay19]);
    expect(merged.snapshot.kickstart_checks).toEqual([stopSign]);
  });

  it('the same history on both sides is the file’s, with nothing marked as kept', () => {
    const merged = mergeKickstartHistory(
      side([endedDay19], [stopSign]),
      side([endedDay19], [stopSign]),
    );
    expect(merged.keptFromPhone).toBe(false);
    expect(merged.snapshot.kickstart_periods).toEqual([endedDay19]);
  });

  it('a period ended on both sides keeps the later end, so every check still falls before it', () => {
    const merged = mergeKickstartHistory(side([endedDay19]), side([endedDay20], [stopSign]));
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
    );
    expect(merged.keptFromPhone).toBe(true);
    expect(merged.snapshot.card_state).toEqual(
      expect.arrayContaining([phoneOnly, later, fileCard]),
    );
    expect(merged.snapshot.card_state).toHaveLength(3);
  });

  it('two unrelated histories that overlap refuse the file instead of dropping either', () => {
    const other = period(2, '2000-02-09T20:00:00.000Z', null);
    const refused = (() => {
      try {
        mergeKickstartHistory(side([other]), side([open]));
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(refused).toBeInstanceOf(BackupError);
    expect(refused).toMatchObject({ code: 'inconsistent', rule: KICKSTART_MERGE_RULE });
  });
});
