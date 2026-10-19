// The Weight check-in card in Settings (HS-11, C46; item 14 design section 2.7): adjustable only
// after reading the explanation, only towards more sensitive, never off.
import { weight } from '@diet/core/copy/health';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appStorageStore } from '../../db/runtime';
import { openTestDb, type TestDb } from '../../db/testKit';
import { WeightCheckInSettings } from './WeightCheckInSettings';

const copy = weight.rapidLossSettings;
let test: TestDb;

beforeEach(async () => {
  test = await openTestDb();
  appStorageStore.set(test.storage);
  render(<WeightCheckInSettings />);
  await screen.findByRole('region', { name: copy.label });
});

afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  test.db.shutDown();
});

const card = () => screen.getByRole('region', { name: copy.label });
const radios = (legend: string) =>
  within(within(card()).getByRole('radiogroup', { name: legend })).getAllByRole('radio');

describe('the Weight check-in card in Settings (HS-11, C46)', () => {
  it('collapsed, it shows no figure; opened, the explanation comes first and no option exists before "I have read this"', async () => {
    expect(card().textContent).not.toMatch(/\d/);
    fireEvent.click(within(card()).getByRole('button', { name: copy.open }));
    expect(within(card()).getByText(copy.explain2)).toBeTruthy();
    expect(within(card()).getByText(copy.explain3)).toBeTruthy();
    expect(within(card()).queryAllByRole('radio')).toEqual([]);
    fireEvent.click(within(card()).getByRole('button', { name: copy.readIt }));
    await waitFor(async () => {
      expect((await test.repos.settings.get()).rapidLossExplanationReadAt).toBe(test.env.now());
    });
    expect((await within(card()).findAllByRole('radio')).length).toBeGreaterThan(0);
  });

  it('the options only make it more sensitive, with no off switch; "Back to the default" restores 1 kg and 3 weeks', async () => {
    await test.repos.settings.update({ rapidLossExplanationReadAt: test.env.now() });
    fireEvent.click(await within(card()).findByRole('button', { name: copy.openAfterRead }));
    const thresholds = radios(copy.thresholdLabel);
    expect(thresholds.map((r) => r.closest('label')?.textContent)).toEqual(
      ['0.75', '0.8', '0.85', '0.9', '0.95', '1'].map((kg) => `${kg} kg a week`),
    );
    expect(radios(copy.weeksLabel).map((r) => r.closest('label')?.textContent)).toEqual([
      '2 weeks',
      '3 weeks',
    ]);
    expect(within(card()).queryByRole('switch')).toBeNull();
    const controls = within(card())
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(controls.filter((name) => /\boff\b/i.test(name))).toEqual([]);
    fireEvent.click(thresholds[0] as HTMLElement);
    fireEvent.click(radios(copy.weeksLabel)[0] as HTMLElement);
    await waitFor(async () => {
      expect(await test.repos.settings.get()).toMatchObject({
        rapidLossThresholdGPerWeek: 750,
        rapidLossConsecutiveWeeks: 2,
      });
    });
    fireEvent.click(within(card()).getByRole('button', { name: copy.reset }));
    await waitFor(async () => {
      expect(await test.repos.settings.get()).toMatchObject({
        rapidLossThresholdGPerWeek: 1000,
        rapidLossConsecutiveWeeks: 3,
      });
    });
  });
});
