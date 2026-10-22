/**
 * Grocery lists for Send to laptop (checklist item 31 design 5.1). Generic and deterministic; each
 * has its own list id (seededUuid over mulberry32 with its own seed), so no test ever holds two
 * different contents under one list id and version.
 */
import type { GroceryItem, GroceryListRecord } from '@diet/core';
import { mulberry32 } from '../storage/fuzzMutations';
import { groceryList300, seededUuid } from './list300';

const AT = '2000-01-01T00:00:00.000Z';

const unsent = {
  createdAt: AT,
  updatedAt: AT,
  sentVersion: null,
  sentAt: null,
  transferId: null,
  receivedVersion: null,
  receivedAt: null,
  laptopReceivedAt: null,
} as const;

const line = (id: string, n: number, patch: Partial<GroceryItem> = {}): GroceryItem => ({
  id,
  origin: 'generated',
  ingredientId: null,
  text: `Example item ${String(n)}`,
  quantity: 500,
  unit: 'g',
  packSuggestion: null,
  aisle: 'Produce',
  substituteHint: null,
  section: 'to-buy',
  fromGardenG: null,
  gardenAmountUnknown: false,
  fromPantryG: null,
  auditNote: null,
  price: null,
  ticked: false,
  ...patch,
});

/** groceryList300()'s first 25 items under their own list id (seed 31), version 1 (TR-04a). */
export function groceryList25(): GroceryListRecord {
  const { list } = groceryList300();
  return { ...list, id: seededUuid(mulberry32(31)), items: list.items.slice(0, 25) };
}

/**
 * Six lines (seed 32), version 3. Lines a, b, c and f are to buy and leave the phone; d and e are
 * already-have lines and stay, as do c's price, garden amount, audit note and ingredient id
 * (K1, N3, B2).
 */
export function groceryListSentinel(): GroceryListRecord {
  const random = mulberry32(32);
  const listId = seededUuid(random);
  const [a, b, c, d, e, f] = Array.from({ length: 6 }, () => seededUuid(random));
  return {
    ...unsent,
    id: listId,
    version: 3,
    storeName: 'Example store',
    items: [
      line(a ?? '', 1, { text: 'zzsentinel' }),
      line(b ?? '', 2, { quantity: null, unit: null }),
      line(c ?? '', 3, {
        price: { amountNzCents: 650, basis: 'line', enteredAt: AT },
        fromGardenG: 300,
        auditNote: '300 g from garden',
        ingredientId: 'seed:example-ingredient-1',
      }),
      line(d ?? '', 4, { section: 'already-have', text: 'zzalready-have', fromGardenG: 300 }),
      line(e ?? '', 5, {
        section: 'already-have',
        gardenAmountUnknown: true,
        auditNote: 'recipes need 500 g; garden amount not entered',
      }),
      line(f ?? '', 6, { origin: 'manual', substituteHint: 'Example swap', ticked: true }),
    ],
  };
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * 500 to-buy lines (seed 3131) whose text, pack suggestion and substitute (all three travel in the
 * payload) are random base64url, so the sealed body is well over the relay's 65,536 characters
 * whatever the compression (TR-05b).
 */
export function groceryListOverCap(): GroceryListRecord {
  const random = mulberry32(3131);
  const noise = (length: number) =>
    Array.from({ length }, () => BASE64URL[Math.floor(random() * 64)] ?? 'A').join('');
  const id = seededUuid(random);
  return {
    ...unsent,
    id,
    version: 1,
    storeName: 'Example store',
    items: Array.from({ length: 500 }, (_, i) =>
      line(seededUuid(random), i + 1, {
        text: noise(100),
        packSuggestion: noise(60),
        substituteHint: noise(60),
      }),
    ),
  };
}
