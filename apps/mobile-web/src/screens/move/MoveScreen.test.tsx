// The Move tab (item 27 design section 5.3, M1 to M9): the whole app over the real repositories
// on fake-indexeddb, after a finished setup. Every record is synthetic.
import { move, moveScreen, readiness } from '@diet/core/copy/health';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { exerciseDataOrNull } from './exerciseData';
import type { TestDb } from '../../db/testKit';
import { MoveScreen } from './MoveScreen';
import {
  A,
  B,
  C,
  checkWith,
  done,
  JOG,
  moveFixture,
  type MoveFixture,
  pattern,
  region,
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

async function openMove(fixture: MoveFixture = {}): Promise<HTMLElement> {
  test = await moveFixture(fixture);
  const main = await renderMove('#/move', 'Move');
  await screen.findByTestId('week-strip');
  return main;
}

const dayItem = (date: string) => screen.getByTestId(`week-day-${date}`);
const sentence = (date: string) => dayItem(date).querySelector('.ui-visually-hidden')?.textContent;
const chip = (date: string) => dayItem(date).querySelector('.ui-week__chip');

describe('the week (M1, M2; EX-05, UX 4a)', () => {
  it('the standard week on a Tuesday: four rest days that count, today marked, the footer and the plan link', async () => {
    await openMove();
    const items = within(screen.getByTestId('week-strip')).getAllByRole('listitem');
    expect(items).toHaveLength(7);
    const rest = items.filter((li) => li.dataset['state'] === 'rest-day');
    expect(rest).toHaveLength(4);
    for (const li of rest) {
      expect(li.querySelector('.ui-week__chip')?.textContent).toBe(move.week.restChip);
      expect(li.textContent).toMatch(/: rest day, counts as success$/);
    }
    expect(dayItem('2000-01-18').getAttribute('aria-current')).toBe('date');
    expect(sentence('2000-01-18')).toBe('Tuesday: Session A (today)');
    const card = region(move.week.title);
    expect(within(card).getByText('Today: Session A')).toBeDefined();
    for (const line of [
      'A, B: full-body sessions of about 25 to 27 minutes.',
      move.week.stripWalk,
      move.rest.general,
    ]) {
      expect(within(card).getByText(line)).toBeDefined();
    }
    expect(card.querySelector('.ui-card__aside-text')?.textContent).toBe('Bodyweight');
    expect(
      within(card)
        .getByRole('link', { name: new RegExp(move.week.edit) })
        .getAttribute('href'),
    ).toBe('#/move-plan');
  });

  it('a stored plan with a session on all seven days (as from an import) shows the standard week and why', async () => {
    await openMove({
      weeklyPattern: pattern({
        1: [A],
        2: [WALK],
        3: [B],
        4: [WALK],
        5: [C],
        6: [WALK],
        7: [WALK],
      }),
    });
    const card = region(move.week.title);
    expect(within(card).getByText(move.week.fallback)).toBeDefined();
    expect(within(card).getByText(move.week.problems['rest-days'])).toBeDefined();
    expect(document.querySelectorAll('[data-state="rest-day"]')).toHaveLength(4);
  });
});

describe('rest is success (M3; EX-08, HS section 6)', () => {
  it('a past day with nothing logged reads calmly, rested and skipped days count, and nothing says missed', async () => {
    const main = await openMove({
      now: '2000-01-21T20:00:00.000Z', // Saturday 22 January
      sessions: [
        { date: '2000-01-20', templateId: B, status: 'skipped', preCheck: null },
        { date: '2000-01-21', templateId: B, status: 'rested', preCheck: null },
      ],
    });
    expect(sentence('2000-01-18')).toBe('Tuesday: Session A, not done. Rest counts too.');
    expect(chip('2000-01-18')?.className).toContain('ui-week__chip--outline');
    expect(sentence('2000-01-20')).toBe('Thursday: rested, that counts');
    expect(sentence('2000-01-21')).toBe('Friday: rested, that counts');
    expect(main.textContent).not.toMatch(
      /\b(?:missed|fail\w*|streaks?|behind|catch(?:ing)?\s+up|make\s+up\s+for|skipp?(?:ed|ing)?)\b/i,
    );
    expect(main.querySelector('.ui-action-row--emergency')).toBeNull();
  });
});

describe('RD-05 and RD-06 on Move (M4)', () => {
  it('answer 6 hides everything but the reason, 111 and Healthline; the GP confirmation brings it back at once', async () => {
    test = await moveFixture({ answers: { q6: 'yes' } });
    const main = await renderMove('#/move', 'Move');
    await screen.findByTestId('gate-notice-exercisePlans');
    const hrefs = [...main.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['tel:111', 'tel:0800611116', '#/readiness']));
    expect(main.textContent).toContain(readiness.confirmationHints.gpExerciseDiscussed);
    expect(main.textContent).toContain(moveScreen.blockedKept);
    expect(screen.queryByTestId('week-strip')).toBeNull();
    expect(screen.queryByRole('link', { name: /Start/ })).toBeNull();
    expect(screen.queryByRole('region', { name: moveScreen.history.title })).toBeNull();
    expect(screen.queryByRole('region', { name: moveScreen.beach.title })).toBeNull();

    await test.repos.readiness.answer('gpExerciseDiscussed', 'yes');
    await screen.findByTestId('week-strip');
    await test.repos.readiness.answer('q6', 'yes');
    await waitFor(() => {
      expect(screen.queryByTestId('week-strip')).toBeNull();
    });
  });

  it('answer 6 missing (as after an import): the reason, never the week', async () => {
    test = await moveFixture({ answers: { q6: null } });
    const main = renderScreenOnly('#/move', createElement(MoveScreen));
    await within(main).findByTestId('gate-notice-exercisePlans');
    expect(within(main).queryByTestId('week-strip')).toBeNull();
    expect(main.querySelector('a[href="tel:111"]')).not.toBeNull();
  });
});

describe("today's sessions (M5; M29, EX-08)", () => {
  it('Start links to the session; a refused session shows why and no Start', async () => {
    await openMove();
    expect(screen.getByRole('link', { name: 'Start Session A' }).getAttribute('href')).toBe(
      '#/move-session/a',
    );
    cleanup();
    resetMove(test);
    await openMove({ sessions: [{ date: '2000-01-17', templateId: C }] });
    const item = screen.getByTestId('today-item-a');
    expect(item.textContent).toContain(move.start.problems['back-to-back']);
    expect(within(item).queryByRole('link', { name: /Start/ })).toBeNull();
  });

  it('Session A and the walk today: resting the walk keeps today planned, A still on its chip, and focus on the walk', async () => {
    await openMove({ weeklyPattern: pattern({ 2: [A, WALK], 5: [B] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Rest instead of Beach walk' }));
    const item = screen.getByTestId('today-item-beach-walk');
    await within(item).findByText(move.rest.rested);
    // The tapped button went with the change; focus goes to the session's name (section 1.17).
    expect(document.activeElement).toBe(within(item).getByText('Beach walk'));
    expect(dayItem('2000-01-18').dataset['state']).toBe('planned');
    expect(chip('2000-01-18')?.textContent).toContain('A');
  });

  it('Rest instead writes a rest without the check, which can be undone later, and Start returns', async () => {
    await openMove();
    fireEvent.click(screen.getByRole('button', { name: 'Rest instead of Session A' }));
    await screen.findByRole('button', { name: 'Undo rest for Session A' });
    expect(within(screen.getByTestId('today-item-a')).getByText(move.rest.rested)).toBeDefined();
    const [row] = await sessionRows(test as TestDb);
    expect(row).toMatchObject({ status: 'rested', preCheck: null, movements: [] });
    // Later, from another screen and back.
    cleanup();
    await renderMove('#/move', 'Move');
    fireEvent.click(await screen.findByRole('button', { name: 'Undo rest for Session A' }));
    await screen.findByRole('link', { name: 'Start Session A' });
    expect(await sessionRows(test as TestDb)).toEqual([]);
  });
});

describe('beach walks and jogging (M6; EX-06, C51, UX 4d)', () => {
  /** A tolerated beach walk in early January. */
  const walk = (date: string) => ({
    date,
    templateId: WALK,
    movements: [done('seed:ex-beach-walk', 'standard', [900], true)],
    exertion: 2,
    soreness: 2,
  });
  const fourWalks = ['2000-01-02', '2000-01-04', '2000-01-06', '2000-01-08'].map(walk);

  it.each([
    [
      'off, 2 tolerated walks',
      false,
      fourWalks.slice(0, 2),
      [move.jog.locked, 'Tolerated walks so far: 2 of 4.', move.jog.needsOptIn],
    ],
    ['off, 4 tolerated walks', false, fourWalks, [move.jog.readyOptIn]],
    [
      'on, 3 tolerated walks',
      true,
      fourWalks.slice(0, 3),
      [move.jog.locked, 'Tolerated walks so far: 3 of 4.'],
    ],
    ['on, 4 tolerated walks', true, fourWalks, [move.jog.optional, move.jog.addToPlan]],
  ])('%s', async (_, jogOptIn, walks, lines) => {
    // A walk counts once a later check shows no pain (C51): a rest chosen from the check.
    const later = { date: '2000-01-11', templateId: A, status: 'rested' as const };
    await openMove({ jogOptIn, sessions: [...walks, later] });
    const card = region(moveScreen.beach.title);
    for (const line of lines) expect(within(card).getByText(line)).toBeDefined();
  });

  it.each([
    ['a jog rated effort 5', { status: 'done' as const, exertion: 5, soreness: 2 }],
    // M6b: closing the app halfway through a jog pauses jogging as an unrated jog does.
    ['a jog left unfinished yesterday', { status: 'planned' as const }],
  ])(
    'paused after %s: the walk is shown on the jog day, and the plan offers no jog',
    async (_, jog) => {
      await openMove({
        jogOptIn: true,
        weeklyPattern: pattern({ 2: [A], 5: [B], 7: [JOG] }),
        sessions: [
          ...fourWalks,
          {
            date: '2000-01-17',
            templateId: JOG,
            movements: [done('seed:ex-beach-jog', 'standard', [60], true)],
            ...jog,
          },
        ],
      });
      expect(within(region(moveScreen.beach.title)).getByText(move.jog.paused)).toBeDefined();
      expect(chip('2000-01-23')?.textContent).toBe('Walk');
      expect(sentence('2000-01-23')).toContain(move.jog.shownAsWalk);
      expect(
        screen.getByText('Jogging is not on right now, so the beach walk is shown on Sunday.'),
      ).toBeDefined();
      // EX-06: while jogging is paused no jog can be planned.
      cleanup();
      await renderMove('#/move-plan', 'Weekly plan');
      const editor = await screen.findByRole('region', { name: moveScreen.plan.title });
      fireEvent.click(within(editor).getByRole('button', { name: /^Sunday: / }));
      const beach = within(editor).getByRole('radiogroup', { name: 'Beach session on Sunday' });
      expect(
        within(beach)
          .getAllByRole('radio')
          .map((r) => r.closest('label')?.querySelector('.ui-choice__label')?.textContent),
      ).toEqual(['None', 'Beach walk']);
      expect(within(editor).getByText(moveScreen.plan.jogHint)).toBeDefined();
    },
  );

  it('explains a tolerated walk; the switch stores the opt-in and adds no jog to the week', async () => {
    await openMove();
    const card = region(moveScreen.beach.title);
    fireEvent.click(within(card).getByRole('button', { name: moveScreen.beach.toleratedButton }));
    expect(within(card).getByText(/at least 15 minutes/)).toBeDefined();
    fireEvent.click(within(card).getByRole('switch', { name: move.jog.toggle.label }));
    await waitFor(async () => {
      expect((await (test as TestDb).repos.profile.get()).jogOptIn).toBe(true);
    });
    expect((await (test as TestDb).repos.settings.get()).weeklyPattern).toBeNull();
    expect(screen.queryByText('Jog')).toBeNull();
  });
});

describe('recent sessions (M7; EX-04)', () => {
  it('lists what was ticked, the ratings and the note; rests read as rested; ten at a time', async () => {
    const extra = Array.from({ length: 10 }, (_, i) => ({
      date: `2000-01-0${(i % 9) + 1}`,
      templateId: WALK,
      status: 'rested' as const,
      preCheck: null,
    }));
    await openMove({
      sessions: [
        {
          date: '2000-01-11',
          templateId: A,
          movements: [done('seed:ex-squat', 'standard', [9, 9])],
          exertion: 3,
          soreness: 2,
          energy: 4,
          note: 'Felt steady',
        },
        {
          date: '2000-01-12',
          templateId: B,
          status: 'planned',
          preCheck: checkWith(),
          movements: [],
        },
        ...extra,
      ],
    });
    const card = region(moveScreen.history.title);
    const rows = () => within(card).getAllByRole('listitem');
    expect(rows()).toHaveLength(10);
    fireEvent.click(within(card).getByRole('button', { name: moveScreen.history.more }));
    expect(rows()).toHaveLength(11);
    const a = rows()[0];
    expect(a?.textContent).toContain('Tue 11 Jan · Session A · Done');
    expect(a?.textContent).toContain('Squat to a chair: 9 reps, 9 reps');
    expect(a?.textContent).toContain('Effort 3, soreness 2, energy 4');
    expect(a?.textContent).toContain('Note: Felt steady');
    expect(rows()[1]?.textContent).toContain(move.rest.rested);
    expect(card.textContent).not.toContain('Session B');
  });
});

describe('equipment (M8; C112)', () => {
  it.each([
    [false, false, 'Bodyweight'],
    [true, false, 'Bodyweight and bands'],
    [false, true, 'Bodyweight and dumbbells'],
    [true, true, 'Bodyweight, bands and dumbbells'],
  ])('bands %s, dumbbells %s: %s', async (bands, dumbbells, text) => {
    await openMove({ equipment: { bands, dumbbells } });
    expect(region(move.week.title).querySelector('.ui-card__aside-text')?.textContent).toBe(text);
  });
});

describe('read and dataset errors (M9)', () => {
  it('a records read that fails offers Reload', async () => {
    test = await moveFixture();
    vi.spyOn(test.repos.sessions, 'list').mockRejectedValue(new Error('read failed'));
    await renderMove('#/move', 'Move');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(moveScreen.errors.readFailed);
    fireEvent.click(within(alert).getByRole('button', { name: moveScreen.errors.reload }));
    expect(test.storage.platform.reloads).toBe(1);
  });

  it('a gate read that fails is an error, not a wait', async () => {
    test = await moveFixture();
    vi.spyOn(test.repos.readiness, 'list').mockRejectedValue(new Error('read failed'));
    renderScreenOnly('#/move', createElement(MoveScreen));
    expect((await screen.findByRole('alert')).textContent).toContain(moveScreen.errors.readFailed);
  });

  it('a dataset that cannot be read says so with Reload; answer 6 still shows its reason first', async () => {
    flags.broken = true;
    test = await moveFixture();
    await renderMove('#/move', 'Move');
    expect(await screen.findByText(move.dataError)).toBeDefined();
    expect(screen.getByRole('button', { name: moveScreen.errors.reload })).toBeDefined();
    cleanup();
    resetMove(test);
    test = await moveFixture({ answers: { q6: 'yes' } });
    await renderMove('#/move', 'Move');
    await screen.findByTestId('gate-notice-exercisePlans');
    expect(screen.queryByText(move.dataError)).toBeNull();
  });
});
