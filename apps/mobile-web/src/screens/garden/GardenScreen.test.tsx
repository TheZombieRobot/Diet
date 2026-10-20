// Garden and pantry (item 19 design section 5, C1 to C5; UX 3d, GD-01, GD-03, HS-30, G7, G12,
// G14, G17, G28 to G31): the screen over the real repositories on fake-indexeddb, after a finished
// setup, with a fake photo platform. Values are synthetic; photos are JPEG bytes built in code.
import { jpegMetadataMarkers } from '@diet/core';
import { garden, gardenScreen } from '@diet/core/copy/health';
import { cleanJpeg, withMetadata } from '@diet/test-fixtures';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appStorageStore } from '../../db/runtime';
import { onboardForTests, openTestDb, photoRow, type TestDb, testEnv } from '../../db/testKit';
import type { PhotoPlatform } from '../../garden/preparePhoto';
import { GardenScreen } from './GardenScreen';

const copy = gardenScreen;
/** 2:00 pm on Monday 10 January 2000 in Auckland. */
const NOW = '2000-01-10T01:00:00.000Z';

let test: TestDb | undefined;
let made: string[];
let revoked: string[];
beforeEach(() => {
  made = [];
  revoked = [];
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:test/${String(made.length)}`;
    made.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  appStorageStore.set(null);
  window.location.hash = '';
  test?.db.shutDown();
  test = undefined;
});

/** A photo platform that "encodes" a JPEG still carrying a location and a comment. */
const fakePlatform = (over: Partial<PhotoPlatform> = {}): PhotoPlatform => ({
  measure: () => Promise.resolve({ width: 300, height: 200 }),
  decode: (_file, size) => Promise.resolve({ ...size, close: () => undefined }),
  encodeJpeg: (_image, width, height) =>
    Promise.resolve(withMetadata(cleanJpeg({ width, height }), { gps: true, comment: true })),
  ...over,
});

async function open(
  options: {
    readonly seed?: (t: TestDb) => Promise<unknown>;
    readonly hash?: string;
    readonly platform?: PhotoPlatform;
    /** Wait for the lists (false when the read is meant to fail). */
    readonly loaded?: boolean;
  } = {},
): Promise<TestDb> {
  const t = await openTestDb({ env: testEnv(NOW) });
  await onboardForTests(t);
  await options.seed?.(t);
  test = t;
  appStorageStore.set(t.storage);
  window.location.hash = options.hash ?? '#/garden';
  render(
    <main>
      <GardenScreen photoPlatform={options.platform ?? fakePlatform()} />
    </main>,
  );
  if (options.loaded !== false) await screen.findByRole('button', { name: copy.addCrop });
  return t;
}

const card = (name: string) => screen.getByRole('region', { name });
const row = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}\\b`) });
const tap = (name: string | RegExp, within_: HTMLElement = document.body) => {
  fireEvent.click(within(within_).getByRole('button', { name }));
};
const type = (form: HTMLElement, label: string, value: string) => {
  fireEvent.change(within(form).getByLabelText(label), { target: { value } });
};
const crop = (name: string, more: Record<string, unknown> = {}) => ({
  ingredientId: null,
  name,
  amount: null,
  unit: null,
  gramsPerUnit: null,
  harvestReady: true,
  harvestedAt: null,
  perishabilityDays: null,
  ...more,
});
const seededSilverbeet = async (t: TestDb) => {
  const found = (await t.repos.garden.list()).find((c) => c.ingredientId === 'seed:silverbeet');
  if (found === undefined) throw new Error('no seeded silverbeet');
  return found;
};

describe('the garden and pantry lists (C1; UX 3d, GD-03, G12, G28)', () => {
  it('C1: rows say what is listed without a made-up weight; unlinked rows carry no note before the dataset; the pill counts usable crops', async () => {
    await open({
      seed: async (t) => {
        await t.repos.garden.create(crop('Example lettuce', { amount: 2, unit: 'each' }));
        await t.repos.pantry.create({
          ingredientId: null,
          name: 'Example tinned fish',
          amount: null,
          unit: null,
        });
      },
    });
    const silverbeet = row('Silverbeet');
    expect(silverbeet.textContent).toContain(garden.available);
    expect(silverbeet.textContent).toContain('Ready to use · Updated today');
    expect(silverbeet.textContent).toContain(copy.amountUnknownNote);
    for (const unlinked of [row('Example lettuce'), row('Example tinned fish')]) {
      expect(unlinked.textContent).not.toMatch(/count|match/i);
    }
    expect(row('Example tinned fish').textContent).toContain('Some, not measured');
    expect(screen.getByTestId('garden-ready-pill').textContent).toBe('2 ready');
  });

  it('C1 G28: the Ready switch is beside the row, named with the crop, saves at once, reverts on a failed save and hides while the row is open', async () => {
    const t = await open();
    const ready = screen.getByRole('switch', { name: 'Silverbeet: ready to use' });
    expect(row('Silverbeet').contains(ready)).toBe(false);
    fireEvent.click(ready);
    await waitFor(async () => {
      expect((await seededSilverbeet(t)).harvestReady).toBe(false);
    });
    await waitFor(() => {
      expect(row('Silverbeet').textContent).toContain(copy.notCounted['not-ready']);
    });
    expect(screen.queryByTestId('garden-ready-pill')).toBeNull();

    vi.spyOn(t.repos.garden, 'update').mockRejectedValueOnce(new Error('synthetic failure'));
    fireEvent.click(screen.getByRole('switch', { name: 'Silverbeet: ready to use' }));
    expect(await within(card(copy.gardenCard)).findByText(copy.errors.saveFailed)).toBeDefined();
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLInputElement>('switch', { name: 'Silverbeet: ready to use' }).checked,
      ).toBe(false);
    });

    fireEvent.click(row('Silverbeet'));
    await screen.findByRole('form', { name: 'Edit Silverbeet' });
    expect(screen.queryByRole('switch', { name: 'Silverbeet: ready to use' })).toBeNull();
  });

  it('C1: a failed read says so and offers a reload', async () => {
    const t = await open({
      loaded: false,
      seed: (s) => {
        vi.spyOn(s.repos.stock, 'rows').mockRejectedValue(new Error('synthetic failure'));
        return Promise.resolve();
      },
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(copy.readFailed);
    tap(copy.reload, alert);
    expect(t.storage.platform.reloads).toBe(1);
  });
});

describe('the crop form (C2; G12, G17, G31)', () => {
  it('C2: the unit is required with an amount; Save writes exactly the checked fields; focus goes to the new row', async () => {
    const t = await open();
    const create = vi.spyOn(t.repos.garden, 'create');
    tap(copy.addCrop);
    const form = await screen.findByRole('form', { name: garden.addTitle });
    type(form, garden.nameLabel, 'Example kale');
    type(form, garden.amountLabel, '1,200');
    tap(copy.cropForm.save, form);
    expect(await within(form).findByText(copy.errors.digitsOnly)).toBeDefined();
    expect(within(form).getByText(garden.errors.unitRequired)).toBeDefined();
    expect(document.activeElement).toBe(within(form).getByLabelText(garden.amountLabel));
    type(form, garden.amountLabel, '1200');
    fireEvent.click(within(form).getByRole('radio', { name: garden.unitOptions.g }));
    tap(copy.cropForm.save, form);
    await waitFor(() => {
      expect(document.activeElement).toBe(row('Example kale'));
    });
    expect(create).toHaveBeenCalledWith(
      crop('Example kale', { amount: 1200, unit: 'g', harvestReady: false }),
    );
    expect(within(card(copy.gardenCard)).getByRole('status').textContent).toBe(copy.saved);
    // Edit prefills the stored number, never the display text, so an unchanged amount saves.
    expect(row('Example kale').textContent).toContain('1,200 g');
    fireEvent.click(row('Example kale'));
    const edit = await screen.findByRole('form', { name: 'Edit Example kale' });
    expect(within(edit).getByLabelText<HTMLInputElement>(garden.amountLabel).value).toBe('1200');
    tap(copy.cropForm.save, edit);
    await waitFor(() => {
      expect(screen.queryByRole('form')).toBeNull();
    });
  });

  it('C2 G12, G17: a typed name that matches a food links it; a duplicate offers to edit the one listed; Remove asks first', async () => {
    const t = await open();
    tap(copy.addCrop);
    let form = await screen.findByRole('form', { name: garden.addTitle });
    type(form, garden.nameLabel, ' silverbeet ');
    expect(within(form).getByText('Matched to Silverbeet')).toBeDefined();
    tap(copy.cropForm.save, form);
    expect(await within(form).findByText('Silverbeet is already in the garden.')).toBeDefined();
    tap('Edit Silverbeet', form);
    form = await screen.findByRole('form', { name: 'Edit Silverbeet' });
    tap(copy.cropForm.remove, form);
    expect(within(form).getByText('Remove Silverbeet from the garden?')).toBeDefined();
    tap(copy.cropForm.removeYes, form);
    await screen.findByText(copy.emptyGarden);
    expect(within(card(copy.gardenCard)).getByRole('status').textContent).toBe(copy.removed);

    // With the seeded row gone, typing its name links it again.
    tap(copy.addCrop);
    form = await screen.findByRole('form', { name: garden.addTitle });
    type(form, garden.nameLabel, 'Silv');
    tap('Silverbeet', within(form).getByRole('group', { name: copy.suggestions }));
    tap(copy.cropForm.save, form);
    await waitFor(async () => {
      expect((await t.repos.garden.list()).map((c) => [c.name, c.ingredientId])).toEqual([
        ['Silverbeet', 'seed:silverbeet'],
      ]);
    });
  });

  it('G30: a form with unsaved typing stays open when another row is tapped', async () => {
    await open({ seed: (t) => t.repos.garden.create(crop('Example herb')) });
    fireEvent.click(row('Example herb'));
    const form = await screen.findByRole('form', { name: 'Edit Example herb' });
    type(form, garden.keepsLabel, '3');
    fireEvent.click(row('Silverbeet'));
    expect(screen.getByRole('form', { name: 'Edit Example herb' })).toBe(form);
    expect(within(card(copy.gardenCard)).getByRole('status').textContent).toBe(
      copy.saveOrCancelFirst,
    );
    expect(form.contains(document.activeElement)).toBe(true);
  });
});

describe('Add harvest (C3; G14)', () => {
  it('C3: opens from #/garden/harvest; asks which crop and whether to add or replace, with the dates; saves, announces and leaves the link', async () => {
    const t = await open({
      hash: '#/garden/harvest',
      seed: async (s) => {
        const silverbeet = await seededSilverbeet(s);
        await s.repos.garden.update(silverbeet.id, {
          amount: 300,
          unit: 'g',
          harvestedAt: '2000-01-08',
          perishabilityDays: 5,
        });
        await s.repos.garden.create(
          crop('Example beans', { amount: 200, unit: 'g', harvestReady: false }),
        );
      },
    });
    const form = await screen.findByRole('form', { name: copy.harvest.title });
    tap(copy.harvest.save, form);
    expect(await within(form).findByText(copy.harvest.cropRequired)).toBeDefined();

    fireEvent.click(within(form).getByRole('radio', { name: 'Example beans' }));
    type(form, copy.harvest.howMuch, '100');
    expect(within(form).getByText('Listed now: 200 g, not ready yet')).toBeDefined();
    expect(within(form).getByText(copy.harvest.replaceOnly['not-ready-before'])).toBeDefined();

    fireEvent.click(within(form).getByRole('radio', { name: 'Silverbeet' }));
    expect(within(form).getByText('Listed now: 300 g, picked 8 January')).toBeDefined();
    type(form, copy.harvest.howMuch, '');
    expect(
      within(form).getByText(
        'With no amount entered, this replaces the 300 g listed with "amount not entered".',
      ),
    ).toBeDefined();
    type(form, copy.harvest.howMuch, '200');
    expect(
      within(form).getByRole('radio', { name: 'Add to it. Days left count from 8 January.' }),
    ).toBeDefined();
    type(form, copy.harvest.pickedOn, '2000-01-07');
    const add = within(form).getByRole('radio', {
      name: 'Add to it. Days left count from 7 January.',
    });
    tap(copy.harvest.save, form);
    expect(await within(form).findByText(copy.harvest.modeRequired)).toBeDefined();
    fireEvent.click(add);
    tap(copy.harvest.save, form);
    await waitFor(() => {
      expect(within(card(copy.gardenCard)).getByRole('status').textContent).toBe(
        'Saved: Silverbeet, 500 g.',
      );
    });
    expect(await seededSilverbeet(t)).toMatchObject({
      amount: 500,
      unit: 'g',
      harvestedAt: '2000-01-07',
      harvestReady: true,
    });
    expect(screen.queryByRole('form')).toBeNull();
    expect(window.location.hash).toBe('#/garden');
  });
});

describe('the pantry (C4; G29)', () => {
  it('C4: 0 needs a unit and reads "None left"; empty reads "Some, not measured"; Remove asks first', async () => {
    const t = await open();
    const pantry = card(copy.pantryCard);
    tap(copy.addPantry, pantry);
    let form = await screen.findByRole('form', { name: copy.pantryForm.addTitle });
    type(form, copy.pantryForm.name, 'Example rice');
    type(form, copy.pantryForm.amount, '0');
    tap(copy.pantryForm.save, form);
    expect(await within(form).findByText(garden.errors.unitRequired)).toBeDefined();
    fireEvent.click(within(form).getByRole('radio', { name: 'Grams' }));
    tap(copy.pantryForm.save, form);
    await waitFor(() => {
      expect(row('Example rice').textContent).toContain('None left');
    });
    tap(copy.addPantry, pantry);
    form = await screen.findByRole('form', { name: copy.pantryForm.addTitle });
    type(form, copy.pantryForm.name, 'Example tinned fish');
    tap(copy.pantryForm.save, form);
    await waitFor(() => {
      expect(row('Example tinned fish').textContent).toContain('Some, not measured');
    });
    fireEvent.click(row('Example rice'));
    form = await screen.findByRole('form', { name: 'Edit Example rice' });
    tap(copy.pantryForm.remove, form);
    expect(within(form).getByText('Remove Example rice from the pantry?')).toBeDefined();
    tap(copy.pantryForm.removeYes, form);
    await waitFor(async () => {
      expect((await t.repos.pantry.list()).map((p) => p.name)).toEqual(['Example tinned fish']);
    });
  });
});

describe('the photo (C5; GD-01, HS-30, G7)', () => {
  const file = () => new File([Uint8Array.of(1, 2, 3)], 'example.jpg', { type: 'image/jpeg' });
  const choose = (target: File = file()) => {
    fireEvent.change(screen.getByTestId('garden-photo-file'), { target: { files: [target] } });
  };
  async function openPhoto(platform?: PhotoPlatform, seed?: (t: TestDb) => Promise<unknown>) {
    const t = await open({
      ...(platform === undefined ? {} : { platform }),
      ...(seed === undefined ? {} : { seed }),
    });
    fireEvent.click(row('Silverbeet'));
    await screen.findByRole('form', { name: 'Edit Silverbeet' });
    return t;
  }

  it('C5 GD-01: a photo is kept without its location or comment, shown through a tracked URL, replaced with the old URL revoked, and a broken one shows the leaf', async () => {
    const t = await openPhoto();
    tap(copy.photo.add);
    choose();
    expect(await screen.findByText(copy.photo.kept)).toBeDefined();
    const silverbeet = await seededSilverbeet(t);
    const stored = await t.repos.gardenPhotos.get(silverbeet.id);
    expect(jpegMetadataMarkers(new Uint8Array(stored?.bytes ?? new ArrayBuffer(0)))).toEqual([]);
    const large = await screen.findByRole('img', { name: 'Photo of Silverbeet' });
    const first = large.getAttribute('src');
    expect(made).toContain(first);
    choose();
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Photo of Silverbeet' }).getAttribute('src')).not.toBe(
        first,
      );
    });
    expect(revoked).toContain(first);
    fireEvent.error(screen.getByRole('img', { name: 'Photo of Silverbeet' }));
    expect(screen.queryByRole('img', { name: 'Photo of Silverbeet' })).toBeNull();
  });

  /** A file the owner picks, over 30 MB by its reported size (no 30 MB is allocated). */
  const bigFile = () => {
    const big = file();
    Object.defineProperty(big, 'size', { value: 30_000_001 });
    return big;
  };

  it.each([
    ['a file over 30 MB', 'file-too-large', {}, bigFile],
    [
      'too many pixels',
      'too-many-pixels',
      { measure: () => Promise.resolve({ width: 10_000, height: 6_000 }) },
      file,
    ],
    [
      'a file that is not an image',
      'unreadable',
      { measure: () => Promise.reject(new Error('synthetic')) },
      file,
    ],
    [
      'no encoding small enough',
      'output-too-large',
      { encodeJpeg: () => Promise.resolve(new Uint8Array(500_001)) },
      file,
    ],
    [
      'an encoding that does not parse',
      'not-cleaned',
      { encodeJpeg: () => Promise.resolve(Uint8Array.of(1, 2, 3)) },
      file,
    ],
    // A JPEG whose frame is not the size prepared: the validation middleware refuses it.
    [
      'a refusal by the write check',
      'not-cleaned',
      { encodeJpeg: () => Promise.resolve(cleanJpeg({ width: 7, height: 7 })) },
      file,
    ],
  ] as const)(
    'C5: %s is told (%s), and the stored photo is left alone',
    async (_name, code, over, picked) => {
      const t = await openPhoto(fakePlatform(over), async (s) =>
        s.db.garden_photos.put(photoRow((await seededSilverbeet(s)).id)),
      );
      const id = (await seededSilverbeet(t)).id;
      const before = await t.repos.gardenPhotos.get(id);
      fireEvent.click(await screen.findByRole('button', { name: copy.photo.replace }));
      choose(picked());
      expect(await screen.findByText(copy.photo.errors[code])).toBeDefined();
      expect(await t.repos.gardenPhotos.get(id)).toEqual(before);
    },
  );

  it('C5 G7: the photo buttons wait while the form has unsaved changes; Remove asks first and says so', async () => {
    await openPhoto(undefined, async (s) =>
      s.db.garden_photos.put(photoRow((await seededSilverbeet(s)).id)),
    );
    const form = screen.getByRole('form', { name: 'Edit Silverbeet' });
    await screen.findByRole('button', { name: copy.photo.replace });
    type(form, garden.keepsLabel, '4');
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: copy.photo.replace }).disabled,
    ).toBe(true);
    expect(screen.getByText(copy.photo.saveFirst)).toBeDefined();
    tap(copy.cropForm.cancel, form);
    fireEvent.click(row('Silverbeet'));
    await screen.findByRole('form', { name: 'Edit Silverbeet' });
    fireEvent.click(await screen.findByRole('button', { name: copy.photo.remove }));
    expect(screen.getByText(copy.photo.removeConfirm)).toBeDefined();
    tap(copy.photo.removeYes);
    expect(await screen.findByText(copy.photo.removed)).toBeDefined();
    expect(screen.getByRole('button', { name: copy.photo.add })).toBeDefined();
  });

  it('C5 HS-30: a photo that finishes after delete-all closed the records is dropped: nothing stored, no URL made', async () => {
    let finish: (image: { width: number; height: number; close: () => void }) => void = () =>
      undefined;
    const t = await openPhoto(
      fakePlatform({
        decode: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      }),
    );
    tap(copy.photo.add);
    choose();
    await screen.findByText(copy.photo.preparing);
    const urlsBefore = made.length;
    act(() => {
      t.db.gate.close();
    });
    await act(async () => {
      finish({ width: 300, height: 200, close: () => undefined });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(await screen.findByText(copy.closed)).toBeDefined();
    expect(await t.db.garden_photos.count()).toBe(0);
    expect(made.length).toBe(urlsBefore);
  });
});
