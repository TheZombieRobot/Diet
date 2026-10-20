import { describe, expect, it } from 'vitest';
import { seedViews } from './dataset';
import { catalogueEntriesFrom, exactFoodMatch, matchKey, searchFoods } from './names';

describe('matching food names (item 18 design 3.6; G12, G13)', () => {
  it('F14 G12 N32 CR20: search by name or alias; an exact name links to one food, and "mince" is never lean', () => {
    const views = seedViews();
    const names = (q: string) => searchFoods(views, q).map((f) => f.name);
    expect(matchKey('  Kūmara ')).toBe('kumara');
    expect(names('chard')).toEqual(['Silverbeet']);
    expect(names('kum')).toEqual(['Kūmara']);
    // "Beef mince" starts with "beef"; "Corned silverside" only contains it (alias "Corned beef").
    expect(names('beef').indexOf('Corned silverside')).toBeGreaterThan(
      names('beef').indexOf('Beef mince'),
    );
    expect(names('a')).toEqual([]);
    expect(exactFoodMatch(views, 'chard')?.id).toBe('seed:silverbeet');
    expect(exactFoodMatch(views, 'Mince')?.id).toBe('seed:beef-mince');
    expect(exactFoodMatch(views, 'lean mince')?.id).toBe('seed:beef-mince-lean');
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
});
