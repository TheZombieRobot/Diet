// Send and export (checklist item 31 design 1.1 to 1.10; V1 to V5; UX 6b, C12, C52, C114, R32,
// TR-10, TR-12, L29, L44, L47). The section over the real repositories on fake-indexeddb, with a
// real pairing key; the relay is a fake fetch. The build's relay origin is the test origin here,
// or null where a row says "not set up".
import { type GroceryListRecord, type Instant } from '@diet/core';
import { grocery, transfer } from '@diet/core/copy/health';
import { importPairingKey } from '@diet/grocery/transfer';
import { groceryListSentinel, VECTOR_KEY_BYTES } from '@diet/test-fixtures';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commerceRules, healthPhraseRules } from '../../../../../tools/scans/rules';
import { scanText } from '../../../../../tools/scans/scan';
import { appStorageStore } from '../../db/runtime';
import { openTestDb, type TestDb, testEnv } from '../../db/testKit';
import { browserTransferDevices, transferDevicesStore } from '../../transfer/devices';
import { EMPTY_SESSION, type TransferSession, transferSessionStore } from '../../transfer/session';
import { SendAndExport } from './SendAndExport';

const origin = vi.hoisted((): { value: string | null } => ({
  value: 'https://relay.example.test',
}));
vi.mock('../../transfer/relayOrigin', () => ({
  get BUILD_RELAY_ORIGIN() {
    return origin.value;
  },
}));

const copy = transfer.send;
const ROOM = 'ExampleRoomId00000000A';
/** 10:42 am on 1 March 2000 in Auckland; the pairing is saved at this time. */
const NOW = '2000-02-29T21:42:00.000Z';
const T = '00000000-0000-4000-8000-0000000000a1';
const PAIRING_ID = `${ROOM}|${NOW}`;
const at = (minutes: number): Instant => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

let test: TestDb | undefined;
afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  transferSessionStore.set(EMPTY_SESSION);
  transferDevicesStore.set(browserTransferDevices);
  origin.value = 'https://relay.example.test';
  test?.db.shutDown();
  test = undefined;
});

const base = groceryListSentinel();
const sentList = (patch: Partial<GroceryListRecord> = {}): GroceryListRecord => ({
  ...base,
  sentVersion: 3,
  sentAt: at(1),
  transferId: T,
  ...patch,
});

interface Setup {
  readonly list?: GroceryListRecord;
  readonly relayUrl?: string | null;
  readonly session?: Partial<TransferSession>;
  readonly closed?: boolean;
  readonly now?: Instant;
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
  readonly online?: boolean;
}

async function show(setup: Setup = {}): Promise<{ posts: string[]; section: HTMLElement }> {
  const t = await openTestDb({ env: testEnv(NOW) });
  test = t;
  const list = setup.list ?? base;
  await t.db.grocery_lists.put(list);
  if (setup.relayUrl !== null) {
    const key = await importPairingKey(VECTOR_KEY_BYTES);
    await t.repos.pairing.save({
      roomId: ROOM,
      relayUrl: setup.relayUrl ?? 'https://relay.example.test',
      key,
    });
  }
  if (setup.now !== undefined) t.env.set(setup.now);
  const posts: string[] = [];
  transferDevicesStore.set({
    ...browserTransferDevices,
    online: () => setup.online ?? true,
    canRequest: () => true,
    relay: {
      fetch: (url, init) => {
        posts.push(`${init.method ?? ''} ${url}`);
        return setup.fetch?.(url, init) ?? Promise.resolve(new Response(null, { status: 204 }));
      },
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => {
        window.clearTimeout(handle as number);
      },
    },
  });
  if (setup.session !== undefined) {
    transferSessionStore.set({
      ...EMPTY_SESSION,
      listId: list.id,
      pairingId: PAIRING_ID,
      version: list.version,
      ...setup.session,
    });
  }
  appStorageStore.set(t.storage);
  render(<SendAndExport listId={list.id} />);
  const section = await screen.findByRole('region', { name: copy.sectionLabel });
  // The pairing is read too: no Send, Pair or line while it loads.
  await waitFor(() => {
    expect(section.querySelector('.ui-button--tall, a[href="#/pairing"]')).not.toBeNull();
  });
  // This tab's own restore or delete-all closes the records; the screen keeps its last values.
  if (setup.closed === true) {
    act(() => {
      t.db.gate.close();
    });
  }
  return { posts, section };
}

const line = (section: HTMLElement) =>
  section.querySelector('.ui-status-line, .ui-progress')?.textContent ?? '';
const pasteState = (section: HTMLElement) => {
  const button = within(section).queryByRole('button', { name: copy.pasteCode });
  return button === null
    ? 'hidden'
    : (button as HTMLButtonElement).disabled
      ? 'disabled'
      : 'enabled';
};

describe('V1 UX 6b C12 C52 C114 R32 TR-12: every state of the section', () => {
  const listening = {
    transferId: T,
    sentVersion: 3,
    sentAt: at(1),
    tappedAt: at(1),
    storedAtMono: 0,
  };
  const rows: [string, Setup, string, 'send' | 'pair' | 'send-disabled', string][] = [
    ['records closed', { closed: true }, copy.lines.recordsClosed, 'send-disabled', 'disabled'],
    ['not paired', { relayUrl: null }, copy.noLaptopYet, 'pair', 'hidden'],
    [
      'needs pairing',
      { relayUrl: 'https://other.example.test' },
      copy.lines.relayNeedsPairing,
      'send',
      'enabled',
    ],
    ['not sent', {}, copy.lines.statusNotSent, 'send', 'enabled'],
    [
      'sent before pairing',
      { list: sentList({ sentAt: at(-60) }) },
      copy.lines.statusBeforePairing,
      'send',
      'enabled',
    ],
    [
      'sending',
      { session: { phase: 'sending' } },
      copy.progress.sending,
      'send-disabled',
      'enabled',
    ],
    [
      'sealing',
      { session: { phase: 'sealing' } },
      copy.progress.sealing,
      'send-disabled',
      'disabled',
    ],
    [
      'waiting while listening',
      {
        list: sentList(),
        session: { listening },
        fetch: () => new Promise<Response>(() => undefined),
      },
      "Sent 10:43 am, waiting for laptop. Open the side panel on the laptop. Keep this screen open to see the laptop's reply.",
      'send',
      'enabled',
    ],
    [
      'waiting after a reload, an older copy received',
      { list: sentList({ receivedVersion: 2, receivedAt: at(1), laptopReceivedAt: at(1) }) },
      'Sent 10:43 am, waiting for laptop. Open the side panel on the laptop. The laptop has an older copy.',
      'send',
      'enabled',
    ],
    [
      'received',
      { list: sentList({ receivedVersion: 3, receivedAt: at(1), laptopReceivedAt: at(1) }) },
      copy.lines.statusReceived,
      'send',
      'enabled',
    ],
    [
      'received here, write failed',
      { list: sentList(), session: { listening, received: true, recordFailed: true } },
      `${copy.lines.statusReceived}. ${copy.extras.notRecorded}`,
      'send',
      'enabled',
    ],
    [
      'record failed',
      { list: sentList(), session: { recordFailed: true } },
      copy.lines.recordFailed,
      'send',
      'enabled',
    ],
    ['expired', { list: sentList(), now: at(17) }, copy.lines.statusExpired, 'send', 'enabled'],
    [
      'changed',
      { list: sentList({ version: 4 }) },
      copy.lines.statusEditedSinceSent,
      'send',
      'enabled',
    ],
    [
      'offline',
      { session: { outcome: 'offline' }, online: false },
      copy.lines.offline,
      'send',
      'enabled',
    ],
    [
      'unavailable',
      { session: { outcome: 'unavailable' } },
      copy.lines.unavailable,
      'send',
      'enabled',
    ],
    ['too large', { session: { outcome: 'too-large' } }, copy.lines.tooLarge, 'send', 'hidden'],
    ['refused', { session: { outcome: 'refused' } }, copy.lines.refused, 'send', 'hidden'],
    [
      'a send time a day ahead',
      { list: sentList({ sentAt: at(24 * 60) }) },
      copy.lines.statusExpired,
      'send',
      'enabled',
    ],
  ];

  it.each(rows)('%s', async (_name, setup, text, primary, paste) => {
    const { section } = await show(setup);
    await waitFor(() => {
      expect(line(section)).toBe(text);
    });
    const send = within(section).queryByRole('button', { name: copy.send });
    const pair = within(section).queryByRole('link', { name: copy.pair });
    if (primary === 'pair') {
      expect(send).toBeNull();
      expect(pair?.getAttribute('href')).toBe('#/pairing');
      // Until item 33 there is nothing to pair with: not the main button.
      expect(pair?.classList.contains('ui-button--tall')).toBe(false);
    } else {
      expect(pair).toBeNull();
      expect((send as HTMLButtonElement).disabled).toBe(primary === 'send-disabled');
    }
    expect(pasteState(section)).toBe(paste);
    // TR-12: the exports are always there and never disabled, with their note.
    for (const name of [grocery.exports.copy, grocery.exports.csv, grocery.exports.json]) {
      expect(within(section).getByRole<HTMLButtonElement>('button', { name }).disabled).toBe(false);
    }
    expect(within(section).getByText(copy.exportsNote)).toBeDefined();
    expect(
      scanText('send and export', section.textContent, [...healthPhraseRules, ...commerceRules]),
    ).toEqual([]);
  });

  it('not set up (no relay address): the standing line, and Send makes a paste code with no request', async () => {
    origin.value = null;
    const { section, posts } = await show();
    expect(line(section)).toBe(copy.lines.notConfigured);
    fireEvent.click(within(section).getByRole('button', { name: copy.send }));
    const intro = await screen.findByText(copy.paste.intro);
    await waitFor(() => {
      expect(document.activeElement).toBe(intro);
    });
    expect(posts).toEqual([]);
    expect(screen.getByLabelText(copy.paste.codeLabel)).toHaveProperty('readOnly', true);
  });
});

describe('V2 C12 TR-07: the paste panel', () => {
  it('opens by itself when the relay cannot be reached, copies, falls back, and Done closes it', async () => {
    const { section, posts } = await show({
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    fireEvent.click(within(section).getByRole('button', { name: copy.send }));
    await screen.findByText(copy.paste.intro);
    expect(posts).toEqual(['POST https://relay.example.test/v1/list']);
    expect(line(section)).toBe(copy.lines.unavailable);
    const code = screen.getByLabelText<HTMLTextAreaElement>(copy.paste.codeLabel).value;
    expect(code.startsWith('dl1.')).toBe(true);
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fireEvent.click(screen.getByRole('button', { name: copy.paste.copy }));
    await screen.findByText(copy.paste.copied);
    expect(writeText).toHaveBeenCalledWith(code);
    writeText.mockImplementationOnce(() => Promise.reject(new Error('denied')));
    fireEvent.click(screen.getByRole('button', { name: copy.paste.copy }));
    await screen.findByText(copy.paste.copyFailed);
    fireEvent.click(screen.getByRole('button', { name: copy.paste.done }));
    expect(screen.queryByText(copy.paste.intro)).toBeNull();
    // Done returns focus to the button that opened the panel.
    expect(document.activeElement).toBe(within(section).getByRole('button', { name: copy.send }));
    const paste = within(section).getByRole('button', { name: copy.pasteCode });
    fireEvent.click(paste);
    await screen.findByText(copy.paste.intro);
    fireEvent.click(screen.getByRole('button', { name: copy.paste.done }));
    expect(document.activeElement).toBe(paste);
  });

  it('the records closing closes the panel', async () => {
    const { section } = await show({ online: false });
    fireEvent.click(within(section).getByRole('button', { name: copy.send }));
    await screen.findByText(copy.paste.intro);
    act(() => {
      test?.db.gate.close();
    });
    await waitFor(() => {
      expect(screen.queryByText(copy.paste.intro)).toBeNull();
    });
    expect(line(section)).toBe(copy.lines.recordsClosed);
  });

  it('back online while the List screen was closed: no offline line on return', async () => {
    const { section } = await show({ online: false });
    fireEvent.click(within(section).getByRole('button', { name: copy.send }));
    await screen.findByText(copy.paste.intro);
    expect(line(section)).toBe(copy.lines.offline);
    cleanup();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    transferDevicesStore.set({ ...transferDevicesStore.get(), online: () => true });
    render(<SendAndExport listId={base.id} />);
    const again = await screen.findByRole('region', { name: copy.sectionLabel });
    await waitFor(() => {
      expect(line(again)).toBe(copy.lines.statusNotSent);
    });
  });

  it('offline: the offline line and the code; coming online clears the line; unpairing closes the panel', async () => {
    const { section, posts } = await show({ online: false });
    fireEvent.click(within(section).getByRole('button', { name: copy.send }));
    await screen.findByText(copy.paste.intro);
    expect(line(section)).toBe(copy.lines.offline);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => {
      expect(line(section)).toBe(copy.lines.statusNotSent);
    });
    await act(() => test?.repos.pairing.remove());
    await waitFor(() => {
      expect(screen.queryByText(copy.paste.intro)).toBeNull();
    });
    expect(line(section)).toBe(copy.noLaptopYet);
    expect(posts).toEqual([]);
  });
});

describe('V3 C52 L47: waiting turns into not confirmed at 15 minutes with no other event', () => {
  it('redraws at sentAt plus 15 minutes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { section } = await show({ list: sentList({ sentAt: NOW }) });
      expect(line(section)).toMatch(/^Sent 10:42 am, waiting for laptop\./);
      test?.env.set(at(15));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(900_001);
      });
      expect(line(section)).toBe(copy.lines.statusExpired);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('V4 HS-14 L11: listening follows the screen', () => {
  it('a stored send is listened for only while the section is mounted, and never after a reload', async () => {
    const gets: string[] = [];
    const { section } = await show({
      fetch: (url) => {
        if (url.endsWith('/ack')) gets.push(url);
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.click(within(section).getByRole('button', { name: copy.send }));
      await waitFor(() => {
        expect(line(section)).toContain(copy.extras.keepOpen);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_100);
      });
      expect(gets).toHaveLength(1);
      cleanup();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(gets).toHaveLength(1);
      // A reload forgets the session: the stored send reads waiting, with nothing listening.
      transferSessionStore.set(EMPTY_SESSION);
      const list = await test?.repos.groceryLists.get(base.id);
      render(<SendAndExport listId={base.id} />);
      const again = await screen.findByRole('region', { name: copy.sectionLabel });
      await waitFor(() => {
        expect(line(again)).toMatch(
          /^Sent .*, waiting for laptop\. Open the side panel on the laptop\.$/,
        );
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(gets).toHaveLength(1);
      expect(list?.sentVersion).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
