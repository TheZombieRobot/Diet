import {
  type AuditRecord,
  backupReminder,
  type BackupReminderState,
  cardHidden,
  type CardStateRecord,
  cardTrigger,
  type SettingsRecord,
} from '@diet/core';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { storageStore } from '../../pwa/storage';
import { routeHref } from '../../routes';
import { createStore, useStore } from '../../store';

/** Set by "Back up now" on Today, so Settings opens with the export panel. */
export const exportRequestStore = createStore(false);

/** "Back up now": open Settings with the export panel ready. */
export function startBackupFromToday(): void {
  exportRequestStore.set(true);
  window.location.assign(routeHref('settings'));
}

export interface ReminderInputs {
  readonly settings: SettingsRecord;
  readonly card: CardStateRecord | undefined;
}

/** What the backup reminder reads (section 12.2): the settings row and its card state. */
export async function readReminderInputs(storage: AppStorage): Promise<ReminderInputs> {
  const [settings, card] = await Promise.all([
    storage.repos.settings.get(),
    storage.repos.cardState.get('backup-reminder', 'weekly'),
  ]);
  return { settings, card };
}

export interface BackupReminderView extends BackupReminderState {
  readonly inputs: ReminderInputs | undefined;
}

/**
 * The backup reminder (storage spec section 12.2; BK-03; D25) from the pure core rule, over the
 * live settings and card state and this launch's storage-protection status (never stored, D24).
 */
export function useBackupReminder(storage: AppStorage | null): BackupReminderView {
  const protection = useStore(storageStore);
  const inputs = useLiveQuery(storage, readReminderInputs);
  if (storage === null || inputs === undefined) {
    return { visible: false, prominent: false, inputs };
  }
  const state = backupReminder({
    lastBackupAt: inputs.settings.lastBackupAt,
    onboardingCompletedAt: inputs.settings.onboardingCompletedAt,
    dismissedAt: inputs.card?.dismissedAt ?? null,
    storage: protection,
    now: storage.env.now(),
  });
  return { ...state, inputs };
}

export interface UpdateNotices {
  readonly triggers: readonly string[];
  readonly reasons: readonly string[];
}

/**
 * Update-notice cards still to show (section 9.2), with the migration audit lines behind them.
 * Each card's own dismissal rule decides (cardHidden), so a done time dated ahead hides nothing.
 */
export async function readUpdateNotices(storage: AppStorage): Promise<UpdateNotices> {
  const [cards, audit] = await Promise.all([
    storage.db.card_state.toArray(),
    storage.db.audit.toArray(),
  ]);
  const now = storage.env.now();
  const triggers = cards
    .filter((c) => {
      const rule = cardTrigger(c.cardId, c.trigger);
      return (
        c.cardId === 'update-notice' &&
        rule !== null &&
        !cardHidden({ now, row: c, dismissal: rule.dismissal, drinkingDayCutoverMinutes: 0 })
      );
    })
    .map((c) => c.trigger);
  const reasons = audit.filter((a: AuditRecord) => a.kind === 'migration').map((a) => a.reason);
  return { triggers, reasons };
}
