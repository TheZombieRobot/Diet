/**
 * What a failed weight write tells the person (item 14 design section 2.10, W35): a full phone and
 * closed records get their own lines, a Kickstart start or check refused because the phone's clock
 * reads earlier than the saved records gets item 12's plain clock message, each repository refusal
 * its own, and only an unknown failure says "Try again". No line ever names an error code. Card
 * buttons and the reconciler swallow their errors instead.
 */
import { StorageInvariantError } from '@diet/core';
import { privacy, weight } from '@diet/core/copy/health';
import {
  mapWriteError,
  StorageClockError,
  StorageClosedError,
  StorageFullError,
  StorageRuleError,
} from '../../db/errors';
import type { WeightStatusMessage } from './stores';

export type WeightAction = 'entry' | 'delete' | 'goal' | 'settings' | 'extension' | 'start' | 'end';

const SAVE_FAILED: Readonly<Record<WeightAction, string>> = {
  entry: weight.entry.saveFailed,
  delete: weight.list.deleteFailed,
  goal: weight.goal.saveFailed,
  settings: weight.rapidLossSettings.saveFailed,
  extension: weight.extension.saveFailed,
  start: weight.start.saveFailed,
  end: weight.end.saveFailed,
};

function refusal(rule: string, action: WeightAction): string | null {
  if (action === 'extension') {
    if (rule === 'kickstart-check-window') return weight.extension.refusedWindow;
    if (rule === 'kickstart-extensions' || rule === 'kickstart-days')
      return weight.extension.refusedCap;
    if (rule === 'kickstart-stop-sign') return weight.extension.refusedStopSign;
  }
  if (action === 'start') {
    if (rule === 'kickstart-days') return weight.start.unavailableCap;
    if (rule === 'kickstart-overlap') return weight.start.unavailableToday;
  }
  if (action === 'end' && (rule === 'kickstart-end' || rule === 'not-found')) {
    return weight.end.alreadyEnded;
  }
  return null;
}

/** The alert for a failed write of `action`. */
export function weightWriteMessage(error: unknown, action: WeightAction): WeightStatusMessage {
  const mapped = mapWriteError(error);
  if (mapped instanceof StorageFullError) return { text: privacy.storageFull, tone: 'alert' };
  if (mapped instanceof StorageClosedError) {
    return { text: privacy.backupCard.closed, tone: 'alert', reload: true };
  }
  // startPeriod and recordCheck refuse while the clock reads earlier than the saved records.
  if (mapped instanceof StorageClockError) return { text: privacy.clockBehind, tone: 'alert' };
  const rule =
    mapped instanceof StorageInvariantError || mapped instanceof StorageRuleError
      ? mapped.rule
      : null;
  const refused = rule === null ? null : refusal(rule, action);
  return { text: refused ?? SAVE_FAILED[action], tone: 'alert' };
}
