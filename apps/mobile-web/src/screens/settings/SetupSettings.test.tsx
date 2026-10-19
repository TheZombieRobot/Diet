// Settings for the setup answers, gate notices and the day-one help card (item 13 design section
// 7.2: K13, K14, K15, K15b, K20 (Settings and Today), K21, K27; RD-01, RD-02, RD-05, RD-06, AL-09,
// AL-09b, C58). The whole app over the real repositories on fake-indexeddb; synthetic values.
import { STORES_V1 } from '@diet/core';
import { alcohol, onboarding, profile, readiness, schedule } from '@diet/core/copy/health';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appStorageStore } from '../../db/runtime';
import {
  backupSnapshot,
  failingWrite,
  onboardForTests,
  openTestDb,
  rawWriter,
  type OnboardOptions,
  type TestDb,
} from '../../db/testKit';
import { go, headingIs, openApp, tap } from '../../onboarding/flowTestKit';
import type { RouteId } from '../../routes';
import { storageStore } from '../../pwa/storage';

let test: TestDb;
beforeEach(() => {
  storageStore.set('protected');
});
afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  storageStore.set('checking');
  test.db.shutDown();
  window.location.hash = '';
});

/** A finished setup, then the app open at a route. */
async function setUp(route: RouteId, options: OnboardOptions = {}): Promise<void> {
  test = await openTestDb();
  await onboardForTests(test, options);
  appStorageStore.set(test.storage);
  await openApp(`#/${route}`);
  await screen.findByRole('navigation', { name: 'Main' });
}

const row = (q: string) => within(screen.getByTestId(`readiness-${q}`));

/** Lets the live queries of the screen settle, so a card that should not show has had its chance. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
}
const featureOff = (feature: string) => screen.queryByTestId(`gate-notice-${feature}`);

describe('Settings, Readiness answers (RD-06; K13, K21)', () => {
  it('K13: answer 5 changed in Settings hides fasting everywhere at once and changes no other record', async () => {
    await setUp('readiness', {
      profile: { goalKg: 70, goalSetAt: '2000-03-01T00:00:00.000Z', goalReferenceKg: 90 },
    });
    await test.repos.targets.update({
      fastingPreset: '23:1',
      eatingWindow: { start: '18:00', end: '19:00' },
      presetChosenBy: 'user',
    });
    const before = await backupSnapshot(test.db);
    await screen.findByTestId('readiness-q5');
    fireEvent.click(row('q5').getByRole('button', { name: readiness.yes }));
    await waitFor(() => {
      expect(
        row('q5').getByRole('button', { name: readiness.yes }).getAttribute('aria-pressed'),
      ).toBe('true');
    });
    await go('eating-schedule');
    await headingIs('Eating schedule');
    expect(await screen.findByTestId('gate-notice-fasting')).toBeDefined();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    await go('food');
    expect(await screen.findByTestId('gate-notice-ketoCeiling')).toBeDefined();
    const after = await backupSnapshot(test.db);
    for (const table of Object.keys(before) as (keyof typeof before)[]) {
      if (table === 'readiness' || table === 'profile') continue;
      expect(after[table], table).toEqual(before[table]);
    }
    const [p0, p1] = [before.profile[0], after.profile[0]];
    // Only the gate-effect fields and the update time may change (named, everything else compared).
    const CHANGEABLE = ['carbCeilingStartedAt', 'firstLowCarbAt', 'kickstartOptIn', 'updatedAt'];
    const omit = (p: object) =>
      Object.fromEntries(Object.entries(p).filter(([key]) => !CHANGEABLE.includes(key)));
    expect(omit(p1 ?? {})).toEqual(omit(p0 ?? {}));
    await go('readiness');
    await screen.findByTestId('readiness-q5');
    fireEvent.click(row('q5').getByRole('button', { name: readiness.no }));
    await go('eating-schedule');
    await screen.findByRole('radiogroup', { name: schedule.presetsLegend });
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /^23:1/ }).checked).toBe(true);
    expect((await test.repos.profile.get()).goalKg).toBe(70);
  });

  it('K21 E53: the prescriber switch shows once; "has changed" lapses it and fasting goes off', async () => {
    await setUp('readiness', { answers: { q3: 'yes' }, confirmations: ['prescriberAgreed'] });
    await screen.findByTestId('readiness-q3');
    expect(
      screen.getAllByRole('switch', { name: readiness.confirmations.prescriberAgreed }),
    ).toHaveLength(1);
    test.env.advanceDays(1);
    fireEvent.click(screen.getByRole('button', { name: readiness.changed.q3 }));
    expect(await screen.findByText(readiness.changedDone.q3)).toBeDefined();
    expect(
      screen.getByRole<HTMLInputElement>('switch', {
        name: readiness.confirmations.prescriberAgreed,
      }).checked,
    ).toBe(false);
    await go('eating-schedule');
    expect(await screen.findByTestId('gate-notice-fasting')).toBeDefined();
  });
});

describe('gate notices on the placeholders (RD-01, RD-02, RD-05; K14)', () => {
  it('answer 1: Drinks says why alcohol logging is off, and Food why the keto ceiling is', async () => {
    await setUp('drinks', { answers: { q1: 'yes' } });
    expect((await screen.findByTestId('gate-notice-alcoholLogging')).textContent).toBe(
      'Alcohol logging is off because of what you told the app about being under 18.',
    );
    expect(
      screen.getByRole('link', { name: readiness.changeAnswersLink }).getAttribute('href'),
    ).toBe('#/readiness');
    await go('food');
    expect(await screen.findByTestId('gate-notice-ketoCeiling')).toBeDefined();
  });

  it('answer 2: Food has the notice, Drinks none', async () => {
    await setUp('food', { answers: { q2: 'yes' } });
    expect(await screen.findByTestId('gate-notice-ketoCeiling')).toBeDefined();
    await go('drinks');
    await headingIs('Drinks');
    expect(featureOff('alcoholLogging')).toBeNull();
  });

  it('answer 6: Move hides exercise plans until the GP switch is on', async () => {
    await setUp('move', { answers: { q6: 'yes' } });
    const notice = await screen.findByTestId('gate-notice-exercisePlans');
    expect(notice.parentElement?.textContent).toContain(
      readiness.confirmationHints.gpExerciseDiscussed,
    );
    await go('readiness');
    fireEvent.click(
      await screen.findByRole('switch', { name: readiness.confirmations.gpExerciseDiscussed }),
    );
    await waitFor(async () => {
      expect(
        (await test.repos.readiness.list()).some((r) => r.questionId === 'gpExerciseDiscussed'),
      ).toBe(true);
    });
    await go('move');
    await headingIs('Move');
    await waitFor(() => {
      expect(featureOff('exercisePlans')).toBeNull();
    });
  });
});

describe('Settings, Eating schedule and Profile (K27, K20)', () => {
  it('K27: with no pattern stored, the screen says so and "No fasting plan for now" is chosen', async () => {
    await setUp('eating-schedule');
    await test.repos.targets.update({
      fastingPreset: null,
      eatingWindow: null,
      presetChosenBy: null,
    });
    cleanup();
    await openApp('#/eating-schedule');
    expect(await screen.findByText(schedule.noneSaved)).toBeDefined();
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: new RegExp(`^${schedule.none}`) })
        .checked,
    ).toBe(true);
  });

  it('K20: a failed profile save shows the message at the top of the form and keeps the screen', async () => {
    const failure = failingWrite('profile', 'put', () => new Error('synthetic failure'));
    test = await openTestDb({ extraMiddleware: [failure.middleware] });
    await onboardForTests(test);
    appStorageStore.set(test.storage);
    await openApp('#/profile');
    await screen.findByLabelText(profile.heightLabel);
    failure.arm();
    tap(profile.save);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(onboarding.frame.saveFailed);
    const form = document.querySelector('form');
    expect(form?.firstElementChild?.contains(alert)).toBe(true);
  });
});

describe('the "talk to someone" card from day one (AL-09, AL-09b, C58; K15)', () => {
  const card = () => screen.queryByTestId('alcohol-help-card');

  it('K15b: with answer 7 "no" there is no card on Today', async () => {
    await setUp('today');
    await settle();
    expect(card()).toBeNull();
    expect(await test.repos.cardState.get('alcohol-help', 'readiness-q7')).toBeUndefined();
  });

  it('K15b: answer 7 to the weekend wording shows the card first on Today, with the help rows', async () => {
    await setUp('today', { answers: { q7: 'yes' } });
    const text = await screen.findByTestId('alcohol-help-card');
    expect(text.textContent).toBe(alcohol.helpCard);
    expect(text.textContent).toContain('most days or heavily at weekends');
    const section = text.closest('section');
    expect(section?.parentElement?.querySelector('section')).toBe(section);
    const hrefs = within(section as HTMLElement)
      .getAllByRole('link')
      .map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(['tel:0800787797', 'sms:8681', 'tel:111']);
    expect(readiness.questions.q7).toBe('Do you drink alcohol most days, or heavily at weekends?');
  });

  it('K15: Not now hides it for 720 hours; answer 7 "no" hides it at once', async () => {
    await setUp('today', { answers: { q7: 'yes' } });
    await screen.findByTestId('alcohol-help-card');
    tap(alcohol.helpCardNotNow);
    await waitFor(() => {
      expect(card()).toBeNull();
    });
    test.env.set(new Date(Date.parse(test.env.now()) + 720 * 3_600_000 - 60_000).toISOString());
    cleanup();
    await openApp('#/today');
    await screen.findByRole('navigation', { name: 'Main' });
    await settle();
    expect(card()).toBeNull();
    test.env.set(new Date(Date.parse(test.env.now()) + 60_000).toISOString());
    cleanup();
    await openApp('#/today');
    expect(await screen.findByTestId('alcohol-help-card')).toBeDefined();
    await go('readiness');
    await screen.findByTestId('readiness-q7');
    fireEvent.click(row('q7').getByRole('button', { name: readiness.no }));
    await waitFor(async () => {
      expect((await test.repos.readiness.list()).find((r) => r.questionId === 'q7')?.answer).toBe(
        'no',
      );
    });
    await go('today');
    await headingIs('Today');
    await settle();
    expect(card()).toBeNull();
  });

  it('K15: it comes back the moment the 720 hours end, without anything else redrawing Today (item 12 redraw rule)', async () => {
    test = await openTestDb();
    await onboardForTests(test, { answers: { q7: 'yes' } });
    const now = Date.parse(test.env.now());
    await test.db.card_state.put({
      cardId: 'alcohol-help',
      trigger: 'readiness-q7',
      firstShownAt: new Date(now - 800 * 3_600_000).toISOString(),
      dismissedAt: new Date(now - 720 * 3_600_000 + 1_500).toISOString(),
      dismissedTimeZone: 'Pacific/Auckland',
      doneAt: null,
    });
    appStorageStore.set(test.storage);
    await openApp('#/today');
    await screen.findByRole('navigation', { name: 'Main' });
    await settle();
    expect(card()).toBeNull();
    // The clock moves on; only the timer set for that moment can draw the card again.
    test.env.set(new Date(now + 1_510).toISOString());
    expect(await screen.findByTestId('alcohol-help-card', {}, { timeout: 5_000 })).toBeDefined();
  });

  it('K15: a done time, or a dismissal dated ahead, never hides it', async () => {
    test = await openTestDb();
    await onboardForTests(test, { answers: { q7: 'yes' } });
    const now = Date.parse(test.env.now());
    test.db.shutDown();
    const raw = await rawWriter(test.deps, STORES_V1);
    await raw.table('card_state').put({
      cardId: 'alcohol-help',
      trigger: 'readiness-q7',
      firstShownAt: new Date(now - 86_400_000).toISOString(),
      dismissedAt: new Date(now + 86_400_000).toISOString(),
      dismissedTimeZone: 'Pacific/Auckland',
      doneAt: new Date(now - 3_600_000).toISOString(),
    });
    raw.close();
    test = await openTestDb({ deps: test.deps, env: test.env });
    appStorageStore.set(test.storage);
    await openApp('#/today');
    expect(await screen.findByTestId('alcohol-help-card')).toBeDefined();
  });

  it('K20: a failed Not now keeps the card with the message', async () => {
    const failure = failingWrite('card_state', 'put', () => new Error('synthetic failure'));
    test = await openTestDb({ extraMiddleware: [failure.middleware] });
    await onboardForTests(test, { answers: { q7: 'yes' } });
    appStorageStore.set(test.storage);
    await openApp('#/today');
    await screen.findByTestId('alcohol-help-card');
    failure.arm();
    tap(alcohol.helpCardNotNow);
    expect((await screen.findByRole('alert')).textContent).toBe(onboarding.frame.saveFailed);
    expect(card()).not.toBeNull();
  });
});
