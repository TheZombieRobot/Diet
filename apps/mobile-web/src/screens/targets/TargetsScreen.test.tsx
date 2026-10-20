// Settings, Diet and targets (item 21 design section 6.3, K13 to K23): WT-06, WT-07, HS-10,
// HS-25, FL-04, C50, C56, C61, C108, RD-01 to RD-06, T25, T26, T29, T30, T34. jsdom over the real
// repositories on fake-indexeddb, seeded with the synthetic fixtures of targetsTestKit.
import { STORES_V1, type TargetsRecord } from '@diet/core';
import { alcohol, privacy, profile, targets as copy } from '@diet/core/copy/health';
import type { WeightScenarioOptions } from '@diet/test-fixtures';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appStorageStore } from '../../db/runtime';
import { openTestDb, rawWriter, type TestDb } from '../../db/testKit';
import { FEMALE, MALE, MALE_STEADY, seedTargets } from './targetsTestKit';
import { TargetsScreen } from './TargetsScreen';

let test: TestDb | undefined;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  appStorageStore.set(null);
  test?.db.shutDown();
  test = undefined;
});

const region = (name: string) => screen.getByRole('region', { name });

async function open(db: TestDb): Promise<TestDb> {
  test = db;
  appStorageStore.set(db.storage);
  render(<TargetsScreen />);
  // The first live read can take more than a second on a busy machine.
  await screen.findByRole('region', { name: copy.energy.label }, { timeout: 4000 });
  return db;
}

const show = async (options: WeightScenarioOptions) => open(await seedTargets(options));

/** The fixture with targets written raw: values the forms and import would refuse (a bypass). */
async function showWithRawTargets(
  options: WeightScenarioOptions,
  patch: Partial<TargetsRecord>,
): Promise<TestDb> {
  const seeded = await seedTargets(options);
  const stored = await seeded.repos.targets.get();
  seeded.db.shutDown();
  const raw = await rawWriter(seeded.deps, STORES_V1);
  await raw.table('targets').put({ ...stored, ...patch });
  raw.close();
  return open(await openTestDb({ deps: seeded.deps, env: seeded.env }));
}

const select = (card: string, label: string) =>
  within(region(card)).getByRole<HTMLSelectElement>('combobox', { name: label });
const field = (card: string, label: string) =>
  within(region(card)).getByRole<HTMLInputElement>('textbox', { name: label });
const type = (input: HTMLInputElement, text: string) => {
  fireEvent.change(input, { target: { value: text } });
};
const save = (card: string) => {
  fireEvent.click(within(region(card)).getByRole('button', { name: copy.form.save }));
};
const radio = (name: string) =>
  screen.getByRole<HTMLInputElement>('radio', { name: new RegExp(`^${name}`) });

describe('the screen (WT-07, T15; K13)', () => {
  it('six cards in order, with the rough guide and the Kickstart target in kJ and about kcal', async () => {
    await show(MALE);
    const labels = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'));
    expect(labels.map((id) => document.getElementById(id ?? '')?.textContent)).toEqual([
      copy.dietMode.label,
      copy.energy.label,
      copy.protein.label,
      copy.carbs.label,
      copy.saturatedFat.label,
      copy.guides.label,
    ]);
    const energy = region(copy.energy.label);
    expect(within(energy).getByText('14,516 kJ a day (about 3,470 kcal)')).toBeTruthy();
    expect(within(energy).getByText('10,162 kJ (about 2,430 kcal)')).toBeTruthy();
    expect(
      within(energy).getByText(
        'Kickstart: 30% below the rough guide, with protein held at 140 g and net carbs at 20 g.',
      ),
    ).toBeTruthy();
    expect(within(energy).getByText(alcohol.dayEnergy.foodOnly)).toBeTruthy();
  });
});

describe('deficits and the floor: refuse, never clamp (HS-10, HS-25, C50, C61, C108, T34; K14, K15, K19)', () => {
  it('K14: the Kickstart deficit offers 0–30% in steps of 5 and saves on change', async () => {
    const db = await show(MALE);
    const kickstart = select(copy.energy.label, copy.energy.kickstartDeficitLabel);
    expect([...kickstart.options].map((o) => o.text)).toEqual([
      '0%',
      '5%',
      '10%',
      '15%',
      '20%',
      '25%',
      '30%',
    ]);
    fireEvent.change(kickstart, { target: { value: '10' } });
    await waitFor(async () => {
      expect((await db.repos.targets.get()).kickstartDeficitPct).toBe(10);
    });
    expect(await within(region(copy.energy.label)).findByText(copy.form.saved)).toBeTruthy();
  });

  it('K14, K15: a stored 50% or a 3,000 kJ floor (a bypass) shows the value in use and says so', async () => {
    await showWithRawTargets(MALE, { kickstartDeficitPct: 50, energyFloorKj: 3000 });
    const kickstart = select(copy.energy.label, copy.energy.kickstartDeficitLabel);
    expect(kickstart.value).toBe('30');
    expect(
      document.getElementById(kickstart.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('The stored value, 50, is outside the allowed range, so 30 is used instead.');
    const floor = field(copy.energy.label, copy.energy.floorLabel);
    expect(floor.value).toBe('5,000');
    expect(
      within(region(copy.energy.label)).getByText(/The stored value, 3,000, is outside/),
    ).toBeTruthy();
  });

  it('K15, HS-10: a floor of 4,000 is refused with a message and nothing is written; 6,000 saves', async () => {
    const db = await show(MALE);
    const update = vi.spyOn(db.repos.targets, 'update');
    const floor = field(copy.energy.label, copy.energy.floorLabel);
    type(floor, '4000');
    save(copy.energy.label);
    expect(within(region(copy.energy.label)).getByText(copy.energy.floorTooLow)).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
    expect((await db.repos.targets.get()).energyFloorKj).toBe(5000);
    type(floor, '6,000');
    save(copy.energy.label);
    await waitFor(async () => {
      expect((await db.repos.targets.get()).energyFloorKj).toBe(6000);
    });
  });

  it('K19, C61: a WT-06 day says the floor applies with no percentage; a raised floor above the guide is named', async () => {
    await show(FEMALE);
    const energy = region(copy.energy.label);
    expect(
      within(energy).getByText(
        /^This is the energy floor\. The planner never plans a day below 5,000 kJ \(about 1,200 kcal\)/,
      ),
    ).toBeTruthy();
    const paragraphs = [...energy.querySelectorAll('p')].map((p) => p.textContent);
    expect(
      paragraphs
        .filter((p) => p.startsWith('This is the energy floor') || p.startsWith('Kickstart'))
        .join(' '),
    ).not.toContain('%');
    expect(
      document.getElementById(
        select(copy.energy.label, copy.energy.kickstartDeficitLabel).getAttribute(
          'aria-describedby',
        ) ?? '',
      )?.textContent,
    ).toContain(copy.energy.deficitNotInUse);
    cleanup();
    test?.db.shutDown();
    await show({ ...FEMALE, periods: [], targets: { energyFloorKj: 6000 } });
    expect(
      within(region(copy.energy.label)).getByText(
        'Your rough guide is below the 6,000 kJ floor, so meals are planned at the floor with no deficit. Your GP or a dietitian can give you a better figure.',
      ),
    ).toBeTruthy();
  });
});

describe('protein (C50, C65; K16)', () => {
  it('a lowest figure above the highest, or 79 g, is refused and nothing is written', async () => {
    const db = await show(MALE);
    const update = vi.spyOn(db.repos.targets, 'update');
    type(field(copy.protein.label, copy.protein.minLabel), '150');
    type(field(copy.protein.label, copy.protein.maxLabel), '130');
    save(copy.protein.label);
    expect(within(region(copy.protein.label)).getByText(copy.protein.minAboveMax)).toBeTruthy();
    type(field(copy.protein.label, copy.protein.minLabel), '79');
    save(copy.protein.label);
    expect(
      within(region(copy.protein.label)).getByText('Enter a number from 80 to 200.'),
    ).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
    expect(
      within(region(copy.protein.label)).getByText(
        'During Kickstart, meals are checked against the top of your range: 140 g.',
      ),
    ).toBeTruthy();
  });
});

describe('readiness answers (RD-01 to RD-06, T25, T26, T36; K17, K17b, K23)', () => {
  const energyText = () => region(copy.energy.label).textContent;

  it('answer 1: no estimate in plain words, no activity or deficit controls, ceilings off, nothing about alcohol', async () => {
    await show({ ...MALE, readiness: { q1: 'yes' } });
    expect(energyText()).toContain(copy.energy.unavailable.under18Answer);
    expect(screen.queryByRole('combobox', { name: profile.activityLegend })).toBeNull();
    expect(screen.queryByRole('combobox', { name: copy.energy.kickstartDeficitLabel })).toBeNull();
    expect(screen.queryByRole('combobox', { name: copy.energy.steadyDeficitLabel })).toBeNull();
    expect(energyText()).toContain(copy.energy.deficitOff);
    expect(region(copy.carbs.label).textContent).toContain(copy.carbs.off);
    expect(region(copy.protein.label).textContent).toContain(copy.protein.plainNote);
    expect(
      within(region(copy.energy.label)).getByRole('link', { name: /^Readiness answers/ }),
    ).toBeTruthy();
    const page = document.body.textContent;
    for (const line of [...Object.values(alcohol.dayEnergy), alcohol.noRiskFreeLevel]) {
      expect(page).not.toContain(line.replace(/\{\w+\}.*$/, ''));
    }
  });

  it('a birth year that means the owner may be under 18 says so, with the profile link; never "your answers say"', async () => {
    await show({ ...MALE, profile: { ...MALE.profile, birthYear: 1982 } });
    expect(energyText()).toContain(copy.energy.unavailable.under18BirthYear);
    expect(energyText()).not.toContain(copy.energy.unavailable.under18Answer);
    expect(
      within(region(copy.energy.label))
        .getByRole('link', { name: /^Profile/ })
        .getAttribute('href'),
    ).toBe('#/profile');
  });

  it('answer 2: no deficit, ceilings off, the pregnancy note; the mode options say no ceiling for now (K23)', async () => {
    await show({ ...MALE, readiness: { q2: 'yes' } });
    expect(energyText()).toContain(copy.energy.deficitOff);
    expect(energyText()).toContain(copy.energy.pregnancyNote);
    expect(region(copy.carbs.label).textContent).toContain(copy.carbs.off);
    expect(radio(copy.dietMode.names.keto).closest('label')?.textContent).toContain(
      copy.dietMode.details.ceilingOff,
    );
    expect(radio(copy.dietMode.names['moderate-low-carb']).closest('label')?.textContent).toContain(
      copy.dietMode.details.ceilingOff,
    );
  });

  it('answer 3 without the prescriber: Kickstart unavailable, keto held at 50 g, the Steady deficit still offered', async () => {
    await show({ ...MALE, readiness: { q3: 'yes' } });
    expect(energyText()).toContain(copy.energy.kickstartUnavailable);
    expect(region(copy.carbs.label).textContent).toContain(copy.carbs.heldAt50);
    expect(screen.getByRole('combobox', { name: copy.energy.steadyDeficitLabel })).toBeTruthy();
  });

  it('answer 5: no deficit, ceilings off, no target row, protein as information; answering no restores the controls', async () => {
    const db = await show({ ...MALE, readiness: { q5: 'yes' } });
    expect(energyText()).not.toContain(copy.energy.targetTerm);
    expect(region(copy.protein.label).textContent).toContain(copy.protein.plainNote);
    expect(region(copy.saturatedFat.label).textContent).toContain(copy.saturatedFat.plainNote);
    await act(async () => {
      await db.repos.readiness.answer('q5', 'no');
    });
    expect(
      await screen.findByRole('combobox', { name: copy.energy.kickstartDeficitLabel }),
    ).toBeTruthy();
    expect((await db.repos.targets.get()).kickstartDeficitPct).toBe(30);
  });

  it('K17b: with no answers at all, the missing-answers notice and the readiness link; never "under 18"', async () => {
    const answers = Object.fromEntries(
      ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'].map((q) => [q, null]),
    );
    await show({ ...MALE, readiness: answers });
    expect(screen.getByText(copy.screen.missingAnswers)).toBeTruthy();
    expect(energyText()).toContain(copy.energy.unavailable.unanswered);
    expect(document.body.textContent).not.toMatch(/you are under 18|may be under 18/);
  });
});

describe('the diet mode: pick, then confirm (FL-04, C56, T29; K18)', () => {
  it('a radio pick writes nothing; "Change diet mode" switches and says so', async () => {
    const db = await show(MALE_STEADY);
    const switchTo = vi.spyOn(db.repos.dietMode, 'switchTo');
    fireEvent.keyDown(radio(copy.dietMode.names.keto), { key: 'ArrowDown' });
    fireEvent.keyDown(radio(copy.dietMode.names['moderate-low-carb']), { key: 'ArrowDown' });
    expect(radio(copy.dietMode.names.balanced).checked).toBe(true);
    expect(switchTo).not.toHaveBeenCalled();
    expect((await db.repos.profile.get()).dietMode).toBe('keto');
    fireEvent.click(screen.getByRole('button', { name: copy.dietMode.change }));
    expect(await screen.findByText('Diet mode is now Balanced.')).toBeTruthy();
    expect(switchTo).toHaveBeenCalledWith('balanced', { endKickstart: false });
    expect((await db.repos.profile.get()).dietMode).toBe('balanced');
  });

  it('with a Kickstart running, leaving keto asks first; Keep keto writes nothing; confirming ends it', async () => {
    const db = await show(MALE);
    const change = () => {
      fireEvent.click(screen.getByRole('button', { name: copy.dietMode.change }));
    };
    fireEvent.click(radio(copy.dietMode.names.balanced));
    change();
    const title = await screen.findByText(copy.dietMode.leaveKickstart.title);
    await waitFor(() => {
      expect(document.activeElement).toBe(title);
    });
    expect((await db.repos.profile.get()).dietMode).toBe('keto');
    fireEvent.click(radio(copy.dietMode.names['moderate-low-carb']));
    expect(screen.getByText(copy.dietMode.leaveKickstart.title)).toBeTruthy();
    fireEvent.click(radio(copy.dietMode.names.keto));
    expect(screen.queryByText(copy.dietMode.leaveKickstart.title)).toBeNull();
    fireEvent.click(radio(copy.dietMode.names.balanced));
    change();
    fireEvent.click(
      await screen.findByRole('button', { name: copy.dietMode.leaveKickstart.cancel }),
    );
    expect(radio(copy.dietMode.names.keto).checked).toBe(true);
    expect(document.activeElement).toBe(radio(copy.dietMode.names.keto));
    expect((await db.repos.kickstart.listPeriods())[0]?.endReason).toBeNull();
    fireEvent.click(radio(copy.dietMode.names.balanced));
    change();
    fireEvent.click(
      await screen.findByRole('button', { name: copy.dietMode.leaveKickstart.confirm }),
    );
    expect(await screen.findByText('Diet mode is now Balanced.')).toBeTruthy();
    expect((await db.repos.kickstart.listPeriods())[0]?.endReason).toBe('left-keto');
  });

  it('a Kickstart started after the screen rendered still gets the question (decided by the repository)', async () => {
    const db = await show(MALE_STEADY);
    await act(async () => {
      await db.repos.kickstart.startPeriod();
    });
    fireEvent.click(radio(copy.dietMode.names.balanced));
    fireEvent.click(screen.getByRole('button', { name: copy.dietMode.change }));
    expect(await screen.findByText(copy.dietMode.leaveKickstart.title)).toBeTruthy();
    expect((await db.repos.profile.get()).dietMode).toBe('keto');
  });
});

describe('states (T30; K20 to K22)', () => {
  it('K20: with the records closed, every control is disabled under the closed notice', async () => {
    const db = await show(MALE);
    act(() => {
      db.db.gate.close();
    });
    expect(await screen.findByText(privacy.backupCard.closed)).toBeTruthy();
    for (const control of screen.getAllByRole('combobox'))
      expect(control).toHaveProperty('disabled', true);
    for (const control of screen.getAllByRole('textbox'))
      expect(control).toHaveProperty('disabled', true);
    for (const control of screen.getAllByRole('radio'))
      expect(control.matches(':disabled')).toBe(true);
  });

  it('K21: a read that fails says so with Reload, and shows no form controls', async () => {
    const seeded = await seedTargets(MALE);
    test = seeded;
    vi.spyOn(seeded.db, 'transaction').mockImplementation(() => {
      throw new Error('Synthetic failure');
    });
    appStorageStore.set(seeded.storage);
    render(<TargetsScreen />);
    expect(await screen.findByText(copy.screen.readFailed, {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('K22: "Saved." stays until the next edit in its card, and is gone after leaving the screen', async () => {
    await show(MALE);
    fireEvent.change(select(copy.saturatedFat.label, copy.saturatedFat.budgetLabel), {
      target: { value: '8' },
    });
    expect(await within(region(copy.saturatedFat.label)).findByText(copy.form.saved)).toBeTruthy();
    type(field(copy.energy.label, copy.energy.floorLabel), '5,5');
    expect(within(region(copy.saturatedFat.label)).getByText(copy.form.saved)).toBeTruthy();
    fireEvent.change(select(copy.saturatedFat.label, copy.saturatedFat.budgetLabel), {
      target: { value: '9' },
    });
    cleanup();
    render(<TargetsScreen />);
    await screen.findByRole('region', { name: copy.saturatedFat.label }, { timeout: 4000 });
    expect(screen.queryByText(copy.form.saved)).toBeNull();
  });
});
