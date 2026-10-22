import { checkRow } from '@diet/core';
import { describe, expect, it } from 'vitest';
import { groceryList300 } from './list300';
import { groceryList25, groceryListOverCap, groceryListSentinel } from './transferLists';

describe('groceryList300 (TR-05a fixture)', () => {
  it('is a valid grocery list of 300 items, the same on every call', () => {
    const { list } = groceryList300();
    expect(checkRow('grocery_lists', list).ok).toBe(true);
    expect(list.items).toHaveLength(300);
    expect(groceryList300()).toEqual({ list });
  });
});

describe('item 31 transfer lists', () => {
  it('are valid grocery lists, each with its own list id', () => {
    const lists = [groceryList25(), groceryListSentinel(), groceryListOverCap()];
    for (const list of lists) expect(checkRow('grocery_lists', list).ok, list.id).toBe(true);
    expect(new Set([groceryList300().list.id, ...lists.map((l) => l.id)]).size).toBe(4);
    expect(groceryList25().items).toEqual(groceryList300().list.items.slice(0, 25));
  });
});
