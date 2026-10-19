/**
 * The one helper every app-generated file name goes through (storage spec section 10.1; C86, C89;
 * D18). Backups are diet-backup-YYYY-MM-DD[-rescue][-locked].json, which `.gitignore`
 * (*backup*.json) and the scan's backup-file path rule both match. The date is the local date of
 * the export in the device zone, so an export at 08:00 in New Zealand, when it is still the
 * previous day in UTC, carries the New Zealand date.
 */
import { type LocalDate, localDateOf } from '../../util/time';
import { DEFAULT_HOME_TIME_ZONE, resolveZone } from '../dates';
import { type Instant, isLocalDate, type TimeZone } from '../primitives';

export type BackupFileKind = 'backup' | 'rescue';

export function backupFileName(
  exportedAt: Instant,
  timeZone: TimeZone,
  options: { readonly locked: boolean; readonly kind: BackupFileKind },
): string {
  const date = localDateOf(exportedAt, resolveZone(timeZone, DEFAULT_HOME_TIME_ZONE).timeZone);
  return `diet-backup-${date}${options.kind === 'rescue' ? '-rescue' : ''}${options.locked ? '-locked' : ''}.json`;
}

/** Later exports (GP summary at item 23, grocery list at item 24), named beside backups. */
export type ExportFileKind =
  'gp-summary-csv' | 'gp-summary-txt' | 'grocery-list-csv' | 'grocery-list-json';

const EXPORT_NAMES: Readonly<
  Record<ExportFileKind, { readonly stem: string; readonly extension: string }>
> = {
  'gp-summary-csv': { stem: 'diet-gp-summary', extension: 'csv' },
  'gp-summary-txt': { stem: 'diet-gp-summary', extension: 'txt' },
  'grocery-list-csv': { stem: 'diet-grocery-list', extension: 'csv' },
  'grocery-list-json': { stem: 'diet-grocery-list', extension: 'json' },
};

/** diet-gp-summary-YYYY-MM-DD.csv or .txt; diet-grocery-list-YYYY-MM-DD.csv or .json. `date` is the local date. */
export function exportFileName(kind: ExportFileKind, date: LocalDate): string {
  if (!isLocalDate(date)) throw new RangeError('The export date must be a real date "YYYY-MM-DD"');
  const { stem, extension } = EXPORT_NAMES[kind];
  return `${stem}-${date}.${extension}`;
}
