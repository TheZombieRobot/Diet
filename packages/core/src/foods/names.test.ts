import { describe, expect, it } from 'vitest';
import { seedViews } from './dataset';
import {
  catalogueEntriesFrom,
  exactFoodMatch,
  isDislikedFood,
  matchKey,
  mentionsWords,
  searchFoods,
} from './names';

describe('matching food names (item 18 design 3.6; G12, G13)', () => {
  it('F14 G12 N32 CR20: search by name or alias; an exact name links to one food, and "mince" is never lean', () => {
    const views = seedViews();
    const names = (q: string) => searchFoods(views, q).map((f) => f.name);
    expect(matchKey('  Kūmara ')).toBe('kumara');
    expect(names('chard')).toEqual(['Silverbeet']);
    expect(names('kum')).toEqual(['Kūmara']);
    // "Beef mince" starts with "beef"; "Lean beef mince" only contains it.
    expect(names('beef').indexOf('Lean beef mince')).toBeGreaterThan(
      names('beef').indexOf('Beef mince'),
    );
    expect(names('a')).toEqual([]);
    expect(exactFoodMatch(views, 'chard')?.id).toBe('seed:silverbeet');
    expect(exactFoodMatch(views, 'Mince')?.id).toBe('seed:beef-mince');
    expect(exactFoodMatch(views, 'lean mince')?.id).toBe('seed:beef-mince-lean');
    // Pork and lamb steaks may be fatty cuts: they never link to a lean entry.
    expect(exactFoodMatch(views, 'pork steaks')).toBeNull();
    expect(exactFoodMatch(views, 'lamb steaks')).toBeNull();
    const twins = [
      { name: 'Example', aliases: [] },
      { name: 'Other', aliases: ['example'] },
    ];
    expect(exactFoodMatch(twins, 'EXAMPLE')).toBeNull();

    const own = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Example own food',
      aliases: [],
      gardenFlag: false,
    };
    const entries = catalogueEntriesFrom(views, [own]);
    expect(entries[0]?.id).toBe('seed:silverbeet');
    expect(entries.at(-1)?.id).toBe(own.id);
    expect(entries).toHaveLength(views.length + 1);
  });

  it('G12 N32: hyphens and apostrophes do not stop a match, and a common word never links to a different food', () => {
    const views = seedViews();
    const exact = (name: string) => exactFoodMatch(views, name)?.name ?? null;
    expect(matchKey('Flat-leaf  parsley')).toBe('flat leaf parsley');
    expect(matchKey('Stir–fry')).toBe('stir fry'); // an en dash
    expect(matchKey('Chef’s')).toBe('chefs');
    expect(exact('flat leaf parsley')).toBe('Parsley');
    expect(exact('stir fry beef')).toBe('Lean beef steak');
    expect(exact('free range eggs')).toBe('Eggs');
    expect(exact('bok choi')).toBe('Bok choy');
    expect(searchFoods(views, 'free range').map((f) => f.name)).toEqual(['Eggs']);
    // Each of these is a different product, or a word for several foods.
    for (const word of [
      'natural yoghurt',
      'plain yoghurt',
      'peas',
      'garden peas',
      'beans',
      'sprouts',
      'cress',
      'corned beef',
      'grana',
    ])
      expect(exact(word), word).toBeNull();
  });

  it('dislikes: an id, or a word in a name or another name, as whole words', () => {
    expect(mentionsWords('Sardines in olive oil', 'sardine')).toBe(true);
    expect(mentionsWords('Butternut squash', 'butter')).toBe(false);
    expect(mentionsWords('Eggplant', 'egg')).toBe(false);
    expect(mentionsWords('Pine nuts', 'pine nut')).toBe(true);
    const kale = { id: 'seed:kale', name: 'Kale', aliases: ['Curly kale', 'Cavolo nero'] };
    const none = { dislikeIngredientIds: [], dislikeTerms: [] };
    expect(isDislikedFood(kale, none)).toBe(false);
    expect(isDislikedFood(kale, { ...none, dislikeIngredientIds: ['seed:kale'] })).toBe(true);
    expect(isDislikedFood(kale, { ...none, dislikeTerms: ['CAVOLO NERO'] })).toBe(true);
    expect(isDislikedFood(kale, { ...none, dislikeTerms: ['ale'] })).toBe(false);
  });
});
