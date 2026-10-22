/**
 * What a failed list write tells the owner (item 24 design 1.13), in item 14's message shape: a
 * full phone and closed records get their own lines, a build refused because the clock reads
 * earlier than the list gets item 12's clock line, and only an unknown failure says "Try again".
 * No line names an error code or a value.
 */
import { StorageInvariantError } from '@diet/core';
import { grocery, privacy } from '@diet/core/copy/health';
import {
  mapWriteError,
  StorageClockError,
  StorageClosedError,
  StorageFullError,
  StorageRuleError,
} from '../../db/errors';

export interface ListMessage {
  readonly text: string;
  readonly tone: 'status' | 'alert';
  /** The closed state: the message holds a Reload button. */
  readonly reload?: boolean;
}

/** `row`: a tick, price, offer or edit; `build`: the build panel and the empty list. */
export function listWriteMessage(error: unknown, action: 'row' | 'build'): ListMessage {
  const mapped = mapWriteError(error);
  if (mapped instanceof StorageFullError) return { text: privacy.storageFull, tone: 'alert' };
  if (mapped instanceof StorageClosedError) {
    return { text: privacy.backupCard.closed, tone: 'alert', reload: true };
  }
  if (mapped instanceof StorageClockError) return { text: privacy.clockBehind, tone: 'alert' };
  const rule =
    mapped instanceof StorageRuleError || mapped instanceof StorageInvariantError
      ? mapped.rule
      : null;
  if (rule === 'list-changed') {
    return {
      text: action === 'build' ? grocery.build.changed : grocery.offers.changed,
      tone: 'alert',
    };
  }
  if (rule === 'not-found') return { text: grocery.panel.gone, tone: 'alert' };
  return {
    text: action === 'build' ? grocery.build.saveFailed : grocery.panel.saveFailed,
    tone: 'alert',
  };
}
