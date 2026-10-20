import { expect, test, type Page } from '@playwright/test';
import {
  alcohol,
  garden,
  onboarding,
  privacy,
  profile,
  readiness,
  schedule,
} from '../packages/core/src/copy/health';
import { plainReferenceEnvelopeV1 } from '../packages/test-fixtures/src/index';
import { commerceRules, healthPhraseRules } from '../tools/scans/rules';
import { scanText } from '../tools/scans/scan';
import {
  goTo,
  heading,
  renderedText,
  seedOnboarded,
  waitForServiceWorkerControl,
} from './support/app';
import { lowContrastText } from './support/contrast';
import { helpRowProblems } from './support/helpRows';
import { startAudit } from './support/network';

// The first-run flow in the production build (checklist item 13; HS-20, HS-03, RD-04, RD-07,
// RD-08, FL-08 in the UI, C53). A fresh browser context is a fresh phone. Values are synthetic.

const QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const;
type Q = (typeof QUESTIONS)[number];

const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name });

async function toNotice(page: Page): Promise<void> {
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
  await button(page, onboarding.frame.continue).click();
  await expect(heading(page)).toHaveText(alcohol.notice.title);
}

async function acknowledge(page: Page): Promise<void> {
  await toNotice(page);
  await button(page, alcohol.notice.acknowledge).click();
  await expect(heading(page)).toHaveText(readiness.questions.q1);
}

async function answer(page: Page, q: Q, value: 'yes' | 'no'): Promise<void> {
  await expect(heading(page)).toHaveText(readiness.questions[q]);
  await button(page, value === 'yes' ? readiness.yes : readiness.no).click();
  if (value === 'yes') {
    await expect(page.getByTestId('consequence')).toBeVisible();
    await button(page, onboarding.frame.continue).click();
  }
}

async function answerAll(
  page: Page,
  answers: Partial<Record<Q, 'yes' | 'no'>> = {},
  from: Q = 'q1',
): Promise<void> {
  for (const q of QUESTIONS.slice(QUESTIONS.indexOf(from)))
    await answer(page, q, answers[q] ?? 'no');
  await expect(heading(page)).toHaveText(readiness.summaryTitle);
}

async function fillProfile(page: Page, weight = '100', goal?: string): Promise<void> {
  await page.getByLabel(profile.heightLabel).fill('175');
  await page.getByLabel(profile.weightLabel).fill(weight);
  await page.getByLabel(profile.birthYearLabel).fill('1970');
  await page.getByRole('radio', { name: profile.sexOptions.female }).check();
  if (goal !== undefined) await page.getByLabel(profile.goalLabel).fill(goal);
}

/** Every store of the app's database, read with raw IndexedDB. */
function readStores(page: Page, stores: readonly string[]): Promise<Record<string, unknown[]>> {
  return page.evaluate(
    (names) =>
      new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const request = indexedDB.open('diet');
        request.onerror = () => {
          reject(new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(names, 'readonly');
          const out: Record<string, unknown[]> = {};
          for (const name of names) {
            const all = tx.objectStore(name).getAll();
            all.onsuccess = () => {
              out[name] = all.result as unknown[];
            };
          }
          tx.oncomplete = () => {
            db.close();
            resolve(out);
          };
        };
      }),
    [...stores],
  );
}

const settingsRow = async (page: Page) =>
  (await readStores(page, ['settings']))['settings']?.[0] as Record<string, unknown>;

const DEEP_LINKS = [
  './',
  './#/today',
  './#/food',
  './#/move',
  './#/drinks',
  './#/list',
  './#/settings',
  './#/about',
  './#/readiness',
  './#/profile',
  './#/eating-schedule',
  // Item 18: the food catalogue.
  './#/foods',
  './#/pairing',
  './#/nothing',
];

test('P1 HS-20: every address, and the manifest start_url, opens on Welcome', async ({
  page,
  request,
}) => {
  for (const url of DEEP_LINKS) {
    await page.goto(url);
    // A hash change within the page (no reload) must not pass Welcome either.
    await expect(heading(page), url).toHaveText(onboarding.welcome.title);
    await page.reload();
    await expect(heading(page), url).toHaveText(onboarding.welcome.title);
    await expect(page.getByText('Step 1 of 6')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(page.locator('input[type=file]')).toHaveCount(0);
  }
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestUrl = new URL(manifestHref ?? '', page.url());
  const manifest = (await (await request.get(manifestUrl.href)).json()) as { start_url: string };
  await page.goto(new URL(manifest.start_url, manifestUrl).href);
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
});

test('P2 HS-20: reload and the back button stay in the flow; after the notice, back steps through setup', async ({
  page,
}) => {
  await page.goto('./');
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
  await page.reload();
  await toNotice(page);
  await page.reload();
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
  await page.goto('./#/today');
  await page.goto('./#/settings');
  await page.goBack();
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
  await expect(page.locator('input[type=file]')).toHaveCount(0);

  await acknowledge(page);
  await answer(page, 'q1', 'no');
  await expect(heading(page)).toHaveText(readiness.questions.q2);
  await page.goBack();
  await expect(heading(page)).toHaveText(readiness.questions.q1);
  await button(page, onboarding.frame.helpLink).click();
  await expect(heading(page)).toHaveText('About');
  await page.goBack();
  await expect(heading(page)).toHaveText(readiness.questions.q1);
});

test('P2 E59: once setup ends, a single back gesture from Today leaves the app', async ({
  page,
}) => {
  await page.goto('./');
  await acknowledge(page);
  await answerAll(page, { q5: 'yes' });
  await button(page, onboarding.frame.continue).click();
  await fillProfile(page);
  await button(page, onboarding.frame.continue).click();
  await expect(heading(page)).toHaveText(garden.title);
  await button(page, garden.skip).click();
  await expect(heading(page)).toHaveText('Today');
  await expect(page).toHaveURL(/#\/today$/);
  await expect(heading(page)).toBeFocused();
  await page.goBack();
  expect(page.url()).toBe('about:blank');
});

test('P3 HS-20: "I understand" is stored, and only then is restore offered', async ({ page }) => {
  await page.goto('./');
  await toNotice(page);
  await expect(button(page, onboarding.frame.restoreLink)).toHaveCount(0);
  expect((await settingsRow(page))['alcoholNoticeAckAt']).toBeNull();
  await button(page, alcohol.notice.acknowledge).click();
  await expect(heading(page)).toHaveText(readiness.questions.q1);
  expect(typeof (await settingsRow(page))['alcoholNoticeAckAt']).toBe('string');
  await expect(button(page, onboarding.frame.restoreLink)).toBeVisible();
});

test('P4 RD-07: closing and reopening resumes at the first unfinished step', async ({ page }) => {
  await page.goto('./');
  await acknowledge(page);
  await answer(page, 'q1', 'no');
  await answer(page, 'q2', 'no');
  await expect(heading(page)).toHaveText(readiness.questions.q3);
  await page.reload();
  await expect(heading(page)).toHaveText(readiness.questions.q3);
  await answerAll(page, {}, 'q3');
  await page.reload();
  await expect(heading(page)).toHaveText(readiness.summaryTitle);
  await button(page, onboarding.frame.continue).click();
  await fillProfile(page);
  await button(page, onboarding.frame.continue).click();
  await expect(heading(page)).toHaveText(schedule.title);
  await page.reload();
  await expect(heading(page)).toHaveText(schedule.title);
  await expect(page.getByRole('radio', { name: /^23:1/ })).toBeChecked();
  await button(page, onboarding.frame.continue).click();
  await expect(heading(page)).toHaveText(garden.title);
  await page.reload();
  await expect(heading(page)).toHaveText(garden.title);
});

test('P5 FL-08 in the UI: a whole setup, then Today, with every record stored', async ({
  page,
}) => {
  await page.goto('./');
  await acknowledge(page);
  await answerAll(page);
  await button(page, onboarding.frame.continue).click();
  await fillProfile(page, '100', '78');
  await button(page, onboarding.frame.continue).click();
  await expect(heading(page)).toHaveText(schedule.title);
  await page.getByRole('radio', { name: /^22:2/ }).check();
  await expect(page.getByTestId('window-summary')).toHaveText(
    'Eating 5:00 pm to 7:00 pm = 2 hours. Fasting 22 hours.',
  );
  await button(page, onboarding.frame.continue).click();
  await expect(heading(page)).toHaveText(garden.title);
  await button(page, garden.skip).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(heading(page)).toHaveText('Today');

  const stored = await readStores(page, ['readiness', 'weights', 'profile', 'targets', 'settings']);
  expect(stored['readiness']).toHaveLength(7);
  expect(stored['weights']).toMatchObject([{ kg: 100, source: 'onboarding' }]);
  expect(stored['profile']?.[0]).toMatchObject({ goalKg: 78, goalReferenceKg: 100 });
  expect((stored['profile']?.[0] as { goalSetAt: unknown }).goalSetAt).toEqual(expect.any(String));
  expect(stored['targets']?.[0]).toMatchObject({
    fastingPreset: '22:2',
    eatingWindow: { start: '17:00', end: '19:00' },
  });
  const settings = stored['settings']?.[0] as Record<string, unknown>;
  for (const marker of [
    'alcoholNoticeAckAt',
    'profileConfirmedAt',
    'scheduleConfirmedAt',
    'gardenConfirmedAt',
    'onboardingCompletedAt',
  ]) {
    expect(typeof settings[marker], marker).toBe('string');
  }
});

test('P6 HS-03 / RD-04: answer 5 leaves out the goal, Kickstart and the schedule', async ({
  page,
}) => {
  await page.goto('./');
  await acknowledge(page);
  await answerAll(page, { q5: 'yes' });
  await button(page, onboarding.frame.continue).click();
  await expect(heading(page)).toHaveText(profile.title);
  await expect(page.getByLabel(profile.goalLabel)).toHaveCount(0);
  await expect(page.getByRole('switch', { name: profile.kickstartLabel })).toHaveCount(0);
  await fillProfile(page);
  await button(page, onboarding.frame.continue).click();
  await expect(heading(page)).toHaveText(garden.title);
  await expect(page.getByText('Step 6 of 6')).toBeVisible();
  expect((await readStores(page, ['targets']))['targets']?.[0]).toMatchObject({
    fastingPreset: null,
  });
  await button(page, garden.skip).click();
  await expect(heading(page)).toHaveText('Today');
  await goTo(page, 'Eating schedule');
  await expect(page.getByTestId('gate-notice-fasting')).toBeVisible();
});

test('P7 C53 / RD-08: a restored file without the acknowledgement or answers asks for them again, with no request outside the app', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  // Audited like every restore (support/network.ts; HS-14), from before the first page load.
  const audit = await startAudit(context, request, baseURL);
  // A plain backup built at run time from the version-1 fixture, without the acknowledgement and
  // without any readiness answer.
  const envelope = JSON.parse(plainReferenceEnvelopeV1()) as {
    payload: { tables: { settings: Record<string, unknown>[]; readiness: unknown[] } };
  };
  const { tables } = envelope.payload;
  tables.settings = tables.settings.map((s) => ({ ...s, alcoholNoticeAckAt: null }));
  tables.readiness = [];
  await page.goto('./');
  await acknowledge(page);
  await button(page, onboarding.frame.restoreLink).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    button(page, privacy.importBackup.chooseFile).click(),
  ]);
  await chooser.setFiles({
    name: 'diet-backup-2000-03-01.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(envelope)),
  });
  const confirm = page.getByTestId('restore-confirm');
  await expect(confirm).toBeVisible();
  await Promise.all([
    page.waitForEvent('load'),
    confirm.getByRole('button', { name: privacy.importBackup.replace }).click(),
  ]);
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
  await toNotice(page);
  await button(page, alcohol.notice.acknowledge).click();
  await expect(heading(page)).toHaveText(readiness.questions.q1);
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await audit.verify();
});

test('P9 E53: "My medication or dose has changed" in Settings turns fasting off again, after a reload too', async ({
  page,
}) => {
  await seedOnboarded(page, './#/readiness');
  await expect(heading(page)).toHaveText('Readiness answers');
  const q3 = page.getByTestId('readiness-q3');
  await q3.getByRole('button', { name: readiness.yes }).click();
  await q3
    .getByRole('switch', { name: readiness.confirmations.prescriberAgreed })
    .click({ force: true });
  await q3.getByRole('button', { name: readiness.changed.q3 }).click();
  await expect(page.getByText(readiness.changedDone.q3)).toBeVisible();
  await page.reload();
  await goTo(page, 'Eating schedule');
  await expect(page.getByTestId('gate-notice-fasting')).toBeVisible();
});

test('P10: Save and the Yes and No buttons in Settings keep focus while they save', async ({
  page,
}) => {
  await seedOnboarded(page, './#/eating-schedule');
  await expect(heading(page)).toHaveText('Eating schedule');
  const save = button(page, schedule.save);
  await save.click();
  await expect(page.getByText(schedule.saved)).toBeVisible();
  await expect(save).toBeFocused();
  await goTo(page, 'Readiness answers');
  const q2 = page.getByTestId('readiness-q2');
  const yes = q2.getByRole('button', { name: readiness.yes, exact: true });
  await yes.click();
  await expect(yes).toHaveAttribute('aria-pressed', 'true');
  await expect(yes).toBeFocused();
});

/**
 * What each onboarding view must pass (P8): wording, contrast in both themes, 48 px, no sideways
 * scroll, and help number rows whose words and numbers stay whole (F19).
 */
async function sweep(page: Page, where: string, found: string[]): Promise<void> {
  const text = await renderedText(page);
  found.push(
    ...scanText(where, text, [...healthPhraseRules, ...commerceRules]).map(
      (v) => `${where}: ${v.ruleId}`,
    ),
  );
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    found.push(...(await lowContrastText(page, `${where}, ${colorScheme}`)).low);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  const sizes = await page
    .locator('a:visible, button:visible, input:visible')
    .evaluateAll((controls) =>
      controls.map((c) => {
        const box = c.getBoundingClientRect();
        const name = `${c.tagName.toLowerCase()} "${c.getAttribute('aria-label') ?? c.textContent}"`;
        return { name, w: box.width, h: box.height };
      }),
    );
  for (const { name, w, h } of sizes) {
    if (h < 48 || w < 48) found.push(`${where}: ${name} is ${w} x ${h}`);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) found.push(`${where}: scrolls sideways by ${overflow} px`);
  found.push(
    ...(await dayBarProblems(page, where)),
    ...(await clippedTimeFields(page, where)),
    ...(await headerLinkProblems(page, where)),
    ...(await helpRowProblems(page, where)),
  );
}

/** The header's "Help numbers and About" starts where the heading does. */
function headerLinkProblems(page: Page, where: string): Promise<string[]> {
  return page.evaluate((label) => {
    const link = document.querySelector('.ui-steps__link .ui-button');
    const title = document.querySelector('h1');
    if (link === null || title === null) return [];
    const text = document.createRange();
    text.selectNodeContents(link);
    const offset = text.getBoundingClientRect().left - title.getBoundingClientRect().left;
    return Math.abs(offset) > 2
      ? [`${label}: the header link is ${offset} px off the heading`]
      : [];
  }, where);
}

/** The day bar's times sit on one line, each under its own hour, the ends at the bar's ends. */
function dayBarProblems(page: Page, where: string): Promise<string[]> {
  return page.evaluate((label) => {
    const problems: string[] = [];
    for (const bar of document.querySelectorAll('.ui-daybar')) {
      const track = bar.querySelector('.ui-daybar__track')?.getBoundingClientRect();
      const all = Array.from(bar.querySelectorAll<HTMLElement>('.ui-daybar__label'));
      if (track === undefined) continue;
      all.forEach((element, i) => {
        const box = element.getBoundingClientRect();
        if (box.width === 0) return;
        const hour = track.left + (track.width * i) / (all.length - 1);
        const at =
          i === 0 ? box.left : i === all.length - 1 ? box.right : (box.left + box.right) / 2;
        if (Math.abs(at - hour) > 1)
          problems.push(`${label}: "${element.textContent}" is off its hour`);
        const first = all[0]?.getBoundingClientRect();
        if (first !== undefined && Math.abs(box.top - first.top) > 1) {
          problems.push(`${label}: the day bar's times wrap`);
        }
        const next = all.slice(i + 1).find((e) => e.getBoundingClientRect().width > 0);
        if (next !== undefined && box.right > next.getBoundingClientRect().left) {
          problems.push(`${label}: "${element.textContent}" overlaps the next time`);
        }
      });
    }
    return problems;
  }, where);
}

/**
 * Time fields whose hours, minutes and AM/PM do not all show: Chromium's own parts of the field,
 * read through the DevTools protocol, are wider than the box they are drawn in.
 */
async function clippedTimeFields(page: Page, where: string): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const pseudoOf = (node: typeof root) => {
      const attributes = node.attributes ?? [];
      return attributes[attributes.indexOf('pseudo') + 1];
    };
    const edits: (typeof root)[] = [];
    const walk = (node: typeof root) => {
      if (pseudoOf(node) === '-webkit-datetime-edit') edits.push(node);
      for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) walk(child);
    };
    walk(root);
    const width = async (node: typeof root) =>
      (await cdp.send('DOM.getBoxModel', { nodeId: node.nodeId })).model.width;
    const problems: string[] = [];
    for (const edit of edits) {
      const fields = edit.children?.find(
        (c) => pseudoOf(c) === '-webkit-datetime-edit-fields-wrapper',
      );
      if (fields === undefined) continue;
      if ((await width(fields)) > (await width(edit)) + 0.5) {
        problems.push(`${where}: a time field cuts off part of its time`);
      }
    }
    return problems;
  } finally {
    await cdp.detach();
  }
}

/** Walks every view of setup, sweeping each (P8). */
async function walkSetup(page: Page, found: string[]): Promise<void> {
  await page.goto('./');
  await expect(heading(page)).toHaveText(onboarding.welcome.title);
  await sweep(page, 'Welcome', found);
  await toNotice(page);
  await button(page, alcohol.notice.why).click();
  await sweep(page, 'the notice with "Why" open', found);
  await button(page, alcohol.notice.acknowledge).click();
  await expect(heading(page)).toHaveText(readiness.questions.q1);
  await sweep(page, 'a question', found);
  await answer(page, 'q1', 'yes');
  await answer(page, 'q2', 'no');
  await button(page, readiness.yes).click();
  await expect(page.getByTestId('consequence')).toBeVisible();
  // The chosen answer's tick is drawn, not read: the button is still named "Yes".
  await expect(page.getByRole('button', { name: readiness.yes, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page
    .getByRole('switch', { name: readiness.confirmations.prescriberAgreed })
    .click({ force: true });
  // Answer 1 keeps fasting off, so the confirmation is recorded without saying it can be chosen.
  await expect(page.getByText(readiness.confirmedAlsoOff.prescriberAgreed)).toBeVisible();
  await sweep(page, 'a yes with its confirmation', found);
  await button(page, onboarding.frame.continue).click();
  await answer(page, 'q4', 'yes');
  await answerAll(page, {}, 'q5');
  await sweep(page, 'the summary', found);
  await button(page, onboarding.frame.continue).click();
  await expect(heading(page)).toHaveText(profile.title);
  await page.getByLabel(profile.heightLabel).fill('175');
  await page.getByLabel(profile.weightLabel).fill('55');
  await page.getByLabel(profile.birthYearLabel).fill('1970');
  await button(page, onboarding.frame.continue).click();
  await expect(page.getByText(onboarding.frame.fixBelow)).toBeVisible();
  await expect(page.getByText(readiness.ageCheck.answeredUnder18)).toBeVisible();
  await expect(page.getByText(readiness.weightCheck.lowWeight)).toBeVisible();
  await sweep(page, 'the profile with an error and both cross-checks', found);
  // "Add" sits beside the dislikes field itself (or, with no room, under it), not beside its hint.
  const dislikes = await page.getByLabel(profile.dislikesLabel).boundingBox();
  const add = await button(page, profile.dislikesAdd).boundingBox();
  if (dislikes === null || add === null) {
    found.push('the profile: no dislikes field or Add button');
  } else if (add.x >= dislikes.x + dislikes.width) {
    const middle = add.y + add.height / 2;
    if (!(middle > dislikes.y && middle < dislikes.y + dislikes.height)) {
      found.push(`the profile: "${profile.dislikesAdd}" is not beside the dislikes field`);
    }
  }
  await button(page, readiness.ageCheck.changeAnswer).click();
  await button(page, readiness.no).click();
  await expect(heading(page)).toHaveText(profile.title);
  await page.getByLabel(profile.weightLabel).fill('100');
  await page.getByRole('radio', { name: profile.sexOptions.female }).check();
  await button(page, onboarding.frame.continue).click();
  await expect(heading(page)).toHaveText(schedule.title);
  await expect(page.getByText(schedule.chooseFirst)).toBeVisible();
  await sweep(page, 'the schedule with no pattern chosen', found);
  await page.getByRole('radio', { name: /^22:2/ }).check();
  await sweep(page, 'the schedule', found);
  await button(page, onboarding.frame.continue).click();
  await expect(heading(page)).toHaveText(garden.title);
  await sweep(page, 'the garden', found);
  await button(page, onboarding.frame.helpLink).click();
  await expect(heading(page)).toHaveText('About');
  await sweep(page, 'About inside setup', found);
  await button(page, onboarding.frame.backToSetup).click();
  await button(page, onboarding.frame.restoreLink).click();
  await expect(heading(page)).toHaveText(onboarding.frame.restoreTitle);
  await sweep(page, 'restore inside setup', found);
}

test('P8: every view of setup passes the wording, contrast, 48 px and layout checks, at 360 px and at 200% text on it, with no request outside the app', async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(420_000);
  const found: string[] = [];
  // 180 px: a 360 px phone at 200% text (the repository's rule, as in shell.spec).
  for (const viewport of [undefined, { width: 360, height: 740 }, { width: 180, height: 740 }]) {
    const context = await browser.newContext({
      ...(baseURL === undefined ? {} : { baseURL }),
      ...(viewport === undefined ? {} : { viewport }),
    });
    // The full audit (support/network.ts), started before the context's first page opens.
    const audit = await startAudit(context, request, baseURL);
    try {
      const page = await context.newPage();
      await walkSetup(page, found);
      await audit.verify();
    } finally {
      await context.close();
    }
  }
  expect(found).toEqual([]);
});

test('P8: the opening screen, when the records take long to open, offers Reload and the help numbers', async ({
  page,
}) => {
  // Another holder of the records lock keeps the app waiting (as a stuck tab would).
  await page.addInitScript(() => {
    void navigator.locks.request(
      'diet-db-open',
      { mode: 'exclusive' },
      () => new Promise(() => undefined),
    );
  });
  await page.goto('./');
  await expect(page.getByRole('status').first()).toHaveText(onboarding.frame.opening);
  await expect(page.getByText(onboarding.frame.openingSlow)).toBeVisible({ timeout: 15_000 });
  await expect(button(page, privacy.storageFailure.reload)).toBeVisible();
  await expect(page.getByRole('link', { name: /111$/ })).toBeVisible();
  const found: string[] = [];
  await sweep(page, 'the opening screen, slow', found);
  expect(found).toEqual([]);
});

test('P2 / PWA: setup works offline once the offline copy is saved', async ({ page, context }) => {
  await page.goto('./');
  await waitForServiceWorkerControl(page);
  await context.setOffline(true);
  await page.reload();
  await acknowledge(page);
  await answer(page, 'q1', 'no');
  await expect(heading(page)).toHaveText(readiness.questions.q2);
});
