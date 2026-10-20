// The session screen (item 27 design section 5.3, S1 to S18): the whole app over the real
// repositories on fake-indexeddb. HS-28 (stop signs first on every route and state), HS-29 (any
// yes gives only the lighter session or rest, which cannot be switched up), RD-05, EX-02 to EX-04.
import { general, move, moveScreen, readiness } from '@diet/core/copy/health';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { exerciseDataOrNull } from './exerciseData';
import { counts, type TestDb } from '../../db/testKit';
import { MoveSessionScreen } from './MoveSessionScreen';
import {
  A,
  answerCheck,
  B,
  C,
  checkWith,
  choiceButtons,
  clockTo,
  done,
  JOG,
  moveFixture,
  type MoveFixture,
  pattern,
  region,
  regionNames,
  renderMove,
  renderScreenOnly,
  resetMove,
  sessionRows,
  WALK,
} from './moveTestKit';

const flags = vi.hoisted(() => ({ broken: false }));
vi.mock('./exerciseData', async (original) => {
  const real = await original<{ exerciseDataOrNull: typeof exerciseDataOrNull }>();
  return { exerciseDataOrNull: () => (flags.broken ? null : real.exerciseDataOrNull()) };
});

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  resetMove(test);
  test = undefined;
  flags.broken = false;
  vi.restoreAllMocks();
});

const SAT = '2000-01-21T20:00:00.000Z';
const FRI = '2000-01-20T20:00:00.000Z';
const STOP = move.safety.stopRules.title;
const tap = (name: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name }));
};
const db = () => test as TestDb;

async function openSession(hash: string, fixture: MoveFixture = {}): Promise<HTMLElement> {
  test = await moveFixture(fixture);
  return renderMove(hash, 'Session');
}
const waitForCheck = () => screen.findByRole('region', { name: move.preCheck.title });
async function startPlanned(choice = 'Planned session', ...yes: Parameters<typeof answerCheck>) {
  await waitForCheck();
  answerCheck(...yes);
  tap(choice);
  await screen.findByRole('button', { name: moveScreen.session.finish });
}

describe('HS-28: the stop signs come first on every route and in every state (S1)', () => {
  const inProgress = { date: '2000-01-18', templateId: A, status: 'planned' as const };
  it.each<[string, string, MoveFixture, () => Promise<unknown>, boolean]>([
    ['a session not started', '#/move-session/a', {}, waitForCheck, true],
    ['the Complete workout target', '#/move-session', {}, waitForCheck, true],
    ['a beach walk', '#/move-session/beach-walk', { now: SAT }, waitForCheck, true],
    [
      'a session in progress',
      '#/move-session/a',
      { sessions: [inProgress] },
      () => screen.findByRole('button', { name: moveScreen.session.finish }),
      true,
    ],
    [
      'the finish step',
      '#/move-session/a/finish',
      { sessions: [inProgress] },
      () => screen.findByRole('region', { name: move.finish.title }),
      true,
    ],
    [
      'a done session',
      '#/move-session/a',
      { sessions: [{ ...inProgress, status: 'done' }] },
      () => screen.findByText(move.week.dayDone),
      true,
    ],
    [
      'a rest',
      '#/move-session/a',
      { sessions: [{ ...inProgress, status: 'rested' }] },
      () => screen.findByText(move.rest.rested),
      true,
    ],
    [
      'a refusal',
      '#/move-session/b',
      {},
      () => screen.findByText(move.start.problems['not-planned-today']),
      true,
    ],
    [
      'answer 6 open',
      '#/move-session/a',
      { answers: { q6: 'yes' } },
      () => screen.findByTestId('gate-notice-exercisePlans'),
      false,
    ],
  ])('%s', async (_, hash, fixture, ready, canReport) => {
    const main = await openSession(hash, fixture);
    await ready();
    expectStopSignsFirst(main, canReport);
  });

  it('a records read error and a dataset error', async () => {
    test = await moveFixture();
    vi.spyOn(test.repos.sessions, 'list').mockRejectedValue(new Error('read failed'));
    let main = await renderMove('#/move-session/a', 'Session');
    await screen.findByRole('alert');
    expectStopSignsFirst(main, false);
    cleanup();
    vi.restoreAllMocks();
    flags.broken = true;
    main = await renderMove('#/move-session/a', 'Session');
    await screen.findByText(move.dataError);
    expectStopSignsFirst(main, false);
  });
});

function expectStopSignsFirst(main: HTMLElement, canReport: boolean): void {
  expect(regionNames(main)[0]).toBe(STOP);
  const card = region(STOP);
  for (const flag of [
    'chest pain or pressure',
    'severe shortness of breath',
    'fainting or near-fainting',
    'sudden severe headache',
    'pain that changes how you move',
  ]) {
    expect(card.textContent).toContain(flag);
  }
  expect(card.textContent).toContain(move.safety.stopRules.emergency);
  expect(card.querySelector('a.ui-action-row--emergency')?.getAttribute('href')).toBe('tel:111');
  expect(card.querySelector('a[href="tel:0800611116"]')).not.toBeNull();
  // Nothing of the session comes before the card.
  for (const control of main.querySelectorAll('input, button, a')) {
    if (card.contains(control)) continue;
    expect(card.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
  expect(within(card).queryByRole('button', { name: readiness.changed.q6 }) !== null).toBe(
    canReport,
  );
  expect(card.textContent.includes(moveScreen.safety.changedLine)).toBe(canReport);
}

describe('the beach prompts before a beach session (S2; HS-12, EX-02, C77, C102)', () => {
  const bullets = () =>
    within(region(move.safety.beachPrompts.title))
      .getAllByRole('listitem')
      .map((li) => li.textContent);

  it('every bullet, in order, before the check, then the heat water line; none before a strength session', async () => {
    const main = await openSession('#/move-session/beach-walk', { now: SAT });
    await waitForCheck();
    expect(regionNames(main).slice(0, 3)).toEqual([
      STOP,
      move.safety.beachPrompts.title,
      move.preCheck.title,
    ]);
    const lines = bullets();
    expect(lines).toHaveLength(6);
    const order = [
      'red and yellow flags',
      'outgoing afternoon tide with rising swell',
      'before 10 am or after 4 pm',
      '500 mL per hour',
      'firm, wet sand',
      'Never swim alone, never after drinking.',
    ];
    order.forEach((text, i) => {
      expect(lines[i]).toContain(text);
    });
    for (const text of [
      'October to the end of March',
      'Safeswim',
      'knee height',
      'Rips: relax and float, raise a hand, do not fight the current.',
      'glass and shells',
      'Do not jump from dunes.',
    ]) {
      expect(lines.join(' ')).toContain(text);
    }
    expect(region(move.safety.beachPrompts.title).textContent).toContain(
      'In the heat, carry at least 500 mL of water, and drink about 500 mL for each hour you are active.',
    );
    cleanup();
    resetMove(test);
    await openSession('#/move-session/a');
    await waitForCheck();
    expect(screen.queryByRole('region', { name: move.safety.beachPrompts.title })).toBeNull();
  });

  it.each([
    ['keto, every gate open', {}, 7, true, false],
    ['keto, answer 5 yes (no keto ceiling)', { q5: 'yes' as const }, 6, false, false],
    ['keto, answer 4 yes', { q4: 'yes' as const }, 8, true, true],
    ['keto, answer 2 yes', { q2: 'yes' as const }, 6, false, false],
  ])('%s: %i bullets', async (_, answers, count, electrolytes, salt) => {
    await openSession('#/move-session/beach-walk', { now: SAT, dietMode: 'keto', answers });
    await waitForCheck();
    const lines = bullets();
    expect(lines).toHaveLength(count);
    const at = lines.indexOf(move.safety.beachPrompts.electrolytes);
    expect(at >= 0).toBe(electrolytes);
    if (electrolytes) expect(lines[at - 1]).toContain('500 mL per hour');
    if (salt) expect(lines[at + 1]).toBe(readiness.bloodPressure.electrolyte);
  });

  it('keto with answer 4 not answered: the salt sentence too (HS-34)', async () => {
    test = await moveFixture({ now: SAT, dietMode: 'keto', answers: { q4: null } });
    renderScreenOnly('#/move-session/beach-walk', createElement(MoveSessionScreen));
    await waitForCheck();
    expect(bullets()).toHaveLength(8);
    expect(bullets()).toContain(readiness.bloodPressure.electrolyte);
  });
});

describe('the check and the choice (S3, S4; HS-29, HS section 3, M32)', () => {
  it('six Yes/No groups with nothing chosen; the choice appears only when all six are answered, and follows a change', async () => {
    await openSession('#/move-session/a');
    const card = await waitForCheck();
    const groups = within(card).getAllByRole('radiogroup');
    expect(groups).toHaveLength(6);
    expect(
      within(card)
        .getAllByRole('radio')
        .filter((r) => (r as HTMLInputElement).checked),
    ).toHaveLength(0);
    expect(screen.getByText(move.preCheck.mustAnswer)).toBeDefined();
    expect(screen.queryByTestId('choice')).toBeNull();
    answerCheck('heatOrSun');
    expect(choiceButtons()).toEqual(['Lighter session', 'Rest today']);
    fireEvent.click(
      within(
        within(card).getByRole('radiogroup', { name: move.preCheck.questions.heatOrSun }),
      ).getByRole('radio', { name: 'No' }),
    );
    expect(choiceButtons()).toEqual(['Planned session', 'Lighter session', 'Rest today']);
  });

  it('answers given before midnight are cleared after it (N4)', async () => {
    const walkDays = pattern({ 2: [A, WALK], 3: [WALK], 5: [B] });
    await openSession('#/move-session/beach-walk', {
      weeklyPattern: walkDays,
      now: '2000-01-18T10:59:00.000Z',
    });
    await waitForCheck();
    answerCheck();
    expect(screen.getByTestId('choice')).toBeDefined();
    await clockTo(db(), '2000-01-18T11:01:00.000Z');
    await waitFor(() => {
      expect(screen.queryByTestId('choice')).toBeNull();
    });
    expect(
      screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked),
    ).toHaveLength(0);
  });

  it.each([
    ['painOrInjury', ['Rest today', 'Lighter session'], move.preCheck.painFirst],
    ['backOrLegSymptoms', ['Rest today', 'Lighter session'], move.preCheck.painFirst],
    ['tiredOrPoorSleep', ['Lighter session', 'Rest today'], null],
    ['heatOrSun', ['Lighter session', 'Rest today'], null],
    ['notHydrated', ['Lighter session', 'Rest today'], null],
    ['heavyWorkDay', ['Lighter session', 'Rest today'], move.preCheck.heavyWork],
  ] as const)('HS-29: a yes to %s offers only %j', async (key, buttons, note) => {
    await openSession('#/move-session/a');
    await waitForCheck();
    answerCheck(key);
    expect(choiceButtons()).toEqual(buttons);
    const choice = screen.getByTestId('choice');
    expect(choice.textContent).toContain(move.preCheck.anyYes);
    expect(choice.textContent).toContain(move.preCheck.notDiagnosis);
    if (note !== null) expect(choice.textContent).toContain(note);
  });

  it.each([
    ['all no', {}, ['Planned session', 'Lighter session', 'Rest today'], false],
    [
      'all no while fasting',
      { fastFrom: '2000-01-17T18:00:00.000Z' },
      ['Lighter session', 'Planned session', 'Rest today'],
      true,
    ],
    [
      'all no while fasting with fasting gated (answer 2)',
      { fastFrom: '2000-01-17T18:00:00.000Z', answersLater: { q2: 'yes' as const } },
      ['Planned session', 'Lighter session', 'Rest today'],
      false,
    ],
  ])('%s', async (_, fixture, buttons, fasted) => {
    await openSession('#/move-session/a', fixture);
    await waitForCheck();
    answerCheck();
    expect(choiceButtons()).toEqual(buttons);
    const text = screen.getByTestId('choice').textContent;
    expect(text).toContain(general.readinessOutcome);
    expect(text.includes(move.preCheck.fasted)).toBe(fasted);
    expect(text.includes(move.preCheck.eatFirst)).toBe(fasted);
  });

  it('S4b: a fast past 24 hours: no fasted note, no "nothing rules this out", the over-24-hours sentence, lighter first', async () => {
    await openSession('#/move-session/a', { fastFrom: '2000-01-16T19:00:00.000Z' });
    await waitForCheck();
    answerCheck();
    const text = screen.getByTestId('choice').textContent;
    expect(text).not.toContain(move.preCheck.fasted);
    expect(text).not.toContain(general.readinessOutcome);
    expect(text).toContain('Fasts over 24 hours are outside what this app supports.');
    expect(text).toContain("It's fine to eat now.");
    expect(choiceButtons()).toEqual(['Lighter session', 'Rest today']);
  });

  it.each([
    ['yesterday', '2000-01-16T22:00:00.000Z', true],
    ['15 days ago', '2000-01-02T22:00:00.000Z', false],
  ])('S4c: a Kickstart stop-sign answer %s', async (_, askedAt, recent) => {
    await openSession('#/move-session/a', {
      kickstartChecks: [{ askedAt, faintAtWork: 'yes' }],
    });
    await waitForCheck();
    answerCheck();
    const choice = screen.getByTestId('choice');
    expect(choice.textContent.includes(general.readinessOutcome)).toBe(!recent);
    expect(choice.textContent.includes('On 17 January 2000 you told the app about dizziness')).toBe(
      recent,
    );
    expect(choice.querySelector('a[href="tel:111"]') !== null).toBe(recent);
    expect(choiceButtons()[0]).toBe(recent ? 'Lighter session' : 'Planned session');
    expect(choiceButtons().includes('Planned session')).toBe(!recent);
  });
});

describe('HS-29 in the session (S5, S6)', () => {
  const STANDARD_OR_UP = [
    'Step-up with slow lowering',
    'Incline pike push-up',
    'Slow incline pike push-up',
    'Dumbbell shoulder press',
    'Slow hip hinge',
    'Inverted row on a rail',
    'Low-rail row',
    'Band row',
    'One-arm dumbbell row',
    'Bird-dog with a hold',
    'Single-leg calf raise',
  ];

  it('B after a hot-day yes with both toggles on: only the easier versions, no switch, still lighter after a reload', async () => {
    await openSession('#/move-session/b', {
      now: FRI,
      equipment: { bands: true, dumbbells: true },
    });
    await startPlanned('Lighter session', 'heatOrSun');
    const check = () => {
      const main = screen.getByRole('main');
      expect(within(region('Session B')).getByText(moveScreen.session.lighterChip)).toBeDefined();
      expect(main.textContent).toContain(move.lighter);
      expect(screen.queryByRole('button', { name: moveScreen.session.changeVersion })).toBeNull();
      for (const name of [
        'Low step-up',
        'Benchtop pike push-up',
        'Hands-on-thighs hinge',
        'High-rail row',
        'One-limb bird-dog',
        'Seated calf raise',
      ]) {
        expect(main.textContent).toContain(name);
      }
      for (const name of STANDARD_OR_UP) expect(main.textContent).not.toContain(name);
    };
    check();
    cleanup();
    await renderMove('#/move-session/b', 'Session');
    await screen.findByRole('button', { name: moveScreen.session.finish });
    check();
  });

  it('A lighter after an all-no check stays lighter after a reload, with no browser storage', async () => {
    await openSession('#/move-session/a');
    await startPlanned('Lighter session');
    cleanup();
    await renderMove('#/move-session/a', 'Session');
    await screen.findByRole('button', { name: moveScreen.session.finish });
    expect(within(region('Session A')).getByText(moveScreen.session.lighterChip)).toBeDefined();
    expect(screen.queryByRole('button', { name: moveScreen.session.changeVersion })).toBeNull();
    const squat = (await sessionRows(db()))[0]?.movements.find(
      (m) => m.exerciseId === 'seed:ex-squat',
    );
    expect(squat).toMatchObject({ variant: 'easier', sets: 1 });
  });

  it('a lighter jog is brisk walk intervals, with walking between them, not jogs', async () => {
    const walk = (date: string) => ({
      date,
      templateId: WALK,
      movements: [done('seed:ex-beach-walk', 'standard', [900], true)],
      exertion: 2,
      soreness: 2,
    });
    await openSession('#/move-session/beach-jog', {
      now: '2000-01-22T20:00:00.000Z',
      jogOptIn: true,
      weeklyPattern: pattern({ 2: [A], 5: [B], 7: [JOG] }),
      sessions: [
        ...['2000-01-02', '2000-01-04', '2000-01-06', '2000-01-08'].map(walk),
        { date: '2000-01-11', templateId: A, status: 'rested' },
      ],
    });
    await startPlanned('Lighter session', 'tiredOrPoorSleep');
    const jog = screen.getByTestId('movement-seed:ex-beach-jog');
    expect(jog.textContent).toContain('Brisk walk intervals');
    expect(jog.textContent).toContain(
      'Walk easily for about 1 minute 30 seconds between brisk walks.',
    );
    expect(screen.queryByText('Walk for about 1 minute 30 seconds between jogs.')).toBeNull();
  });

  it('S6: after a pain yes the hinge is left out; all no, its switch offers only Easier and Standard', async () => {
    await openSession('#/move-session/b', {
      now: FRI,
      equipment: { bands: true, dumbbells: true },
    });
    await waitForCheck();
    const note = region(move.safety.painFreeOnly.title);
    expect(note.textContent).toContain('In this session: Hip hinge to a box.');
    answerCheck('painOrInjury');
    tap('Lighter session');
    await screen.findByRole('button', { name: moveScreen.session.finish });
    expect(screen.queryByTestId('movement-seed:ex-hip-hinge')).toBeNull();

    cleanup();
    resetMove(test);
    await openSession('#/move-session/b', {
      now: FRI,
      equipment: { bands: true, dumbbells: true },
    });
    await startPlanned();
    const hinge = screen.getByTestId('movement-seed:ex-hip-hinge');
    expect(hinge.textContent).toContain(move.safety.painFreeOnly.body);
    fireEvent.click(within(hinge).getByRole('button', { name: moveScreen.session.changeVersion }));
    expect(
      within(hinge)
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.querySelector('.ui-choice__label')?.textContent),
    ).toEqual(['Hands-on-thighs hinge', 'Hip hinge to a box']);
    const row = screen.getByTestId('movement-seed:ex-row');
    fireEvent.click(within(row).getByRole('button', { name: moveScreen.session.changeVersion }));
    expect(within(row).getAllByRole('radio')).toHaveLength(5);
  });
});

describe('the progression cap, and logging never blocked (S7, S8; EX-03, C76)', () => {
  const twoAs = pattern({ 2: [A], 4: [C], 6: [A] });
  const lastWeek = [
    { date: '2000-01-11', templateId: A, movements: [done('seed:ex-squat', 'standard', [8, 8])] },
    { date: '2000-01-14', templateId: A, movements: [done('seed:ex-squat', 'standard', [8, 8])] },
  ];

  it('S7: capped at about 10% over last week, shared over the week, with the reason shown', async () => {
    await openSession('#/move-session/a', { weeklyPattern: twoAs, sessions: lastWeek });
    await startPlanned();
    const squat = screen.getByTestId('movement-seed:ex-squat');
    expect(
      within(squat).getByRole('group', { name: 'Set 1' }).querySelector('output')?.textContent,
    ).toBe('6 reps');
    expect(squat.textContent).toContain('Set 2: 5 reps');
    expect(squat.textContent).toContain(move.progression.capped);
  });

  it.each([
    ['all no', [], 'standard'],
    ['after a hot-day yes (S8b)', ['heatOrSun' as const], 'easier'],
  ])(
    "S8: the week's amount reached, %s: Log a set anyway stores the planned version",
    async (_, yes, variant) => {
      await openSession('#/move-session/c', {
        now: '2000-01-19T20:00:00.000Z',
        weeklyPattern: twoAs,
        sessions: [
          ...lastWeek,
          {
            date: '2000-01-18',
            templateId: A,
            movements: [done('seed:ex-squat', 'standard', [12, 12, 11])],
          },
        ],
      });
      await startPlanned(yes.length === 0 ? 'Planned session' : 'Lighter session', ...yes);
      const squat = screen.getByTestId('movement-seed:ex-squat');
      expect(squat.textContent).toContain(move.progression.weekReached);
      expect(within(squat).queryByRole('button', { name: 'Set 1 done' })).toBeNull();
      fireEvent.click(within(squat).getByRole('button', { name: moveScreen.session.logAnyway }));
      fireEvent.click(within(squat).getByRole('button', { name: 'Set 1 done' }));
      await waitFor(async () => {
        const row = (await sessionRows(db())).find((r) => r.date === '2000-01-20');
        expect(row?.movements.find((m) => m.exerciseId === 'seed:ex-squat')).toMatchObject({
          variant,
          sets: 1,
          done: [{ reps: expect.any(Number) as number }],
        });
      });
    },
  );
});

describe('logging a session (S9, S10; EX-04, C112, N7)', () => {
  const squatPanel = () => screen.getByTestId('movement-seed:ex-squat');
  const squatRow = async () =>
    (await sessionRows(db()))[0]?.movements.find((m) => m.exerciseId === 'seed:ex-squat');

  it('ticks, undo, an extra set, the finish ratings and note; then the summary, editable today', async () => {
    await openSession('#/move-session/a');
    await startPlanned();
    expect((await sessionRows(db()))[0]).toMatchObject({
      status: 'planned',
      preCheck: checkWith(),
    });
    const output = () =>
      within(squatPanel())
        .getByRole('group', { name: /^Set \d$/ })
        .querySelector('output')?.textContent;
    expect(output()).toBe('8 reps');
    fireEvent.click(within(squatPanel()).getByRole('button', { name: 'More for set 1' }));
    expect(output()).toBe('9 reps');
    fireEvent.click(within(squatPanel()).getByRole('button', { name: 'Set 1 done' }));
    await waitFor(async () => {
      expect((await squatRow())?.done).toEqual([{ reps: 9, seconds: null }]);
    });
    fireEvent.click(await within(squatPanel()).findByRole('button', { name: 'Undo set 1' }));
    await waitFor(async () => {
      expect((await squatRow())?.done).toEqual([]);
    });
    fireEvent.click(await within(squatPanel()).findByRole('button', { name: 'More for set 1' }));
    fireEvent.click(within(squatPanel()).getByRole('button', { name: 'Set 1 done' }));
    const set2 = await within(squatPanel()).findByRole('button', { name: 'Set 2 done' });
    // The second set keeps the session within its amount (item 26): 16 less the 9 done.
    expect(output()).toBe('7 reps');
    fireEvent.click(within(squatPanel()).getByRole('button', { name: 'More for set 2' }));
    fireEvent.click(set2);
    fireEvent.click(
      await within(squatPanel()).findByRole('button', { name: moveScreen.session.extraSet }),
    );
    fireEvent.click(within(squatPanel()).getByRole('button', { name: 'Set 3 done' }));
    await waitFor(async () => {
      expect(await squatRow()).toMatchObject({
        sets: 3,
        done: [{ reps: 9 }, { reps: 8 }, { reps: 8 }],
      });
    });
    expect((await sessionRows(db()))[0]?.status).toBe('planned');

    tap(moveScreen.session.finish);
    const finish = await screen.findByRole('region', { name: move.finish.title });
    for (const [legend, value] of [
      ['Effort', '3'],
      ['Soreness', '2'],
      ['Energy', '4'],
    ] as const) {
      const group = within(finish).getByRole('radiogroup', { name: legend });
      expect(within(group).getAllByRole('radio')[0]?.getAttribute('name')).toMatch(/^rating-/);
      fireEvent.click(within(group).getByRole('radio', { name: value }));
    }
    fireEvent.change(within(finish).getByLabelText(moveScreen.finish.noteLabel), {
      target: { value: 'Felt steady' },
    });
    fireEvent.click(within(finish).getByRole('button', { name: moveScreen.finish.save }));
    await screen.findByRole('button', { name: moveScreen.finish.saveChanges });
    const row = (await sessionRows(db()))[0];
    expect(row).toMatchObject({
      status: 'done',
      exertion: 3,
      soreness: 2,
      energy: 4,
      note: 'Felt steady',
      timeZone: 'Pacific/Auckland',
    });
    expect(row?.completedAt).not.toBeNull();
    expect(screen.getByText(moveScreen.finish.saved)).toBeDefined();
    expect(document.activeElement?.textContent).toBe('Session A');
    expect(region('Session A').textContent).toContain('Squat to a chair: 9 reps, 8 reps, 8 reps');

    const edit = region(move.finish.title);
    fireEvent.click(
      within(within(edit).getByRole('radiogroup', { name: 'Effort' })).getByRole('radio', {
        name: '4',
      }),
    );
    expect(screen.queryByText(moveScreen.finish.saved)).toBeNull();
    fireEvent.click(within(edit).getByRole('button', { name: moveScreen.finish.saveChanges }));
    await screen.findByText(moveScreen.finish.saved);
    expect((await sessionRows(db()))[0]?.exertion).toBe(4);
  });

  it.each([
    [
      true,
      [
        'High-rail row',
        'Inverted row on a rail',
        'Low-rail row',
        'Band row',
        'One-arm dumbbell row',
      ],
    ],
    [false, ['High-rail row', 'Inverted row on a rail', 'Low-rail row']],
  ])(
    'S10: with the toggles %s the row offers %j; Band row starts at the bottom; no switch after a tick',
    async (toggles, names) => {
      await openSession('#/move-session/a', { equipment: { bands: toggles, dumbbells: toggles } });
      await startPlanned();
      const row = () => screen.getByTestId('movement-seed:ex-row');
      fireEvent.click(
        within(row()).getByRole('button', { name: moveScreen.session.changeVersion }),
      );
      const labels = within(row())
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.querySelector('.ui-choice__label')?.textContent);
      expect(labels).toEqual(names);
      if (!toggles) return;
      fireEvent.click(within(row()).getByRole('radio', { name: /^Band row/ }));
      await waitFor(async () => {
        const stored = (await sessionRows(db()))[0]?.movements.find(
          (m) => m.exerciseId === 'seed:ex-row',
        );
        expect(stored).toMatchObject({ variant: 'band', reps: 8 });
      });
      fireEvent.click(await within(row()).findByRole('button', { name: 'Set 1 done' }));
      await waitFor(() => {
        expect(
          within(row()).queryByRole('button', { name: moveScreen.session.changeVersion }),
        ).toBeNull();
      });
    },
  );
});

describe('rest (S11; EX-08, N5)', () => {
  it('a rest from the check keeps its answers: Undo writes nothing and offers the same choice, which updates the same row', async () => {
    await openSession('#/move-session/a');
    await waitForCheck();
    answerCheck('painOrInjury');
    tap('Rest today');
    await screen.findByText(move.rest.rested);
    const [rested] = await sessionRows(db());
    expect(rested).toMatchObject({ status: 'rested', preCheck: checkWith('painOrInjury') });
    tap('Undo rest for Session A');
    const card = await waitForCheck();
    expect((await sessionRows(db()))[0]).toEqual(rested);
    const radios = within(card).getAllByRole<HTMLInputElement>('radio');
    expect(radios.filter((r) => r.checked)).toHaveLength(6);
    expect(radios.every((r) => r.closest('fieldset')?.disabled === true)).toBe(true);
    expect(choiceButtons()).toEqual(['Rest today', 'Lighter session']);
    tap('Lighter session');
    await screen.findByRole('button', { name: moveScreen.session.finish });
    const rows = await sessionRows(db());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: rested?.id,
      status: 'planned',
      preCheck: checkWith('painOrInjury'),
    });
  });

  it('Rest instead in the log and on the finish card while nothing is ticked; gone after a tick', async () => {
    await openSession('#/move-session/a');
    await startPlanned();
    tap(moveScreen.session.finish);
    const finish = await screen.findByRole('region', { name: move.finish.title });
    expect(finish.textContent).toContain(moveScreen.finish.noTicks);
    expect(within(finish).getByRole('button', { name: move.choices.skip })).toBeDefined();
    tap(moveScreen.finish.back);
    fireEvent.click(
      within(screen.getByTestId('movement-seed:ex-squat')).getByRole('button', {
        name: 'Set 1 done',
      }),
    );
    await within(screen.getByTestId('movement-seed:ex-squat')).findByRole('button', {
      name: 'Undo set 1',
    });
    expect(screen.queryByRole('button', { name: move.choices.skip })).toBeNull();
    fireEvent.click(
      within(screen.getByTestId('movement-seed:ex-squat')).getByRole('button', {
        name: 'Undo set 1',
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: move.choices.skip }));
    await screen.findByText(move.rest.rested);
    expect((await sessionRows(db()))[0]?.status).toBe('rested');
  });
});

describe('refusals keep the gate; a started session can still be finished (S12; M29, N27)', () => {
  it.each([
    ['#/move-session/b', {}, move.start.problems['not-planned-today']],
    ['#/move-session/beach-jog', {}, move.start.problems['jog-locked']],
    ['#/move-session/zzz', {}, move.start.problems['unknown-template']],
    [
      '#/move-session/beach-walk',
      {
        weeklyPattern: pattern({ 2: [A, WALK], 5: [B] }),
        sessions: [
          {
            date: '2000-01-18',
            templateId: A,
            status: 'rested' as const,
            preCheck: checkWith('painOrInjury'),
          },
        ],
      },
      move.start.problems['earlier-yes'],
    ],
  ])('%s is refused with its reason and no check', async (hash, fixture, text) => {
    await openSession(hash, fixture);
    await screen.findByText(text);
    expect(screen.queryByRole('region', { name: move.preCheck.title })).toBeNull();
  });

  it('a session in progress after the plan moved it: its ticks are kept, no new tick, and it can be finished', async () => {
    await openSession('#/move-session/a', {
      weeklyPattern: pattern({ 4: [A], 6: [B] }),
      sessions: [
        {
          date: '2000-01-18',
          templateId: A,
          status: 'planned',
          movements: [done('seed:ex-squat', 'standard', [8])],
        },
      ],
    });
    await screen.findByText(new RegExp(moveScreen.session.refusedKept.slice(0, 30)));
    expect(screen.queryByRole('button', { name: /^Set \d done$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: moveScreen.session.changeVersion })).toBeNull();
    const finish = region(move.finish.title);
    fireEvent.click(
      within(within(finish).getByRole('radiogroup', { name: 'Effort' })).getByRole('radio', {
        name: '2',
      }),
    );
    fireEvent.click(within(finish).getByRole('button', { name: moveScreen.finish.save }));
    await waitFor(async () => {
      expect((await sessionRows(db()))[0]).toMatchObject({ status: 'done', exertion: 2 });
    });
  });
});

describe('RD-05 during a session, and reporting a red flag (S13; RD-06)', () => {
  const inProgress = {
    date: '2000-01-18',
    templateId: A,
    status: 'planned' as const,
    movements: [done('seed:ex-squat', 'standard', [8])],
  };

  it('answer 6 closes the session at once; the stop signs stay first and the ticks are kept', async () => {
    const main = await openSession('#/move-session/a', { sessions: [inProgress] });
    await screen.findByRole('button', { name: moveScreen.session.finish });
    await db().repos.readiness.answer('q6', 'yes');
    await screen.findByTestId('gate-notice-exercisePlans');
    expectStopSignsFirst(main, false);
    expect(screen.queryByRole('button', { name: /done$|Finish session/ })).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect((await sessionRows(db()))[0]?.movements[0]?.done).toEqual([{ reps: 8, seconds: null }]);
  });

  it('"My symptoms have changed" stores a fresh yes to question 6 and closes exercise plans', async () => {
    await openSession('#/move-session/a', { sessions: [inProgress] });
    await screen.findByRole('button', { name: moveScreen.session.finish });
    tap(readiness.changed.q6);
    const done = await screen.findByText(readiness.changedDone.q6);
    expect(screen.getByTestId('gate-notice-exercisePlans')).toBeDefined();
    expect(document.activeElement).toBe(done);
    expect((await db().repos.readiness.list()).find((r) => r.questionId === 'q6')?.answer).toBe(
      'yes',
    );
  });
});

describe('the Complete workout target never writes (S14; item 26 3.14 point 6)', () => {
  it('a started session opens at its finish', async () => {
    await openSession('#/move-session', {
      sessions: [{ date: '2000-01-18', templateId: A, status: 'planned' }],
    });
    await screen.findByRole('region', { name: move.finish.title });
    expect(window.location.hash).toBe('#/move-session/a/finish');
  });

  it('two sessions: a chooser whose Start replaces the address', async () => {
    await openSession('#/move-session', { weeklyPattern: pattern({ 2: [A, WALK], 5: [B] }) });
    const before = await counts(db().db);
    const length = window.history.length;
    const start = await screen.findByRole('link', { name: 'Start Beach walk' });
    expect(screen.getByRole('link', { name: 'Start Session A' })).toBeDefined();
    fireEvent.click(start);
    await screen.findByRole('region', { name: move.safety.beachPrompts.title });
    expect(window.location.hash).toBe('#/move-session/beach-walk');
    expect(window.history.length).toBe(length);
    expect(await counts(db().db)).toEqual(before);
  });

  it('leaving the session never reads the new address as the Complete workout target', async () => {
    // The screen alone, so it sees the hash change before any shell would replace it.
    test = await moveFixture();
    renderScreenOnly('#/move-session/a', createElement(MoveSessionScreen));
    await waitForCheck();
    await act(async () => {
      window.location.hash = '#/move';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(window.location.hash).toBe('#/move');
    expect(screen.queryByRole('region', { name: move.safety.stopRules.title })).toBeNull();
  });

  it('a rest day: "Rest day, that counts" and no Start', async () => {
    await openSession('#/move-session', { now: '2000-01-16T20:00:00.000Z' });
    await screen.findByText(move.rest.restDay);
    expect(screen.queryByRole('link', { name: /Start/ })).toBeNull();
    expect(await sessionRows(db())).toEqual([]);
  });
});

describe('no check, no write (S15, S16; HS-29, N31)', () => {
  it('an unchecked row reached at its finish address shows the check; a done row with no check is read-only', async () => {
    await openSession('#/move-session/a/finish', {
      sessions: [{ date: '2000-01-18', templateId: A, status: 'planned', preCheck: null }],
    });
    await waitForCheck();
    expect(screen.queryByRole('region', { name: move.finish.title })).toBeNull();
    cleanup();
    resetMove(test);
    await openSession('#/move-session/a', {
      sessions: [{ date: '2000-01-18', templateId: A, preCheck: null }],
    });
    await screen.findByText(moveScreen.finish.noCheckDone);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
  });

  it('two quick taps on Planned session give one row', async () => {
    await openSession('#/move-session/a');
    await waitForCheck();
    answerCheck();
    const planned = screen.getByRole('button', { name: 'Planned session' });
    fireEvent.click(planned);
    fireEvent.click(planned);
    await screen.findByRole('button', { name: moveScreen.session.finish });
    expect(await sessionRows(db())).toHaveLength(1);
  });
});

describe('time (S17, S18)', () => {
  it('midnight during a session: it can still be rated and finished, with no new ticks (N18)', async () => {
    await openSession('#/move-session/a', {
      now: '2000-01-18T10:58:00.000Z',
      sessions: [
        {
          date: '2000-01-18',
          templateId: A,
          status: 'planned',
          movements: [done('seed:ex-squat', 'standard', [8])],
        },
      ],
    });
    await screen.findByRole('button', { name: moveScreen.session.finish });
    await clockTo(db(), '2000-01-18T11:01:00.000Z');
    await screen.findByText(/This session started on 18 January 2000/);
    expect(screen.queryByRole('button', { name: /^Set \d done$/ })).toBeNull();
    const finish = region(move.finish.title);
    for (const [legend, value] of [
      ['Effort', '2'],
      ['Soreness', '2'],
      ['Energy', '3'],
    ] as const) {
      fireEvent.click(
        within(within(finish).getByRole('radiogroup', { name: legend })).getByRole('radio', {
          name: value,
        }),
      );
    }
    fireEvent.click(within(finish).getByRole('button', { name: moveScreen.finish.save }));
    await screen.findByText(/Effort 2, soreness 2, energy 3/);
    expect((await sessionRows(db()))[0]).toMatchObject({
      date: '2000-01-18',
      status: 'done',
      exertion: 2,
      soreness: 2,
      energy: 3,
    });
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it.each([
    ['every gate open', {}, true],
    ['answer 5 yes', { q5: 'yes' as const }, false],
  ])('S18: a hot-day strength session in keto, %s', async (_, answers, electrolytes) => {
    test = await moveFixture({ dietMode: 'keto', answers: { q4: null, ...answers } });
    renderScreenOnly('#/move-session/a', createElement(MoveSessionScreen));
    await waitForCheck();
    answerCheck('heatOrSun');
    tap('Lighter session');
    await screen.findByRole('button', { name: moveScreen.session.finish });
    const card = region('Session A');
    expect(card.textContent).toContain('In the heat, carry at least 500 mL of water');
    expect(card.textContent.includes(move.safety.beachPrompts.electrolytes)).toBe(electrolytes);
    expect(card.textContent.includes(readiness.bloodPressure.electrolyte)).toBe(electrolytes);
  });
});
