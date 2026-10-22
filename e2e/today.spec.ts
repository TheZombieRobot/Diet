import { expect, type Page, test } from '@playwright/test';
import {
  alcohol,
  onboarding,
  privacy,
  reminders,
  targets,
  today,
  weight,
} from '../packages/core/src/copy/health';
import { heading, patchRecords, seedOnboarded, waitForServiceWorkerControl } from './support/app';

// Today in the production build (item 16 design section 5.3 E2): TD-01 to TD-04, HS-20, AL-09
// and PWA-04 (Today portion). Synthetic records from a finished setup (every answer "no", a 22:2
// pattern, a 100 kg onboarding weight).

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const panel = (page: Page) => page.locator('.ui-fab-panel');

async function todayLoaded(page: Page): Promise<void> {
  await expect(heading(page)).toHaveText('Today');
  await expect(region(page, today.cards.movement)).toBeVisible();
}

test('TD-01: the cards come in order, and Reminders shows the lipid test', async ({ page }) => {
  await seedOnboarded(page);
  await todayLoaded(page);
  await expect(region(page, privacy.backupReminder.cardLabel)).toBeVisible();
  const labels = await page
    .getByRole('main')
    .locator('section > .ui-card__header > h2')
    .allInnerTexts();
  expect(labels.map((l) => l.toLowerCase())).toEqual(
    [
      weight.card.label,
      'Fast',
      targets.today.label,
      today.cards.water,
      today.cards.steps,
      today.cards.movement,
      today.cards.drinks,
      privacy.backupReminder.cardLabel,
    ].map((l) => l.toLowerCase()),
  );
  await expect(region(page, privacy.backupReminder.cardLabel)).toContainText(
    reminders.cholesterol.title['day-1'],
  );
});

test('TD-03, TD-04, PWA-04: water, the electrolyte tick and steps are saved offline and still there after a reload', async ({
  page,
  context,
}) => {
  await seedOnboarded(page);
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  await todayLoaded(page);
  const water = region(page, today.cards.water);
  const add = water.getByRole('button', { name: today.water.add });
  await add.click();
  await expect(water.getByRole('status')).toHaveText('Added 250 mL. Today: 250 mL.');
  await add.click();
  await expect(water.getByRole('status')).toHaveText('Added 250 mL. Today: 500 mL.');
  await water.getByRole('switch', { name: today.water.electrolytes }).check();
  const steps = region(page, today.cards.steps);
  await steps.getByRole('button', { name: today.steps.enter }).click();
  await steps.getByLabel(today.steps.field).fill('9,000');
  await steps.getByLabel(today.steps.field).press('Enter');
  await expect(page.getByTestId('steps-today')).toHaveText('9,000');

  await page.reload();
  await todayLoaded(page);
  await expect(page.getByTestId('water-total')).toHaveText('500 mL');
  await expect(water.getByRole('switch', { name: today.water.electrolytes })).toBeChecked();
  await expect(page.getByTestId('steps-today')).toHaveText('9,000');
});

test('TD-02: a Later quick action does nothing; Log weight opens the entry in place, ready to type', async ({
  page,
}) => {
  await seedOnboarded(page);
  await todayLoaded(page);
  await expect(region(page, weight.card.label)).toBeVisible();
  await page.getByRole('button', { name: today.quickActions.title }).click();
  await expect(panel(page).getByText(today.quickActions.laterNote)).toBeVisible();
  const url = page.url();
  const later = panel(page).locator('[aria-disabled="true"]');
  // One Later row: items 19, 22, 23, 27 and 28 built Add harvest, Swap recipe, Finish meal,
  // Complete workout and Add drink.
  await expect(later).toHaveCount(1);
  for (let i = 0; i < 1; i++) {
    // aria-disabled rows stay focusable and tappable on purpose; they just do nothing.
    await later.nth(i).click({ force: true });
    await later.nth(i).press('Enter');
    expect(page.url()).toBe(url);
    await expect(heading(page)).toHaveText('Today');
    await expect(panel(page)).toBeVisible();
  }
  await panel(page).getByRole('button', { name: today.quickActions.labels['log-weight'] }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByLabel(weight.entry.fieldLabel)).toBeFocused();
  expect(page.url()).toBe(url);
});

test('TD-03, TD-04: after a save, and after a failed one, focus stays on the control that was used (design 1.14)', async ({
  page,
}) => {
  await seedOnboarded(page);
  await todayLoaded(page);
  const water = region(page, today.cards.water);
  const add = water.getByRole('button', { name: today.water.add });
  const toggle = water.getByRole('switch', { name: today.water.electrolytes });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(water.getByRole('status')).toHaveText('Added 250 mL. Today: 250 mL.');
  await expect(add).toBeFocused();
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
  await expect(toggle).toBeFocused();

  // From here the phone refuses every water and steps write.
  await page.evaluate(() => {
    const store = IDBObjectStore.prototype as unknown as Record<
      string,
      (this: IDBObjectStore, ...args: unknown[]) => IDBRequest
    >;
    for (const method of ['add', 'put', 'delete']) {
      const original = store[method];
      if (original === undefined) throw new Error(`no IDBObjectStore.${method}`);
      store[method] = function (this: IDBObjectStore, ...args: unknown[]) {
        if (this.name === 'water_log' || this.name === 'steps_log') {
          throw new DOMException('Synthetic write failure', 'UnknownError');
        }
        return original.apply(this, args);
      };
    }
  });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(water.getByRole('alert')).toHaveText(today.saveFailed);
  await expect(page.getByTestId('water-total')).toHaveText('250 mL');
  await expect(add).toBeFocused();
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeFocused();
  const steps = region(page, today.cards.steps);
  await steps.getByRole('button', { name: today.steps.enter }).click();
  await steps.getByLabel(today.steps.field).fill('9000');
  const save = steps.getByRole('button', { name: today.steps.save });
  await save.click();
  await expect(steps.getByRole('alert')).toHaveText(today.saveFailed);
  await expect(save).toBeFocused();
});

test('TD-02: the "+" panel keeps the Later note in view, with whole rows on a phone, and every row reachable at 200% zoom', async ({
  page,
}) => {
  await seedOnboarded(page);
  /** What of the panel is in view: inside its visible part, on the screen and not under the "+". */
  const inView = () =>
    page.evaluate(() => {
      const panelBox = document.querySelector('.ui-fab-panel')?.getBoundingClientRect();
      const fab = document.querySelector('.ui-fab')?.getBoundingClientRect();
      if (panelBox === undefined || fab === undefined) throw new Error('no panel');
      const whole = (b: DOMRect) =>
        b.top >= panelBox.top - 0.5 &&
        b.bottom <= Math.min(panelBox.bottom, window.innerHeight) + 0.5 &&
        (b.bottom <= fab.top || b.top >= fab.bottom || b.right <= fab.left || b.left >= fab.right);
      const note = document.querySelector('.ui-fab-panel p.ui-text-muted');
      const rows = Array.from(document.querySelectorAll('.ui-fab-panel .ui-action-row'), (r) =>
        r.getBoundingClientRect(),
      );
      return {
        note: note !== null && whole(note.getBoundingClientRect()),
        wholeRows: rows.filter(whole).length,
        // The first row starts in view, so the panel shows that it goes on.
        firstRowStarts: (rows[0]?.top ?? Infinity) < Math.min(panelBox.bottom, fab.top),
        lastRowWhole: rows.length > 0 && whole(rows[rows.length - 1] as DOMRect),
      };
    });
  // A 360 × 740 phone, then the same phone at 200% zoom.
  for (const [width, height] of [
    [360, 740],
    [180, 370],
  ] as const) {
    const where = `${width} × ${height}`;
    await page.setViewportSize({ width, height });
    await todayLoaded(page);
    await page.getByRole('button', { name: today.quickActions.title }).click();
    await expect(panel(page).getByText(today.quickActions.laterNote)).toBeVisible();
    const first = await inView();
    expect(first.note, `${where}: the Later note`).toBe(true);
    expect(first.firstRowStarts, `${where}: the first row`).toBe(true);
    if (width === 360) expect(first.wholeRows, `${where}: whole rows`).toBeGreaterThanOrEqual(3);
    // Scrolled to its end, the last row is clear of the "+".
    await panel(page).evaluate((p) => {
      p.scrollTop = p.scrollHeight;
    });
    expect((await inView()).lastRowWhole, `${where}: the last row`).toBe(true);
    await page.keyboard.press('Escape');
  }
});

test('HS-20: a new phone typing ./#/today gets Welcome, with nothing to log', async ({ page }) => {
  await page.goto('./#/today');
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
  await expect(page.getByRole('button', { name: today.water.add })).toHaveCount(0);
  await expect(page.getByRole('button', { name: today.steps.enter })).toHaveCount(0);
});

test('AL-09: on a small phone with weak storage, the "talk to someone" card is in view first, before the backup reminder', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: () => Promise.resolve(false), persist: () => Promise.resolve(false) },
    });
  });
  await page.setViewportSize({ width: 390, height: 600 });
  await seedOnboarded(page);
  await patchRecords(page, {
    readiness: { q7: 'yes' },
    settings: { onboardingCompletedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
  });
  await todayLoaded(page);
  const talk = region(page, alcohol.helpCardLabel);
  const reminderCard = region(page, privacy.backupReminder.cardLabel);
  await expect(reminderCard).toContainText(privacy.backupReminder.weakStorage);
  const call = talk.getByRole('link').first();
  await expect(call).toHaveAttribute('href', 'tel:0800787797');
  const box = await call.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? -1) >= 0 && (box?.y ?? 0) + (box?.height ?? 0) <= 600).toBe(true);
  const order = await page
    .getByRole('main')
    .locator('section > .ui-card__header > h2')
    .allInnerTexts();
  expect(order.slice(0, 2).map((l) => l.toLowerCase())).toEqual(
    [alcohol.helpCardLabel, privacy.backupReminder.cardLabel].map((l) => l.toLowerCase()),
  );
});
