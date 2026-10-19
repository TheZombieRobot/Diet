// The backup reminder on Today (storage spec section 12.2; section 16 test 40; BK-03; D25) and
// the update-notice card (section 9.2). jsdom over the real repositories on fake-indexeddb.
import { privacy } from '@diet/core/copy/health';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appStorageStore } from '../../db/runtime';
import { openTestDb, type TestDb } from '../../db/testKit';
import { storageStore } from '../../pwa/storage';
import { routeHref } from '../../routes';
import { TodayScreen } from '../TodayScreen';
import { exportRequestStore } from './reminder';

let test: TestDb;

beforeEach(async () => {
  test = await openTestDb();
  appStorageStore.set(test.storage);
  storageStore.set('protected');
});

afterEach(() => {
  cleanup();
  appStorageStore.set(null);
  storageStore.set('checking');
  exportRequestStore.set(false);
  window.location.hash = '';
  test.db.shutDown();
});

/** Onboarding finished `days` days before the test clock (1 March 2000). */
async function onboardedDaysAgo(days: number): Promise<void> {
  const at = new Date(Date.parse(test.env.now()) - days * 86_400_000).toISOString();
  await test.repos.settings.update({ onboardingCompletedAt: at });
}

const reminder = () => screen.queryByTestId('backup-reminder');

describe('BK-03 backup reminder on Today (section 16 test 40)', () => {
  it('is hidden until onboarding is complete', async () => {
    render(<TodayScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(reminder()).toBeNull();
  });

  it('appears from the pure rule after 7 days, after the day’s other content, and Not now dismisses it for good (persisted)', async () => {
    await onboardedDaysAgo(7);
    render(<TodayScreen />);
    const card = await screen.findByTestId('backup-reminder');
    expect(card.textContent).toContain(privacy.backupReminder.title);
    expect(card.textContent).not.toContain(privacy.backupReminder.weakStorage);
    const main = card.closest('section')?.parentElement;
    expect(main?.lastElementChild?.contains(card)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: privacy.backupReminder.notNow }));
    await waitFor(() => {
      expect(reminder()).toBeNull();
    });
    expect(await test.repos.cardState.get('backup-reminder', 'weekly')).toMatchObject({
      dismissedAt: test.env.now(),
      dismissedTimeZone: 'Pacific/Auckland',
    });
  });

  it('is not due at 6 days on a phone that protects the records', async () => {
    await onboardedDaysAgo(6);
    render(<TodayScreen />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(reminder()).toBeNull();
  });

  it('when storage is not protected: due after 3 days, shown first, with the extra line', async () => {
    storageStore.set('not-protected');
    await onboardedDaysAgo(3);
    render(<TodayScreen />);
    const card = await screen.findByTestId('backup-reminder');
    expect(card.textContent).toContain(privacy.backupReminder.weakStorage);
    const section = card.closest('section');
    expect(section?.parentElement?.firstElementChild).toBe(section);
  });

  it('Back up now opens Settings with the export panel ready', async () => {
    await onboardedDaysAgo(8);
    render(<TodayScreen />);
    await screen.findByTestId('backup-reminder');
    fireEvent.click(screen.getByRole('button', { name: privacy.backupReminder.backUpNow }));
    expect(window.location.hash).toBe(routeHref('settings'));
    expect(exportRequestStore.get()).toBe(true);
  });

  it('a confirmed backup clears it', async () => {
    await onboardedDaysAgo(8);
    render(<TodayScreen />);
    await screen.findByTestId('backup-reminder');
    await act(async () => {
      await test.repos.settings.recordBackup(test.env.now());
    });
    await waitFor(() => {
      expect(reminder()).toBeNull();
    });
  });
});

describe('the update-notice card (section 9.2; D13)', () => {
  it('shows after a migration changed values, lists the changes, and Close hides it for good', async () => {
    await test.repos.audit.create({
      kind: 'migration',
      table: 'targets',
      recordId: 'singleton',
      reason: 'Steady deficit was changed to fit the limits of app version 2.',
    });
    await test.repos.cardState.markShown('update-notice', 'v2');
    render(<TodayScreen />);
    const card = await screen.findByTestId('update-notice');
    expect(card.textContent).toContain(privacy.updateNotice);
    fireEvent.click(screen.getByRole('button', { name: privacy.updateNoticeLink }));
    expect(card.textContent).toContain(
      'Steady deficit was changed to fit the limits of app version 2.',
    );
    fireEvent.click(screen.getByRole('button', { name: privacy.updateNoticeClose }));
    await waitFor(() => {
      expect(screen.queryByTestId('update-notice')).toBeNull();
    });
    expect((await test.repos.cardState.get('update-notice', 'v2'))?.doneAt).toBe(test.env.now());
  });
});
