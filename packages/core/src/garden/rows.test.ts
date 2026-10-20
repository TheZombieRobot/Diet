// Garden and pantry rows, harvests and the link catalogue (item 19 design 2.1, 2.3 and 2.4; A5 to
// A7; GD-03, C57, G12 to G15, G17, G19). Synthetic rows dated in 2000.
import { describe, expect, it } from 'vitest';
import { garden, gardenScreen } from '../copy/health';
import { defaultGarden } from '../storage/defaults';
import type { GardenRecord, PantryRecord } from '../storage/records';
import {
  type Catalogue,
  exactMatch,
  findDuplicate,
  linkFor,
  PRE_DATASET_CATALOGUE,
  searchCatalogue,
} from './catalogue';
import {
  applyHarvest,
  type HarvestInput,
  harvestModes,
  harvestNoticeText,
  listedNowText,
} from './harvest';
import { amountText, gardenDaysLeft, gardenRowView, pantryRowView } from './rows';

const TODAY = '2000-01-10';
const ZONE = 'Pacific/Auckland';
const crop = (row: Partial<GardenRecord> = {}): GardenRecord => ({
  id: '0b6f1d2e-0000-4000-8000-000000000301',
  ingredientId: 'seed:example-lettuce',
  name: 'Example lettuce',
  amount: null,
  unit: null,
  gramsPerUnit: null,
  harvestReady: true,
  harvestedAt: null,
  perishabilityDays: null,
  updatedAt: '2000-01-09T12:00:00.000Z',
  ...row,
});
const pantryItem = (row: Partial<PantryRecord> = {}): PantryRecord => ({
  id: '0b6f1d2e-0000-4000-8000-000000000302',
  ingredientId: null,
  name: 'Example tinned fish',
  amount: null,
  unit: null,
  updatedAt: '2000-01-09T12:00:00.000Z',
  ...row,
});

describe('days left and amounts (A5; G15, G19, GD-03)', () => {
  it.each([
    ['the last day', '2000-01-05', 5, 0],
    ['a day past', '2000-01-04', 5, -1],
    ['a date after today counts as today (G15)', '2000-01-11', 5, 5],
  ])('%s', (_name, harvestedAt, perishabilityDays, left) => {
    expect(gardenDaysLeft({ harvestedAt, perishabilityDays }, TODAY)).toBe(left);
  });

  it.each([
    [crop(), 'garden', garden.available],
    [crop({ harvestReady: false }), 'garden', 'Amount not entered'],
    [pantryItem(), 'pantry', 'Some, not measured'],
    [pantryItem({ amount: 0, unit: 'g' }), 'pantry', 'None left'],
    [crop({ amount: 1, unit: 'bunch' }), 'garden', '1 bunch'],
    [
      crop({ amount: 2, unit: 'bunch', gramsPerUnit: 150 }),
      'garden',
      '2 bunches, about 150 g per bunch',
    ],
    [
      crop({ amount: 2.5, unit: 'each', gramsPerUnit: 250 }),
      'garden',
      '2.5 each, about 250 g per item',
    ],
    [crop({ amount: 1200, unit: 'g' }), 'garden', '1,200 g'],
    [pantryItem({ amount: 5000, unit: 'ml' }), 'pantry', '5,000 mL'],
  ] as const)('A5 G19: amount text, case %#', (row, source, text) => {
    expect(amountText(row, source)).toBe(text);
    expect(amountText(row, source)).not.toMatch(/\bkg\b|kilo/i);
  });

  it('a row shows its ready state, days left or "Updated", and amber past its keep days', () => {
    const seeded = gardenRowView(crop({ ingredientId: 'seed:silverbeet' }), {
      today: TODAY,
      zone: ZONE,
      hasDataset: false,
    });
    expect([seeded.value, seeded.detail, seeded.note]).toEqual([
      garden.available,
      'Ready to use · Updated today',
      gardenScreen.amountUnknownNote,
    ]);
    const past = gardenRowView(
      crop({ amount: 150, unit: 'g', harvestedAt: '2000-01-04', perishabilityDays: 5 }),
      { today: TODAY, zone: ZONE, hasDataset: false },
    );
    expect([past.detail, past.detailTone, past.note, past.usable]).toEqual([
      'Ready to use · Past the 5 days you said it keeps',
      'amber',
      gardenScreen.notCounted['past-keeps'],
      false,
    ]);
  });

  it('A5 G12: before the dataset an unlinked row has no note; with it, the not-matched note', () => {
    const unlinked = crop({ ingredientId: null });
    const unlinkedNotReady = crop({ ingredientId: null, harvestReady: false });
    const item = pantryItem();
    for (const hasDataset of [false, true]) {
      const at = { today: TODAY, zone: ZONE, hasDataset };
      const note = hasDataset ? gardenScreen.notCounted['not-linked'] : null;
      expect(gardenRowView(unlinked, at).note).toBe(note);
      expect(pantryRowView(item, at).note).toBe(note);
      expect(gardenRowView(unlinkedNotReady, at).note).toBe(
        hasDataset ? gardenScreen.notCounted['not-ready'] : null,
      );
    }
  });
});

describe('Add harvest (A6; G14)', () => {
  const listed = crop({ amount: 300, unit: 'g', harvestedAt: '2000-01-08', perishabilityDays: 5 });
  const picked = (h: Partial<HarvestInput> = {}): HarvestInput => ({
    amount: 200,
    unit: 'g',
    gramsPerUnit: null,
    pickedOn: TODAY,
    ...h,
  });

  it.each([
    ['nothing listed', crop(), picked(), 'nothing-listed'],
    [
      'the listed amount was not ready',
      { ...listed, harvestReady: false },
      picked(),
      'not-ready-before',
    ],
    ['no amount picked', listed, picked({ amount: null, unit: null }), 'no-amount-picked'],
    ['another unit', listed, picked({ unit: 'each' }), 'unit-differs'],
    [
      'another weight for each one',
      crop({ amount: 2, unit: 'each', gramsPerUnit: 250 }),
      picked({ amount: 1, unit: 'each', gramsPerUnit: 300 }),
      'weight-differs',
    ],
    ['the same unit, ready', listed, picked(), null],
  ] as const)('%s', (_name, row, harvest, reason) => {
    expect(harvestModes(row, harvest)).toEqual({
      modes: reason === null ? ['add', 'replace'] : ['replace'],
      replaceOnly: reason,
    });
  });

  it('adding keeps the earlier date and sums exactly; replacing takes the new date', () => {
    expect(applyHarvest(listed, picked(), 'add')).toEqual({
      ok: true,
      fields: {
        ingredientId: listed.ingredientId,
        name: listed.name,
        amount: 500,
        unit: 'g',
        gramsPerUnit: null,
        harvestReady: true,
        harvestedAt: '2000-01-08',
        perishabilityDays: 5,
      },
    });
    const tenth = crop({ amount: 0.1, unit: 'g' });
    expect(applyHarvest(tenth, picked({ amount: 0.2 }), 'add')).toMatchObject({
      fields: { amount: 0.3 },
    });
    expect(applyHarvest(listed, picked(), 'replace')).toMatchObject({
      fields: { amount: 200, harvestedAt: TODAY },
    });
  });

  it('a replace in another unit drops the old weight per item; too much and a disallowed mode are refused', () => {
    const counted = crop({ amount: 2, unit: 'each', gramsPerUnit: 250 });
    expect(applyHarvest(counted, picked({ amount: 1, unit: 'bunch' }), 'replace')).toMatchObject({
      fields: { unit: 'bunch', gramsPerUnit: null },
    });
    expect(applyHarvest(crop({ amount: 99_999, unit: 'g' }), picked({ amount: 2 }), 'add')).toEqual(
      { ok: false, error: 'too-much' },
    );
    expect(applyHarvest(crop(), picked(), 'add')).toEqual({
      ok: false,
      error: 'mode-not-allowed',
    });
    // No amount picked: available, amount not entered, never a weight (C57).
    expect(applyHarvest(listed, picked({ amount: null, unit: null }), 'replace')).toMatchObject({
      fields: { amount: null, unit: null, gramsPerUnit: null, harvestReady: true },
    });
  });

  it('the notices name the amount replaced and the day days left count from', () => {
    expect(listedNowText(listed, TODAY)).toBe('Listed now: 300 g, picked 8 January');
    expect(harvestNoticeText(listed, picked({ amount: null, unit: null }), null, TODAY)).toEqual([
      'With no amount entered, this replaces the 300 g listed with "amount not entered".',
      'The earlier pick is treated as used up. Days left count from 10 January.',
    ]);
    expect(harvestNoticeText(listed, picked(), 'add', TODAY)).toEqual([]);
    expect(harvestNoticeText(crop(), picked(), null, TODAY)).toEqual([]);
  });
});

describe('linking to a food (A7; G12, G13, G17)', () => {
  const catalogue: Catalogue = {
    hasDataset: true,
    entries: [
      { id: 'seed:silverbeet', name: 'Silverbeet', aliases: ['Chard'], gardenFlag: true },
      { id: 'seed:example-crepe', name: 'Example crêpe mix', aliases: [], gardenFlag: false },
      { id: 'seed:example-beet', name: 'Example beetroot', aliases: [], gardenFlag: true },
      { id: 'seed:example-greens', name: 'Beet greens', aliases: [], gardenFlag: false },
    ],
  };
  const ids = (query: string) => searchCatalogue(catalogue, query).map((e) => e.id);

  it('search: aliases, diacritics, prefix before contains, nothing under 2 characters', () => {
    expect(ids('chard')).toEqual(['seed:silverbeet']);
    expect(ids('crepe')).toEqual(['seed:example-crepe']);
    expect(ids('ex')).toEqual(['seed:example-beet', 'seed:example-crepe']);
    // A name that starts with the query comes before one that contains it, garden or not.
    expect(ids('beet')).toEqual(['seed:example-greens', 'seed:example-beet', 'seed:silverbeet']);
    expect(ids('s')).toEqual([]);
    expect(exactMatch(catalogue, ' CHARD ')?.id).toBe('seed:silverbeet');
  });

  it('linkFor: an unchanged name keeps its link; a changed one links again only by an exact match or a pick', () => {
    const stored = { name: 'Garden chard', ingredientId: 'seed:not-in-catalogue' };
    expect(linkFor(catalogue, { name: 'garden chard ', picked: null, stored })).toBe(
      'seed:not-in-catalogue',
    );
    expect(linkFor(catalogue, { name: 'Chard', picked: null, stored })).toBe('seed:silverbeet');
    expect(
      linkFor(catalogue, { name: 'Rainbow chard', picked: 'seed:silverbeet', stored }),
    ).toBeNull();
    // An unlinked row is linked by picking its food, without retyping the name.
    const unlinked = { name: 'Example beetroot', ingredientId: null };
    expect(
      linkFor(catalogue, { name: 'Example beetroot', picked: null, stored: unlinked }),
    ).toBeNull();
    expect(
      linkFor(catalogue, {
        name: 'Example beetroot',
        picked: 'seed:example-beet',
        stored: unlinked,
      }),
    ).toBe('seed:example-beet');
  });

  it('findDuplicate: by food or by name, never the row being edited', () => {
    const rows = [
      { id: 'a', ingredientId: 'seed:silverbeet', name: 'Silverbeet' },
      { id: 'b', ingredientId: null, name: 'Example herb' },
    ];
    expect(findDuplicate(rows, { ingredientId: 'seed:silverbeet', name: 'Chard' }, null)?.id).toBe(
      'a',
    );
    expect(findDuplicate(rows, { ingredientId: null, name: ' example HERB' }, null)?.id).toBe('b');
    expect(findDuplicate(rows, { ingredientId: null, name: 'Example herb' }, 'b')).toBeNull();
    expect(findDuplicate(rows, { ingredientId: null, name: 'Silverbeet stems' }, null)).toBeNull();
  });

  it('G13: before the dataset, the catalogue is the seeded row: its id and its name', () => {
    const seeded = defaultGarden({
      now: '2000-01-01T00:00:00.000Z',
      randomId: () => '0b6f1d2e-0000-4000-8000-000000000303',
    });
    expect(PRE_DATASET_CATALOGUE.hasDataset).toBe(false);
    expect(PRE_DATASET_CATALOGUE.entries.map((e) => [e.id, e.name])).toEqual([
      [seeded.ingredientId, seeded.name],
    ]);
    expect(linkFor(PRE_DATASET_CATALOGUE, { name: 'silverbeet', picked: null, stored: null })).toBe(
      'seed:silverbeet',
    );
    expect(
      linkFor(PRE_DATASET_CATALOGUE, { name: 'Example kale', picked: null, stored: null }),
    ).toBeNull();
  });
});
