import {
  type AuditRecord,
  backupReminder,
  type BackupReminderInput,
  backupReminderNextChange,
  type BackupReminderState,
  cardHidden,
  cardNextChange,
  type CardStateRecord,
  cardTrigger,
  type Instant,
  instantMs,
  type SettingsRecord,
} from '@diet/core';
import { useLiveQuery } from '../../db/liveQuery';
import type { AppStorage } from '../../db/runtime';
import { storageStore } from '../../pwa/storage';
import { routeHref } from '../../routes';
import { createStore, useStore } from '../../store';
import { useRedrawAt } from './redraw';

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
 * The clock is read while drawing, and the screen is drawn again when the app comes back into view
 * and at the next moment the reminder can change (redraw.ts), so a snooze that ends shows at once.
 */
export function useBackupReminder(storage: AppStorage | null): BackupReminderView {
  const protection = useStore(storageStore);
  const inputs = useLiveQuery(storage, readReminderInputs);
  const input: BackupReminderInput | null =
    storage === null || inputs === undefined
      ? null
      : {
          lastBackupAt: inputs.settings.lastBackupAt,
          onboardingCompletedAt: inputs.settings.onboardingCompletedAt,
          dismissedAt: inputs.card?.dismissedAt ?? null,
          storage: protection,
          now: storage.env.now(),
        };
  const next = input === null ? null : backupReminderNextChange(input);
  useRedrawAt(next === null ? null : instantMs(next), input === null ? 0 : instantMs(input.now));
  if (input === null) return { visible: false, prominent: false, inputs };
  return { ...backupReminder(input), inputs };
}

export interface UpdateNotices {
  /** The registered update-notice rows; which of them show depends on the time (visibleUpdateNotices). */
  readonly cards: readonly CardStateRecord[];
  readonly reasons: readonly string[];
}

/** Update-notice rows (section 9.2), with the migration audit lines behind them. */
export async function readUpdateNotices(storage: AppStorage): Promise<UpdateNotices> {
  const [cards, audit] = await Promise.all([
    storage.db.card_state.toArray(),
    storage.db.audit.toArray(),
  ]);
  const notices = cards.filter(
    (c) => c.cardId === 'update-notice' && cardTrigger(c.cardId, c.trigger) !== null,
  );
  const reasons = audit.filter((a: AuditRecord) => a.kind === 'migration').map((a) => a.reason);
  return { cards: notices, reasons };
}

/**
 * The update-notice triggers still to show at `now`, and the next moment that can change. Each
 * card's own dismissal rule decides (cardHidden), so a done or dismissal time dated ahead hides
 * nothing until it comes.
 */
export function visibleUpdateNotices(
  cards: readonly CardStateRecord[],
  now: Instant,
): { readonly triggers: readonly string[]; readonly wakeAt: number | null } {
  const triggers: string[] = [];
  let wakeAt: number | null = null;
  for (const card of cards) {
    const rule = cardTrigger(card.cardId, card.trigger);
    if (rule === null) continue;
    const input = { now, row: card, dismissal: rule.dismissal, drinkingDayCutoverMinutes: 0 };
    if (!cardHidden(input)) triggers.push(card.trigger);
    const next = cardNextChange(input);
    if (next !== null && (wakeAt === null || next < wakeAt)) wakeAt = next;
  }
  return { triggers, wakeAt };
}
