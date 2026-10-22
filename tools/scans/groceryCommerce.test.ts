import { describe, expect, it } from 'vitest';
import { DEFAULT_STORE_NAME } from '../../packages/core/src/index';
import { commerceText } from '../../packages/grocery/src/list/edit';
import { commerceRules, PRICE_FORMATTER_FILES } from './rules';
import { scanText } from './scan';

// Item 24 (design 2.8 and 5.5; HS-16, NN-05, J37): item names and the store name reach every
// export and the laptop with no entered-at time, so the app refuses the price, stock and cart
// wording these scans refuse. The app cannot import this folder, so grocery keeps its own copy of
// the patterns; this test keeps the two in step.
const FLAGGED = [
  'Only $4.50',
  'NZ$12',
  'NZD 12',
  '5 dollars',
  'In stock at the store',
  'Out-of-stock',
  'Sold out',
  'Stock level: high',
  'Only 3 left',
  'Limited stock',
  'Added to cart',
  'Added to the basket',
  'Cart updated',
  'Your cart has 3 items',
  'Already in your cart',
  'In your trolley',
  'On special this week',
  'Club Deal',
  '20% off',
  'Cheaper here',
  'Lowest price',
];

describe('grocery item and store names (LS4)', () => {
  it('every sample the commerce scan flags is refused by commerceText', () => {
    for (const text of FLAGGED) {
      expect(scanText('x.md', text, commerceRules).length, text).toBeGreaterThan(0);
      expect(commerceText(text), text).toBe(true);
    }
    expect(commerceText('Store: specials')).toBe(true);
  });

  it('ordinary food names and the default store pass', () => {
    for (const text of [
      'Chicken stock',
      'Beef stock cubes',
      'Laundry basket',
      DEFAULT_STORE_NAME,
    ]) {
      expect(commerceText(text), text).toBe(false);
    }
  });

  it('LS1 HS-16, NN-05: the price file is the only one allowed to print a price', () => {
    expect(PRICE_FORMATTER_FILES).toEqual(['packages/grocery/src/list/price.ts']);
  });
});
