import { describe, expect, it } from 'vitest';
import { gateInputFromRecords, readinessGates } from '../readiness/gates';
import { CARD_REGISTRY } from '../storage/cards';
import { drinkFigures } from '../storage/derived';
import {
  READINESS_QUESTION_IDS,
  READINESS_WORDING,
  readinessInputFromRows,
} from '../storage/readiness';
import type { DrinkLogRecord, ReadinessRecord, StoredBeverage } from '../storage/records';
import { addDays, zonedWallTimeToInstant } from '../util/time';
import {
  activeHelpTriggers,
  ALCOHOL_HELP_TRIGGERS,
  type AlcoholHelpTrigger,
  type HelpTriggerInput,
  helpCardState,
} from './helpCard';

const ZONE = 'Pacific/Auckland';
const HONOLULU = 'Pacific/Honolulu';
/** The test clock: 1:00 pm on Wednesday 1 March 2000 in Auckland. */
const NOW = '2000-03-01T00:00:00.000Z';

const at = (date: string, hh: number, mm = 0, zone = ZONE) =>
  new Date(zonedWallTimeToInstant(date, hh * 60 + mm, zone)).toISOString();

const measure = (volumeMl: number, abvPercent: number, standardDrinks: number | null = null) =>
  ({
    volumeMl,
    abvPercent,
    label:
      standardDrinks === null
        ? null
        : {
            volumeMl,
            abvPercent,
            standardDrinks,
            kcal: null,
            energyAsEntered: null,
            origin: 'owner',
          },
  }) satisfies StoredBeverage;

const CAN = measure(330, 5);
let next = 0;
const drink = (when: string, beverage: StoredBeverage = CAN, count = 1, zone = ZONE) => {
  next += 1;
  return {
    id: `drink-${next}`,
    at: when,
    timeZone: zone,
    beverageId: null,
    name: 'Example drink',
    count,
    beverage,
    ...drinkFigures(beverage),
  } as DrinkLogRecord;
};

/** One drink at noon on each day from `from` to `to`. */
const daily = (from: string, to: string, beverage: StoredBeverage = CAN, count = 1) => {
  const rows: DrinkLogRecord[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) rows.push(drink(at(d, 12), beverage, count));
  return rows;
};

const input = (over: Partial<HelpTriggerInput> = {}): HelpTriggerInput => ({
  now: NOW,
  deviceZone: ZONE,
  ctx: { homeTimeZone: ZONE, cutoverMinutes: 300 },
  rows: [],
  weeklyGuidance: 10,
  withdrawalTickDates: [],
  noteToday: '2000-03-01',
  q7Gated: false,
  ...over,
});

// Labels a little above the calculation, so the label is the figure the card counts (A39).
const LABEL_2_5 = measure(375, 8.4, 2.5); // the calculation, 2.49, agrees
const LABEL_1_75 = measure(330, 6.7, 1.75); // the calculation, 1.74, agrees
const HOLD = daily('2000-02-17', '2000-02-22', LABEL_1_75, 2); // 21.00 over 6 days, no run

describe('activeHelpTriggers (U4; HS-06, AL-06 to AL-10, A7, A8, A37, A39, D8)', () => {
  it.each<[string, Partial<HelpTriggerInput>, AlcoholHelpTrigger[]]>([
    [
      'AL-06: 7 drinking days, 24 Feb to 1 Mar',
      { rows: daily('2000-02-24', '2000-03-01') },
      ['consecutive-days'],
    ],
    ['AL-06: 6 drinking days', { rows: daily('2000-02-25', '2000-03-01') }, []],
    [
      'A7: a run 18 to 24 Feb, ending today − 6',
      { rows: daily('2000-02-18', '2000-02-24') },
      ['consecutive-days'],
    ],
    ['A7: a run 17 to 23 Feb', { rows: daily('2000-02-17', '2000-02-23') }, []],
    [
      'D8: 23 to 25 Feb in Honolulu, then 27 Feb to 1 Mar in Auckland (26 Feb skipped by the date line)',
      {
        rows: [
          ...['2000-02-23', '2000-02-24', '2000-02-25'].map((d) =>
            drink(at(d, 12, 0, HONOLULU), CAN, 1, HONOLULU),
          ),
          ...daily('2000-02-27', '2000-03-01'),
        ],
      },
      ['consecutive-days'],
    ],
    [
      'A5: 7 days of 0% drinks only',
      { rows: daily('2000-02-24', '2000-03-01', measure(330, 0)) },
      [],
    ],
    [
      'A39: 750 mL at 13.5% a day with a label of 0 kept by "Save anyway"',
      { rows: daily('2000-02-24', '2000-03-01', measure(750, 13.5, 0)) },
      ['consecutive-days', 'double-guidance'],
    ],
    [
      'A39: women, 13 × 150 mL at 13% over three days, labelled 1.5 (within 10%; the calculation, 20.00)',
      {
        rows: [
          drink(at('2000-02-25', 20), measure(150, 13, 1.5), 4),
          drink(at('2000-02-26', 20), measure(150, 13, 1.5), 5),
          drink(at('2000-02-27', 20), measure(150, 13, 1.5), 4),
        ],
      },
      ['double-guidance'],
    ],
    [
      "A39: men's figure 15, 4 × 750 mL at 13% on alternate days, labelled 7.0 (the calculation, 30.77)",
      {
        rows: ['2000-02-23', '2000-02-25', '2000-02-27', '2000-02-29'].map((d) =>
          drink(at(d, 20), measure(750, 13, 7)),
        ),
        weeklyGuidance: 15,
      },
      ['double-guidance'],
    ],
    [
      'A39: women, 16 × 330 mL at 5% labelled 1.2 (the calculation, 20.83)',
      { rows: [drink(at('2000-03-01', 12), measure(330, 5, 1.2), 16)] },
      ['double-guidance'],
    ],
    [
      'AL-07: women, rolling 7 at 20.00',
      { rows: [drink(at('2000-03-01', 12), LABEL_2_5, 8)] },
      ['double-guidance'],
    ],
    [
      'AL-07: women, 19.99',
      {
        rows: [
          drink(at('2000-03-01', 12), LABEL_2_5, 7),
          drink(at('2000-03-01', 12), measure(375, 8.4, 2.49)),
        ],
      },
      [],
    ],
    [
      "AL-07: men's figure 15, 30.00",
      { rows: [drink(at('2000-03-01', 12), LABEL_2_5, 12)], weeklyGuidance: 15 },
      ['double-guidance'],
    ],
    [
      'A8: 21.00 on 17 to 22 Feb, today 23 Feb',
      { rows: HOLD, now: at('2000-02-23', 13), noteToday: '2000-02-23' },
      ['double-guidance'],
    ],
    [
      'A8: the same, today 25 Feb',
      { rows: HOLD, now: at('2000-02-25', 13), noteToday: '2000-02-25' },
      ['double-guidance'],
    ],
    ['A8: the same, today 1 Mar (the last such window ended 23 Feb)', { rows: HOLD }, []],
    [
      'A37: cut-over midnight; 7 days in a run only under the default 5:00 am',
      {
        ctx: { homeTimeZone: ZONE, cutoverMinutes: 0 },
        rows: [
          ...[
            '2000-02-23',
            '2000-02-24',
            '2000-02-25',
            '2000-02-26',
            '2000-02-28',
            '2000-02-29',
          ].map((d) => drink(at(d, 21))),
          drink(at('2000-02-28', 0, 30)),
        ],
      },
      ['consecutive-days'],
    ],
    [
      'AL-08: a tick on 1 Feb (today − 29)',
      { withdrawalTickDates: ['2000-02-01'] },
      ['withdrawal-tick'],
    ],
    ['AL-08: a tick on 31 Jan', { withdrawalTickDates: ['2000-01-31'] }, []],
    [
      'A9: a tick dated after today (saved in Auckland, read in Honolulu the day before)',
      { withdrawalTickDates: ['2000-03-02'] },
      ['withdrawal-tick'],
    ],
    [
      'D8: 10.11 std in Honolulu on 22 Feb and in Auckland on 29 Feb: a date skipped, so 7 days lived (20.21)',
      {
        rows: [
          drink(at('2000-02-22', 20, 0, HONOLULU), measure(750, 14), 1, HONOLULU),
          drink(at('2000-02-22', 21, 0, HONOLULU), measure(330, 7), 1, HONOLULU),
          drink(at('2000-02-29', 20), measure(750, 14)),
          drink(at('2000-02-29', 21), measure(330, 7)),
        ],
      },
      ['double-guidance'],
    ],
    [
      'D8: the same in Auckland on both days: 8 dates, no double',
      {
        rows: [
          drink(at('2000-02-22', 20), measure(750, 14)),
          drink(at('2000-02-22', 21), measure(330, 7)),
          drink(at('2000-02-29', 20), measure(750, 14)),
          drink(at('2000-02-29', 21), measure(330, 7)),
        ],
      },
      [],
    ],
    [
      'AL-10: three drinks, on Mon 21, Wed 23 and Fri 25 Feb',
      { rows: ['2000-02-21', '2000-02-23', '2000-02-25'].map((d) => drink(at(d, 12))) },
      [],
    ],
    [
      'all four at once, q7 unanswered',
      {
        q7Gated: true,
        rows: daily('2000-02-24', '2000-03-01', LABEL_2_5, 2),
        withdrawalTickDates: ['2000-03-01'],
      },
      ['readiness-q7', 'consecutive-days', 'double-guidance', 'withdrawal-tick'],
    ],
  ])('%s', (_case, over, expected) => {
    expect(activeHelpTriggers(input(over))).toEqual(expected);
  });

  it('lists the triggers in the card registry order', () => {
    expect(ALCOHOL_HELP_TRIGGERS).toEqual(CARD_REGISTRY['alcohol-help'].map((t) => t.pattern));
  });
});

describe('question 7 from real readiness rows (U4; AL-09, AL-09b, C41, C58)', () => {
  const rows = (q7: 'yes' | 'no' | null, version = READINESS_WORDING.q7): ReadinessRecord[] =>
    READINESS_QUESTION_IDS.filter((q) => q !== 'q7' || q7 !== null).map((q) => ({
      questionId: q,
      answer: q === 'q7' && q7 !== null ? q7 : 'no',
      wordingVersion: q === 'q7' ? version : READINESS_WORDING[q],
      answeredAt: NOW,
    }));
  const q7Gated = (records: ReadinessRecord[], wording = READINESS_WORDING) =>
    readinessGates({
      ...gateInputFromRecords({
        rows: records,
        birthYear: 1970,
        heightCm: null,
        currentWeightKg: null,
        today: '2000-03-01',
      }),
      ...readinessInputFromRows(records, 1970, '2000-03-01', wording),
    }).alcoholHelpCardFromDayOne;

  it.each([
    ['answered yes', rows('yes'), READINESS_WORDING, ['readiness-q7']],
    ['not answered', rows(null), READINESS_WORDING, ['readiness-q7']],
    [
      'answered under an older wording',
      rows('no', 1),
      { ...READINESS_WORDING, q7: 2 },
      ['readiness-q7'],
    ],
    ['answered no', rows('no'), READINESS_WORDING, []],
  ])('%s', (_case, records, wording, expected) => {
    expect(activeHelpTriggers(input({ q7Gated: q7Gated(records, wording) }))).toEqual(expected);
  });
});

describe('helpCardState (U4; C44, D43, A10)', () => {
  const dismissed = (when: string) => ({
    dismissedAt: when,
    dismissedTimeZone: ZONE,
    doneAt: null,
  });

  it('a record-based trigger hides until the next 5:00 am while it holds; a dismissal dated ahead hides nothing', () => {
    const rows = { 'consecutive-days': dismissed(at('2000-03-01', 22)) };
    const state = (now: string) => helpCardState(['consecutive-days'], rows, now, 300).visible;
    expect(state(at('2000-03-02', 4, 59))).toBe(false);
    expect(state(at('2000-03-02', 5))).toBe(true);
    expect(state(at('2000-03-01', 21))).toBe(true);
  });

  it('question 7 hides for 720 hours, then shows again', () => {
    const when = at('2000-03-01', 13);
    const rows = { 'readiness-q7': dismissed(when) };
    const later = (ms: number) => new Date(Date.parse(when) + ms).toISOString();
    expect(helpCardState(['readiness-q7'], rows, later(720 * 3_600_000 - 1), 300).visible).toBe(
      false,
    );
    expect(helpCardState(['readiness-q7'], rows, later(720 * 3_600_000), 300)).toEqual({
      visible: true,
      showing: ['readiness-q7'],
      returns: 'in-30-days',
    });
  });

  it('A10: question 7 showing and a record-based trigger hidden for the day: the card says it is back at the next drinking day', () => {
    const rows = {
      'readiness-q7': dismissed(at('2000-01-15', 13)),
      'consecutive-days': dismissed(at('2000-03-01', 10)),
    };
    expect(helpCardState(['readiness-q7', 'consecutive-days'], rows, NOW, 300)).toEqual({
      visible: true,
      showing: ['readiness-q7'],
      returns: 'next-drinking-day',
    });
  });

  it('with both showing, both are dismissed; at the next cut-over only the record-based one returns', () => {
    const active: AlcoholHelpTrigger[] = ['readiness-q7', 'consecutive-days'];
    expect(helpCardState(active, {}, NOW, 300)).toEqual({
      visible: true,
      showing: active,
      returns: 'next-drinking-day',
    });
    const when = at('2000-03-01', 14);
    const rows = { 'readiness-q7': dismissed(when), 'consecutive-days': dismissed(when) };
    expect(helpCardState(active, rows, at('2000-03-02', 5), 300)).toEqual({
      visible: true,
      showing: ['consecutive-days'],
      returns: 'next-drinking-day',
    });
  });
});
