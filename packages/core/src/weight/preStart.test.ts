// The pre-start stop-sign answer as a record (item 14 W31; cross-item ruling 9; full review F6,
// F18): today's refusal and guidance, and the 336 hours the exercise check counts it for.
import { describe, expect, it } from 'vitest';
import type { CardStateRecord } from '../storage/records';
import {
  PRE_START_STOP_SIGN_CARD,
  preStartGuidanceDue,
  preStartStopSignOn,
  preStartTrigger,
  recentPreStartStopSignDay,
} from './preStart';

const HOUR = 3_600_000;
const YES_AT = '2000-02-01T09:00:00.000Z';
const after = (hours: number) => new Date(Date.parse(YES_AT) + hours * HOUR).toISOString();

const row = (patch: Partial<CardStateRecord> = {}): CardStateRecord => ({
  cardId: PRE_START_STOP_SIGN_CARD,
  trigger: preStartTrigger('2000-02-01'),
  firstShownAt: YES_AT,
  dismissedAt: null,
  dismissedTimeZone: null,
  doneAt: null,
  ...patch,
});

describe('the pre-start "yes" record', () => {
  it('refuses a start on its own date only, and is not the stop-signs card of a period', () => {
    expect(preStartStopSignOn([row()], '2000-02-01')).toBe(true);
    expect(preStartStopSignOn([row()], '2000-02-02')).toBe(false);
    const periodCard = row({ trigger: 'period:00000000-0000-4000-8000-000000000001' });
    expect(preStartStopSignOn([periodCard], '2000-02-01')).toBe(false);
    expect(recentPreStartStopSignDay([periodCard], after(1))).toBeNull();
  });

  it('its guidance shows until OK, and an OK dated ahead of the clock hides nothing yet', () => {
    expect(preStartGuidanceDue([row()], '2000-02-01', after(1))).toBe(true);
    const ok = row({ dismissedAt: after(1), dismissedTimeZone: 'Pacific/Auckland' });
    expect(preStartGuidanceDue([ok], '2000-02-01', after(2))).toBe(false);
    expect(preStartGuidanceDue([ok], '2000-02-01', after(0.5))).toBe(true);
  });

  it('counts for the exercise check for 336 hours from the latest "yes", naming its date; one dated ahead counts', () => {
    expect(recentPreStartStopSignDay([row()], after(335.9))).toBe('2000-02-01');
    expect(recentPreStartStopSignDay([row()], after(336))).toBeNull();
    expect(recentPreStartStopSignDay([row()], after(-48))).toBe('2000-02-01');
    const later = row({ trigger: preStartTrigger('2000-02-03'), firstShownAt: after(48) });
    expect(recentPreStartStopSignDay([row(), later], after(100))).toBe('2000-02-03');
  });
});
