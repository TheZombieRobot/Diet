// The storage failure screens (storage spec section 7.4; section 16 test 41; HS-13 as extended by
// C17; D48), with the database mocked as unavailable through the open status.
import { general, helpNumbers, privacy } from '@diet/core/copy/health';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { type FailureStatus, openStatusStore } from '../db/db';
import { StorageFailureScreen, type StorageFailureActions } from './StorageFailureScreen';

afterEach(() => {
  cleanup();
  openStatusStore.set('opening');
  window.location.hash = '';
});

const FAILURES: readonly FailureStatus[] = [
  'newer-version',
  'upgrade-failed',
  'unavailable',
  'reload-needed',
];
const NUMBERS = [
  helpNumbers.emergency.number,
  helpNumbers.healthline.number,
  helpNumbers.alcoholDrugHelpline.number,
  helpNumbers.alcoholDrugHelpline.text,
  helpNumbers.needToTalk.number,
];

function browserLikeActions(): StorageFailureActions {
  return { reload: vi.fn(), makeRescueCopy: vi.fn(() => Promise.resolve(null)), download: vi.fn() };
}

describe('storage failure screens (HS-13; section 16 test 41)', () => {
  it.each(FAILURES)(
    '%s replaces the app and carries the not-a-medical-device line and every help number',
    (status) => {
      openStatusStore.set(status);
      window.location.hash = '#/settings';
      render(<App />);
      expect(screen.getByTestId('storage-failure').textContent).toBe(
        privacy.storageFailure[status],
      );
      const text = document.body.textContent;
      expect(text).toContain(general.about);
      for (const number of NUMBERS) expect(text).toContain(number);
      expect(screen.getByRole('link', { name: /111$/ }).getAttribute('href')).toBe('tel:111');
      expect(screen.getByRole('button', { name: privacy.storageFailure.reload })).toBeDefined();
      // The card under the "Your records" heading has its own name.
      expect(
        screen
          .getByRole('region', { name: privacy.storageFailure.cardLabel })
          .contains(screen.getByTestId('storage-failure')),
      ).toBe(true);
      // Settings, the tabs and delete-all are not reachable from a failure screen.
      expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
      expect(text).not.toContain(privacy.backupCard.deleteAllAction);
      expect(
        screen.queryByRole('button', { name: privacy.storageFailure.saveRescueCopy }) !== null,
      ).toBe(status === 'upgrade-failed');
    },
  );

  it('upgrade-failed: saving the rescue copy is the main button and Reload comes after it', () => {
    render(<StorageFailureScreen status="upgrade-failed" actions={browserLikeActions()} />);
    const card = screen.getByRole('region', { name: privacy.storageFailure.cardLabel });
    const buttons = within(card).getAllByRole('button');
    const save = within(card).getByRole('button', { name: privacy.storageFailure.saveRescueCopy });
    const reload = within(card).getByRole('button', { name: privacy.storageFailure.reload });
    expect(buttons.indexOf(save)).toBeLessThan(buttons.indexOf(reload));
    expect(save.className).toContain('ui-button--primary');
    expect(reload.className).toContain('ui-button--secondary');
  });

  it('upgrade-failed: the rescue copy is locked by default and is offered as a download', async () => {
    const makeRescueCopy = vi.fn((password: string | null) =>
      Promise.resolve({
        file: {
          text: password === null ? 'plain' : 'locked',
          kind: 'rescue' as const,
          locked: password !== null,
          schemaVersion: 1,
          exportedAt: '2000-03-01T00:00:00.000Z',
        },
        fileName: 'diet-backup-2000-03-01-rescue-locked.json',
      }),
    );
    const actions: StorageFailureActions = { reload: vi.fn(), makeRescueCopy, download: vi.fn() };
    render(<StorageFailureScreen status="upgrade-failed" actions={actions} />);
    const lock = screen.getByRole('switch', { name: privacy.exportBackup.lockLabel });
    expect((lock as HTMLInputElement).checked).toBe(true);
    const phrase = 'example phrase for the rescue';
    for (const label of [
      privacy.exportBackup.passwordLabel,
      privacy.exportBackup.passwordRepeatLabel,
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: phrase } });
    }
    fireEvent.click(screen.getByRole('button', { name: privacy.storageFailure.saveRescueCopy }));
    await waitFor(() => {
      expect(actions.download).toHaveBeenCalledWith(
        'locked',
        'diet-backup-2000-03-01-rescue-locked.json',
      );
    });
    expect(makeRescueCopy).toHaveBeenCalledWith(phrase);
    // Where the file went, and a way to save another copy.
    const saved = await screen.findByTestId('rescue-saved');
    expect(saved.textContent).toContain(
      'look in Downloads for diet-backup-2000-03-01-rescue-locked.json, saved at',
    );
    expect(saved.textContent).toContain(privacy.rescue.note);
    fireEvent.click(within(saved).getByRole('button', { name: privacy.rescue.saveAnother }));
    expect(
      screen.getByRole('button', { name: privacy.storageFailure.saveRescueCopy }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: privacy.storageFailure.reload }));
    expect(actions.reload).toHaveBeenCalledOnce();
    expect(
      within(document.body).queryByRole('button', { name: privacy.deleteAll.confirm }),
    ).toBeNull();
  });
});
