import { checkRow } from '@diet/core';
import { describe, expect, it } from 'vitest';
import { groceryList300 } from './list300';

describe('groceryList300 (TR-05a fixture)', () => {
  it('is a valid grocery list of 300 items, the same on every call', () => {
    const { list } = groceryList300();
    expect(checkRow('grocery_lists', list).ok).toBe(true);
    expect(list.items).toHaveLength(300);
    expect(groceryList300()).toEqual({ list });
  });
});
