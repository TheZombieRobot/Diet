// The List tab (item 24 design 5.4, LC1 to LC4 and LC6; UX 6a): the screen over the real
// repositories on fake-indexeddb, after a finished setup, with item 18's shipped catalogue and
// item 20's shipped recipes. Values are synthetic.
import {
  DEFAULT_STORE_NAME,
  type GroceryItem,
  type GroceryListRecord,
  type StoreRecords,
} from '@diet/core';
import { foods as foodsCopy, grocery, privacy } from '@diet/core/copy/health';
import { listCsv, listJson, listText } from '@diet/grocery';
import { groceryList300 } from '@diet/test-fixtures';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '../../clipboard';
import { appStorageStore } from '../../db/runtime';
import { onboardForTests, openTestDb, seedPlanDay, type TestDb, testEnv } from '../../db/testKit';
import { FoodDataContext } from '../../foods/FoodDataContext';
import { ListExportButtons } from './ListExportButtons';
import { ListScreen } from './ListScreen';
import { listSessionStore } from './session';

/** 2:00 pm on Monday 10 January 2000 in Auckland. */
const NOW = '2000-01-10T01:00:00.000Z';
const TODAY = '2000-01-10';

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  appStorageStore.set(null);
  listSessionStore.set(null);
  test?.db.shutDown();
  test = undefined;
});

const line = (n: number, over: Partial<GroceryItem> = {}): GroceryItem => ({
  id: `0b6f1d2e-0000-4000-8000-0000000005${String(n).padStart(2, '0')}`,
  origin: 'generated',
  ingredientId: 'seed:broccoli',
  text: 'Broccoli',
  quantity: 300,
  unit: 'g',
  packSuggestion: '1 head',
  aisle: 'Produce',
  substituteHint: null,
  section: 'to-buy',
  fromGardenG: null,
  gardenAmountUnknown: false,
  fromPantryG: null,
  auditNote: null,
  price: null,
  ticked: false,
  ...over,
});

async function open(
  options: {
    readonly seed?: (t: TestDb) => Promise<unknown>;
    readonly items?: GroceryItem[];
    readonly profile?: Partial<StoreRecords['profile']>;
    readonly loaded?: boolean;
  } = {},
): Promise<TestDb> {
  const t = await openTestDb({ env: testEnv(NOW) });
  await onboardForTests(t, options.profile === undefined ? {} : { profile: options.profile });
  if (options.items !== undefined) {
    await t.repos.groceryBuild.create(
      { storeName: DEFAULT_STORE_NAME, items: options.items },
      [],
      null,
    );
  }
  await options.seed?.(t);
  test = t;
  appStorageStore.set(t.storage);
  render(
    <main>
      <ListScreen />
    </main>,
  );
  if (options.loaded !== false) await screen.findByText(grocery.header.prices);
  return t;
}

const main = () => screen.getByRole('main');
const tap = (name: string | RegExp, inside: HTMLElement = document.body) => {
  fireEvent.click(within(inside).getByRole('button', { name }));
};
const current = async (): Promise<GroceryListRecord> => {
  const list = await test?.repos.groceryBuild.current();
  if (list === null || list === undefined) throw new Error('no list');
  return list;
};

describe('states and layout (LC1; UX 6a, GL-04, GL-08, NN-05, J19)', () => {
  it('opening, then no list: the default store as plain text, the prices line, the empty card and no figure', async () => {
    appStorageStore.set(null);
    const { unmount } = render(<ListScreen />);
    expect(screen.getByText(grocery.loading)).toBeDefined();
    unmount();
    await open();
    expect(screen.getByText(DEFAULT_STORE_NAME).tagName).toBe('P');
    expect(screen.getByRole('region', { name: grocery.empty.label })).toBeDefined();
    expect(main().textContent).not.toMatch(/\d|[$€£]/);
    expect(
      [...main().querySelectorAll('a')].filter((a) => a.getAttribute('href')?.startsWith('http')),
    ).toEqual([]);
  });

  it('a list: made on, ticked progress, aisles in order, Already have with its count, and the exports', async () => {
    await open({
      items: [
        line(1, { text: 'Example tea', aisle: 'Drinks', ingredientId: null, packSuggestion: null }),
        line(2, {
          text: 'Rice',
          aisle: 'Rice, pasta and grains',
          ingredientId: 'seed:white-rice',
          ticked: true,
        }),
        line(3),
        line(4, { text: 'Lemon', section: 'already-have', packSuggestion: null }),
      ],
    });
    expect(screen.getByText('Made on 10 January.')).toBeDefined();
    expect(screen.getByText('1 of 3 ticked')).toBeDefined();
    const labels = [...main().querySelectorAll('.ui-card__label')].map((h) => h.textContent);
    expect(labels).toEqual([
      'Shopping at',
      'Produce',
      'Rice, pasta and grains',
      'Drinks',
      'Already have',
    ]);
    expect(
      within(screen.getByRole('region', { name: 'Already have' })).getByText('1'),
    ).toBeDefined();
    expect(screen.getByRole('region', { name: grocery.exports.sectionLabel })).toBeDefined();
  });

  it('300 lines render without virtualisation; foods that cannot be read keep the build off', async () => {
    const { list } = groceryList300();
    await open({ items: list.items });
    expect(main().querySelectorAll('input[type="checkbox"]')).toHaveLength(300);
    cleanup();
    appStorageStore.set(test?.storage ?? null);
    render(
      <FoodDataContext.Provider
        value={{ data: { status: 'error' }, attributions: {}, approved: [] }}
      >
        <ListScreen />
      </FoodDataContext.Provider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: grocery.actions.update }));
    expect(await screen.findByText(grocery.build.foodsUnavailable)).toBeDefined();
    expect(screen.queryByRole('button', { name: grocery.build.update })).toBeNull();
  });
});

describe('the build panel (LC2; GL-01, GL-05, J27, J46)', () => {
  it('summarises the week, makes the list, and keeps skipped meals in view until dismissed', async () => {
    await open({
      seed: async (t) => {
        await seedPlanDay(t, {
          date: TODAY,
          dietMode: 'balanced',
          meals: [
            {
              slot: 'dinner',
              recipeId: 'seed:recipe-chicken-silverbeet-traybake',
              myServes: 1,
              householdServes: 4,
            },
            {
              slot: 'lunch',
              recipeId: '0b6f1d2e-0000-4000-8000-000000000999',
              myServes: 1,
              householdServes: 1,
            },
          ],
          eatingWindow: null,
        });
        await seedPlanDay(t, {
          date: '2000-01-11',
          dietMode: 'balanced',
          meals: [],
          eatingWindow: { start: '17:00', end: '20:00' },
        });
      },
    });
    tap(grocery.empty.fromPlan);
    expect(document.activeElement?.textContent).toBe(grocery.build.firstDayHint);
    expect(await screen.findByText('2 planned meals on one of these days.')).toBeDefined();
    expect(screen.getByText('From 10 January to 16 January.')).toBeDefined();
    expect(screen.getByText(/One of these planned meals could not be read/)).toBeDefined();
    expect(screen.getByText(/the 5:00 pm snack has no meal chosen yet/)).toBeDefined();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: grocery.build.make }).hasAttribute('disabled'),
      ).toBe(false);
    });
    tap(grocery.build.make);
    expect(await screen.findByText(grocery.build.made)).toBeDefined();
    expect(await screen.findByText(grocery.build.skippedOne)).toBeDefined();
    expect(screen.getByRole('checkbox', { name: /^Chicken thigh/ })).toBeDefined();
    // C57: the seeded silverbeet, available with no amount entered, is under Already have.
    expect(
      within(screen.getByRole('region', { name: 'Already have' })).getByText('Silverbeet'),
    ).toBeDefined();
    tap(grocery.build.dismiss);
    expect(screen.queryByText(grocery.build.skippedOne)).toBeNull();
  });

  it('J27, J34: an old list offers Start a new list first; a build with the clock behind writes nothing', async () => {
    const t = await open({
      items: [line(1)],
      seed: (db) => {
        db.env.advanceDays(4);
        return Promise.resolve();
      },
    });
    expect(await screen.findByText(/This list was made on 10 January/)).toBeDefined();
    const row = screen.getByText(grocery.actions.add).closest('.ui-button-row');
    expect(row?.querySelector('button')?.textContent).toBe(grocery.actions.startNew);
    // Design 1.13: a form takes focus when it opens, and Cancel returns it to the opening button.
    tap(grocery.actions.add);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: grocery.manual.name }));
    tap(grocery.manual.cancel);
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: grocery.actions.add }),
      );
    });
    t.env.set('2000-01-09T00:00:00.000Z');
    tap(grocery.actions.update);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: grocery.build.update }).hasAttribute('disabled'),
      ).toBe(false);
    });
    tap(grocery.build.update);
    expect(await screen.findByText(privacy.clockBehind)).toBeDefined();
    expect((await current()).version).toBe(1);
    tap(grocery.build.cancel);
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: grocery.actions.update }),
      );
    });
  });
});

describe('lines (LC3; GL-05, GL-09, C57, NN-05, NN-06)', () => {
  it('ticks keep focus, shows the substitute, saves a price through Options and removes with a confirmation', async () => {
    await open({
      items: [
        line(1, { substituteHint: 'Cauliflower' }),
        line(2, { text: 'Lemon', ingredientId: 'seed:lemon', packSuggestion: '3 lemons' }),
      ],
    });
    const box = screen.getByRole<HTMLInputElement>('checkbox', { name: /^Broccoli/ });
    box.focus();
    fireEvent.click(box);
    // Never disabled while it saves: a browser moves focus off a disabled box (LE1 checks focus).
    expect(box.disabled).toBe(false);
    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Broccoli/ }).checked).toBe(
        true,
      );
    });
    expect(document.activeElement).toBe(box);
    expect(screen.getByText('or cauliflower')).toBeDefined();

    const options = screen.getByRole('button', { name: 'Options for Broccoli' });
    fireEvent.click(options);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /^Broccoli/ }).checked).toBe(
      true,
    );
    fireEvent.change(screen.getByLabelText(grocery.price.field), { target: { value: '6.50' } });
    tap(grocery.price.save);
    expect(
      await screen.findByText(/^Your price: \$6\.50 for this line, entered 10 January\.$/),
    ).toBeDefined();
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Options for Broccoli' }),
      );
    });

    // Escape closes the panel with focus still on the Options button that opened it.
    const lemonOptions = screen.getByRole('button', { name: 'Options for Lemon' });
    fireEvent.click(lemonOptions);
    fireEvent.keyDown(lemonOptions, { key: 'Escape' });
    expect(screen.queryByLabelText(grocery.price.field)).toBeNull();
    fireEvent.click(lemonOptions);
    tap(grocery.panel.remove);
    expect(screen.getByText(grocery.panel.comesBack)).toBeDefined();
    tap(grocery.panel.removeYes);
    expect(await screen.findByText('Removed: lemon.')).toBeDefined();
    // The last row left: focus goes to the row before it, never to the top of the page.
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Options for Broccoli' }),
      );
    });
    expect((await current()).items.map((i) => i.text)).toEqual(['Broccoli']);
  });

  it('C57: Use it, and Buy anyway, each write once with an audit row, are named for their item and are announced', async () => {
    const t = await open({
      items: [
        line(1, {
          text: 'Silverbeet',
          ingredientId: 'seed:silverbeet',
          quantity: 500,
          packSuggestion: '1 bunch',
        }),
        line(2, {
          text: 'Lemon',
          ingredientId: 'seed:lemon',
          section: 'already-have',
          packSuggestion: null,
          gardenAmountUnknown: true,
          auditNote: 'recipes need 300 g; garden amount not entered',
        }),
      ],
      seed: async (db) => {
        const [seeded] = await db.repos.garden.list();
        db.env.advanceDays(1);
        if (seeded !== undefined)
          await db.repos.garden.update(seeded.id, { amount: 300, unit: 'g' });
      },
    });
    const use = await screen.findByRole('button', { name: 'Use it: silverbeet' });
    expect(use.getAttribute('aria-describedby')).not.toBeNull();
    fireEvent.click(use);
    await waitFor(async () => {
      expect((await current()).items.find((i) => i.text === 'Silverbeet')).toMatchObject({
        quantity: 200,
        fromGardenG: 300,
      });
    });
    expect(await screen.findByText('Updated: silverbeet.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Buy anyway: lemon' }));
    await waitFor(async () => {
      expect((await current()).items.find((i) => i.text === 'Lemon')?.section).toBe('to-buy');
    });
    expect(await screen.findByText('Back on the list: lemon.')).toBeDefined();
    expect((await t.repos.audit.list()).map((a) => a.reason)).toEqual([
      expect.stringMatching(/^300 g silverbeet from garden, as listed on 11 January/),
      'lemon: you chose to buy it anyway',
    ]);
  });

  it('a line removed in another tab closes its open panel', async () => {
    await open({ items: [line(1)] });
    fireEvent.click(screen.getByRole('button', { name: 'Options for Broccoli' }));
    const list = await current();
    await act(async () => {
      await test?.repos.groceryBuild.updateList(list.id, () => ({ items: [], audits: [] }));
    });
    expect(await screen.findByText(grocery.panel.gone)).toBeDefined();
    expect(screen.queryByLabelText(grocery.price.field)).toBeNull();
  });
});

describe('ListExportButtons (LC4; GL-06, GL-07, item 31 1.12)', () => {
  const LIST: GroceryListRecord = {
    id: '0b6f1d2e-0000-4000-8000-000000000999',
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    storeName: DEFAULT_STORE_NAME,
    sentVersion: null,
    sentAt: null,
    transferId: null,
    receivedVersion: null,
    receivedAt: null,
    laptopReceivedAt: null,
    items: [line(1)],
  };

  it('Copy text, CSV and JSON: never disabled, made on the phone, named with the local date', async () => {
    const t = await openTestDb({ env: testEnv('2000-01-10T13:00:00.000Z') });
    test = t;
    appStorageStore.set(t.storage);
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ListExportButtons list={LIST} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => [b.textContent, b.hasAttribute('disabled')])).toEqual([
      ['Copy text', false],
      ['CSV', false],
      ['JSON', false],
    ]);
    tap('Copy text');
    expect(await screen.findByText(grocery.exports.copied)).toBeDefined();
    expect(writeText).toHaveBeenCalledWith(listText(LIST));
    tap('CSV');
    tap('JSON');
    expect(t.storage.platform.downloads).toEqual([
      { text: listCsv(LIST), fileName: 'diet-grocery-list-2000-01-11.csv' },
      { text: listJson(LIST), fileName: 'diet-grocery-list-2000-01-11.json' },
    ]);
    expect(
      screen.getByText(
        'Your phone should now show diet-grocery-list-2000-01-11.json in Downloads.',
      ),
    ).toBeDefined();
    cleanup();
    render(<ListExportButtons list={{ ...LIST, items: [] }} />);
    tap('Copy text');
    expect(await screen.findByText(grocery.exports.nothingToCopy)).toBeDefined();
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('copyToClipboard is false with no clipboard and when writing is refused', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    expect(await copyToClipboard('x')).toBe(false);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    expect(await copyToClipboard('x')).toBe(false);
  });
});

describe('phone-only reminders and cleared hints (LC6; GL-10, HS-24, J28, J36)', () => {
  const items = [
    line(1, {
      text: 'Peanut butter',
      ingredientId: 'seed:peanut-butter',
      aisle: 'Pantry',
      substituteHint: 'Tahini',
    }),
    line(2, { text: 'Pasta', ingredientId: 'seed:pasta', aisle: 'Rice, pasta and grains' }),
  ];

  it('the label reminder and allergen chips show on the phone only, never in the list text or files', async () => {
    const cases: [Partial<StoreRecords['profile']>, string[]][] = [
      [{ allergens: ['peanut'] }, ['Contains peanuts']],
      [{ glutenFreeHousehold: true }, ['Contains wheat']],
      [{}, []],
    ];
    for (const [profile, chips] of cases) {
      await open({ items, profile });
      await screen.findByText('Peanut butter');
      const shown = chips.length > 0;
      await waitFor(() => {
        expect(screen.queryByText(foodsCopy.screen.rowCheckLabel) !== null).toBe(shown);
      });
      for (const chip of chips) expect(screen.getByText(chip)).toBeDefined();
      const list = await current();
      for (const text of [listText(list), listCsv(list), listJson(list)]) {
        expect(text).not.toMatch(/Check the label|Contains (?:peanuts|wheat)/);
      }
      cleanup();
      test?.db.shutDown();
    }
  });

  it('after a profile change clears the hints, the List says so until the list next changes', async () => {
    const t = await open({ items });
    await act(async () => {
      await t.repos.profile.update({ allergens: ['soy'] });
    });
    expect(await screen.findByText(grocery.substitutes.cleared)).toBeDefined();
    t.env.set('2000-01-10T02:00:00.000Z');
    fireEvent.click(screen.getByRole('checkbox', { name: /^Pasta/ }));
    await waitFor(() => {
      expect(screen.queryByText(grocery.substitutes.cleared)).toBeNull();
    });
  });
});
