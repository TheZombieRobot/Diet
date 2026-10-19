import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateStore } from './update';
import {
  checkForUpdate,
  checkForUpdatesWhenReopened,
  UPDATE_CHECK_THROTTLE_MS,
  watchForWaitingVersion,
  type PageEnvironment,
  type UpdatableRegistration,
} from './updateChecks';

/** A stand-in page: visible or hidden, online or offline, controlled by a service worker or not. */
function fakePage() {
  const target = new EventTarget();
  const page = {
    visibilityState: 'visible' as DocumentVisibilityState,
    online: true,
    controlled: true,
  };
  Object.defineProperty(target, 'visibilityState', { get: () => page.visibilityState });
  const env: PageEnvironment = {
    document: target as EventTarget & Pick<Document, 'visibilityState'>,
    isOnline: () => page.online,
    hasController: () => page.controlled,
  };
  /** The app comes back into view (Android resumes it from the background). */
  const resume = async (): Promise<void> => {
    page.visibilityState = 'hidden';
    target.dispatchEvent(new Event('visibilitychange'));
    page.visibilityState = 'visible';
    target.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
  };
  return { page, env, resume, target };
}

/** A stand-in registration whose update() can "find" a waiting version. */
function fakeRegistration() {
  const target = new EventTarget();
  const registration = Object.assign(target, {
    waiting: null as ServiceWorker | null,
    installing: null as ServiceWorker | null,
    update: vi.fn(() => Promise.resolve(registration as unknown as ServiceWorkerRegistration)),
  });
  return registration as typeof registration & UpdatableRegistration;
}

const fakeWorker = (state: ServiceWorkerState) =>
  Object.assign(new EventTarget(), { state }) as unknown as ServiceWorker & { state: string };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-05T08:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  updateStore.set({ waiting: false, applying: false });
});

describe('checking for a new version when the app comes back into view (PWA-05)', () => {
  it('checks on the first return, at once, with no wait since the app was opened', async () => {
    const { env, resume } = fakePage();
    const registration = fakeRegistration();
    checkForUpdatesWhenReopened(registration, env);
    expect(registration.update).not.toHaveBeenCalled();
    await resume();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('does not check again within 60 seconds, and checks again after', async () => {
    const { env, resume } = fakePage();
    const registration = fakeRegistration();
    checkForUpdatesWhenReopened(registration, env);
    await resume();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_THROTTLE_MS - 1_000);
    await resume();
    expect(registration.update).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await resume();
    expect(registration.update).toHaveBeenCalledTimes(2);
    expect(UPDATE_CHECK_THROTTLE_MS).toBe(60_000);
  });

  it('does not check while offline, and checks on the first return once back online', async () => {
    const { page, env, resume } = fakePage();
    const registration = fakeRegistration();
    checkForUpdatesWhenReopened(registration, env);
    page.online = false;
    await resume();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await resume();
    expect(registration.update).not.toHaveBeenCalled();
    page.online = true;
    await resume();
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the page goes out of view, and stops when asked', async () => {
    const { page, env, resume, target } = fakePage();
    const registration = fakeRegistration();
    const stop = checkForUpdatesWhenReopened(registration, env);
    page.visibilityState = 'hidden';
    target.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(registration.update).not.toHaveBeenCalled();
    stop();
    await resume();
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('shows "Update available" when the check finds a waiting version', async () => {
    const { env, resume } = fakePage();
    const registration = fakeRegistration();
    registration.update.mockImplementation(() => {
      registration.waiting = fakeWorker('installed');
      return Promise.resolve(registration as unknown as ServiceWorkerRegistration);
    });
    checkForUpdatesWhenReopened(registration, env);
    expect(updateStore.get().waiting).toBe(false);
    await resume();
    expect(updateStore.get()).toEqual({ waiting: true, applying: false });
  });

  it('shows a version that was already waiting on return, even within the 60 seconds', async () => {
    const { env, resume } = fakePage();
    const registration = fakeRegistration();
    checkForUpdatesWhenReopened(registration, env);
    await resume();
    registration.waiting = fakeWorker('installed');
    await resume();
    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(updateStore.get().waiting).toBe(true);
  });

  it('a failed check is quiet and the next return tries again', async () => {
    const { env, resume } = fakePage();
    const registration = fakeRegistration();
    registration.update.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    checkForUpdatesWhenReopened(registration, env);
    await resume();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_THROTTLE_MS);
    await resume();
    expect(registration.update).toHaveBeenCalledTimes(2);
    expect(updateStore.get().waiting).toBe(false);
  });
});

describe('noticing a waiting version however it was found', () => {
  it('a first install (no service worker runs the page yet) is not an update', async () => {
    const { page, env } = fakePage();
    page.controlled = false;
    const registration = fakeRegistration();
    registration.waiting = fakeWorker('installed');
    await checkForUpdate(registration, env);
    expect(updateStore.get().waiting).toBe(false);
  });

  it('a version that finishes installing later shows the banner (updatefound)', () => {
    const { env } = fakePage();
    const registration = fakeRegistration();
    watchForWaitingVersion(registration, env);
    const worker = fakeWorker('installing');
    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));
    expect(updateStore.get().waiting).toBe(false);
    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
    expect(updateStore.get().waiting).toBe(true);
  });

  it('a second update after a failed one still shows the banner', () => {
    const { env } = fakePage();
    const registration = fakeRegistration();
    watchForWaitingVersion(registration, env);
    const failed = fakeWorker('installing');
    registration.installing = failed;
    registration.dispatchEvent(new Event('updatefound'));
    failed.state = 'redundant';
    failed.dispatchEvent(new Event('statechange'));
    expect(updateStore.get().waiting).toBe(false);
    const next = fakeWorker('installing');
    registration.installing = next;
    registration.dispatchEvent(new Event('updatefound'));
    next.state = 'installed';
    next.dispatchEvent(new Event('statechange'));
    expect(updateStore.get().waiting).toBe(true);
  });

  it('a version already waiting when the app starts shows the banner at once', () => {
    const { env } = fakePage();
    const registration = fakeRegistration();
    registration.waiting = fakeWorker('installed');
    watchForWaitingVersion(registration, env);
    expect(updateStore.get().waiting).toBe(true);
  });
});
