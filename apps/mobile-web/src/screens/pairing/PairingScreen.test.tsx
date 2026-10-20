// The Laptop pairing screen (item 30 design 1.4; A8–A14, A18, A19, A21; TR-03a, TR-10 phone half,
// C83, C115, HS-(next)). Rendered in jsdom over the real repositories on fake-indexeddb, with the
// fake camera and the real bundled reader over a fake canvas (pairingTestKit.ts).
import { privacy, transfer } from '@diet/core/copy/health';
import { NO_RELAY_URL, parsePairingCode } from '@diet/grocery/transfer';
import {
  V1_CODE,
  V1_KEY_TEXT,
  V1_RELAY,
  V1_ROOM_ID,
  V5_CODE,
  V5_ROOM_ID,
} from '@diet/test-fixtures';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appStorageStore } from '../../db/runtime';
import { openTestDb, type TestDb, testEnv } from '../../db/testKit';
import { recordsBusyStore } from '../backup/focus';
import { SettingsScreen } from '../SettingsScreen';
import { browserPairingDevices, pairingDevicesStore } from './devices';
import { PairingScreen } from './PairingScreen';
import { type FakeDeviceOptions, type FakeDevices, fakeDevices } from './pairingTestKit';
import { savePairingFromCode } from './savePairing';
import { SCAN_TIMEOUT_MS } from './ScanCard';

const copy = transfer.pairing;
let test: TestDb;
let devices: FakeDevices;
let releaseCamera: () => void;

beforeEach(async () => {
  test = await openTestDb({ env: testEnv('2000-01-05T06:00:00.000Z', 'Pacific/Auckland') });
  appStorageStore.set(test.storage);
  // jsdom has no camera frames: the video always has one ready.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(480);
  useDevices();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  appStorageStore.set(null);
  pairingDevicesStore.set(browserPairingDevices);
  recordsBusyStore.set(false);
  test.db.shutDown();
});

function useDevices(options: FakeDeviceOptions = {}): void {
  ({ devices, releaseCamera } = fakeDevices(options));
  pairingDevicesStore.set(devices);
}

async function pairedWith(code: string): Promise<void> {
  const parsed = parsePairingCode(code);
  if (!parsed.ok) throw new Error('not a code');
  expect(await savePairingFromCode(test.repos.pairing, parsed.code)).toBe('saved');
}

const button = (name: string) => screen.getByRole('button', { name });
const tap = (name: string) => {
  fireEvent.click(button(name));
};
const lastCanvas = () => devices.canvases.at(-1);
const allStopped = () => devices.tracks.every((t) => t.readyState === 'ended');

/** Opens the screen and waits for the not-paired or paired card. */
async function open(): Promise<void> {
  render(<PairingScreen />);
  await screen.findByRole('region', { name: /^(?:Pair with your laptop|Pairing)$/ });
  await waitFor(() => {
    expect(screen.queryByText(privacy.backupCard.notReady)).toBeNull();
  });
}

/** Taps Scan (or a confirmation's Scan the new code) and waits for the camera to run. */
async function startScan(name: string = copy.scan): Promise<void> {
  tap(name);
  await screen.findByText(copy.looking);
}

/** The DOM, attributes included, never holds the room id, the key or the relay address. */
function expectNothingSecretShown(): void {
  const html = document.body.innerHTML;
  for (const secret of [V1_ROOM_ID, V1_KEY_TEXT, V1_RELAY, V1_CODE]) {
    expect(html.includes(secret), secret).toBe(false);
  }
  expect(document.querySelector('input, textarea')).toBeNull();
}

describe('not paired (A8)', () => {
  it('explains pairing and the risk of the code, and rendering starts no camera', async () => {
    await open();
    for (const text of [
      copy.intro,
      ...copy.steps,
      copy.laptopLaterStep,
      copy.codeRisk,
      copy.scanOnlyHere,
      copy.cameraNote,
      copy.optional,
    ]) {
      expect(screen.getByText(text)).toBeDefined();
    }
    expect(button(copy.scan)).toBeDefined();
    expect(devices.getUserMedia).not.toHaveBeenCalled();
    expectNothingSecretShown();
  });
});

describe('scanning and saving (A9)', () => {
  it('a code from another app keeps scanning; V1 stops the camera before the save, then the paired card shows', async () => {
    const save = vi.spyOn(test.repos.pairing, 'save');
    const stoppedAtSave: boolean[] = [];
    save.mockImplementation(async function (this: unknown, input) {
      stoppedAtSave.push(allStopped());
      save.mockRestore();
      return test.repos.pairing.save(input);
    });
    await open();
    devices.seen = 'https://example.com/x';
    await startScan();
    await screen.findByText(copy.notAPairingCode);
    expectNothingSecretShown();
    devices.seen = V1_CODE;
    await screen.findByText(copy.paired);
    expect(stoppedAtSave).toEqual([true]);
    expect(screen.getByText('Paired 5 January 2000')).toBeDefined();
    expect(await screen.findByText('Pairing check: PCMK')).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe(copy.pairedNow);
    expect(document.querySelector('video')).toBeNull();
    expect(allStopped()).toBe(true);
    expect(lastCanvas()).toMatchObject({ width: 0, height: 0 });
    expectNothingSecretShown();
  });
});

describe('codes and cameras that cannot be used (A10; C83)', () => {
  it('a newer-version code stops the camera and offers Reload, not Scan again', async () => {
    await open();
    devices.seen = V1_CODE.replace(':1:', ':2:');
    await startScan();
    await screen.findByText(copy.errors['newer-version']);
    expect(allStopped()).toBe(true);
    expect(screen.queryByRole('button', { name: copy.scanAgain })).toBeNull();
    tap(privacy.backupCard.reload);
    expect(devices.reloads).toBe(1);
  });

  it('a damaged code says so and offers Scan again', async () => {
    await open();
    devices.seen = `${V1_CODE} `;
    await startScan();
    await screen.findByText(copy.errors.damaged);
    expect(button(copy.scanAgain)).toBeDefined();
  });

  it('a denied camera gives the steps with the site name; an unavailable one says so', async () => {
    useDevices({ camera: Object.assign(new Error('x'), { name: 'NotAllowedError' }) });
    await open();
    tap(copy.scan);
    await screen.findByText(/^The app is not allowed to use the camera\./);
    expect(screen.getByRole('alert').textContent).toContain(
      'Choose example.test and set it to Allow.',
    );
    cleanup();
    useDevices({ camera: Object.assign(new Error('x'), { name: 'NotReadableError' }) });
    await open();
    tap(copy.scan);
    await screen.findByText(copy.errors['camera-unavailable']);
    expect(button(copy.scanAgain)).toBeDefined();
  });

  it('no reader: Reload is offered and the camera is never asked for', async () => {
    useDevices({ noReader: true });
    await open();
    tap(copy.scan);
    await screen.findByText(copy.errors['no-reader']);
    expect(button(privacy.backupCard.reload)).toBeDefined();
    expect(devices.getUserMedia).not.toHaveBeenCalled();
  });
});

describe('the camera always stops (A11; HS-(next))', () => {
  it('after 2 minutes without a code', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    await open();
    await startScan();
    await act(async () => {
      vi.advanceTimersByTime(SCAN_TIMEOUT_MS);
      await Promise.resolve();
    });
    await screen.findByText(copy.stoppedTimeout);
    expect(allStopped()).toBe(true);
    expect(lastCanvas()).toMatchObject({ width: 0, height: 0 });
  });

  it('when the app goes to the background', async () => {
    await open();
    await startScan();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await screen.findByText(copy.stoppedHidden);
    expect(allStopped()).toBe(true);
  });

  it('when the track ends mid-scan, which reads as the camera being unavailable', async () => {
    await open();
    await startScan();
    act(() => {
      devices.tracks[0]?.end();
    });
    await screen.findByText(copy.errors['camera-unavailable']);
    expect(allStopped()).toBe(true);
  });

  it('on Cancel, and the move from starting to scanning never stopped it', async () => {
    await open();
    await startScan();
    expect(devices.tracks[0]?.readyState).toBe('live');
    tap(copy.cancel);
    expect(allStopped()).toBe(true);
    expect(lastCanvas()).toMatchObject({ width: 0, height: 0 });
    expect(button(copy.scan)).toBeDefined();
  });

  it('a camera that answers only after Cancel is stopped at once', async () => {
    useDevices({ holdCamera: true });
    await open();
    tap(copy.scan);
    await waitFor(() => {
      expect(devices.getUserMedia).toHaveBeenCalled();
    });
    tap(copy.cancel);
    await act(async () => {
      releaseCamera();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(devices.tracks).toHaveLength(1);
    expect(allStopped()).toBe(true);
  });

  it('when the screen is left', async () => {
    await open();
    await startScan();
    cleanup();
    expect(allStopped()).toBe(true);
    expect(lastCanvas()).toMatchObject({ width: 0, height: 0 });
  });
});

describe('Pair again (A12; C115)', () => {
  it('asks first; Cancel keeps the pairing; scanning the new code replaces it', async () => {
    await pairedWith(V1_CODE);
    await open();
    tap(copy.pairAgain);
    expect(screen.getByText(copy.pairAgainTitle)).toBeDefined();
    tap(copy.cancel);
    expect(await screen.findByText('Pairing check: PCMK')).toBeDefined();
    tap(copy.pairAgain);
    devices.seen = V5_CODE;
    await startScan(copy.pairAgainConfirm);
    expect(await screen.findByText('Pairing check: TVST')).toBeDefined();
    expect(await test.db.transfer_pairings.count()).toBe(1);
    expect((await test.repos.pairing.get())?.roomId).toBe(V5_ROOM_ID);
  });
});

describe('Unpair (A13; TR-10 phone half; C115)', () => {
  it('asks first with Cancel as the main button, then removes the pairing on this phone only', async () => {
    await pairedWith(V1_CODE);
    await open();
    tap(copy.unpair);
    const [cancel, unpair] = screen.getAllByRole('button');
    expect(cancel?.textContent).toBe(copy.cancel);
    expect(cancel?.className).toContain('ui-button--primary');
    expect(unpair?.className).toContain('ui-button--caution');
    expect(screen.getByText(transfer.unpairOther)).toBeDefined();
    tap(copy.cancel);
    expect(await test.repos.pairing.get()).toBeDefined();

    let finish: () => void = () => undefined;
    const remove = vi.spyOn(test.repos.pairing, 'remove');
    remove.mockImplementation(() => {
      remove.mockRestore();
      return new Promise<void>((resolve, reject) => {
        finish = () => {
          test.repos.pairing.remove().then(resolve, reject);
        };
      });
    });
    tap(copy.unpair);
    tap(copy.unpair);
    expect(await screen.findByText(copy.unpairing)).toBeDefined();
    expect(screen.getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(
      true,
    );
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(await screen.findByText(copy.unpairedNow)).toBeDefined();
    expect(await screen.findByText(copy.intro)).toBeDefined();
    expect(await test.repos.pairing.get()).toBeUndefined();
  });

  it('a failed removal says so and offers Try again, which asks again', async () => {
    await pairedWith(V1_CODE);
    await open();
    vi.spyOn(test.repos.pairing, 'remove').mockRejectedValue(new Error('example'));
    tap(copy.unpair);
    tap(copy.unpair);
    await screen.findByText(copy.errors['unpair-failed']);
    tap(copy.tryAgain);
    expect(screen.getByText(copy.unpairTitle)).toBeDefined();
  });
});

describe('opening (A14)', () => {
  it('says the records are opening, with no buttons, until storage is open', () => {
    appStorageStore.set(null);
    render(<PairingScreen />);
    expect(screen.getByText(privacy.backupCard.notReady)).toBeDefined();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('a pairing is still there after the app opens again: no second scan', async () => {
    await pairedWith(V1_CODE);
    test.db.shutDown();
    test = await openTestDb({ deps: test.deps, env: test.env });
    appStorageStore.set(test.storage);
    await open();
    expect(screen.getByText(copy.paired)).toBeDefined();
    expect(devices.getUserMedia).not.toHaveBeenCalled();
  });
});

describe('the records closed (A18)', () => {
  const closeRecords = () => {
    act(() => {
      test.db.gate.close();
    });
  };

  it.each(['not paired', 'paired'] as const)(
    '%s: the closed line and Reload, and no action',
    async (state) => {
      if (state === 'paired') await pairedWith(V1_CODE);
      await open();
      closeRecords();
      expect(screen.getByText(privacy.backupCard.closed)).toBeDefined();
      for (const name of [copy.scan, copy.pairAgain, copy.unpair]) {
        expect(screen.queryByRole('button', { name })).toBeNull();
      }
      tap(privacy.backupCard.reload);
      expect(test.storage.platform.reloads).toBe(1);
    },
  );

  it('while scanning, the camera stops; while a restore runs here, no Reload is offered', async () => {
    await open();
    await startScan();
    recordsBusyStore.set(true);
    closeRecords();
    expect(allStopped()).toBe(true);
    expect(lastCanvas()).toMatchObject({ width: 0, height: 0 });
    expect(screen.getByText(privacy.backupCard.closed)).toBeDefined();
    expect(screen.queryByRole('button', { name: privacy.backupCard.reload })).toBeNull();
  });

  it('a save or an unpair that meets closed records ends on the closed card, and nothing is saved', async () => {
    const save = vi.spyOn(test.repos.pairing, 'save');
    save.mockImplementation((input) => {
      save.mockRestore();
      test.db.gate.close();
      return test.repos.pairing.save(input);
    });
    await open();
    devices.seen = V1_CODE;
    await startScan();
    await screen.findByText(privacy.backupCard.closed);
    expect(screen.queryByText(copy.errors['save-failed'])).toBeNull();
    expect(await test.db.transfer_pairings.count()).toBe(0);
  });
});

describe('focus (A19)', () => {
  const focused = () => document.activeElement;

  it('opening the screen moves no focus; each step and Cancel move it as the design says', async () => {
    await open();
    expect(focused()).toBe(document.body);
    tap(copy.scan);
    await waitFor(() => {
      expect(focused()?.textContent).toBe(copy.cancel);
    });
    await screen.findByText(copy.looking);
    tap(copy.cancel);
    await waitFor(() => {
      expect(focused()?.textContent).toBe(copy.scan);
    });
    devices.seen = V1_CODE.replace(':1:', ':2:');
    await startScan();
    await waitFor(() => {
      expect(focused()?.textContent).toBe(copy.errors['newer-version']);
    });
  });

  it('the saving line, then the paired card’s lead line once the row arrives', async () => {
    await open();
    devices.seen = V1_CODE;
    await startScan();
    await waitFor(() => {
      expect(focused()?.textContent).toBe(copy.paired);
    });
  });

  it('confirmations, the removing line, Cancel back to its button, and the closed line', async () => {
    await pairedWith(V1_CODE);
    await open();
    tap(copy.pairAgain);
    expect(focused()?.textContent).toBe(copy.pairAgainTitle);
    tap(copy.cancel);
    expect(focused()?.textContent).toBe(copy.pairAgain);
    tap(copy.unpair);
    expect(focused()?.textContent).toBe(copy.unpairTitle);
    tap(copy.cancel);
    expect(focused()?.textContent).toBe(copy.unpair);
    vi.spyOn(test.repos.pairing, 'remove').mockReturnValue(new Promise<void>(() => undefined));
    tap(copy.unpair);
    tap(copy.unpair);
    expect(focused()?.textContent).toBe(copy.unpairing);
    act(() => {
      test.db.gate.close();
    });
    expect(focused()?.textContent).toBe(privacy.backupCard.closed);
  });
});

describe('a pairing for another relay (A21; R19, C81)', () => {
  it.each([
    [NO_RELAY_URL, V1_RELAY, true],
    [V1_RELAY, V1_RELAY, false],
    [NO_RELAY_URL, null, false],
  ] as const)('stored %s, build relay %s: "pair again" shown %s', async (stored, origin, shown) => {
    useDevices({ relayOrigin: origin });
    await pairedWith(stored === NO_RELAY_URL ? V1_CODE.slice(0, -V1_RELAY.length) : V1_CODE);
    await open();
    expect(screen.queryByText(copy.relayPairAgain) !== null).toBe(shown);
  });
});

describe('Settings, the Laptop card (A15)', () => {
  const row = () => screen.getByRole('link', { name: /^Laptop pairing/ });

  it('says Checking…, then Not paired, then the pairing date, and links to the screen', async () => {
    appStorageStore.set(null);
    const { unmount } = render(<SettingsScreen />);
    expect(row().textContent).toContain(copy.settingsRowChecking);
    expect(row().getAttribute('href')).toBe('#/pairing');
    unmount();
    appStorageStore.set(test.storage);
    render(<SettingsScreen />);
    await waitFor(() => {
      expect(row().textContent).toContain(copy.settingsRowNotPaired);
    });
    await act(async () => {
      await pairedWith(V1_CODE);
    });
    await waitFor(() => {
      expect(row().textContent).toContain('Paired 5 January 2000');
    });
  });

  it('the placeholder no longer mentions pairing', () => {
    render(<SettingsScreen />);
    const placeholder = screen.getByRole('region', { name: 'Not built yet' }).textContent;
    expect(placeholder).not.toMatch(/pairing/i);
    expect(placeholder).toContain('arrive with the steps that use them.');
  });
});
