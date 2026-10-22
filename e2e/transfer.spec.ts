import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { grocery, transfer } from '../packages/core/src/copy/health';
import type { GroceryListRecord } from '../packages/core/src/index';
import { RELAY_E2E_ORIGIN, RELAY_ORIGIN } from '../packages/core/src/relay/protocol';
import { bodyFromPasteCode, listPayload } from '../packages/grocery/src/transfer/index';
import {
  groceryList25,
  groceryList300,
  groceryListOverCap,
  groceryListSentinel,
} from '../packages/test-fixtures/src/index';
import { BASE_PATH, CONTENT_SECURITY_POLICY, goTo, seedOnboarded } from './support/app';
import { type Audit, startAudit } from './support/network';
import { startTestRelay, type TestRelay } from './support/relayServer';
import { startStaticServer, type SwitchableServer } from './support/staticServer';
import {
  buildRelayTestApp,
  expectSealedListBody,
  seedTransfer,
  storedList,
  sweepSection,
} from './support/transfer';

// Send to laptop (checklist item 31 design 5.5; TR-02, TR-04a, TR-05a, TR-05b, TR-07, TR-08a,
// TR-11, TR-12, HS-14, C12, C52). A production build whose relay origin is the reserved test name
// reaches item 29's real relay handler on 127.0.0.1 through Playwright routing; a laptop stand-in
// runs item 30's real duplicate rule and acknowledgement. Every list is synthetic.

const copy = transfer.send;
let outDir = '';
let server: SwitchableServer;
let relay: TestRelay;
let app = '';
let rooms = 0;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  outDir = buildRelayTestApp();
  server = await startStaticServer(outDir, BASE_PATH);
  app = `${server.origin}${BASE_PATH}`;
  relay = await startTestRelay(server.origin);
});

test.afterAll(async () => {
  await relay.close();
  await server.close();
  rmSync(outDir, { recursive: true, force: true });
});

const section = (page: Page) => page.getByRole('region', { name: copy.sectionLabel });
const line = (page: Page) => section(page).locator('.ui-status-line, .ui-progress');
const sendButton = (page: Page) => section(page).getByRole('button', { name: copy.send });

interface Opened {
  readonly audit: Audit;
  readonly rawKey: Uint8Array;
  readonly roomId: string;
}

/** The audit with the relay allowance, a finished setup, the list and a pairing; the List tab. */
async function open(
  page: Page,
  context: BrowserContext,
  request: APIRequestContext,
  list: GroceryListRecord,
): Promise<Opened> {
  // A room of its own for each test, so nothing a test leaves in the relay reaches another.
  rooms += 1;
  const roomId = `ExampleRoomId00000${String(rooms).padStart(3, '0')}A`;
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const audit = await startAudit(context, request, app, { origin: RELAY_E2E_ORIGIN, roomId });
  await relay.route(context);
  relay.setMode('up');
  await seedOnboarded(page, app, app);
  await seedTransfer(page, { list, pairing: { rawKey, relayUrl: RELAY_E2E_ORIGIN, roomId } });
  await goTo(page, 'List');
  await expect(sendButton(page)).toBeEnabled();
  return { audit, rawKey, roomId };
}

async function tapSend(page: Page, audit: Audit): Promise<void> {
  audit.markTap();
  await sendButton(page).click();
}

test('B9 L10: the relay-test build allows exactly the test relay, and nothing else differs', () => {
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  const expected = CONTENT_SECURITY_POLICY.replace(
    /connect-src 'self'[^;]*;/,
    `connect-src 'self' ${RELAY_E2E_ORIGIN};`,
  );
  expect(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1]).toBe(expected);
});

test('B1a B6b TR-04a TR-11 C52: a 25-item list reaches the laptop, "Received" follows its acknowledgement, then no request', async ({
  page,
  context,
  request,
}) => {
  const list = groceryList25();
  const { audit, rawKey, roomId } = await open(page, context, request, list);
  const laptop = await relay.laptop(rawKey, roomId);
  await tapSend(page, audit);
  await expect(line(page)).toHaveText(
    /^Sent .+, waiting for laptop\. Open the side panel on the laptop\. Keep this screen open to see the laptop's reply\.$/,
  );
  const payload = await laptop.collectWithin(30_000);
  const stored = await storedList(page, list.id);
  expect(stored.sentVersion).toBe(1);
  expect(payload).toEqual(
    listPayload(list, { transferId: stored.transferId ?? '', sentAt: stored.sentAt ?? '' }),
  );
  await expect(line(page)).toHaveText(copy.lines.statusReceived, { timeout: 30_000 });
  expect((await storedList(page, list.id)).receivedVersion).toBe(1);
  audit.markEnd();
  await page.waitForTimeout(7_000);
  // The audit's relay rules are not vacuous: it saw the POST and the polls.
  const methods = audit.seen.filter((s) => s.url.startsWith(RELAY_E2E_ORIGIN)).map((s) => s.method);
  expect(methods).toContain('POST');
  expect(methods).toContain('GET');
  await audit.verify();
});

test('B1b TR-05a: a 300-item list seals under half the cap and is collected and acknowledged', async ({
  page,
  context,
  request,
}) => {
  const { list } = groceryList300();
  const { audit, rawKey, roomId } = await open(page, context, request, list);
  const laptop = await relay.laptop(rawKey, roomId);
  await tapSend(page, audit);
  const payload = await laptop.collectWithin(30_000);
  expect(payload.list.items).toHaveLength(300);
  expect(relay.listBodies().at(-1)?.length).toBeLessThanOrEqual(32_768);
  await expect(line(page)).toHaveText(copy.lines.statusReceived, { timeout: 30_000 });
  await audit.verify();
});

test('B2 TR-02 HS-41: every stored body is sealed, differs per send, and carries only the to-buy lines', async ({
  page,
  context,
  request,
}) => {
  const list = groceryListSentinel();
  const { audit, rawKey } = await open(page, context, request, list);
  const before = relay.listBodies().length;
  await tapSend(page, audit);
  await expect(line(page)).toHaveText(/^Sent /);
  const first = await storedList(page, list.id);
  // The relay takes one write a second per room.
  await page.waitForTimeout(1_100);
  await tapSend(page, audit);
  await expect.poll(() => relay.listBodies().length).toBe(before + 2);
  // The phone records the second send a moment after the relay stores it.
  await expect
    .poll(async () => (await storedList(page, list.id)).transferId)
    .not.toBe(first.transferId);
  const second = await storedList(page, list.id);
  const [a, b] = relay.listBodies().slice(before);
  expect(a).not.toBe(b);
  for (const [body, sent] of [
    [a, first],
    [b, second],
  ] as const) {
    await expectSealedListBody(
      body ?? '',
      rawKey,
      listPayload(list, { transferId: sent.transferId ?? '', sentAt: sent.sentAt ?? '' }),
    );
  }
  const items = listPayload(list, {
    transferId: second.transferId ?? '',
    sentAt: second.sentAt ?? '',
  }).list.items;
  expect(items.map((i) => i.text)).toEqual([
    'zzsentinel',
    'Example item 2',
    'Example item 3',
    'Example item 6',
  ]);
  await audit.verify();
});

test('B3 B7 TR-05b TR-12 C114: too large: said so, no request, no paste code; CSV and JSON still download', async ({
  page,
  context,
  request,
}) => {
  const { audit } = await open(page, context, request, groceryListOverCap());
  const before = audit.seen.length;
  await tapSend(page, audit);
  await expect(line(page)).toHaveText(copy.lines.tooLarge);
  await expect(section(page).getByRole('button', { name: copy.pasteCode })).toHaveCount(0);
  for (const name of [grocery.exports.csv, grocery.exports.json]) {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      section(page).getByRole('button', { name, exact: true }).click(),
    ]);
    expect(file.suggestedFilename()).toMatch(/^diet-grocery-list-\d{4}-\d{2}-\d{2}\.(?:csv|json)$/);
  }
  await expect(section(page).getByText(copy.exportsNote)).toBeVisible();
  await audit.settle();
  expect(audit.seen.slice(before).filter((s) => s.url.startsWith(RELAY_E2E_ORIGIN))).toEqual([]);
  await audit.verify();
});

test('B4 B5 TR-07 TR-08a: relay down or phone offline: a paste code at once, which the laptop opens', async ({
  page,
  context,
  request,
}) => {
  const list = groceryList25();
  const { audit, rawKey, roomId } = await open(page, context, request, list);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.origin });
  relay.setMode('refuse-connection');
  const tapped = Date.now();
  await tapSend(page, audit);
  await expect(page.getByText(copy.paste.intro)).toBeVisible({ timeout: 5_000 });
  expect(Date.now() - tapped).toBeLessThan(5_000);
  await expect(line(page)).toHaveText(copy.lines.unavailable);

  await context.setOffline(true);
  await page.getByRole('button', { name: copy.paste.done }).click();
  const before = audit.seen.length;
  await tapSend(page, audit);
  await expect(line(page)).toHaveText(copy.lines.offline);
  await page.getByRole('button', { name: copy.paste.copy }).click();
  await expect(page.getByText(copy.paste.copied)).toBeVisible();
  const code = await page.evaluate(() => navigator.clipboard.readText());
  expect(code).toBe(await page.getByLabel(copy.paste.codeLabel).inputValue());
  expect(audit.seen.slice(before).filter((s) => s.url.startsWith(RELAY_E2E_ORIGIN))).toEqual([]);
  const wrapped = code.replace(/(.{76})/g, '$1\n');
  expect(bodyFromPasteCode(wrapped).ok).toBe(true);
  expect(bodyFromPasteCode(code.slice(0, -9))).toEqual({ ok: false, problem: 'incomplete' });
  const laptop = await relay.laptop(rawKey, roomId);
  expect(await laptop.paste(wrapped)).toEqual({ accept: true, kind: 'new-list' });
  expect(laptop.held()?.payload.list.items).toHaveLength(25);

  await context.setOffline(false);
  await expect(line(page)).not.toHaveText(copy.lines.offline);
  await audit.verify();
});

test('B6a TR-11 HS-14: a list waiting from before a reload makes no request on any screen', async ({
  page,
  context,
  request,
}) => {
  const list: GroceryListRecord = {
    ...groceryList25(),
    sentVersion: 1,
    sentAt: new Date(Date.now() - 60_000).toISOString(),
    transferId: '00000000-0000-4000-8000-0000000000c1',
  };
  const { audit } = await open(page, context, request, list);
  await expect(line(page)).toHaveText(
    /^Sent .+, waiting for laptop\. Open the side panel on the laptop\.$/,
  );
  for (const name of ['Today', 'Food', 'Move', 'Drinks', 'List'] as const) await goTo(page, name);
  await page.waitForTimeout(7_000);
  // No Send tap: any relay request fails the audit.
  await audit.verify();
});

test('B6c TR-11 HS-14: a poll that falls due after 15 minutes, as after the phone slept, makes no request', async ({
  page,
  context,
  request,
}) => {
  // The page's timers, Date and performance.now follow Playwright's clock from the first load.
  await page.clock.install();
  const { audit } = await open(page, context, request, groceryList25());
  await tapSend(page, audit);
  await expect(line(page)).toHaveText(/Keep this screen open to see the laptop's reply\.$/);
  // A busy answer to the first poll puts the next one 60 s away, so none falls before the jump.
  relay.setMode({ status: 503, retryAfter: '60' });
  const polls = () =>
    audit.seen.filter((s) => s.method === 'GET' && s.url.startsWith(RELAY_E2E_ORIGIN)).length;
  await expect.poll(polls, { timeout: 30_000 }).toBe(1);
  audit.markEnd();
  // Like closing the laptop lid for 20 minutes: the pending poll falls due after the window.
  await page.clock.fastForward('20:00');
  await expect(line(page)).toHaveText(copy.lines.statusExpired);
  await audit.verify();
});

test('B13 C12 L15: the week-3 order (a paste code, then Send) ends in "Received on laptop"', async ({
  page,
  context,
  request,
}) => {
  const list = groceryList25();
  const { audit, rawKey, roomId } = await open(page, context, request, list);
  const laptop = await relay.laptop(rawKey, roomId);
  await context.setOffline(true);
  await tapSend(page, audit);
  const code = await page.getByLabel(copy.paste.codeLabel).inputValue();
  expect(await laptop.paste(code)).toEqual({ accept: true, kind: 'new-list' });
  const t1 = laptop.held()?.ref.transferId;
  await page.waitForTimeout(1_100);
  await context.setOffline(false);
  await expect(line(page)).toHaveText(copy.lines.statusNotSent);
  await tapSend(page, audit);
  await expect(line(page)).toHaveText(/^Sent /);
  const got = await laptop.collect();
  expect(got?.decision).toEqual({ accept: true, kind: 'resend' });
  const t2 = laptop.held()?.ref.transferId;
  expect(t2).not.toBe(t1);
  await expect(line(page)).toHaveText(copy.lines.statusReceived, { timeout: 30_000 });
  const stored = await storedList(page, list.id);
  expect(stored.transferId).toBe(t2);
  expect(stored.laptopReceivedAt).toBe(laptop.held()?.acceptedAt);
  await audit.verify();
});

test.describe('B11 L27: the section at 360 px, light and dark', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('with the paste panel holding a 300-item code, and not paired: readable, tappable, no sideways scroll', async ({
    page,
    context,
    request,
  }) => {
    const { audit } = await open(page, context, request, groceryList300().list);
    relay.setMode('refuse-connection');
    await tapSend(page, audit);
    await expect(page.getByText(copy.paste.intro)).toBeVisible();
    const found: string[] = [];
    await sweepSection(page, 'paste panel', found);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const request = indexedDB.open('diet');
          request.onsuccess = () => {
            const tx = request.result.transaction(['transfer_pairings'], 'readwrite');
            tx.objectStore('transfer_pairings').clear();
            tx.oncomplete = () => {
              request.result.close();
              resolve();
            };
          };
        }),
    );
    await page.reload();
    await goTo(page, 'List');
    await expect(line(page)).toHaveText(copy.noLaptopYet);
    await sweepSection(page, 'not paired', found);
    expect(found).toEqual([]);
  });
});

test('B10 HS-14 L56: the production build, whatever RELAY_ORIGIN is, contacts nothing but its own origin', async ({
  page,
  context,
  request,
  baseURL,
}) => {
  const audit = await startAudit(context, request, baseURL);
  await seedOnboarded(page);
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  await seedTransfer(page, {
    list: groceryList25(),
    pairing: { rawKey, relayUrl: 'https://other.example.test', roomId: 'ExampleRoomId00000000A' },
  });
  await goTo(page, 'List');
  await expect(line(page)).toHaveText(
    RELAY_ORIGIN === null ? copy.lines.notConfigured : copy.lines.relayNeedsPairing,
  );
  await sendButton(page).click();
  await expect(page.getByText(copy.paste.intro)).toBeVisible();
  expect(bodyFromPasteCode(await page.getByLabel(copy.paste.codeLabel).inputValue()).ok).toBe(true);
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(policy).toBe(CONTENT_SECURITY_POLICY);
  await audit.verify();
});
