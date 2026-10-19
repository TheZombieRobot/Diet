/**
 * A 300-item grocery list for TR-05a (checklist items 24, 29 and 31): the size a long shop could
 * reach. Generic and deterministic. Its ids come from a seeded generator (mulberry32, seed 29), so
 * they are the same on every run yet as hard to compress as real random ids, which keeps the
 * relay size check honest.
 */
import type { GroceryItem, GroceryListRecord } from '@diet/core';
import { mulberry32 } from '../storage/fuzzMutations';

const AISLES = [
  'Produce',
  'Bakery',
  'Dairy',
  'Meat and seafood',
  'Pantry',
  'Frozen',
  'Drinks',
  'Household',
] as const;
const UNITS = ['g', 'ml', 'each'] as const;
const AT = '2000-01-01T00:00:00.000Z';

/** A lowercase UUID v4 drawn from `random`. */
function seededUuid(random: () => number): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  const part = (start: number, end: number) => hex.slice(start, end);
  return `${part(0, 8)}-${part(8, 12)}-${part(12, 16)}-${part(16, 20)}-${part(20, 32)}`;
}

function item(n: number, random: () => number): GroceryItem {
  const unit = UNITS[n % 3] ?? 'g';
  const tenth = n % 10 === 0;
  return {
    id: seededUuid(random),
    origin: 'generated',
    ingredientId: `seed:example-ingredient-${((n - 1) % 40) + 1}`,
    text: `Example item ${n}`,
    quantity: unit === 'each' ? (n % 9) + 1 : ((n % 9) + 1) * 50,
    unit,
    packSuggestion: n % 3 === 0 ? `${(n % 4) + 1} x 500 g pack` : null,
    aisle: AISLES[(n - 1) % AISLES.length] ?? 'Pantry',
    substituteHint: null,
    section: 'to-buy',
    fromGardenG: tenth ? 300 : null,
    gardenAmountUnknown: false,
    fromPantryG: null,
    auditNote: tenth ? '300 g from garden' : null,
    price: null,
    ticked: false,
  };
}

export function groceryList300(): { list: GroceryListRecord } {
  const random = mulberry32(29);
  return {
    list: {
      id: seededUuid(random),
      version: 1,
      createdAt: AT,
      updatedAt: AT,
      storeName: 'Example store',
      sentVersion: null,
      sentAt: null,
      transferId: null,
      receivedVersion: null,
      receivedAt: null,
      laptopReceivedAt: null,
      items: Array.from({ length: 300 }, (_, i) => item(i + 1, random)),
    },
  };
}
