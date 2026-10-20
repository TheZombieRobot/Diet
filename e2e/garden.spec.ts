import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';
import { garden, gardenScreen, privacy } from '../packages/core/src/copy/health';
import { jpegMetadataMarkers, jpegSize, PHOTO_LIMITS } from '../packages/core/src/index';
import {
  ALL_PHOTO_METADATA,
  hasTestMarker,
  PHOTO_TEST_MARKERS,
  withMetadata,
} from '../packages/test-fixtures/src/index';
import { goTo, heading, seedOnboarded, waitForServiceWorkerControl } from './support/app';
import { bandAtTop, bandOnRight, canvasJpeg, readPhotos } from './support/db';
import { type Audit, startAudit } from './support/network';

// Garden and pantry in the production build (checklist item 19; design section 5, E1 and E2;
// GD-01, GD-02, HS-14, HS-15, PWA-04). Photos are drawn by the page's own canvas and given
// synthetic metadata in code (every GPS position 0° N 0° E); no image file is committed. Every
// request in every test is checked to go to the app's own origin only.

const test = base.extend<{ audit: Audit }>({
  audit: [
    async ({ context, request, baseURL }, use) => {
      const audit = await startAudit(context, request, baseURL);
      await use(audit);
      await audit.verify();
    },
    { auto: true },
  ],
});

const copy = gardenScreen;
const row = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name}\\b`) });
const form = (page: Page, name: string) => page.getByRole('form', { name });

/** Opens a saved crop's panel, adds `bytes` through the real file chooser, and closes the panel. */
async function addPhoto(page: Page, crop: string, bytes: Uint8Array): Promise<void> {
  await row(page, crop).click();
  const panel = page.locator('.ui-item-panel');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    panel.getByRole('button', { name: copy.photo.add }).click(),
  ]);
  await chooser.setFiles({
    name: 'example.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByText(copy.photo.kept)).toBeVisible();
  await expect(panel.getByRole('img', { name: `Photo of ${crop}` })).toBeVisible();
  await panel.getByRole('button', { name: copy.cropForm.cancel }).click();
}

/** Adds a crop with only its name. */
async function addCrop(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: copy.addCrop }).click();
  await form(page, garden.addTitle).getByLabel(garden.nameLabel).fill(name);
  await form(page, garden.addTitle).getByRole('button', { name: copy.cropForm.save }).click();
  await expect(row(page, name)).toBeFocused();
}

const bytesOf = (base64: string) => new Uint8Array(Buffer.from(base64, 'base64'));

test('E1 GD-01, GD-02: a photo is kept upright, small and with no metadata, and the backup holds none of it', async ({
  page,
}) => {
  await seedOnboarded(page);
  await goTo(page, 'Garden and pantry');
  // 300 × 200 with orientation 6 (turned a quarter): the kept photo is upright, 200 × 300.
  const turned = withMetadata(await canvasJpeg(page, 300, 200), ALL_PHOTO_METADATA);
  expect(hasTestMarker(turned)).toBe(true);
  await addPhoto(page, 'Silverbeet', turned);
  await addCrop(page, 'Example lettuce');
  const large = withMetadata(await canvasJpeg(page, 3000, 2000), { gps: true, comment: true });
  await addPhoto(page, 'Example lettuce', large);
  // A large portrait, the usual shape of a phone photo: scaled on its long side, never squeezed.
  await addCrop(page, 'Example kale');
  await addPhoto(page, 'Example kale', await canvasJpeg(page, 2000, 3000));

  const photos = await readPhotos(page);
  expect(photos).toHaveLength(3);
  for (const photo of photos) {
    const bytes = bytesOf(photo.base64);
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    expect(photo.mimeType).toBe('image/jpeg');
    expect(jpegMetadataMarkers(bytes)).toEqual([]);
    expect(hasTestMarker(bytes)).toBe(false);
    expect(jpegSize(bytes)).toEqual({ width: photo.width, height: photo.height });
    expect(bytes.length).toBeLessThanOrEqual(PHOTO_LIMITS.targetBytes);
  }
  expect(photos.map((p) => [p.width, p.height]).sort()).toEqual([
    [1024, 683],
    [200, 300],
    [683, 1024],
  ]);
  // Turned upright, not squeezed into the upright size: the band drawn at the top is on the right.
  const upright = photos.find((p) => p.width === 200);
  expect(await bandOnRight(page, upright?.base64 ?? '')).toBe(true);
  const portrait = photos.find((p) => p.width === 683);
  expect(await bandAtTop(page, portrait?.base64 ?? '')).toBe(true);

  // A plain backup from Settings holds no photo, no photo key and no marker text (HS-15).
  await goTo(page, 'Settings');
  const card = page.getByRole('region', { name: privacy.backupCard.title });
  await card.getByRole('button', { name: privacy.backupCard.exportAction }).click();
  await card.getByRole('switch', { name: privacy.exportBackup.lockLabel }).uncheck();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('button', { name: privacy.exportBackup.saveFile }).click(),
  ]);
  const text = readFileSync(await download.path(), 'utf8');
  expect(text).toContain('Example lettuce');
  expect(text).not.toContain('garden_photos');
  expect(text).not.toContain('"bytes"');
  for (const marker of Object.values(PHOTO_TEST_MARKERS)) expect(text).not.toContain(marker);
  for (const photo of photos) expect(text).not.toContain(photo.base64.slice(0, 64));
});

test('E2 PWA-04 (garden part): a crop, a harvest, a pantry item and a photo added offline are all there in a new page offline', async ({
  page,
  context,
}) => {
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  await goTo(page, 'Garden and pantry');

  await addCrop(page, 'Example lettuce');
  await page.getByRole('button', { name: copy.addHarvest }).click();
  const harvest = form(page, copy.harvest.title);
  await harvest.getByRole('radio', { name: 'Silverbeet' }).check();
  await harvest.getByLabel(copy.harvest.howMuch).fill('300');
  await harvest.getByRole('radio', { name: garden.unitOptions.g }).check();
  await harvest.getByRole('button', { name: copy.harvest.save }).click();
  await expect(page.getByText('Saved: Silverbeet, 300 g.')).toBeVisible();
  await page.getByRole('button', { name: copy.addPantry }).click();
  await form(page, copy.pantryForm.addTitle).getByLabel(copy.pantryForm.name).fill('Example rice');
  await form(page, copy.pantryForm.addTitle)
    .getByRole('button', { name: copy.pantryForm.save })
    .click();
  await expect(row(page, 'Example rice')).toBeVisible();
  await addPhoto(page, 'Example lettuce', await canvasJpeg(page, 400, 300));
  await page.close();

  const again = await context.newPage();
  await again.goto('./#/garden');
  await expect(heading(again)).toHaveText('Garden and pantry');
  await expect(row(again, 'Silverbeet')).toContainText('300 g');
  await expect(row(again, 'Example lettuce')).toBeVisible();
  await expect(row(again, 'Example rice')).toContainText('Some, not measured');
  const thumbnail = row(again, 'Example lettuce').locator('img');
  await expect(thumbnail).toBeVisible();
  await expect
    .poll(() => thumbnail.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
});

/**
 * Words in the crop rows and the choices that a line break falls inside: each word of each
 * visible title, amount and choice label is measured, and one drawn on two lines is listed.
 */
function brokenWords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const broken: string[] = [];
    const parts = '.ui-item-row__title, .ui-item-row__value, .ui-choice__label';
    for (const element of document.querySelectorAll<HTMLElement>(parts)) {
      if (element.getClientRects().length === 0) continue;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        for (const word of (node.textContent ?? '').matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, word.index);
          range.setEnd(node, word.index + word[0].length);
          const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
          if (lines.size > 1) broken.push(word[0]);
        }
      }
    }
    return broken;
  });
}

// Item 19 review: on the owner's phone and on one zoomed to 200% (180 px wide), crop names,
// amounts and choices wrap between words, never inside one ("Sil / ve / rb / ee / t").
test('E4: on a 360 px and a 412 px phone, and at 200%, no word of a crop row or a choice is broken', async ({
  page,
}) => {
  await seedOnboarded(page);
  await goTo(page, 'Garden and pantry');
  await page.getByRole('button', { name: copy.addCrop }).click();
  const add = form(page, garden.addTitle);
  await add.getByLabel(garden.nameLabel).fill('Example courgette');
  await add.getByLabel(garden.amountLabel).fill('2');
  await add.getByRole('radio', { name: garden.unitOptions.each }).check();
  await add.getByLabel(copy.cropForm.gramsPerUnit.each).fill('250');
  await add.getByRole('button', { name: copy.cropForm.save }).click();
  await expect(row(page, 'Example courgette')).toBeFocused();

  for (const size of [
    { width: 360, height: 740 },
    { width: 412, height: 915 },
    { width: 180, height: 370 },
  ]) {
    await page.setViewportSize(size);
    expect(await brokenWords(page), `rows at ${String(size.width)} px`).toEqual([]);
    await row(page, 'Silverbeet').click();
    const edit = form(page, 'Edit Silverbeet');
    await expect(edit).toBeVisible();
    expect(await brokenWords(page), `the crop form at ${String(size.width)} px`).toEqual([]);
    await edit.getByRole('button', { name: copy.cropForm.cancel }).click();
    await page.getByRole('button', { name: copy.addHarvest }).click();
    const harvest = form(page, copy.harvest.title);
    await expect(harvest).toBeVisible();
    expect(await brokenWords(page), `Add harvest at ${String(size.width)} px`).toEqual([]);
    await harvest.getByRole('button', { name: copy.harvest.cancel }).click();
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(sideways, `nothing scrolls sideways at ${String(size.width)} px`).toBe(false);
  }
});
