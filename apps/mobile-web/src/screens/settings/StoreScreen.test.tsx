// Settings, Store (item 24 design 5.4, LC5; GL-08, HS-16): the screen over the real repositories
// on fake-indexeddb, after a finished setup. Values are synthetic.
import { DEFAULT_STORE_NAME } from '@diet/core';
import { grocery } from '@diet/core/copy/health';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { appStorageStore } from '../../db/runtime';
import { onboardForTests, openTestDb, type TestDb } from '../../db/testKit';
import { StoreScreen } from './StoreScreen';

const copy = grocery.store;
let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  test?.db.shutDown();
  test = undefined;
});

const field = () => screen.getByLabelText<HTMLInputElement>(copy.field);
const type = (value: string) => {
  fireEvent.change(field(), { target: { value } });
};

describe('Store (LC5; GL-08, HS-16)', () => {
  it('fills the field once, refuses a blank, long or price-bearing name, and saves to the profile and the current list', async () => {
    render(<StoreScreen />);
    expect(screen.getByText(copy.loading)).toBeDefined();
    cleanup();
    const t = await openTestDb();
    test = t;
    await onboardForTests(t);
    await t.repos.groceryBuild.create({ storeName: DEFAULT_STORE_NAME, items: [] }, []);
    appStorageStore.set(t.storage);
    render(<StoreScreen />);
    await waitFor(() => {
      expect(field().value).toBe(DEFAULT_STORE_NAME);
    });
    type('Example sto');
    await act(async () => {
      await t.repos.profile.update({ budgetNote: 'Example note' });
    });
    expect(field().value).toBe('Example sto');

    for (const [value, message] of [
      ['  ', copy.errors.required],
      ['x'.repeat(81), copy.errors.length],
      ['Store: specials', copy.errors.nameOnly],
    ] as const) {
      type(value);
      fireEvent.click(screen.getByRole('button', { name: copy.save }));
      expect(await screen.findByText(message)).toBeDefined();
    }
    fireEvent.click(screen.getByRole('button', { name: `Use ${DEFAULT_STORE_NAME}` }));
    expect(field().value).toBe(DEFAULT_STORE_NAME);
    type('Example store');
    fireEvent.click(screen.getByRole('button', { name: copy.save }));
    expect(await screen.findByText(copy.saved)).toBeDefined();
    expect((await t.repos.profile.get()).storeName).toBe('Example store');
    expect((await t.repos.groceryBuild.current())?.storeName).toBe('Example store');
  });

  it('closed records: the Reload button', async () => {
    const t = await openTestDb();
    test = t;
    await onboardForTests(t);
    appStorageStore.set(t.storage);
    render(<StoreScreen />);
    await waitFor(() => {
      expect(field().value).toBe(DEFAULT_STORE_NAME);
    });
    t.db.gate.close();
    type('Example store');
    fireEvent.click(screen.getByRole('button', { name: copy.save }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reload' }));
    expect(t.storage.platform.reloads).toBe(1);
  });
});
