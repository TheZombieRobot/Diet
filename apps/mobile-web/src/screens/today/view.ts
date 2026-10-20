/**
 * What Today shows (item 16 design sections 1.1, 1.9 and 2.7), worked out from one live read and
 * the clock by core functions only. The Talk to someone, Weight and Fast cards and the "+" panel
 * run their own reads (items 13 to 15); the status line reads item 15's fasting picture.
 */
import {
  addDays,
  type AlcoholGuidanceSet,
  type CardStateRecord,
  cholesterolCheckinDue,
  type CholesterolTrigger,
  electrolyteCopyKeys,
  electrolyteReminderDue,
  guidanceFor,
  type Id,
  type Instant,
  isKickstartDay,
  type KickstartCheckRecord,
  type KickstartEndReason,
  type KickstartPeriodRecord,
  type LocalDate,
  phaseInputFrom,
  type ProfileRecord,
  type ReadinessGates,
  type SettingsRecord,
  type StepsRecord,
  stepsRepeatOffer,
  type TimeZone,
  utcRangeCovering,
  type WaterDay,
  waterForDay,
  type WaterRecord,
} from '@diet/core';
import type { WriteGate } from '../../db/gate';
import type { AppStorage } from '../../db/runtime';

const TRIGGERS: readonly CholesterolTrigger[] = ['day-1', 'day-56', 'day-84'];

export interface TodayInputs {
  /** The local date the read was made for. */
  readonly today: LocalDate;
  readonly settings: SettingsRecord;
  readonly profile: ProfileRecord;
  /** Water rows near the date; waterForDay picks the date's own. */
  readonly water: readonly WaterRecord[];
  readonly stepsToday: StepsRecord | undefined;
  readonly stepsYesterday: StepsRecord | undefined;
  readonly periods: readonly KickstartPeriodRecord[];
  readonly checks: readonly KickstartCheckRecord[];
  readonly cholesterol: Readonly<Partial<Record<CholesterolTrigger, CardStateRecord>>>;
  readonly electrolyte: CardStateRecord | undefined;
}

export interface TodaySource {
  readonly gate: WriteGate;
  readonly storage: AppStorage;
  readonly today: LocalDate;
}

/** Today's own records, in one live query built per local date (so its ranges move at midnight). */
export async function readToday({ storage, today }: TodaySource): Promise<TodayInputs> {
  const { repos } = storage;
  const { lower, upper } = utcRangeCovering(today, today);
  const [settings, profile, water, stepsToday, stepsYesterday, periods, checks, electrolyte] =
    await Promise.all([
      repos.settings.get(),
      repos.profile.get(),
      repos.water.listByIndex('at', lower, upper),
      repos.steps.get(today),
      repos.steps.get(addDays(today, -1)),
      repos.kickstart.listPeriods(),
      repos.kickstart.listChecks(),
      repos.cardState.get('electrolyte-reminder', 'daily'),
    ]);
  const rows = await Promise.all(
    TRIGGERS.map((t) => repos.cardState.get('cholesterol-checkin', t)),
  );
  const cholesterol: Partial<Record<CholesterolTrigger, CardStateRecord>> = {};
  TRIGGERS.forEach((trigger, i) => {
    const row = rows[i];
    if (row !== undefined) cholesterol[trigger] = row;
  });
  return {
    today,
    settings,
    profile,
    water,
    stepsToday,
    stepsYesterday,
    periods,
    checks,
    cholesterol,
    electrolyte,
  };
}

/** A line of the electrolyte reminder: item 21's electrolyteCopyKeys decides which, in order. */
export type ElectrolyteLine = ReturnType<typeof electrolyteCopyKeys>[number];

/** One item of the Reminders card. */
export type ReminderItem =
  | { readonly kind: 'electrolytes'; readonly lines: readonly ElectrolyteLine[] }
  | { readonly kind: 'medication' }
  | { readonly kind: 'cholesterol'; readonly trigger: CholesterolTrigger }
  | { readonly kind: 'backup' };

export interface TodayView {
  /** The alcohol notice acknowledged and setup finished (HS-20, C41, T23). */
  readonly setupDone: boolean;
  readonly water: WaterDay;
  readonly steps: { readonly today: StepsRecord | null; readonly repeat: number | null };
  readonly drinks:
    { readonly kind: 'gated' } | { readonly kind: 'guidance'; readonly set: AlcoholGuidanceSet };
  /** The Reminders card goes second (prominent) or last; with no items it is not shown. */
  readonly reminders: { readonly prominent: boolean; readonly items: readonly ReminderItem[] };
}

export interface TodayViewArgs {
  readonly inputs: TodayInputs;
  readonly gates: ReadinessGates;
  readonly now: Instant;
  readonly deviceTimeZone: TimeZone;
  /** Item 12's backup reminder (useBackupReminder). */
  readonly backup: { readonly visible: boolean; readonly prominent: boolean };
  /** Item 14's end latch: a Kickstart whose end is due reads as ended. */
  readonly endsPending: ReadonlyMap<Id, KickstartEndReason>;
}

/** The alcohol notice acknowledged and setup finished: until then nothing on Today writes. */
export function setupFinished(settings: SettingsRecord): boolean {
  return settings.alcoholNoticeAckAt !== null && settings.onboardingCompletedAt !== null;
}

export function todayView(args: TodayViewArgs): TodayView {
  const { inputs, gates, now } = args;
  const { settings, profile } = inputs;
  const setupDone = setupFinished(settings);
  const kickstartToday = isKickstartDay(
    phaseInputFrom({
      now,
      deviceTimeZone: args.deviceTimeZone,
      homeTimeZone: settings.homeTimeZone,
      profile,
      gates,
      periods: inputs.periods,
      checks: inputs.checks,
      endsPending: args.endsPending,
    }),
  );
  const items: ReminderItem[] = [];
  if (
    electrolyteReminderDue({
      now,
      gates,
      dietMode: profile.dietMode,
      kickstartToday,
      carbCeilingStartedAt: profile.carbCeilingStartedAt,
      row: inputs.electrolyte,
    })
  ) {
    items.push({ kind: 'electrolytes', lines: electrolyteCopyKeys(gates) });
  }
  // While fasting is available the line stays on the Fast card (C07); never both.
  if (gates.pharmacistReminder && gates.fastingGated) items.push({ kind: 'medication' });
  const trigger = cholesterolCheckinDue({
    now,
    onboardingCompletedAt: settings.onboardingCompletedAt,
    firstLowCarbAt: profile.firstLowCarbAt,
    profileCreatedAt: profile.createdAt,
    rows: inputs.cholesterol,
  });
  if (trigger !== null) items.push({ kind: 'cholesterol', trigger });
  const prominent = args.backup.visible && args.backup.prominent;
  if (args.backup.visible) {
    // The backup reminder goes first among the reminders when storage is not protected (D25).
    if (prominent) items.unshift({ kind: 'backup' });
    else items.push({ kind: 'backup' });
  }
  return {
    setupDone,
    water: waterForDay(inputs.water, inputs.today, settings.homeTimeZone),
    steps: {
      today: inputs.stepsToday ?? null,
      repeat: stepsRepeatOffer(inputs.stepsToday, inputs.stepsYesterday),
    },
    drinks: gates.alcoholLoggingAvailable
      ? { kind: 'guidance', set: guidanceFor(profile.sex, settings.alcoholGuidanceSet).set }
      : { kind: 'gated' },
    reminders: { prominent, items },
  };
}
