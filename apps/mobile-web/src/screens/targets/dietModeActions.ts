/**
 * Changing the diet mode (item 21 design sections 2.2.1 and 5.2; FL-04, C56; T14, T29). The
 * repository writes the profile, deciding inside its transaction whether leaving keto needs the
 * owner's confirmation; when the switch ends a Kickstart, the end is written in the same action by
 * item 14's one rule, endKickstartIfConditionsFail (the only way any action ends a Kickstart on a
 * mode change; its guard test allows no other caller of endPeriod). If that end fails, it is
 * latched and the reconciler retries it, and the phase and the figures already read Steady.
 */
import type { DietMode, KickstartEndReason } from '@diet/core';
import type { AppStorage } from '../../db/runtime';
import { endKickstartIfConditionsFail } from '../weight/kickstartActions';

export interface DietModeSwitched {
  readonly changed: boolean;
  /** The end written for a Kickstart this switch ended, or null. */
  readonly ended: KickstartEndReason | null;
}

/**
 * Switches to `mode`. Rejects with StorageRuleError 'kickstart-confirm-needed' (writing nothing)
 * when leaving keto would end a Kickstart and `endKickstart` is false.
 */
export async function switchDietMode(
  storage: AppStorage,
  mode: DietMode,
  options: { readonly endKickstart: boolean },
): Promise<DietModeSwitched> {
  const result = await storage.repos.dietMode.switchTo(mode, options);
  const ended = result.endsKickstart ? await endKickstartIfConditionsFail(storage) : null;
  return { changed: result.changed, ended };
}
