import { describe, expect, it } from 'vitest';
import { backupReminder, type BackupReminderInput } from './backupReminder';

const T0 = Date.parse('2000-01-01T00:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(T0 + ms).toISOString();

const base: BackupReminderInput = {
  lastBackupAt: null,
  onboardingCompletedAt: at(0),
  dismissedAt: null,
  storage: 'protected',
  now: at(0),
};
const state = (patch: Partial<BackupReminderInput>) => backupReminder({ ...base, ...patch });

describe('BK-03: the weekly backup reminder (section 12.2; D25; section 16 test 11)', () => {
  it('is hidden at 6 days 23 h 59 m and visible at exactly 7 days', () => {
    expect(state({ now: at(7 * DAY - MIN) }).visible).toBe(false);
    expect(state({ now: at(7 * DAY) })).toEqual({ visible: true, prominent: false });
  });

  it('dismissed at 7 days: hidden at 13 days 23 h, back at 14 days', () => {
    const dismissedAt = at(7 * DAY);
    expect(state({ dismissedAt, now: at(13 * DAY + 23 * HOUR) }).visible).toBe(false);
    expect(state({ dismissedAt, now: at(14 * DAY) }).visible).toBe(true);
  });

  it('a confirmed export resets it; a dismissal before the last backup no longer counts', () => {
    const lastBackupAt = at(10 * DAY);
    expect(state({ lastBackupAt, now: at(16 * DAY) }).visible).toBe(false);
    expect(state({ lastBackupAt, now: at(17 * DAY) }).visible).toBe(true);
    expect(state({ lastBackupAt, dismissedAt: at(9 * DAY), now: at(17 * DAY) }).visible).toBe(true);
  });

  it('weak storage: due after 3 days, back 1 day after a dismissal, and shown first', () => {
    for (const storage of ['not-protected', 'unsupported'] as const) {
      expect(state({ storage, now: at(3 * DAY - MIN) }).visible).toBe(false);
      expect(state({ storage, now: at(3 * DAY) })).toEqual({ visible: true, prominent: true });
      const dismissedAt = at(3 * DAY);
      expect(state({ storage, dismissedAt, now: at(3 * DAY + 23 * HOUR) }).visible).toBe(false);
      expect(state({ storage, dismissedAt, now: at(4 * DAY) })).toEqual({
        visible: true,
        prominent: true,
      });
    }
  });

  it('nothing until onboarding is complete', () => {
    expect(state({ onboardingCompletedAt: null, now: at(100 * DAY) })).toEqual({
      visible: false,
      prominent: false,
    });
  });

  it("'checking' counts as protected, so it never flashes the stronger reminder", () => {
    expect(state({ storage: 'checking', now: at(3 * DAY) }).visible).toBe(false);
    expect(state({ storage: 'checking', now: at(7 * DAY) })).toEqual({
      visible: true,
      prominent: false,
    });
  });

  it('a last backup, onboarding time or dismissal dated after now never silences it (a clock that ran ahead, or an imported file)', () => {
    // A backup confirmation one year ahead: due now, not hidden for a year.
    expect(state({ lastBackupAt: at(365 * DAY), now: at(10 * DAY) }).visible).toBe(true);
    expect(state({ onboardingCompletedAt: at(365 * DAY), now: at(1 * DAY) }).visible).toBe(true);
    // A dismissal dated a year ahead is ignored until that moment comes.
    const dismissedAt = at(365 * DAY);
    expect(state({ dismissedAt, now: at(8 * DAY) }).visible).toBe(true);
    expect(state({ dismissedAt, now: at(365 * DAY + HOUR) }).visible).toBe(false);
    expect(state({ dismissedAt, now: at(372 * DAY) }).visible).toBe(true);
  });
});
