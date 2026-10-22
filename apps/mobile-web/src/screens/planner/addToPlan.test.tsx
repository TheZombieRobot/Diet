// "Add to plan" and "Hide from suggestions" on a recipe's page, and Settings' Hidden recipes card
// (item 22 design 2.14, 2.15, K15): the whole app over the shipped datasets (no figures loaded, so
// every seed's allergens are "not fully known" for an owner who lists one). Synthetic profile.
import { planner, recipes } from '@diet/core/copy/health';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { appStorageStore } from '../../db/runtime';
import { type OnboardOptions, onboardForTests, openTestDb, type TestDb } from '../../db/testKit';
import { recipeHref } from '../../routes';
import { screenTitleStore } from '../../screenTitle';

const FISH = 'seed:recipe-fish-garlicky-silverbeet';
const TRAYBAKE = 'seed:recipe-chicken-silverbeet-traybake';
let test: TestDb;

beforeEach(() => {
  window.matchMedia = vi.fn(
    (query: string) => ({ matches: false, media: query }) as MediaQueryList,
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  screenTitleStore.set(null);
  test.db.shutDown();
  window.location.hash = '';
});

async function page(id: string, options: OnboardOptions = {}): Promise<HTMLElement> {
  test = await openTestDb();
  await onboardForTests(test, options);
  appStorageStore.set(test.storage);
  window.location.hash = recipeHref(id);
  render(<App />);
  return screen.findByRole('region', { name: recipes.actions.label });
}

describe('Add to plan on a recipe’s page (item 22 K15; UX 3b, HS-24, P41)', () => {
  it('fish listed: the conflict confirmation names fish first; Cancel writes nothing; "Add it anyway" adds the meal', async () => {
    const actions = await page(FISH, { profile: { allergens: ['fish'] } });
    fireEvent.click(within(actions).getByRole('button', { name: recipes.actions.addToPlan }));
    const panel = await screen.findByTestId('add-to-plan');
    expect(within(panel).getByRole('radio', { name: planner.dayNames.today })).toHaveProperty(
      'checked',
      true,
    );
    expect(within(panel).getByRole('radio', { name: 'Dinner' })).toHaveProperty('checked', true);
    fireEvent.click(within(panel).getByRole('button', { name: recipes.actions.addToPlan }));
    expect((await within(panel).findByText(planner.conflict.title)).tagName).toBe('H3');
    expect(panel.textContent).toContain('fish');
    fireEvent.click(within(panel).getByRole('button', { name: planner.conflict.cancel }));
    expect(await test.repos.planDays.list()).toEqual([]);
    fireEvent.click(within(panel).getByRole('button', { name: recipes.actions.addToPlan }));
    fireEvent.click(await within(panel).findByRole('button', { name: planner.conflict.confirm }));
    expect(await screen.findByText("Added to Wednesday 1 March's dinner.")).toBeDefined();
    await waitFor(async () => {
      expect((await test.repos.planDays.get('2000-03-01'))?.meals[0]?.recipeId).toBe(FISH);
    });
  });

  it('peanuts listed: the label check names peanuts and the lines; only Confirm writes', async () => {
    const actions = await page(TRAYBAKE, { profile: { allergens: ['peanut'] } });
    fireEvent.click(within(actions).getByRole('button', { name: recipes.actions.addToPlan }));
    const panel = await screen.findByTestId('add-to-plan');
    fireEvent.click(within(panel).getByRole('button', { name: recipes.actions.addToPlan }));
    const check = await within(panel).findByTestId('label-check');
    expect(check.textContent).toContain('peanuts');
    expect(within(check).getAllByRole('listitem').length).toBeGreaterThan(0);
    fireEvent.click(within(check).getByRole('button', { name: planner.labelCheck.cancel }));
    expect(await test.repos.planDays.list()).toEqual([]);
    fireEvent.click(within(panel).getByRole('button', { name: recipes.actions.addToPlan }));
    fireEvent.click(await within(panel).findByRole('button', { name: planner.labelCheck.confirm }));
    await waitFor(async () => {
      expect((await test.repos.planDays.get('2000-03-01'))?.meals).toHaveLength(1);
    });
  });
});

describe('Hide from suggestions (item 22 K15; UX 7, D3)', () => {
  it('hides a seed from the planner, shows it in Settings, and suggests it again from there', async () => {
    const actions = await page(TRAYBAKE);
    fireEvent.click(within(actions).getByRole('button', { name: planner.hidden.hide }));
    expect(await within(actions).findByText(planner.hidden.hiddenNote)).toBeDefined();
    expect((await test.repos.settings.get()).hiddenSeedIds).toEqual([TRAYBAKE]);
    window.location.hash = '#/settings';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    const card = await screen.findByRole('region', { name: planner.hidden.cardLabel });
    fireEvent.click(
      await within(card).findByRole('button', {
        name: 'Suggest Lemon chicken and silverbeet traybake again',
      }),
    );
    expect(await within(card).findByText(planner.hidden.none)).toBeDefined();
    expect((await test.repos.settings.get()).hiddenSeedIds).toEqual([]);
  });
});
