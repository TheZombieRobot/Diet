import { describe, expect, it } from 'vitest';
import { foodData } from './dataset';
import { heartRoleOf } from './heart';

describe('heart roles (HEALTH_SAFETY section 4; item 18 design 3.7)', () => {
  it('F13 NU-04: fatty cuts and flagged fats, cheese above 40 g, favoured foods, and the rest neutral', () => {
    const data = foodData();
    if (data.status !== 'ok') throw new Error('the shipped catalogue did not load');
    const role = (id: string) => {
      const seed = data.seedById.get(`seed:${id}`);
      if (seed === undefined) throw new Error(`${id} is not shipped`);
      return heartRoleOf(seed);
    };
    const flagged = { kind: 'flag', aboveGramsPerServe: 0 };
    for (const id of [
      'beef-mince',
      'lamb-chops',
      'pork-chops',
      'butter',
      'cream',
      'bacon',
      'salami',
      'coconut-oil',
      'coconut-cream',
    ])
      expect(role(id), id).toEqual(flagged);
    expect(role('cheddar')).toEqual({ kind: 'flag', aboveGramsPerServe: 40 });
    for (const id of [
      'olive-oil',
      'avocado',
      'salmon',
      'tuna-in-oil',
      'chicken-breast',
      'eggs',
      'chickpeas',
      'almonds',
      'silverbeet',
    ])
      expect(role(id), id).toEqual({ kind: 'favour' });
    for (const id of ['beef-mince-lean', 'firm-tofu', 'white-fish', 'beef-steak', 'white-rice'])
      expect(role(id), id).toEqual({ kind: 'neutral' });
  });
});
