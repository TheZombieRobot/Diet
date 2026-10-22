// The Move screens' test fixture (item 27 design section 5.3), written through the repositories
// over fake-indexeddb with the test clock. Imported only by tests; every value is synthetic.
import {
  type DietMode,
  type Instant,
  type KickstartCheckRecord,
  localDateOf,
  PRE_CHECK_KEYS,
  PRE_START_STOP_SIGN_CARD,
  type PreCheck,
  preStartTrigger,
  READINESS_WORDING,
  type ReadinessQuestionId,
  type SessionMovement,
  type SessionRecord,
  type WeeklyPatternDay,
  type YesNo,
} from '@diet/core';
import { move } from '@diet/core/copy/health';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import { App } from '../../App';
import { appStorageStore } from '../../db/runtime';
import type { CreateInput } from '../../db/repos/crud';
import { onboardForTests, openTestDb, type TestDb, testEnv } from '../../db/testKit';
import { storageStore } from '../../pwa/storage';
import { finishDraftStore } from './finishDrafts';

/** Tuesday 18 January 2000, 9:00 am in Auckland: Session A in the standard week. */
export const MOVE_NOW: Instant = '2000-01-17T20:00:00.000Z';
export const ZONE = 'Pacific/Auckland';
export const A = 'seed:session-a';
export const B = 'seed:session-b';
export const C = 'seed:session-c';
export const WALK = 'seed:session-beach-walk';
export const JOG = 'seed:session-beach-jog';

/** 9:00 am on a summer date in Auckland (NZDT, UTC+13). */
export const morningOf = (date: string): Instant =>
  new Date(Date.parse(`${date}T09:00:00.000+13:00`)).toISOString();

/** A check with these answers yes and the rest no. */
export function checkWith(...yes: (keyof PreCheck)[]): PreCheck {
  return Object.fromEntries(
    PRE_CHECK_KEYS.map((key) => [key, yes.includes(key) ? 'yes' : 'no']),
  ) as unknown as PreCheck;
}

/** One movement with these ticked sets (reps unless `seconds`). */
export function done(
  exerciseId: string,
  variant: SessionMovement['variant'],
  amounts: readonly number[],
  seconds = false,
): SessionMovement {
  const sets = amounts.map((n) =>
    seconds ? { reps: null, seconds: n } : { reps: n, seconds: null },
  );
  return {
    exerciseId,
    variant,
    sets: Math.max(1, amounts.length),
    reps: seconds ? null : (amounts.at(-1) ?? 8),
    seconds: seconds ? (amounts.at(-1) ?? 30) : null,
    done: sets,
  };
}

export type SessionInput = Pick<SessionRecord, 'date' | 'templateId'> &
  Partial<Omit<CreateInput<'sessions'>, 'date' | 'templateId'>>;

/** A week with these weekdays' templates and every other day empty. */
export function pattern(
  days: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string[]>>,
): WeeklyPatternDay[] {
  return ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({
    weekday,
    templateIds: days[weekday] ?? [],
  }));
}

export interface MoveFixture {
  readonly now?: Instant;
  /** Answers other than "no"; null removes the answer (as after an import). */
  readonly answers?: Partial<Record<ReadinessQuestionId, YesNo | null>>;
  readonly equipment?: { readonly bands?: boolean; readonly dumbbells?: boolean };
  readonly jogOptIn?: boolean;
  readonly dietMode?: DietMode;
  readonly weeklyPattern?: WeeklyPatternDay[];
  /** Done rows default to an all-no check; give `preCheck: null` for an imported row. */
  readonly sessions?: readonly SessionInput[];
  /** A running fast from this instant. */
  readonly fastFrom?: Instant;
  /** Answers written after the fast began (as when answer 2 turns yes mid-fast). */
  readonly answersLater?: Partial<Record<ReadinessQuestionId, YesNo>>;
  /** Stored Kickstart stop-sign checks. */
  readonly kickstartChecks?: readonly Partial<KickstartCheckRecord>[];
  /** Pre-start stop-sign answers, as item 14 records them (a card_state row), at these instants. */
  readonly preStartYes?: readonly Instant[];
}

/** A finished setup (item 13's helper), then the Move records, at the clock `now`. */
export async function moveFixture(fixture: MoveFixture = {}): Promise<TestDb> {
  const now = fixture.now ?? MOVE_NOW;
  const test = await openTestDb({ env: testEnv('2000-01-01T00:00:00.000Z', ZONE) });
  const answers: Partial<Record<ReadinessQuestionId, YesNo>> = {};
  for (const [q, a] of Object.entries(fixture.answers ?? {})) {
    if (a !== null) answers[q as ReadinessQuestionId] = a;
  }
  await onboardForTests(test, {
    answers,
    profile: {
      equipmentBands: fixture.equipment?.bands ?? false,
      equipmentDumbbells: fixture.equipment?.dumbbells ?? false,
      jogOptIn: fixture.jogOptIn ?? false,
    },
  });
  // The diet mode as a record: its only writer is item 21's switch.
  await test.db.profile.put({
    ...(await test.repos.profile.get()),
    dietMode: fixture.dietMode ?? 'balanced',
  });
  for (const [q, a] of Object.entries(fixture.answers ?? {})) {
    if (a === null) await test.db.readiness.delete(q);
  }
  if (fixture.weeklyPattern !== undefined) {
    await test.repos.settings.update({ weeklyPattern: fixture.weeklyPattern });
  }
  for (const s of fixture.sessions ?? []) {
    test.env.set(morningOf(s.date));
    await test.repos.sessions.create({
      status: 'done',
      movements: [],
      preCheck: checkWith(),
      exertion: null,
      soreness: null,
      energy: null,
      durationMinutes: null,
      note: null,
      ...s,
    });
  }
  if (fixture.fastFrom !== undefined) {
    test.env.set(fixture.fastFrom);
    await test.repos.fasts.start();
  }
  // Records only, as item 16's Today fixture does: the readiness writers stay item 13's actions.
  for (const [q, answer] of Object.entries(fixture.answersLater ?? {})) {
    await test.db.readiness.put({
      questionId: q as ReadinessQuestionId,
      answer,
      wordingVersion: READINESS_WORDING[q as ReadinessQuestionId],
      answeredAt: test.env.now(),
    });
  }
  if ((fixture.kickstartChecks ?? []).length > 0) {
    const periodId = test.env.randomId();
    await test.db.kickstart_periods.put({
      id: periodId,
      startedAt: '2000-01-01T00:00:00.000Z',
      timeZone: ZONE,
      endedAt: '2000-01-10T00:00:00.000Z',
      endedTimeZone: ZONE,
      endReason: 'user-ended',
    });
    for (const c of fixture.kickstartChecks ?? []) {
      await test.db.kickstart_checks.add({
        id: test.env.randomId(),
        periodId,
        askedAt: '2000-01-16T20:00:00.000Z',
        timeZone: ZONE,
        dizzyOnStanding: 'no',
        palpitations: 'no',
        crampsNotSettling: 'no',
        faintAtWork: 'no',
        energyRating: null,
        sleepRating: null,
        outcome: 'stop-sign',
        ...c,
      });
    }
  }
  for (const at of fixture.preStartYes ?? []) {
    test.env.set(at);
    await test.repos.cardState.reopen(
      PRE_START_STOP_SIGN_CARD,
      preStartTrigger(localDateOf(at, ZONE)),
    );
  }
  test.env.set(now);
  storageStore.set('protected');
  appStorageStore.set(test.storage);
  return test;
}

/** The whole app at `hash`, waiting for the screen's heading. */
export async function renderMove(hash: string, heading: string): Promise<HTMLElement> {
  window.location.hash = hash;
  render(createElement(App));
  await screen.findByRole('heading', { level: 1, name: heading });
  return screen.getByRole('main');
}

/**
 * One screen alone, in a `main` as in the shell: for a readiness answer left unanswered after
 * setup, where the whole app would show item 13's repair questions first (RD-08).
 */
export function renderScreenOnly(hash: string, element: ReactElement): HTMLElement {
  window.location.hash = hash;
  render(createElement('main', null, element));
  return screen.getByRole('main');
}

/** Moves the clock and lets the screens read it (as on return to the app). */
export async function clockTo(test: TestDb, at: Instant): Promise<void> {
  test.env.set(at);
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
  });
}

export function resetMove(test: TestDb | undefined): void {
  finishDraftStore.set({});
  appStorageStore.set(null);
  storageStore.set('checking');
  window.location.hash = '';
  test?.db.shutDown();
}

/** The card labels in `main`, in order. */
export function regionNames(main: HTMLElement): string[] {
  return [...main.querySelectorAll('section')].map((s) => s.querySelector('h2')?.textContent ?? '');
}

export const region = (name: string): HTMLElement => screen.getByRole('region', { name });

/** Answers the six questions: the named ones yes, every other one no. */
export function answerCheck(...yes: (keyof PreCheck)[]): void {
  const card = region(move.preCheck.title);
  for (const key of PRE_CHECK_KEYS) {
    const group = within(card).getByRole('radiogroup', { name: move.preCheck.questions[key] });
    fireEvent.click(within(group).getByRole('radio', { name: yes.includes(key) ? 'Yes' : 'No' }));
  }
}

/** The names of the choice buttons, in order. */
export function choiceButtons(): string[] {
  return within(screen.getByTestId('choice'))
    .getAllByRole('button')
    .map((b) => b.textContent);
}

/** Every session row, by date then id. */
export async function sessionRows(test: TestDb): Promise<SessionRecord[]> {
  const rows = await test.repos.sessions.list();
  return rows.sort((a, b) => (a.date + a.id < b.date + b.id ? -1 : 1));
}
