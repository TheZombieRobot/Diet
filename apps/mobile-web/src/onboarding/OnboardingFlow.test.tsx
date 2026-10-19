// The first-run guard and flow (item 13 design section 7.2: K1 to K12, K16, K17, K20, K22 to
// K30; HS-20, HS-03, RD-01 to RD-08, FL-08, C41, C53, C57). The whole app is rendered in jsdom over
// the real repositories on a fresh fake-indexeddb database. Values are synthetic.
import { READINESS_QUESTION_IDS, STORES_V1 } from '@diet/core';
import {
  alcohol,
  garden,
  general,
  onboarding,
  privacy,
  profile,
  readiness,
  schedule,
} from '@diet/core/copy/health';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { StorageRuleError } from '../db/errors';
import { appStorageStore } from '../db/runtime';
import { failingWrite, onboardForTests, openTestDb, rawWriter, type TestDb } from '../db/testKit';
import { ROUTES } from '../routes';
import {
  answer,
  answerAll,
  fillProfile,
  h1,
  headingIs,
  openApp,
  passNotice,
  tap,
  throughProfile,
  type,
} from './flowTestKit';
import { restoreReloadTarget } from './navigation';
import { OPENING_SLOW_MS } from './OpeningScreen';
import { gateInputOf, readOnboardingState } from './state';

let test: TestDb;
beforeEach(async () => {
  test = await openTestDb();
  appStorageStore.set(test.storage);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  appStorageStore.set(null);
  test.db.shutDown();
  window.location.hash = '';
});

/** Reopens the app on the same records, as a reload does. */
async function reload(hash = ''): Promise<void> {
  cleanup();
  test.db.shutDown();
  test = await openTestDb({ deps: test.deps, env: test.env });
  appStorageStore.set(test.storage);
  await openApp(hash);
}

const settings = () => test.repos.settings.get();
const gateInput = async () => {
  const read = await readOnboardingState(test.storage);
  if (!read.ok) throw new Error('unreadable');
  return gateInputOf(read.state, test.env);
};
const links = () => screen.queryAllByRole('link').map((l) => l.getAttribute('href'));
const buttons = () => screen.getAllByRole('button').map((b) => b.textContent);

describe('the first-run guard (HS-20, C41, C53)', () => {
  it('K1: every route, and an unknown one, shows Welcome with only the help numbers to tap', async () => {
    for (const hash of [...ROUTES.map((r) => `#/${r}`), '#/unknown']) {
      cleanup();
      await openApp(hash);
      await headingIs(onboarding.welcome.title);
      expect(screen.getByText('Step 1 of 6')).toBeDefined();
      expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
      expect(document.body.textContent).not.toMatch(/Restore/);
      expect(document.querySelector('input[type=file]')).toBeNull();
      expect(links()).toEqual([
        'tel:111',
        'tel:0800611116',
        'tel:0800787797',
        'sms:8681',
        'tel:1737',
        'sms:1737',
      ]);
      expect(screen.getByRole('main').textContent).toContain(general.welcome);
    }
    tap(onboarding.frame.continue);
    await headingIs(alcohol.notice.title);
  });

  it('K2: the notice has no way past it but "I understand", which is stored once', async () => {
    await openApp();
    tap(onboarding.frame.continue);
    await headingIs(alcohol.notice.title);
    expect(screen.getByText('Step 2 of 6')).toBeDefined();
    expect(buttons()).toEqual([
      alcohol.notice.why,
      alcohol.notice.acknowledge,
      onboarding.frame.back,
    ]);
    expect(links()).toEqual(['tel:0800787797', 'sms:8681', 'tel:111']);
    expect(screen.getByTestId('first-run-notice').textContent).toBe(alcohol.firstRunNotice);
    const why = screen.getByRole('button', { name: alcohol.notice.why });
    expect(why.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(why);
    expect(why.getAttribute('aria-expanded')).toBe('true');
    for (const text of alcohol.notice.whyText) expect(screen.getByText(text)).toBeDefined();
    expect((await settings()).alcoholNoticeAckAt).toBeNull();
    tap(alcohol.notice.acknowledge);
    await headingIs(readiness.questions.q1);
    const ack = (await settings()).alcoholNoticeAckAt;
    expect(ack).toBe(test.env.now());
    test.env.advanceDays(1);
    await reload();
    expect((await settings()).alcoholNoticeAckAt).toBe(ack);
  });

  it('K3: restore is offered only after the notice, and Cancel keeps what was typed', async () => {
    await openApp();
    expect(screen.queryByRole('button', { name: onboarding.frame.restoreLink })).toBeNull();
    tap(onboarding.frame.continue);
    await headingIs(alcohol.notice.title);
    expect(screen.queryByRole('button', { name: onboarding.frame.restoreLink })).toBeNull();
    tap(alcohol.notice.acknowledge);
    await headingIs(readiness.questions.q1);
    expect(screen.getByRole('button', { name: onboarding.frame.restoreLink })).toBeDefined();
    await answerAll();
    tap(onboarding.frame.continue);
    await headingIs(profile.title);
    type(profile.heightLabel, '182');
    tap(onboarding.frame.restoreLink);
    await headingIs(onboarding.frame.restoreTitle);
    expect(screen.getByText(onboarding.frame.restoreIntro)).toBeDefined();
    expect(screen.getByTestId('restore-file')).toBeDefined();
    tap(privacy.importBackup.cancel);
    await headingIs(profile.title);
    expect(screen.getByLabelText<HTMLInputElement>(profile.heightLabel).value).toBe('182');
  });

  it('K29: a restore from setup reloads onto Settings, Readiness answers (E64)', async () => {
    expect(restoreReloadTarget({ pathname: '/Diet/', search: '' })).toBe('/Diet/#/readiness');
    await onboardForTests(test);
    await reload('#/readiness');
    await headingIs('Readiness answers');
  });
});

describe('readiness questions (C41, D29)', () => {
  it('K4: no forward control until answered; No moves on, Yes explains; the stored answer writes nothing', async () => {
    await passNotice();
    expect(screen.queryByRole('button', { name: onboarding.frame.continue })).toBeNull();
    expect(screen.queryByRole('button', { name: onboarding.frame.back })).toBeNull();
    expect(screen.getByText(readiness.intro)).toBeDefined();
    tap(readiness.no);
    await headingIs(readiness.questions.q2);
    tap(readiness.yes);
    await screen.findByTestId('consequence');
    expect(screen.getByText(readiness.ifYes.q2)).toBeDefined();
    tap(onboarding.frame.continue);
    await headingIs(readiness.questions.q3);
    tap(onboarding.frame.back);
    await headingIs(readiness.questions.q2);
    const before = (await test.repos.readiness.list()).find((r) => r.questionId === 'q2');
    test.env.advanceDays(1);
    tap(readiness.yes);
    await screen.findByTestId('consequence');
    const after = (await test.repos.readiness.list()).find((r) => r.questionId === 'q2');
    expect(after?.answeredAt).toBe(before?.answeredAt);
    expect(screen.getByRole('button', { name: readiness.yes }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('K5 RD-03 / HS-33: answer 3 explains the risk, the prescriber switch confirms, and a changed answer lapses it', async () => {
    await passNotice();
    await answer('q1', 'no');
    await answer('q2', 'no');
    await headingIs(readiness.questions.q3);
    tap(readiness.yes);
    await screen.findByTestId('consequence');
    expect(screen.getByText(readiness.ifYes.q3).textContent).toContain('hypoglycaemia');
    const control = screen.getByRole<HTMLInputElement>('switch', {
      name: readiness.confirmations.prescriberAgreed,
    });
    const hintId = control.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(hintId)?.textContent).toBe(readiness.confirmationLapses);
    test.env.advanceDays(1);
    fireEvent.click(control);
    await screen.findByText(readiness.confirmed.prescriberAgreed);
    expect(screen.getByRole('button', { name: readiness.changed.q3 })).toBeDefined();
    expect((await gateInput()).confirmations.prescriberAgreed).toBe(true);
    test.env.advanceDays(1);
    tap(readiness.no);
    await headingIs(readiness.questions.q4);
    tap(onboarding.frame.back);
    await headingIs(readiness.questions.q3);
    test.env.advanceDays(1);
    tap(readiness.yes);
    await screen.findByTestId('consequence');
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLInputElement>('switch', {
          name: readiness.confirmations.prescriberAgreed,
        }).checked,
      ).toBe(false);
    });
    expect((await gateInput()).confirmations.prescriberAgreed).toBe(false);
  });

  it('K6: the summary says nothing is ruled out only when nothing is switched off (E8)', async () => {
    await passNotice();
    await answerAll();
    expect(screen.getByText(readiness.summaryNone)).toBeDefined();
    expect(screen.getByText(general.readinessOutcome)).toBeDefined();
    tap(onboarding.frame.back);
    await headingIs(readiness.questions.q7);
    for (const q of ['q6', 'q5', 'q4', 'q3', 'q2'] as const) {
      tap(onboarding.frame.back);
      await headingIs(readiness.questions[q]);
    }
    tap(readiness.yes);
    await screen.findByTestId('consequence');
    tap(onboarding.frame.continue);
    await answerAll({}, 'q3');
    expect(screen.getByText(readiness.ifYes.q2).textContent).toContain('midwife or GP');
    expect(screen.getByText(readiness.summarySome)).toBeDefined();
    expect(screen.queryByText(general.readinessOutcome)).toBeNull();
  });

  it('K7 RD-07: setup resumes at the first unanswered question, then at the summary', async () => {
    await passNotice();
    await answer('q1', 'no');
    await answer('q2', 'no');
    await headingIs(readiness.questions.q3);
    await reload();
    await headingIs(readiness.questions.q3);
    await answerAll({}, 'q3');
    await reload();
    await headingIs(readiness.summaryTitle);
  });
});

describe('the profile step (UX 1d; C24, C42, HS-35)', () => {
  it.each(['q1', 'q2', 'q5'] as const)(
    'K8: with answer %s yes there is no goal or Kickstart, each with its reason, and the weight is optional',
    async (q) => {
      await passNotice();
      await answerAll({ [q]: 'yes' });
      tap(onboarding.frame.continue);
      await headingIs(profile.title);
      expect(screen.queryByLabelText(profile.goalLabel)).toBeNull();
      expect(screen.queryByRole('switch', { name: profile.kickstartLabel })).toBeNull();
      expect(screen.getByTestId('gate-notice-goalSetting')).toBeDefined();
      expect(screen.getByTestId('gate-notice-kickstart')).toBeDefined();
      expect(screen.getByText(profile.weightOptionalHint)).toBeDefined();
    },
  );

  it('K8: a birth year that may be under 18 with answer 1 "no" hides the goal and Kickstart at once (C24)', async () => {
    await passNotice();
    await answerAll();
    tap(onboarding.frame.continue);
    await headingIs(profile.title);
    expect(
      screen.getByRole<HTMLInputElement>('switch', { name: profile.kickstartLabel }),
    ).toBeDefined();
    type(profile.birthYearLabel, '1982');
    expect(
      screen.getByText(/This birth year means you may be under 18\. Until 1 January 2001/),
    ).toBeDefined();
    expect(screen.queryByLabelText(profile.goalLabel)).toBeNull();
    expect(screen.queryByRole('switch', { name: profile.kickstartLabel })).toBeNull();
  });

  it('K8b RD-04: with answer 5 yes a weight entered is still stored for the trend', async () => {
    await passNotice();
    await answerAll({ q5: 'yes' });
    await throughProfile({ weight: '82.5' });
    const weights = await test.repos.weights.list();
    expect(weights.map((w) => [w.kg, w.source])).toEqual([[82.5, 'onboarding']]);
  });

  it('K9: refused Continue focuses the first problem; a save writes the profile and one weight row; Enter never submits', async () => {
    await passNotice();
    await answerAll();
    tap(onboarding.frame.continue);
    await headingIs(profile.title);
    type(profile.heightLabel, '175');
    type(profile.weightLabel, '90');
    type(profile.goalLabel, '56.6');
    tap(onboarding.frame.continue);
    expect(await screen.findByText(onboarding.frame.fixBelow)).toBeDefined();
    expect(screen.getByText(profile.errors.goalBelowFloor)).toBeDefined();
    expect(document.activeElement).toBe(
      screen.getByLabelText<HTMLInputElement>(profile.birthYearLabel),
    );
    // Enter in the height field does nothing; in the dislikes field it adds the food.
    fireEvent.keyDown(screen.getByLabelText<HTMLInputElement>(profile.heightLabel), {
      key: 'Enter',
    });
    type(profile.dislikesLabel, ' liver ');
    fireEvent.keyDown(screen.getByLabelText<HTMLInputElement>(profile.dislikesLabel), {
      key: 'Enter',
    });
    expect(screen.getByRole('button', { name: 'Remove liver' })).toBeDefined();
    expect(h1().textContent).toBe(profile.title);
    fillProfile({ goal: '70' });
    tap(onboarding.frame.continue);
    await onSchedule();
    const stored = await test.repos.profile.get();
    expect([
      stored.heightCm,
      stored.birthYear,
      stored.sex,
      stored.goalKg,
      stored.goalReferenceKg,
    ]).toEqual([175, 1970, 'female', 70, 90]);
    expect(stored.dislikeTerms).toEqual(['liver']);
    expect((await settings()).profileConfirmedAt).not.toBeNull();
    tap(onboarding.frame.back);
    await headingIs(profile.title);
    type(profile.weightLabel, '88');
    tap(onboarding.frame.continue);
    await onSchedule();
    const weights = await test.repos.weights.list();
    expect(weights.map((w) => w.kg)).toEqual([88]);
  });

  it('K9 / C42: a goal already stored is kept when goal setting becomes unavailable', async () => {
    await passNotice();
    await answerAll();
    await throughProfile({ goal: '70' });
    tap(onboarding.frame.back);
    await headingIs(profile.title);
    type(profile.birthYearLabel, '1982');
    tap(onboarding.frame.continue);
    await headingIs(garden.title);
    expect((await test.repos.profile.get()).goalKg).toBe(70);
  });

  it('K17 C24: answer 1 yes with an adult birth year offers "Change my answer", which comes straight back with the typing kept', async () => {
    await passNotice();
    await answerAll({ q1: 'yes' });
    tap(onboarding.frame.continue);
    await headingIs(profile.title);
    fillProfile();
    fireEvent.click(
      screen.getByRole<HTMLInputElement>('checkbox', { name: profile.allergenNames.sesame }),
    );
    expect(screen.getByText(readiness.ageCheck.answeredUnder18)).toBeDefined();
    tap(readiness.ageCheck.changeAnswer);
    await headingIs(readiness.questions.q1);
    tap(readiness.no);
    await headingIs(profile.title);
    expect(screen.getByLabelText<HTMLInputElement>(profile.heightLabel).value).toBe('175');
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: profile.allergenNames.sesame })
        .checked,
    ).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>(profile.goalLabel)).toBeDefined();
  });

  it('K24 HS-35: a low weight with answer 5 "no" closes the same features, never shows the BMI, and "Change answer 5" comes back', async () => {
    await passNotice();
    await answerAll();
    tap(onboarding.frame.continue);
    await headingIs(profile.title);
    fillProfile({ weight: '55' });
    expect(screen.getByText(readiness.weightCheck.lowWeight)).toBeDefined();
    expect(screen.queryByRole('switch', { name: profile.kickstartLabel })).toBeNull();
    expect(screen.queryByLabelText(profile.goalLabel)).toBeNull();
    expect(document.body.textContent).not.toMatch(/18\.5|56\.6|BMI/);
    tap(readiness.weightCheck.changeAnswer);
    await headingIs(readiness.questions.q5);
    tap(onboarding.frame.back);
    await headingIs(profile.title);
    expect(screen.getByLabelText<HTMLInputElement>(profile.weightLabel).value).toBe('55');
    tap(onboarding.frame.continue);
    await headingIs(garden.title);
    expect((await test.repos.targets.get()).fastingPreset).toBeNull();
    tap(onboarding.frame.back);
    await headingIs(profile.title);
    type(profile.weightLabel, '82');
    expect(screen.queryByText(readiness.weightCheck.lowWeight)).toBeNull();
    // Kickstart shows again with the stored choice, which was saved off while it was unavailable.
    expect(
      screen.getByRole<HTMLInputElement>('switch', { name: profile.kickstartLabel }).checked,
    ).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>(profile.goalLabel)).toBeDefined();
  });
});

const radio = (id: string) =>
  screen.getByRole<HTMLInputElement>('radio', { name: new RegExp(`^${id}`) });
const summaryLine = () => screen.getByTestId('window-summary').textContent;

/** The schedule step, once its stored targets have arrived. */
async function onSchedule(): Promise<void> {
  await headingIs(schedule.title);
  await screen.findByRole('radiogroup', { name: schedule.presetsLegend });
}

describe('the eating schedule (FL-08 in the UI, FL-14, C55, C07)', () => {
  it('K10: Kickstart preselects 23:1 with its note; times follow the pattern; saving records who chose it', async () => {
    await passNotice();
    await answerAll();
    await throughProfile();
    await onSchedule();
    expect(screen.getByText('Step 5 of 6')).toBeDefined();
    expect(radio('23:1').checked).toBe(true);
    expect(radio('23:1').closest('label')?.textContent).toContain(schedule.kickstartChip);
    expect(screen.getByText(schedule.kickstartWhen)).toBeDefined();
    expect(screen.getByText(/One meal has to carry about 140 g protein/)).toBeDefined();
    expect(summaryLine()).toBe('Eating 6:00 pm to 7:00 pm = 1 hour. Fasting 23 hours.');
    expect(radio('22:2').closest('label')?.textContent).toContain(
      '5 pm snack + dinner · Eat 5:00 pm – 7:00 pm',
    );
    fireEvent.click(radio('22:2'));
    expect(summaryLine()).toBe('Eating 5:00 pm to 7:00 pm = 2 hours. Fasting 22 hours.');
    expect(screen.getByLabelText<HTMLInputElement>(schedule.startLabel).value).toBe('17:00');
    expect(screen.getByLabelText<HTMLInputElement>(schedule.endLabel).value).toBe('19:00');
    type(schedule.endLabel, '19:30');
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: new RegExp(`^${schedule.custom}`) }),
    ).toHaveProperty('checked', true);
    type(schedule.endLabel, '17:00');
    expect(screen.getByRole('alert').textContent).toBe(schedule.errors.sameTime);
    tap(onboarding.frame.continue);
    expect(h1().textContent).toBe(schedule.title);
    fireEvent.click(radio('23:1'));
    tap(onboarding.frame.continue);
    await headingIs(garden.title);
    const targets = await test.repos.targets.get();
    expect([targets.fastingPreset, targets.eatingWindow, targets.presetChosenBy]).toEqual([
      '23:1',
      { start: '18:00', end: '19:00' },
      'kickstart-default',
    ]);
    expect((await settings()).scheduleConfirmedAt).not.toBeNull();
    tap(onboarding.frame.back);
    await onSchedule();
    type(schedule.startLabel, '17:30');
    type(schedule.endLabel, '18:30');
    tap(onboarding.frame.continue);
    await headingIs(garden.title);
    expect((await test.repos.targets.get()).presetChosenBy).toBe('user');
  });

  it('K10: with Kickstart declined, 22:2 is preselected and saved as the default', async () => {
    await passNotice();
    await answerAll();
    tap(onboarding.frame.continue);
    await headingIs(profile.title);
    fillProfile();
    fireEvent.click(screen.getByRole<HTMLInputElement>('switch', { name: profile.kickstartLabel }));
    tap(onboarding.frame.continue);
    await onSchedule();
    expect(radio('22:2').checked).toBe(true);
    tap(onboarding.frame.continue);
    await headingIs(garden.title);
    expect((await test.repos.targets.get()).presetChosenBy).toBe('default');
  });

  it.each([
    ['answer 1', { q1: 'yes' }],
    ['answer 2', { q2: 'yes' }],
    ['answer 5', { q5: 'yes' }],
    ['answer 3 unconfirmed', { q3: 'yes' }],
  ] as const)(
    'K11 HS-03: with %s the schedule is skipped and nothing is stored',
    async (_name, answers) => {
      await passNotice();
      await answerAll(answers);
      await throughProfile();
      await headingIs(garden.title);
      expect(screen.getByText('Step 6 of 6')).toBeDefined();
      expect(document.querySelectorAll('.ui-steps__bar--done')).toHaveLength(5);
      expect(screen.queryByRole('radiogroup', { name: schedule.presetsLegend })).toBeNull();
      const targets = await test.repos.targets.get();
      expect([targets.fastingPreset, targets.eatingWindow, targets.presetChosenBy]).toEqual([
        null,
        null,
        null,
      ]);
    },
  );

  it('K25 E49: with answer 4 the pharmacist note comes first, nothing is chosen, and Continue asks for a choice', async () => {
    await passNotice();
    await answerAll({ q4: 'yes' });
    await throughProfile();
    await onSchedule();
    const note = screen.getByText(schedule.pharmacistNote);
    const list = screen.getByRole('radiogroup', { name: schedule.presetsLegend });
    expect(note.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole<HTMLInputElement>('radio').some((r) => r.checked)).toBe(false);
    expect(screen.getByText(schedule.chooseFirst)).toBeDefined();
    tap(onboarding.frame.continue);
    expect(await screen.findByText(schedule.errors.choosePattern)).toBeDefined();
    expect(document.activeElement).toBe(radio('16:8'));
    fireEvent.click(radio('23:1'));
    tap(onboarding.frame.continue);
    await headingIs(garden.title);
    expect((await test.repos.targets.get()).presetChosenBy).toBe('kickstart-default');
  });

  it('K27 E50: "No fasting plan for now" hides the times and stores no pattern', async () => {
    await passNotice();
    await answerAll();
    await throughProfile();
    await onSchedule();
    fireEvent.click(
      screen.getByRole<HTMLInputElement>('radio', { name: new RegExp(`^${schedule.none}`) }),
    );
    expect(screen.queryByLabelText(schedule.startLabel)).toBeNull();
    tap(onboarding.frame.continue);
    await headingIs(garden.title);
    const targets = await test.repos.targets.get();
    expect([targets.fastingPreset, targets.eatingWindow, targets.presetChosenBy]).toEqual([
      null,
      null,
      null,
    ]);
    expect((await settings()).scheduleConfirmedAt).not.toBeNull();
  });

  it('K26 E52: a later yes to answer 3 clears the Kickstart default and asks for the schedule again', async () => {
    await passNotice();
    await answerAll();
    await throughProfile();
    await onSchedule();
    tap(onboarding.frame.continue);
    await headingIs(garden.title);
    expect((await test.repos.targets.get()).fastingPreset).toBe('23:1');
    tap(onboarding.frame.back);
    await onSchedule();
    tap(onboarding.frame.back);
    await headingIs(profile.title);
    tap(onboarding.frame.back);
    await headingIs(readiness.summaryTitle);
    for (const q of ['q7', 'q6', 'q5', 'q4', 'q3'] as const) {
      tap(onboarding.frame.back);
      await headingIs(readiness.questions[q]);
    }
    tap(readiness.yes);
    await screen.findByTestId('consequence');
    fireEvent.click(
      screen.getByRole<HTMLInputElement>('switch', {
        name: readiness.confirmations.prescriberAgreed,
      }),
    );
    await screen.findByText(readiness.confirmed.prescriberAgreed);
    await reload();
    await onSchedule();
    expect((await test.repos.targets.get()).fastingPreset).toBeNull();
    expect((await test.repos.profile.get()).kickstartOptIn).toBe(false);
    expect(radio('22:2').checked).toBe(true);
  });

  it('K26 (c): a schedule the owner chose survives a change of the Kickstart choice', async () => {
    await passNotice();
    await answerAll();
    await throughProfile();
    await onSchedule();
    fireEvent.click(radio('18:6'));
    tap(onboarding.frame.continue);
    await headingIs(garden.title);
    tap(onboarding.frame.back);
    await onSchedule();
    tap(onboarding.frame.back);
    await headingIs(profile.title);
    fireEvent.click(screen.getByRole<HTMLInputElement>('switch', { name: profile.kickstartLabel }));
    tap(onboarding.frame.continue);
    await onSchedule();
    expect(radio('18:6').checked).toBe(true);
    expect((await test.repos.targets.get()).presetChosenBy).toBe('user');
  });
});

describe('the garden and the end of setup (C57, E24, PWA-06)', () => {
  it('K12: silverbeet is listed; added crops claim no weight unless given and can be removed; Skip finishes setup', async () => {
    const onOnboardingCompleted = vi.fn();
    test.db.shutDown();
    test = await openTestDb({ deps: test.deps, env: test.env, hooks: { onOnboardingCompleted } });
    appStorageStore.set(test.storage);
    await passNotice();
    await answerAll({ q5: 'yes' });
    await throughProfile();
    await headingIs(garden.title);
    expect(await screen.findByText(garden.silverbeetListed)).toBeDefined();
    const list = screen.getByTestId('garden-list');
    expect(list.textContent).toContain(garden.available);
    expect(within(list).queryByRole('button')).toBeNull();
    type(garden.nameLabel, 'Spinach');
    fireEvent.click(screen.getByRole<HTMLInputElement>('radio', { name: garden.unitOptions.g }));
    tap(garden.add);
    await waitFor(() => {
      expect(screen.getByTestId('garden-list').textContent).toContain('Spinach');
    });
    const spinach = (await test.repos.garden.list()).find((c) => c.name === 'Spinach');
    expect([spinach?.amount, spinach?.unit]).toEqual([null, null]);
    expect(document.activeElement).toBe(screen.getByLabelText<HTMLInputElement>(garden.nameLabel));
    type(garden.nameLabel, 'Kale');
    type(garden.amountLabel, '1');
    tap(garden.add);
    expect(await screen.findByText(garden.errors.unitRequired)).toBeDefined();
    fireEvent.click(
      screen.getByRole<HTMLInputElement>('radio', { name: garden.unitOptions.bunch }),
    );
    type(garden.keepsLabel, '1');
    tap(garden.add);
    await screen.findByText(/1 bunch · Ready to harvest · Keeps about 1 day/);
    tap('Remove Spinach');
    await waitFor(() => {
      expect(screen.getByTestId('garden-list').textContent).not.toContain('Spinach');
    });
    tap(garden.skip);
    await screen.findByRole('navigation', { name: 'Main' });
    expect(window.location.hash).toBe('#/today');
    const done = await settings();
    expect(done.gardenConfirmedAt).not.toBeNull();
    expect(done.onboardingCompletedAt).not.toBeNull();
    expect(onOnboardingCompleted).toHaveBeenCalledOnce();
  });

  it('K12: without the seeded row there is no silverbeet sentence, and an empty list says so', async () => {
    test.db.shutDown();
    const raw = await rawWriter(test.deps, STORES_V1);
    await raw.table('garden').clear();
    raw.close();
    test = await openTestDb({ deps: test.deps, env: test.env });
    appStorageStore.set(test.storage);
    await passNotice();
    await answerAll({ q5: 'yes' });
    await throughProfile();
    await headingIs(garden.title);
    expect(await screen.findByText(garden.empty)).toBeDefined();
    expect(screen.queryByText(garden.silverbeetListed)).toBeNull();
  });
});

describe('repair mode: answers missing after setup (RD-08, E56)', () => {
  it('K16: only the questions are asked, the last consequence and the summary show, then Today', async () => {
    await onboardForTests(test);
    for (const q of READINESS_QUESTION_IDS) await test.repos.readiness.clear(q);
    await openApp('#/today');
    await headingIs(readiness.questions.q1);
    expect(screen.queryByText(/Step \d of 6/)).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    tap(onboarding.frame.helpLink);
    await headingIs('About');
    tap(onboarding.frame.backToSetup);
    await headingIs(readiness.questions.q1);
    await answer('q1', 'no');
    await headingIs(readiness.questions.q2);
    tap(onboarding.frame.back);
    await headingIs(readiness.questions.q1);
    tap(readiness.no);
    for (const q of ['q2', 'q3', 'q4', 'q5', 'q6'] as const) await answer(q, 'no');
    await headingIs(readiness.questions.q7);
    tap(readiness.yes);
    await screen.findByTestId('consequence');
    tap(onboarding.frame.continue);
    await headingIs(readiness.summaryTitle);
    expect(screen.getByText(readiness.ifYes.q7)).toBeDefined();
    tap(onboarding.frame.continue);
    await screen.findByRole('navigation', { name: 'Main' });
    expect(window.location.hash).toBe('#/today');
  });

  it('K16: with only answers 3 and 6 missing, Next and Back move within those two', async () => {
    await onboardForTests(test);
    await test.repos.readiness.clear('q3');
    await test.repos.readiness.clear('q6');
    await openApp();
    await headingIs(readiness.questions.q3);
    expect(screen.getByText('Question 1 of 2')).toBeDefined();
    tap(readiness.no);
    await headingIs(readiness.questions.q6);
    tap(onboarding.frame.back);
    await headingIs(readiness.questions.q3);
  });
});

describe('write failures (E58; K20)', () => {
  async function failing(table: string, op: 'add' | 'put' | 'delete') {
    const failure = failingWrite(table, op, () => new Error('synthetic failure'));
    test.db.shutDown();
    test = await openTestDb({
      deps: test.deps,
      env: test.env,
      extraMiddleware: [failure.middleware],
    });
    appStorageStore.set(test.storage);
    return failure;
  }

  it('a readiness tap shows the message under the buttons, focused, and shows what is stored', async () => {
    const failure = await failing('readiness', 'put');
    await passNotice();
    failure.arm();
    tap(readiness.yes);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(onboarding.frame.saveFailed);
    expect(alert.parentElement).toBe(document.activeElement);
    expect(h1().textContent).toBe(readiness.questions.q1);
    expect(screen.getByRole('button', { name: readiness.yes }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('a full phone says so; finishing that fails stays on the garden, and the next tap completes once', async () => {
    const onOnboardingCompleted = vi.fn();
    const quota = failingWrite(
      'settings',
      'put',
      () => new DOMException('full', 'QuotaExceededError'),
    );
    test.db.shutDown();
    test = await openTestDb({
      deps: test.deps,
      env: test.env,
      extraMiddleware: [quota.middleware],
      hooks: { onOnboardingCompleted },
    });
    appStorageStore.set(test.storage);
    await passNotice();
    await answerAll({ q2: 'yes' });
    await throughProfile();
    await headingIs(garden.title);
    quota.arm();
    tap(garden.continue);
    expect((await screen.findByRole('alert')).textContent).toBe(privacy.storageFull);
    expect(h1().textContent).toBe(garden.title);
    expect((await settings()).onboardingCompletedAt).toBeNull();
    test.db.shutDown();
    test = await openTestDb({ deps: test.deps, env: test.env, hooks: { onOnboardingCompleted } });
    appStorageStore.set(test.storage);
    await headingIs(garden.title);
    fireEvent.click(await screen.findByRole('button', { name: garden.continue }));
    await screen.findByRole('navigation', { name: 'Main' });
    expect(onOnboardingCompleted).toHaveBeenCalledOnce();
  });
});

describe('step numbers, reachability and the back gesture (E54, E55, E59)', () => {
  it('K22: Welcome is step 1 and the notice step 2; with answer 5 the garden is step 6 of 6', async () => {
    await openApp();
    expect(screen.getByText('Step 1 of 6')).toBeDefined();
    tap(onboarding.frame.continue);
    await headingIs(alcohol.notice.title);
    expect(screen.getByText('Step 2 of 6')).toBeDefined();
  });

  it('K23: the profile stays reachable from the summary; Back then No shows the next question; a cleared answer pulls the view back', async () => {
    await passNotice();
    await answerAll();
    tap(onboarding.frame.continue);
    await headingIs(profile.title);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(h1().textContent).toBe(profile.title);
    tap(onboarding.frame.back);
    await headingIs(readiness.summaryTitle);
    for (const q of ['q7', 'q6', 'q5', 'q4', 'q3', 'q2'] as const) {
      tap(onboarding.frame.back);
      await headingIs(readiness.questions[q]);
    }
    tap(readiness.no);
    await headingIs(readiness.questions.q3);
    for (const q of ['q3', 'q4', 'q5', 'q6', 'q7'] as const) await answer(q, 'no');
    await headingIs(readiness.summaryTitle);
    tap(onboarding.frame.continue);
    await headingIs(profile.title);
    const other = await openTestDb({ deps: test.deps, env: test.env });
    await other.repos.readiness.clear('q5');
    other.db.shutDown();
    await headingIs(readiness.questions.q5);
  });

  it('K30: the back gesture steps back through setup; on Welcome the flow adds no history entry', async () => {
    const start = window.history.length;
    await openApp();
    expect(window.history.length).toBe(start);
    tap(onboarding.frame.continue);
    await headingIs(alcohol.notice.title);
    tap(alcohol.notice.acknowledge);
    await headingIs(readiness.questions.q1);
    tap(readiness.no);
    await headingIs(readiness.questions.q2);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await headingIs(readiness.questions.q1);
    tap(onboarding.frame.helpLink);
    await headingIs('About');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await headingIs(readiness.questions.q1);
  });
});

describe('the opening screen (E29, E57; K28)', () => {
  it('waits with nothing to tap, and after 5 seconds adds Reload and the help numbers', () => {
    vi.useFakeTimers();
    appStorageStore.set(null);
    render(<App />);
    expect(screen.getByRole('status').textContent).toBe(onboarding.frame.opening);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(OPENING_SLOW_MS - 1);
    });
    expect(screen.queryByText(onboarding.frame.openingSlow)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText(onboarding.frame.openingSlow)).toBeDefined();
    expect(screen.getByRole('button', { name: privacy.storageFailure.reload })).toBeDefined();
    expect(screen.getByText(general.about)).toBeDefined();
    expect(screen.getAllByRole('link').length).toBe(6);
  });

  it('a read that fails shows the failed text, Reload and the help numbers, and nothing else', async () => {
    appStorageStore.set({
      ...test.storage,
      repos: {
        ...test.storage.repos,
        settings: {
          ...test.storage.repos.settings,
          get: () => Promise.reject(new StorageRuleError('settings', 'not-found')),
        },
      },
    });
    render(<App />);
    expect(await screen.findByTestId('opening-failed')).toHaveProperty(
      'textContent',
      onboarding.frame.openingFailed,
    );
    expect(buttons()).toEqual([privacy.storageFailure.reload]);
    expect(screen.getByText(general.about)).toBeDefined();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
