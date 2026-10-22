/**
 * Today's sessions (item 27 design section 2.3; item 26 design 3.14 points 1 and 3): one item per
 * planned template, and one per other template that already has a started, done or rested row
 * today, so a session the plan moved away from can still be finished.
 */
import {
  type ExerciseData,
  type ResolvedWeek,
  type SessionTemplate,
  type TemplateKind,
  templateById,
  templatesOn,
} from '../exercise';
import type { SessionRecord } from '../storage/records';
import type { LocalDate } from '../util/time';

export type TodayItemState = 'not-started' | 'in-progress' | 'done' | 'rested';

export interface TodayItem {
  readonly templateId: string;
  /** Null for a stored id no longer in the dataset. */
  readonly template: SessionTemplate | null;
  /** In templatesOn(data, week, today). */
  readonly planned: boolean;
  readonly state: TodayItemState;
  /** The row the state comes from; for 'not-started', an unchecked row the choice reuses, or null. */
  readonly row: SessionRecord | null;
}

type RowClass = 'in-progress' | 'done' | 'rested' | 'unchecked';
/** Highest first: the row an item shows. */
const CLASS_ORDER: readonly RowClass[] = ['in-progress', 'done', 'rested', 'unchecked'];
const KIND_ORDER: readonly TemplateKind[] = ['strength', 'walk', 'jog'];

const ticked = (row: SessionRecord): boolean => row.movements.some((m) => m.done.length > 0);

/**
 * A row's class, or null for an unchecked planned row with ticked sets (only from an import): it
 * is left out here, still counts as work in the start gate, and still shows in history.
 */
function classOf(row: SessionRecord): RowClass | null {
  if (row.status === 'done') return 'done';
  if (row.status === 'rested' || row.status === 'skipped') return 'rested';
  if (row.preCheck !== null) return 'in-progress';
  return ticked(row) ? null : 'unchecked';
}

/** The first row by id of the highest class, with that class. */
function pick(rows: readonly SessionRecord[]): { row: SessionRecord; cls: RowClass } | null {
  for (const cls of CLASS_ORDER) {
    const row = rows
      .filter((r) => classOf(r) === cls)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    if (row !== undefined) return { row, cls };
  }
  return null;
}

function itemOf(
  data: ExerciseData,
  templateId: string,
  planned: boolean,
  found: { row: SessionRecord; cls: RowClass } | null,
): TodayItem {
  const state: TodayItemState =
    found === null || found.cls === 'unchecked' ? 'not-started' : found.cls;
  return Object.freeze({
    templateId,
    template: templateById(data, templateId) ?? null,
    planned,
    state,
    row: found?.row ?? null,
  });
}

/**
 * The planned templates first, strength before beach (the strip's order), each with the state of
 * its rows dated today: in progress (planned with a check), done, rested (rested or skipped), or
 * not started (no row, or an unchecked row with nothing ticked, which a choice reuses). Then rows
 * of templates not planned today, in dataset order with unknown ids last, only when started, done
 * or rested.
 */
export function todaySessions(
  data: ExerciseData,
  week: ResolvedWeek,
  sessions: readonly SessionRecord[],
  today: LocalDate,
): TodayItem[] {
  const rows = sessions.filter((s) => s.date === today);
  const planned = templatesOn(data, week, today)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => KIND_ORDER.indexOf(a.t.kind) - KIND_ORDER.indexOf(b.t.kind) || a.i - b.i)
    .map(({ t }) => t);
  const items = planned.map((t) =>
    itemOf(data, t.id, true, pick(rows.filter((r) => r.templateId === t.id))),
  );
  const plannedIds = new Set(planned.map((t) => t.id));
  const datasetOrder = data.templates.map((t) => t.id);
  const otherIds = [
    ...new Set(rows.map((r) => r.templateId).filter((id) => !plannedIds.has(id))),
  ].sort((a, b) => {
    const ai = datasetOrder.indexOf(a);
    const bi = datasetOrder.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0 || bi >= 0) return ai >= 0 ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  for (const id of otherIds) {
    const found = pick(rows.filter((r) => r.templateId === id));
    if (found !== null && found.cls !== 'unchecked') items.push(itemOf(data, id, false, found));
  }
  return items;
}
