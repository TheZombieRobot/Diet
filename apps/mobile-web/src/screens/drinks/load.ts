/**
 * What the Drinks screen, the Today Drinks card and the Talk to someone card read (item 28 design
 * 5.1), in one live query: any write to these stores re-renders all three at once. The query is
 * built per drinking-day range (useDrinksView), so it moves when the week does. The readiness
 * answers come from item 13's live gates (useReadinessGates), not from here.
 */
import {
  ALCOHOL_HELP_TRIGGERS,
  type AlcoholDayNoteRecord,
  type AlcoholHelpTrigger,
  type AlcoholMilestoneRecord,
  type BeverageRecord,
  type CardStateRecord,
  type DrinkLogRecord,
  type LocalDate,
  type ProfileRecord,
  type SettingsRecord,
} from '@diet/core';
import type { WriteGate } from '../../db/gate';
import type { AppStorage } from '../../db/runtime';

export interface DrinksSource {
  readonly gate: WriteGate;
  readonly storage: AppStorage;
  /** The drinking days to read: 8 display weeks plus 3 for the rolling average (design 3.8). */
  readonly from: LocalDate;
  readonly to: LocalDate;
}

export interface DrinksData {
  readonly settings: SettingsRecord;
  readonly profile: ProfileRecord;
  readonly beverages: readonly BeverageRecord[];
  readonly drinks: readonly DrinkLogRecord[];
  /** Every next-day note: a small store, keyed by calendar date. */
  readonly notes: readonly AlcoholDayNoteRecord[];
  readonly milestones: readonly AlcoholMilestoneRecord[];
  /** The help card's own rows, by trigger. */
  readonly cardRows: Readonly<Partial<Record<AlcoholHelpTrigger, CardStateRecord>>>;
}

/** The records of the Drinks views; a failure is thrown, and the live query reports it. */
export async function loadDrinksData({ storage, from, to }: DrinksSource): Promise<DrinksData> {
  const { repos } = storage;
  const [settings, profile, beverages, drinks, notes, milestones, rows] = await Promise.all([
    repos.settings.get(),
    repos.profile.get(),
    repos.beverages.list(),
    repos.drinks.forDrinkingDays(from, to),
    repos.alcoholDayNotes.list(),
    repos.alcoholMilestones.list(),
    Promise.all(ALCOHOL_HELP_TRIGGERS.map((t) => repos.cardState.get('alcohol-help', t))),
  ]);
  const cardRows: Partial<Record<AlcoholHelpTrigger, CardStateRecord>> = {};
  ALCOHOL_HELP_TRIGGERS.forEach((trigger, i) => {
    const row = rows[i];
    if (row !== undefined) cardRows[trigger] = row;
  });
  return { settings, profile, beverages, drinks, notes, milestones, cardRows };
}
