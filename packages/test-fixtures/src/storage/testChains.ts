/**
 * TEST-ONLY migration chains (storage spec sections 9.6 and 16 tests 17 and 32), built here and
 * never shipped: version 1 followed by a version 2 that
 * (a) adds a field with a default and renames an enum value;
 * (b) narrows a safety range, mapping 20 to 18 and recording the change;
 * (c) adds a backed-up store and a device-only store;
 * (d) removes an index that version 1 declares (for the newer-database tests);
 * and two more for the database upgrade tests: an identity step that changes nothing, and a step
 * whose result fails validation (the upgrade must then leave version 1 untouched).
 */
import {
  fillTemplate,
  type LooseSnapshot,
  type Migration,
  MIGRATIONS,
  type ObjectRule,
  type ProfileRecord,
  ROWS_V1,
  type SettingsRecord,
  specKit,
  STORES_V1,
  TABLES_V1,
  type TargetsRecord,
} from '@diet/core';
import { privacy } from '@diet/core/copy/health';

const { bool, enumOf, id, int, object, table } = specKit;

export const V1 = MIGRATIONS[0] as Migration;
export type Rows = Record<string, unknown>[];

// (a) profile gains compactView (default false); settings.textSize 'largest' becomes 'extra-large'.
export type ProfileV2 = ProfileRecord & { compactView: boolean };
export type SettingsV2 = Omit<SettingsRecord, 'textSize'> & {
  textSize: 'standard' | 'large' | 'extra-large';
};
export const chainA: readonly Migration[] = [
  V1,
  {
    version: 2,
    stores: {},
    backup: { added: [], removed: [], deviceOnly: [] },
    specs: {
      ...TABLES_V1,
      profile: table(
        STORES_V1.profile,
        true,
        TABLES_V1.profile.ops,
        object<ProfileV2>({ ...ROWS_V1.profile.fields, compactView: bool }, ROWS_V1.profile.rules),
      ),
      settings: table(
        STORES_V1.settings,
        true,
        TABLES_V1.settings.ops,
        object<SettingsV2>(
          { ...ROWS_V1.settings.fields, textSize: enumOf(['standard', 'large', 'extra-large']) },
          ROWS_V1.settings.rules as unknown as ObjectRule<SettingsV2>[],
        ),
      ),
    },
    reads: ['profile', 'settings'],
    rewrites: ['profile', 'settings'],
    upgrade: (s) => ({
      snapshot: {
        ...s,
        profile: (s.profile as Rows).map((p) => ({ ...p, compactView: false })),
        settings: (s.settings as Rows).map((x) => ({
          ...x,
          textSize: x.textSize === 'largest' ? 'extra-large' : x.textSize,
        })),
      },
      changes: [],
    }),
  },
];

// (b) steadyDeficitPct narrows from 15–20 to 15–18: 19 and 20 move to 18, the nearest safe value.
export const chainB: readonly Migration[] = [
  V1,
  {
    version: 2,
    stores: {},
    backup: { added: [], removed: [], deviceOnly: [] },
    specs: {
      ...TABLES_V1,
      targets: table(
        STORES_V1.targets,
        true,
        TABLES_V1.targets.ops,
        object<TargetsRecord>(
          { ...ROWS_V1.targets.fields, steadyDeficitPct: int(15, 18) },
          ROWS_V1.targets.rules,
        ),
      ),
    },
    reads: ['targets'],
    rewrites: ['targets'],
    upgrade: (s) => {
      const changes = (s.targets as Rows)
        .filter((t) => (t.steadyDeficitPct as number) > 18)
        .map(() => ({
          table: 'targets',
          recordId: 'singleton',
          field: 'steadyDeficitPct',
          reason: fillTemplate(privacy.migrationChange, { field: 'Steady deficit', version: 2 }),
        }));
      const targets = (s.targets as Rows).map((t) => ({
        ...t,
        steadyDeficitPct: Math.min(18, t.steadyDeficitPct as number),
      }));
      return { snapshot: { ...s, targets }, changes };
    },
  },
];

// (c) a new backed-up store and a new device-only store.
export const chainC: readonly Migration[] = [
  V1,
  {
    version: 2,
    stores: { example_notes: 'id', example_cache: 'id' },
    backup: { added: ['example_notes'], removed: [], deviceOnly: ['example_cache'] },
    specs: {
      ...TABLES_V1,
      example_notes: table(
        'id',
        true,
        ['create', 'get', 'list', 'update', 'remove'],
        object<{ id: string }>({ id }),
      ),
      example_cache: table('id', false, [], object<{ id: string }>({ id })),
    },
    reads: [],
    rewrites: [],
    upgrade: (s) => ({ snapshot: s, changes: [] }),
  },
];

// (d) the weights store loses its `at` index: a database at this version is newer than the code,
// and version-1 Dexie would "patch" it by adding the index back if it were ever let near it.
export const chainD: readonly Migration[] = [
  V1,
  {
    version: 2,
    stores: { weights: 'id' },
    backup: { added: [], removed: [], deviceOnly: [] },
    specs: TABLES_V1,
    reads: [],
    rewrites: [],
    upgrade: (s) => ({ snapshot: s, changes: [] }),
  },
];

/** A version 2 that changes nothing: the last-step checks still run over every row. */
export const chainIdentity: readonly Migration[] = [
  V1,
  {
    version: 2,
    stores: {},
    backup: { added: [], removed: [], deviceOnly: [] },
    specs: TABLES_V1,
    reads: [],
    rewrites: [],
    upgrade: (s) => ({ snapshot: s, changes: [] }),
  },
];

/** A version 2 whose result fails validation (a height of 999 cm): the upgrade must fail. */
export const chainFailing: readonly Migration[] = [
  V1,
  {
    version: 2,
    stores: {},
    backup: { added: [], removed: [], deviceOnly: [] },
    specs: TABLES_V1,
    reads: ['profile'],
    rewrites: ['profile'],
    upgrade: (s: LooseSnapshot) => ({
      snapshot: { ...s, profile: (s.profile as Rows).map((p) => ({ ...p, heightCm: 999 })) },
      changes: [],
    }),
  },
];
