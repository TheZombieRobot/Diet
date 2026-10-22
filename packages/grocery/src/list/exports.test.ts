import { checkRow, type GroceryItem, type GroceryListRecord } from '@diet/core';
import { groceryList300 } from '@diet/test-fixtures';
import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, listCsv, listJson, listText } from './exports';

const base: GroceryItem = {
  id: '0b6f1d2e-0000-4000-8000-000000000001',
  origin: 'generated',
  ingredientId: 'seed:silverbeet',
  text: 'Silverbeet',
  quantity: 200,
  unit: 'g',
  packSuggestion: '1 bunch',
  aisle: 'Produce',
  substituteHint: 'Spinach',
  section: 'to-buy',
  fromGardenG: 300,
  gardenAmountUnknown: false,
  fromPantryG: null,
  auditNote: '300 g from garden, as listed on 9 January',
  price: null,
  ticked: true,
};
const item = (n: number, over: Partial<GroceryItem>): GroceryItem => ({
  ...base,
  id: `0b6f1d2e-0000-4000-8000-00000000000${n}`,
  ...over,
});
const LIST: GroceryListRecord = {
  id: '0b6f1d2e-0000-4000-8000-000000000999',
  version: 2,
  createdAt: '2000-01-10T00:00:00.000Z',
  updatedAt: '2000-01-10T01:00:00.000Z',
  storeName: "PAK'nSAVE Pāpāmoa",
  sentVersion: null,
  sentAt: null,
  transferId: null,
  receivedVersion: null,
  receivedAt: null,
  laptopReceivedAt: null,
  items: [
    base,
    item(2, {
      origin: 'manual',
      ingredientId: null,
      text: '=SUM(A1), "big"',
      quantity: 2,
      unit: 'pack',
      packSuggestion: null,
      aisle: 'Other',
      substituteHint: null,
      fromGardenG: null,
      auditNote: null,
      price: { amountNzCents: 650, basis: 'line', enteredAt: '2000-01-10T00:30:00.000Z' },
      ticked: false,
    }),
    item(3, {
      text: 'Example item',
      quantity: null,
      unit: null,
      packSuggestion: null,
      auditNote: null,
      fromGardenG: null,
      substituteHint: null,
    }),
    item(4, {
      text: 'Courgette',
      section: 'already-have',
      quantity: 400,
      packSuggestion: null,
      fromGardenG: 400,
      substituteHint: null,
      auditNote: 'about 400 g from garden (2 each, about 250.4 g per item), as listed on 9 January',
    }),
    item(5, {
      text: 'Lettuce',
      section: 'already-have',
      quantity: 300,
      packSuggestion: null,
      fromGardenG: null,
      gardenAmountUnknown: true,
      substituteHint: null,
      auditNote: 'recipes need 300 g; garden amount not entered',
    }),
  ],
};

/** A small RFC 4180 reader, for checking the writer. */
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charAt(i);
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else cell += c;
  }
  return rows;
}

describe('exports (LU9; GL-06, GL-07, NN-05)', () => {
  it('J17: a text cell starting with +, -, @, a tab or a return gets the apostrophe too', () => {
    for (const start of ['+', '-', '@', '\t', '\r']) {
      const csv = listCsv({ ...LIST, items: [{ ...base, text: `${start}1 Example` }] });
      expect(readCsv(csv.slice(1))[1]?.[2], JSON.stringify(start)).toBe(`'${start}1 Example`);
    }
  });

  it('GL-06: Copy text is one line per item to buy, with no price, note, hint or header', () => {
    expect(listText(LIST)).toBe('Silverbeet, 1 bunch\n=SUM(A1), "big", 2 packs\nExample item');
    expect(
      listText({ ...LIST, items: LIST.items.filter((i) => i.section === 'already-have') }),
    ).toBe('');
  });

  it('GL-07: CSV has a BOM, 16 columns, CRLF rows, to buy then already have, and guards formulas', () => {
    const csv = listCsv(LIST);
    expect(csv.startsWith('\uFEFFstore,aisle,item,section,')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    const rows = readCsv(csv.slice(1));
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    const cells = rows
      .slice(1)
      .map((r) => Object.fromEntries(CSV_COLUMNS.map((c, i) => [c, r[i]])));
    expect(cells.map((c) => [c['item'], c['section']])).toEqual([
      ['Silverbeet', 'to buy'],
      ['\'=SUM(A1), "big"', 'to buy'],
      ['Example item', 'to buy'],
      ['Courgette', 'already have'],
      ['Lettuce', 'already have'],
    ]);
    expect(cells[0]).toMatchObject({
      store: "PAK'nSAVE Pāpāmoa",
      quantity: '200',
      pack_suggestion: '1 bunch',
      from_garden: '300',
      note: '300 g from garden, as listed on 9 January',
      substitute: 'Spinach',
      price: 'unknown',
      ticked: 'yes',
      list_updated_at: '2000-01-10T01:00:00.000Z',
    });
    expect(cells[1]).toMatchObject({
      price: '6.50',
      price_basis: 'line',
      price_entered_at: '2000-01-10T00:30:00.000Z',
    });
    expect(cells[3]?.['note']).toMatch(/^about 400 g from garden \(2 each/);
    expect(cells[4]?.['from_garden']).toBe('amount not entered');
    expect(
      cells.every((c) => c['store'] === LIST.storeName && c['list_updated_at'] === LIST.updatedAt),
    ).toBe(true);
  });

  it('JSON is the record as stored, no BOM; the 300-line fixture round-trips', () => {
    expect(JSON.parse(listJson(LIST))).toEqual(LIST);
    expect(listJson(LIST).startsWith('{')).toBe(true);
    const { list } = groceryList300();
    expect(readCsv(listCsv(list).slice(1))).toHaveLength(301);
    const back = JSON.parse(listJson(list)) as unknown;
    expect(back).toEqual(list);
    expect(checkRow('grocery_lists', back).ok).toBe(true);
  });
});
