# Storage design (checklist item 12)

**Status:** implemented at checklist item 12 (stages a and b), then revised by the item-12 review fix pass (the rescue import limits of section 9.5, the step contract of section 9.3, the lock handshake of section 7.5, the content-based confirmation of section 10.6, future-dated times in section 12.3, and plain-word messages). Orchestrator override: D30 is changed so readiness answer 5 switches the keto carb ceiling off entirely (see `DECISIONS.md`; section 13.3). Known text correction: section 16 test 5 should read "day 18 refused; days 19–21 accepted (the last 3 days)", per section 4.5.

**What this is.** The design for checklist item 12 (local database and backup). It covers every IndexedDB store with its fields, ranges and indexes; how times and local dates work; how the database is opened safely; schema version 1 and the migration policy; the backup file (plain and password-locked) with import validation and the round-trip definition; the rescue copy; delete-all; persistent storage and the weekly backup reminder; readiness storage and the gate input; and the tests. It is meant to be complete enough that one implementer can build item 12 without guessing. Section 15 lists the document edits item 12 makes when it lands, and section 19 lists every choice this spec makes that the documents do not already fix, for recording in DECISIONS.md.

**Revision 2 (19 Oct 2026).** Rewritten after two independent reviews. Every review point is either built in below or answered with a short "Not adopted because …" note where it is raised.

**Sources read.** `DATA_MODEL.md`; `HEALTH_SAFETY.md` (all, especially sections 1–8); `TEST_PLAN.md` 3.1 (PWA-06), 3.2, 3.3, 3.4, 3.5, 3.8, 3.10 and section 4; `UX_SCREENS.md`; `IMPLEMENTATION_CHECKLIST.md` items 12–24 and 28–31; `DECISIONS.md` (the 2026-10-19 rows, including the owner-delegated choices); and the `DOC_REVIEW.md` items listed in section 14. The existing core code: `alcohol/standardDrinks.ts`, `nutrition/*.ts`, `fasting/eatingWindow.ts`, `weight/trend.ts`, `energy/*.ts`, `util/time.ts` and `util/round.ts`, plus `apps/mobile-web/src/pwa/storage.ts`, `vite.config.ts`, `.gitignore` and `tools/scans/rules.ts`. The published tarballs of `dexie@4.4.6` (`dist/dexie.mjs`, `dist/dexie.d.ts`) and `fake-indexeddb@6.2.5` were read for the open, version-change and `databases()` behaviour that section 7 relies on. Where a DOC_REVIEW recommendation differs from a later DECISIONS row, the DECISIONS row wins, as the "How to read this file" note in DOC_REVIEW says.

**Words used.** MUST and MUST NOT are requirements for item 12. SHOULD is a strong default; the implementer may depart from it only by giving a reason in the commit. "Core" is `packages/core` and "app" is `apps/mobile-web`. "Dn" refers to a numbered decision in section 19. Every example value is synthetic: dates in the year 2000, round numbers, names such as "Example drink". None of them describes anyone.

---

## 0. At a glance

- **28 stores, 26 backed up** (D1). `transfer_pairings` and `garden_photos` never leave the phone.
- **Seed datasets stay in code**, addressed by `seed:` ids (D2, D3). The owner's corrections to a seed ingredient are stored as small patches in `ingredient_overrides`, merged over the current seed when read; allergens can only ever be added.
- **One set of pure validators in core** (D10). They depend only on the value and the code version, never on the clock, configuration or the browser's time-zone data. The middleware, import, upgrade and the export self-check all use them. Repositories add the checks that only make sense at the moment of writing.
- **Times** are canonical UTC instants with the IANA zone stored on every event record (D5); unknown zones in imported data are accepted and resolved when read (D6).
- **Opening never lets old code touch a newer database** (D16): the installed version is checked with raw IndexedDB before Dexie runs, and Dexie never reopens a database by itself.
- **Every write transaction is synchronous and holds only Dexie requests** (D15), so it cannot commit early. A repository scan enforces this.
- **Any change to the stored shape, or to anything a validator depends on, bumps the schema version** (D12, D13); each released version's specs are frozen and kept, so every backup ever made stays importable.
- **Import replaces everything, all or nothing** (D17). **Export checks its own output**, including decrypting a locked file before offering it (D19), and records the backup only when the owner confirms they can see the file (D21).
- **Safety rules that the reviews found missing in storage**: Kickstart is capped at 42 days in all, across every period (D27); the extension check is bounded to the last 3 days (D28); readiness confirmations lapse when their question is re-answered (D29); the rapid-loss card returns daily while its condition holds (D26).

---

## 1. Code layout and dependencies

**Core, `packages/core/src/storage/`** (no runtime dependency; WebCrypto comes from `globalThis.crypto`, which Node 22 and Chrome both provide):

| File | Contents |
|---|---|
| `primitives.ts` | Format predicates and small combinators (section 2). No validation library. Predicates return booleans; they never throw and never build a message containing a value. |
| `limits.ts` | Safety and range constants (section 4.3). Re-exported from the core index; item 21 imports the same constants. |
| `allergens.ts` | `Allergen`, `UserAllergen`, `expandUserAllergens()` (C43). |
| `overrides.ts` | `IngredientChange`, `effectiveIngredient(seed, override)`, `effectiveAllergens()`, `recipeAllergens()` (section 4.7). |
| `records.ts` | One TypeScript interface per store (hand-written; `exactOptionalPropertyTypes` is on, so no optional properties). |
| `specs/v1.ts` | `TABLES_V1`: the frozen version-1 field specs, typed `{ [K in keyof Row]-?: Validator<Row[K]> }` so a missing or extra field is a compile error. Each later version adds `specs/vN.ts` and never edits an earlier one. |
| `tables.ts` | `DB_NAME`, `STORE_NAMES`, `TABLES` (= the current version's specs), `TABLES_BY_VERSION`, per-store write operations (section 8.4), `BACKUP_TABLES_BY_VERSION`, `DEVICE_ONLY_TABLES_BY_VERSION`, `BACKUP_FIELDS_BY_VERSION`, `VALIDATOR_CONSTANTS` (section 9.2). |
| `validate.ts` | `validateRow(table, value, specs?)`, `validateSnapshot(tables, specs?)`, `StorageValidationError` (section 2.3). |
| `invariants.ts` | `checkInvariants(snapshot)`, `StorageInvariantError` (section 5). |
| `defaults.ts` | Default singleton rows and populate rows (section 6). |
| `dates.ts` | `localWallClockOf`, `drinkingDayOf`, `skippedDrinkingDays`, `areConsecutiveDrinkingDays`, `resolveZone`, `utcRangeCovering` (section 3). |
| `kickstart.ts` | Pure period arithmetic used by the invariants and the kickstart repository: `periodDay1`, `scheduledLastDay`, `effectiveLastDay`, `effectiveDays`, `extensionWindow` (section 4.5). |
| `readiness.ts` | Question ids, wording versions, `readinessInputFromRows`, `missingReadinessAnswers` (section 13). |
| `profileMapping.ts` | `estimateSexOf(profile.sex)`, `guidanceSetFor(profile.sex, settings.alcoholGuidanceSet)` (section 4.4). |
| `cards.ts` | `CARD_REGISTRY`, trigger patterns, `collapsedUntil` (section 4.12). |
| `derived.ts` | Small read-time derivations: `shownStdDrinksPerServe`, `groceryListStatus`, `nutrientCompleteness` (sections 4.7, 4.10, 4.11). |
| `migrations.ts` | `MIGRATIONS`, `SCHEMA_VERSION`, `SPEC_FINGERPRINTS`, `GOLDEN_VECTORS`, `migrateSnapshot` (section 9). |
| `backup/fileName.ts`, `backup/base64.ts`, `backup/crypto.ts`, `backup/encode.ts`, `backup/decode.ts`, `backup/errors.ts` | Section 10. `fileName.ts` holds the one helper every app-generated file name goes through (section 10.1). |
| `backupReminder.ts` | Pure reminder rule (section 12). |

**App, `apps/mobile-web/src/db/`:** `db.ts` (the `DietDb` Dexie subclass, the open sequence, the validation middleware, version-change handling, the open status), `gate.ts` (the write gate and the cross-tab channel, section 7.5), `repos/` (section 8), `snapshot.ts` (read in one transaction, replace in one transaction), `exportBackup.ts`, `importBackup.ts`, `deleteAll.ts`, `rescue.ts`, and `liveQuery.ts`. The last is a `useLiveQuery` hook built on Dexie's `liveQuery` and `useSyncExternalStore`, like the existing `store.ts`; it unsubscribes when the write gate closes. UI: a Backup and data card in Settings (export, restore, delete all, storage status), a backup reminder card on Today, and the storage failure screens (section 7.4).

**Repository scan, `tools/scans/txScope.ts`** (with a test): the transaction-scope rule of section 8.5.

**Copy.** The backup, restore, rescue, delete-all and storage-status wording, and the static safety block on the storage failure screens, go in a new `privacy` section of `packages/core/src/copy/health.ts`. HEALTH_SAFETY section 7 treats privacy as a safety feature, so this text is reviewed and scanned with the rest (C16: "Backup", "back" and "bacon" already pass the scanner).

**Dependencies** (exact pins, as elsewhere in the repo):
- `dexie` **4.4.6** (Apache-2.0, released 10 Sep 2026) in the app's `dependencies`.
- `fake-indexeddb` **6.2.5** (Apache-2.0) in the app's `devDependencies`. It implements `indexedDB.databases()`. Version 6.2.6 came out on 16 Oct 2026, three days ago; leave it until it is at least two weeks old.
- MUST NOT add `dexie-cloud-addon` or any sync addon, nor any crypto, validation or base64 package. Both licences are already on `ALLOWED_LICENSES`.

---

## 2. Rules for every stored value

### 2.1 Only plain JSON values
Every field in a backed-up store holds only: `string`, finite `number` (never `-0` or NaN; JSON cannot carry Infinity), `boolean`, `null`, arrays of these, and plain objects of these. **There are no optional properties and no `undefined`.** A field that can be empty is always present and set to `null`. MUST NOT store `Date`, `Map`, `Set`, `Blob`, class instances or sparse arrays. This is what makes the round trip exact, because structured clone (IndexedDB) and JSON (the backup) then agree. The two device-only stores may hold an `ArrayBuffer` (photos) and a non-extractable `CryptoKey` (pairing).

Every validator returns a **new** object built only from the allowed keys. It never spreads its input. It refuses an object with any key outside the field list, and refuses the keys `__proto__`, `constructor` and `prototype` at any depth. That matters because `JSON.parse` creates `__proto__` as an ordinary own property.

### 2.2 Formats

| Name | Format | Validation (pure predicate in `primitives.ts`) |
|---|---|---|
| `Instant` | `YYYY-MM-DDTHH:mm:ss.sssZ`, exactly 24 characters, the `toISOString()` form | Matches the 24-character pattern, `new Date(s).toISOString() === s`, and lies from `2000-01-01T00:00:00.000Z` up to, but not including, `2100-01-01T00:00:00.000Z`. One canonical form means string order is time order (Dexie indexes) and equality is exact. Core's throwing `parseInstant` is not called (its message contains the value). |
| `TimeZone` | IANA name, e.g. `Pacific/Auckland` | **Syntactic only:** at most 64 characters, matches `^[A-Za-z][A-Za-z0-9_+-]*(?:/[A-Za-z0-9_+-]+){0,2}$`, and is not `Etc/Unknown`. Whether this device's `Intl` recognises the zone is an environment check made only by repositories when writing (section 8.3), never by a validator, so a backup or an upgrade is never refused because the importing browser has older time-zone data (section 3.4). |
| `LocalDate` | `YYYY-MM-DD` | A real calendar date from 2000-01-01 to 2099-12-31. |
| `ClockTime` | `HH:MM`, 24-hour | `^([01]\d|2[0-3]):[0-5]\d$` (the same rule as core `parseClockTime`). |
| `Id` | lowercase UUID v4 from `crypto.randomUUID()` | `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/` |
| `SeedId` | `seed:<slug>`, e.g. `seed:silverbeet` | `/^seed:[a-z0-9]+(?:-[a-z0-9]+)*$/`, at most 64 characters. Reserved for datasets in code. |
| `RefId` | `Id` or `SeedId` | Either pattern. Existence is not checked unless section 5 says so ("soft" references). |
| `Text(a–b)` | single-line string | No leading or trailing whitespace; length a–b in UTF-16 code units; no U+0000–U+001F or U+007F. |
| `Note(≤n)` | multi-line string | As Text, but `\n` is allowed; length 1–n. An empty note is stored as `null`, never `''`. |
| `Int a–b` | integer | `Number.isSafeInteger`, within a–b. |
| `Num a–b` | number | Finite, not `-0`, within a–b. `(a` means the lower bound is exclusive. |
| `Bool` | `true` / `false` | Strict. |
| `X[] ≤n` | array | `Array.isArray`, not sparse, length ≤ n, items validated; "unique" where stated. |

### 2.3 Validation layers, normalisation and errors

There are three layers. Only the first two can ever refuse stored data.

1. **`validateRow(table, value, specs = TABLES)`**: structural and safety rules (types, formats, ranges, enums, and the rules inside one record, such as "null iff"). It is a pure function of the value and the code version. It MUST NOT read the clock, configuration (such as the relay origin), `Intl`'s time-zone data, the seed datasets or other records. It is used by the middleware on every `add` and `put`, by `populate`, by `runUpgrade`, by import (once with the file's own version's specs and once with the current specs, section 10.6) and by the export self-check. Passing a version's specs (`TABLES_BY_VERSION[n]`) validates against that frozen version.
2. **`checkInvariants(snapshot)`**: the cross-record rules of section 5. Also pure.
3. **Repository write checks** (section 8.3): first normalisation, then the environment checks that only make sense at the moment of writing (the zone is one this device's `Intl` knows; a birth year is not in the future), then the repository's own rules (for example the Kickstart extension window). These never run on import, upgrade or export.

**Normalisation (repositories only, before validating).** Every number `-0` becomes `0`. In a `Text` field, `\r\n`, `\r`, `\n` and `\t` each become one space, other control characters are removed, and the result is trimmed. In a `Note` field, `\r\n` and `\r` become `\n`, `\t` becomes a space, other control characters except `\n` are removed, the result is trimmed, and an empty result becomes `null`. A pasted note with Windows line endings or a tab therefore saves. Import does not normalise: a file that holds such values is refused, because the app never writes them.

**Errors carry no values and no record keys.** `StorageValidationError` has exactly `{ table, field, rule }`, and `StorageInvariantError` has `{ rule }`. `field` is a path such as `beverage.label.kcal`; `rule` is one of a fixed set of ids (`type`, `missing`, `extra-key`, `forbidden-key`, `format`, `range`, `enum`, `length`, `unique`, `order`, `iff`, `equals`, `pattern`, and the write-only `zone-unknown` and `future-year`). Neither error has a `cause`. Validators call predicates only; where a core function must be used (for example `windowLength`), it is called inside a helper that catches the core `RangeError`, drops it and returns `false`. A message is built only from the table name, the field path, the rule and spec constants (for example "must be 20–400"). User-facing messages also leave out the record key, because a key can itself be personal (the key of `alcohol_day_notes` is the date of a drinking note). Section 16 test 21 writes sentinel values through every failure path and checks they never appear.

### 2.4 How the field tables read
Columns: **Field**; **Type and unit** (section 2.2 names); **Null** (whether `null` is allowed); **Default** (the value in a new row, or "—" when the writer must supply it); **Validation**; **Serves** (the document rule or DOC_REVIEW item behind it). Unless stated, every field is required and non-null, and ranges are inclusive.

---

## 3. Times and local dates

### 3.1 What is stored
- **Event records** store `at` (or `startedAt` / `endedAt`, `askedAt`, `enteredAt`) as an `Instant` and `timeZone` as the device zone at that moment: weights, fasts, symptom_log, water_log, food_log, drinks_log, kickstart_periods, kickstart_checks, alcohol_day_notes' `enteredAt` (C21 point 5), audit rows and card dismissals (`card_state.dismissedTimeZone`). A fast and a Kickstart period also store `endedTimeZone`, because they can end in a different zone from the one they started in.
- **Calendar-day records** are keyed by a `LocalDate`, which is the owner's date with no zone: plan_days, steps_log, sessions, alcohol_day_notes, alcohol_milestones' `fromDate` and garden's `harvestedAt`.
- **Bookkeeping instants** (`createdAt`, `updatedAt`, `answeredAt`, `lastBackupAt`, `firstShownAt`, `doneAt`, the onboarding confirmations, `goalSetAt`, `packSizeEnteredAt`, `price.enteredAt`, `sentAt`, `receivedAt`) store no zone. They are shown in the current zone when displayed, and no rule places them on a local day.
- **Elapsed-time counts.** `profile.carbCeilingStartedAt` (C72, "fewer than 14 days have passed") and `profile.firstLowCarbAt` (C109, "when 56 and 84 days have elapsed") are counted in elapsed 24-hour periods from the instant, so they need no zone and travel cannot shift them. Every consumer of an elapsed-time start (these two, `goalSetAt` and any later one) reads it through core `clock.ts`: `elapsedStartAt(start, now)` is the start, or `now` when the start is dated after now, and `elapsedDaysSince(start, now)` counts whole 24-hour periods from that, never negative. A start dated ahead (a clock that ran ahead, then was corrected) therefore never delays a check-in or a reminder by more than the time it lies ahead, and import puts a start dated after the file's limit back to that limit (section 12.3).
- **The clock high-water mark** (`clockHighWater(tables)` in core `clock.ts`; health-rules review): the newest event or bookkeeping instant in any backed-up store, computed when needed (nothing is stored). `isClockBehind(now, highWater)` is true when now is earlier than it by more than 5 minutes. The Kickstart repository uses both (section 8.2), so a phone clock set back can never make lived Kickstart days count as fewer.
- **Backdated entries**: when a form picks a past wall time (date plus `HH:MM`), it is converted with `zonedWallTimeToInstant(date, minutes, zone)`, where `zone` is the current device zone (section 3.4), and the record stores that zone. A bare `datetime-local` string is never parsed with `Date`.
- **"Now" and "today"**: `now = env.now()`; `today = localDateOf(now, env.timeZone())`. Repositories take both through an injected `StorageEnv` (section 8.1) so tests control the clock.

### 3.2 Derivations (core functions, never stored)

| Quantity | Rule | Serves |
|---|---|---|
| Zone of a record | `resolveZone(record.timeZone, settings.homeTimeZone, DEFAULT_HOME_TIME_ZONE)` (section 3.4) | D6 |
| Weigh-in date | `localDateOf(at, zone)`; `dailyWeightsKg` already does this | WT-05, trend.ts |
| Food, water and symptom day | `localDateOf(at, zone)` (calendar midnight) | FL-*, FL-15 |
| Drinking day | `drinkingDayOf(at, zone, settings.drinkingDayCutoverMinutes)` (section 3.3) | C21, HS-05, HS-06 |
| Consecutive drinking days | `areConsecutiveDrinkingDays` (section 3.3): a date skipped by a time-zone change never breaks a run | HS-06, C21 |
| Alcohol day note's day | the stored `date` | C05 |
| Fast length | `endedAt ?? now` minus `startedAt` in milliseconds: real elapsed time, correct across daylight saving | DATA_MODEL, FS-03 |
| Fast over 24 h | elapsed **strictly greater** than 86,400,000 ms | HS-02, C30 |
| Day a fast is credited to (streak) | `localDateOf(endedAt, endedTimeZone)`, when elapsed ≤ 24 h | C63 |
| Kickstart day N, scheduled and effective last day, days used | section 4.5 (`kickstart.ts`) | C08, C45, C59, WT-08 |
| Display week | Monday-start week containing the drinking day (alcohol) or local date (everything else), labelled as such | C21 point 2 |
| Help-card week | the rolling 7 drinking days ending today | C21 point 2 |
| "Returns monthly" | 30 × 24 h after `card_state.dismissedAt` | C21 point 3, C44 |
| "Collapsed for the day" | until `collapsedUntil(dismissedAt, dismissedTimeZone, boundary)` (section 3.5) | C44, C46 |
| Cholesterol check-ins, electrolyte fortnight | elapsed 24-hour periods since `firstLowCarbAt` / `carbCeilingStartedAt` | C109, C72 |
| Garden "days left" | `perishabilityDays − daysBetween(harvestedAt, today)` when both are set | DATA_MODEL, NU-07 |
| Backup due | elapsed time since `settings.lastBackupAt` (section 12) | BK-03 |

### 3.3 Drinking day
```ts
/** Local wall-clock date and minutes after midnight of an instant in a zone (export the helper util/time already has). */
export function localWallClockOf(at: Instant, timeZone: TimeZone): { date: LocalDate; minutes: number };

/** Drinks before the cut-over count toward the previous evening (C21). Never subtract hours from the instant. */
export function drinkingDayOf(at: Instant, timeZone: TimeZone, cutoverMinutes: number): LocalDate {
  const { date, minutes } = localWallClockOf(at, timeZone);
  return minutes < cutoverMinutes ? addDays(date, -1) : date;
}

/** How many drinking days a change of zone skipped at instant `at` (0 when nothing was skipped). */
export function skippedDrinkingDays(at: Instant, from: TimeZone, to: TimeZone, cutoverMinutes: number): number {
  return Math.max(0, daysBetween(drinkingDayOf(at, from, cutoverMinutes), drinkingDayOf(at, to, cutoverMinutes)));
}

/** Two drinking days that both have drinks are consecutive when no day the owner lived through lies between them. */
export function areConsecutiveDrinkingDays(
  earlier: { day: LocalDate; timeZone: TimeZone },               // zone of that day's last drink
  later: { day: LocalDate; firstAt: Instant; timeZone: TimeZone }, // first drink of the later day
  cutoverMinutes: number,
): boolean {
  const gap = daysBetween(earlier.day, later.day);
  return gap >= 1 && gap <= 1 + skippedDrinkingDays(later.firstAt, earlier.timeZone, later.timeZone, cutoverMinutes);
}
```
It works on wall-clock minutes, not by subtracting 5 h from the instant, so the daylight-saving nights come out right. On the New Zealand autumn night (5 April 2026), 02:30 happens twice; both readings fall before 05:00 and go to 4 April. With a cut-over of 0 the drinking day is the calendar date. Every record uses its own recorded zone, so drinks logged while travelling land on the day the owner experienced.

Crossing the date line westward skips a calendar date (for example Honolulu to Auckland): no drink can be logged on it, so a plain calendar count would break a 7-day run and hide the HS-06 card. `areConsecutiveDrinkingDays` treats the skipped date as absent from the owner's timeline. A date the owner actually lived through with nothing logged still breaks the run (C21 point 4 counts unlogged days as alcohol-free). Item 28 builds the consecutive-days trigger on this function.

### 3.4 Zones when reading
```ts
export const DEFAULT_HOME_TIME_ZONE = 'Pacific/Auckland';
/** The first candidate this device's Intl recognises, ending with 'UTC'. fallback is true when the first candidate was not usable. */
export function resolveZone(...candidates: string[]): { timeZone: TimeZone; fallback: boolean };
```
- A record's zone is `resolveZone(record.timeZone, settings.homeTimeZone, DEFAULT_HOME_TIME_ZONE)`. Every derivation in section 3.2 uses it, so a zone that this browser's time-zone data does not know (for example one recorded under newer data while travelling, then imported into an older browser, the C48 laptop Guest window, or Node) never throws. When `fallback` is true, the screen says "Times shown in your home time zone" next to the affected entries.
- New records take the current device zone: `deviceTimeZone(resolveZone(settings.homeTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone)`. Core's `deviceTimeZone` already refuses `Etc/Unknown` and anything `Intl` rejects, so a record is never written with an unusable zone.

### 3.5 Day boundaries for cards
```ts
/** End of a "collapsed for the day" dismissal: the first boundary after dismissedAt, read in the zone the dismissal was made in. */
export function collapsedUntil(dismissedAt: Instant, dismissedTimeZone: TimeZone, boundaryMinutes: number): number /* ms */ {
  const zone = resolveZone(dismissedTimeZone, DEFAULT_HOME_TIME_ZONE).timeZone;
  const { date, minutes } = localWallClockOf(dismissedAt, zone);
  return zonedWallTimeToInstant(minutes < boundaryMinutes ? date : addDays(date, 1), boundaryMinutes, zone);
}
```
`boundaryMinutes` is 0 (calendar midnight) for every card except `alcohol-help`, which uses `settings.drinkingDayCutoverMinutes`, so its dismissal lasts until the next drinking day starts. The card is collapsed while `now < collapsedUntil(…)`. Because the end is a fixed instant, travelling cannot stretch a one-day dismissal past about 25 hours.

### 3.6 Range queries
Records are indexed by their instant. To read every record whose local date (or drinking day) falls in `[from, to]`, query the `at` index over `utcRangeCovering(from, to)`, which is `[from − 2 days at 00:00Z, to + 3 days at 00:00Z)`, then filter exactly in core with the derivations above. Two days covers any UTC offset (−12 h to +14 h) plus the largest cut-over (6 h). Data is small (one person, a few thousand rows a year), so the margin costs nothing.

---

## 4. Stores, version 1

### 4.1 Overview

| Store | Primary key | Other indexes | In backup | Seeded at creation | First written by item |
|---|---|---|---|---|---|
| profile | `id` (`'singleton'`) | — | yes | yes (defaults) | 13 |
| readiness | `questionId` | — | yes | no | 13 |
| targets | `id` (`'singleton'`) | — | yes | yes (defaults) | 13, 21 |
| settings | `id` (`'singleton'`) | — | yes | yes (defaults) | 12 |
| kickstart_periods | `id` | `startedAt` | yes | no | 14 |
| kickstart_checks | `id` | `periodId`, `askedAt` | yes | no | 14 |
| weights | `id` | `at` | yes | no | 13 (onboarding weight), 14 |
| fasts | `id` | `startedAt` | yes | no | 15 |
| symptom_log | `id` | `at` | yes | no | 15 |
| water_log | `id` | `at` | yes | no | 23 |
| steps_log | `date` | — | yes | no | 23 |
| ingredients | `id` | `name` | yes | no (dataset in code) | 23 |
| ingredient_overrides | `seedId` | — | yes | no | 41 (and any seed correction) |
| recipes | `id` | `title` | yes | no (dataset in code) | 20, 22 |
| plan_days | `date` | — | yes | no | 15 (per-day eating windows, with no meals), 22 |
| food_log | `id` | `at` | yes | no | 23 |
| garden | `id` | `ingredientId` | yes | yes (silverbeet) | 13, 19 |
| garden_photos | `gardenId` | — | **no (device only)** | no | 19 |
| pantry | `id` | `ingredientId` | yes | no | 19 |
| sessions | `id` | `date` | yes | no | 27 |
| beverages | `id` | `sortOrder` | yes | yes (default preset) | 28 |
| drinks_log | `id` | `at` | yes | no | 28 |
| alcohol_day_notes | `date` | — | yes | no | 28 |
| alcohol_milestones | `id` | `fromDate` | yes | never (HS section 5) | 28 |
| grocery_lists | `id` | `createdAt` | yes | no | 24 |
| transfer_pairings | `id` (`'singleton'`) | — | **no (device only)** | no | 30 |
| card_state | `[cardId+trigger]` | — | yes | no | 12 (backup reminder), 14, 15, 22, 28 |
| audit | `id` | `at`, `[table+recordId]` | yes | no | 24 (and migrations) |

`BACKUP_TABLES_BY_VERSION[1]` lists the 26 stores marked yes, in the order above. `DEVICE_ONLY_TABLES_BY_VERSION[1] = ['garden_photos', 'transfer_pairings']`. `BACKUP_TABLES` and `DEVICE_ONLY_TABLES` are the current version's entries. A test asserts that the two lists together are exactly the store names, for every version.

Indexed fields are never null for the rows that need finding: IndexedDB leaves out rows whose index value is null, which is intended for `garden.ingredientId` and `pantry.ingredientId`. Booleans cannot be indexed, and none are. The running fast is found as `fasts.orderBy('startedAt').last()` with `endedAt === null`; section 5 guarantees that only the latest fast can be running.

### 4.2 Dexie schema strings, version 1
```ts
// packages/core/src/storage/tables.ts — strings only; core does not depend on Dexie.
export const DB_NAME = 'diet';
export const STORES_V1 = {
  profile: 'id',
  readiness: 'questionId',
  targets: 'id',
  settings: 'id',
  kickstart_periods: 'id, startedAt',
  kickstart_checks: 'id, periodId, askedAt',
  weights: 'id, at',
  fasts: 'id, startedAt',
  symptom_log: 'id, at',
  water_log: 'id, at',
  steps_log: 'date',
  ingredients: 'id, name',
  ingredient_overrides: 'seedId',
  recipes: 'id, title',
  plan_days: 'date',
  food_log: 'id, at',
  garden: 'id, ingredientId',
  garden_photos: 'gardenId',
  pantry: 'id, ingredientId',
  sessions: 'id, date',
  beverages: 'id, sortOrder',
  drinks_log: 'id, at',
  alcohol_day_notes: 'date',
  alcohol_milestones: 'id, fromDate',
  grocery_lists: 'id, createdAt',
  transfer_pairings: 'id',
  card_state: '[cardId+trigger]',
  audit: 'id, at, [table+recordId]',
} as const;
```
All primary keys are inbound strings: no auto-increment, so imported keys never collide or renumber. Store names are snake_case, as in DATA_MODEL. Field names are camelCase, matching the core types (`volumeMl`, `abvPercent`, `energyKj`, `timeZone`). DOC_REVIEW's snake_case names map one to one: `goal_kg` → `goalKg`, `kickstart_opt_in` → `kickstartOptIn`, and so on.

### 4.3 Shared shapes and constants

**Safety and range constants (`limits.ts`).** These are never stored; stored user values are bounded by them.

| Constant | Value | Serves |
|---|---|---|
| `FLOOR_KJ` | 5000 | HS-10, HS-25, C50, C108 |
| `MAX_RAISED_FLOOR_KJ` | 20000 | C108 (the optional floor can only go up) |
| `KICKSTART_MAX_DEFICIT_PCT` | 30 | HS-25, C61 |
| `STEADY_DEFICIT_PCT` | `{ min: 15, max: 20 }`, default 15 | DECISIONS (C55/C61/C65 row), C45 |
| `KICKSTART_NET_CARBS_G` | 20 | DECISIONS (Kickstart row), C45 |
| `NET_CARB_CEILING_G` | `{ min: 20, max: 50 }`, default 30 | HS section 4 |
| `MODERATE_NET_CARB_CEILING_G` | `{ min: 50, max: 130 }`, default 100 | C70 |
| `FIBRE_GUIDE_G` | `{ min: 10, max: 70 }` (the stored override; null means the NRV default by sex, chosen at item 21) | C70, HS section 4 |
| `KICKSTART_DAYS` | 21 | HS section 2 |
| `KICKSTART_EXTENSION_DAYS` | 7 | HS section 4, C59 |
| `KICKSTART_MAX_EXTENSIONS` | 3 (across all periods) | DECISIONS (C08 row) |
| `KICKSTART_MAX_TOTAL_DAYS` | 42 (across all periods) | DECISIONS (C08 row, "six weeks in all"), D27 |
| `KICKSTART_OFFER_DAYS` | 3 (extension offered and checked only in the last 3 local days) | C59 |
| `PROTEIN_LIMITS_G`, `DEFAULT_PROTEIN_RANGE_G` | existing in baseTargets.ts (80–200; 120–140) | PLAN 7, C65 |
| `SAT_FAT_BUDGET_PCT` | `{ min: 5, max: 10 }`, default 10 | HS section 4, C71 |
| `RAPID_LOSS_THRESHOLD_G_PER_WEEK` | `{ min: 750, max: 1000, step: 50 }`, default 1000 | C46 |
| `RAPID_LOSS_WEEKS` | `2 \| 3`, default 3 | C46 |
| `DRINKING_DAY_CUTOVER_MINUTES` | `{ min: 0, max: 360, step: 30 }`, default 300 | C21 |
| `MAX_PLANNED_FAST_MINUTES` | 1440 (= core `MAX_PLANNED_FAST_HOURS` × 60) | HS section 3, C30 |
| `RELAY_TTL_MS` | 900,000 (15 minutes) | DECISIONS (relay row), C52 |
| `PBKDF2_IMPORT_MIN_ITERATIONS` | 600,000, **fixed forever** | C99, section 10.4 |
| `PBKDF2_EXPORT_ITERATIONS` | 600,000 (may rise in a later version) | C99 |
| `PBKDF2_MAX_ITERATIONS` | 10,000,000 (may rise, never fall) | section 10.4 |
| `MAX_BACKUP_FILE_BYTES` | 52,428,800 (50 MiB) | section 10.6 |

**`Nutrients`** is the core interface, unchanged. Its `carbsG` is always available carbohydrate (C01). There are two sets of limits:
- per 100 g (ingredients and override nutrition): energyKj 0–3,800; proteinG, fatG, saturatedFatG, carbsG, sugarsG, fibreG each 0–100; sodiumMg 0–40,000;
- per item (a recipe serve or a logged entry): energyKj 0–50,000; proteinG, fatG, saturatedFatG 0–1,000; carbsG, sugarsG 0–2,000; fibreG 0–500; sodiumMg 0–100,000.

No cross-nutrient rule is applied (such as saturated fat ≤ fat): label figures are often inconsistent, and refusing a backup over one would do harm.

**Unknown nutrients (D35).** `NutrientKey = keyof Nutrients`. Wherever a `Nutrients` value is stored, a sibling field `unknownNutrients: NutrientKey[]` (unique, in `NUTRIENT_KEYS` order, never all eight) lists the figures that are not complete. For a single food (an ingredient, an override's nutrition, a label or estimate log entry) each listed figure is stored as `0`. For a computed figure (a recipe serve, or a log entry from a recipe or plan) each listed figure is the sum of the parts that are known, which is a lower bound. Either way, a listed figure is never used as if it were complete. `nutrientCompleteness(entries)` gives every daily total a count per nutrient of the entries that lack it ("2 entries without carbs"), the way `totalDrinkEnergy` counts drinks with unknown energy. A carb or saturated-fat bar with such entries reads "at least N g" and never shows the ceiling or budget as met. This replaces the separate fibre-unknown flags: fibre "not on label" (C68) is `'fibreG'` in the list.

*Refinement of a review suggestion:* the review proposed "stored as 0 and never used as a value" everywhere. That is kept for single foods; for computed figures the known part is kept as a lower bound instead of being thrown away, because "at least 18 g, 1 entry incomplete" tells the owner more than "0 g, 1 entry incomplete" and is still never shown as complete.

**`StoredDrinkLabel`** (extends core `DrinkLabel`, so a stored beverage can be passed straight to `standardDrinks()` and `drinkEnergy()`):

| Field | Type and unit | Null | Validation | Serves |
|---|---|---|---|---|
| volumeMl | Num (0–3000], mL | no | the measure the label was read for | NN-01, C92 |
| abvPercent | Num 0–100, % | no | 5 means 5% | core |
| standardDrinks | Num 0–100 | yes | the printed figure | AL-02 |
| kcal | Num 0–5000, kcal per serve | yes | null = not on label. 0 is allowed (core `drinkEnergy` accepts it and flags `labelImplausible`) | NN-01, C92 |
| energyAsEntered | `{ value: Num 0–20920; unit: 'kcal' \| 'kJ' }` | yes | null iff `kcal` is null; `unit 'kcal'` ⇒ `kcal === value`; `unit 'kJ'` ⇒ `kcal === kjToKcal(value)` (`Object.is`) | C31 (as-entered provenance) |
| origin | `'owner' \| 'preset-default'` | no | `'preset-default'` only on the seeded preset until the owner saves the label; the screen then says "Check against your can's label" | NN-01, D42 |

A label with both `standardDrinks` and `kcal` null is refused; store `label: null` instead.

**`EatingWindow`** is the core `{ start: ClockTime; end: ClockTime }`, and must pass `windowLength()` (start ≠ end, at least `MIN_EATING_MINUTES` = 60).

**Allergens (C43, FSANZ Standard 1.2.3).**
`Allergen = 'peanut' | 'tree-nut' | 'milk' | 'egg' | 'fish' | 'crustacea' | 'mollusc' | 'sesame' | 'soy' | 'lupin' | 'wheat' | 'barley' | 'oats' | 'rye' | 'sulphites'`, used on ingredients and recipes.
`UserAllergen = Allergen | 'gluten'`, used on the profile, where `'gluten'` expands to wheat, barley, oats and rye (`expandUserAllergens`).

**Other enums:** `DietMode = 'keto' | 'moderate-low-carb' | 'balanced'`; `ActivityLevel` (core); `FastingPresetId` (core); `NutritionSource`, `Confidence`, `CarbBasis` (core); `YesNo = 'yes' | 'no'`. Core MUST export each union's values as a frozen array beside the type (`NUTRITION_SOURCES`, `CONFIDENCES`, `CARB_BASES`, `FASTING_PRESET_IDS`; `ACTIVITY_FACTORS` keys already exist), with a type-level test that the array and the union agree. Validators read these arrays, and they are part of the fingerprint (section 9.2).

### 4.4 You: profile, readiness, targets, settings

**profile** (one row; DATA_MODEL profile, C04, C24, C25, C42, C43, C45, C51, C72, C109)

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | `'singleton'` | no | `'singleton'` | literal | — |
| heightCm | Num, cm | yes | null | 120–230 (the energy estimate's limits) | estimate, BMI floor HS-01 |
| sex | `'female' \| 'male'` | yes | null | enum. Null only until entered (item 13 requires it before `onboardingCompletedAt` is set, C25). Consumers map null through `profileMapping.ts`: the energy estimate uses core `EstimateSex` `'unspecified'` (the midpoint constant, which C24 point 4 and C25 both allow), and alcohol uses the women's figures | C25, C24 point 4, C10 |
| birthYear | Int | yes | null | 1900–2099 (a static range; the validator never reads the clock). The repository refuses a year after the current one ("future-year"). If a stored year is later than today's year when read, `readinessInputFromRows` treats the minimum age as 0, which gates as under 18 | C24, age.ts |
| activityLevel | ActivityLevel | no | `'active-job'` | own key of ACTIVITY_FACTORS | HS section 4 |
| equipmentBands | Bool | no | false | — | DECISIONS (bodyweight default) |
| equipmentDumbbells | Bool | no | false | — | same |
| jogOptIn | Bool | no | false | — | C51 |
| householdSize | Int, people | no | 1 | 1–20 (grocery quantities only) | HS-23 |
| dietMode | DietMode | no | `'keto'` | enum | HS section 4, FL-04 |
| carbCeilingStartedAt | Instant | yes | null | set on each switch into keto and at Kickstart start; counted in elapsed time (section 3.1). It drives only the C72 electrolyte reminder; never the Kickstart phase, notes, band or rapid-loss suppression, which come only from kickstart_periods (D27) | C72 |
| firstLowCarbAt | Instant | yes | null | set once, never reset; counted in elapsed time | C109 |
| kickstartOptIn | Bool | no | true | the onboarding choice; it does not start a period by itself. Item 13 preselects `false` while Q3 is gated (C06: "Kickstart defaults off") | C42, C45, C06 |
| goalKg | Num, kg | yes | null | 20–400. The BMI 18.5 floor is checked when the goal is entered (item 14) and again whenever it is used, not here (section 5) | C04, C42 |
| goalSetAt | Instant | yes | null | — | C42 |
| goalReferenceKg | Num, kg | yes | null | 20–400; the current weight when the goal was set (lower of the latest weigh-in and the 7-day average, C24) | C42, C24 |
| allergens | UserAllergen[] ≤ 16 | no | `[]` | unique | C43, HS-24 |
| dislikeIngredientIds | RefId[] ≤ 200 | no | `[]` | unique | C43 |
| dislikeTerms | Text(1–40)[] ≤ 50 | no | `[]` | unique ignoring case | C43 |
| glutenFreeHousehold | Bool | no | false | — | C43, FL-07 |
| budgetNote | Text(1–200) | yes | null | — | C43 |
| storeName | Text(1–80) | no | `PAK'nSAVE Pāpāmoa` | — | GL-08 |
| createdAt | Instant | no | creation time | — | DATA_MODEL |
| updatedAt | Instant | no | creation time | ≥ createdAt | DATA_MODEL |

Invariant: `goalKg`, `goalSetAt` and `goalReferenceKg` are either all null or all non-null. The nearer milestone (at most 20% below the current 7-day average) is **derived**, never stored (DECISIONS C04 row). The goal is hidden, never deleted, while readiness Q5 (or Q1) is gated (C42). There is no `units` field: units are fixed metric (PLAN 7, "kg, cm, mL, kJ with kcal shown"). The onboarding current weight is written as the first `weights` row, with `source: 'onboarding'` (C42). Only the birth year is stored, not the month (D31). Food-safety substitutions have no field: they are deferred and off (D33).

**readiness** (one row per answered question; HS section 1, C41, C58)

| Field | Type | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| questionId | `'q1' … 'q7' \| 'prescriberAgreed' \| 'gpExerciseDiscussed'` | no | — | enum; primary key | HS section 1, RD-03, RD-05 |
| answer | YesNo | no | — | For the two confirmations, `'yes'` means confirmed | C41 |
| wordingVersion | Int | no | `READINESS_WORDING[questionId]` | 1 up to the current version for that id. A row with an older version counts as unanswered | C41, C58 |
| answeredAt | Instant | no | — | — | RD-06 |

No row means unanswered, and unanswered counts as gated. Rows are never seeded and never hold an "unanswered" value. Version 1 wording numbers are all 1. Q7's v1 wording is "Do you drink alcohol most days, or heavily at weekends?" (DECISIONS C58 row); the text itself lives in health.ts at item 13. A confirmation counts only under the rule in section 13.2, and re-answering its question deletes it (D29).

**targets** (one row; DATA_MODEL targets, as changed by C45, C50, C55, C61, C65, C70, C108)

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | `'singleton'` | no | `'singleton'` | — | — |
| proteinRangeG | `{ min: Num; max: Num }`, g/day | no | `{ min: 120, max: 140 }` | min 80–200, max from min to 200 (the `assertValidProteinRange` rule, written as a predicate) | PLAN 7, C65 |
| netCarbCeilingG | Int, g/day | no | 30 | 20–50; the owner's own keto ceiling (the 20 g during Kickstart is derived) | HS section 4, C45 |
| moderateNetCarbCeilingG | Int, g/day | no | 100 | 50–130; used in moderate low-carb mode. Balanced mode has no ceiling | C70, PLAN 7, FL-04 |
| saturatedFatBudgetPct | Int, % of the day's planned energy | no | 10 | 5–10 | HS section 4, C71 |
| kickstartDeficitPct | Int, % | no | 30 | 0–30 (it can be lowered, never raised) | C61, HS-25 |
| steadyDeficitPct | Int, % | no | 15 | 15–20 | DECISIONS, C45 |
| energyFloorKj | Int, kJ | no | 5000 | 5000–20000; it can only be raised | C50, C108, HS-10 |
| fibreGuideG | Int, g/day | yes | null | 10–70; null means the NRV adequate intake for the profile's sex (item 21) | C70, HS section 4, item 21 |
| waterTargetMl | Int, mL/day | yes | null | 1000–6000; null means the sex-based default (item 21) | C70, DATA_MODEL |
| fastingPreset | `FastingPresetId \| 'custom'` | yes | null | Null means no fasting plan: not chosen yet, or gated at onboarding (C07) | HS section 3 |
| eatingWindow | EatingWindow | yes | null | null iff fastingPreset is null; if fastingPreset is not `'custom'`, `windowLength(eatingWindow).eatingMinutes` must equal that preset's | HS-17, C55 |
| presetChosenBy | `'kickstart-default' \| 'default' \| 'user'` | yes | null | null iff fastingPreset is null. Records whether the preset is an untouched default (C55's day-22 rule) | C55 |
| refluxPreferEarlier | Bool | no | false | — | HS section 3, FL-11 |
| refluxPreferSplit | Bool | no | false | — | HS section 3, FL-11 |
| updatedAt | Instant | no | creation time | — | — |

Removed from the DATA_MODEL `targets` list, with reasons: *phase*, *phase started at* and *kickstart extensions count* are derived from kickstart_periods and kickstart_checks (C45). The single *deficit %* is split into Kickstart and Steady (C45). *Energy floor* stays as a raise-only optional floor (C50). When readiness later gates fasting, the stored preset is **kept but ignored** (RD-06: "no data lost"); C07's "no preset stored" applies only at onboarding.

**settings** (one row; DATA_MODEL settings, C21, C41, C46, C51, C53)

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | `'singleton'` | no | `'singleton'` | — | — |
| onboardingCompletedAt | Instant | yes | null | replaces "onboarding done" | C41, BK-03 |
| alcoholNoticeAckAt | Instant | yes | null | — | HS-20, C53 |
| profileConfirmedAt | Instant | yes | null | set when screen 1d is saved | C41, RD-07 |
| scheduleConfirmedAt | Instant | yes | null | set when screen 1e is saved (screen 1e is skipped, and this stays null, while fasting is gated) | C41, C07 |
| gardenConfirmedAt | Instant | yes | null | set when screen 1f is saved or skipped ("Skip is allowed") | C41, UX 1f |
| lastBackupAt | Instant | yes | null | written only when the owner confirms they can see an exported file (section 10.5) | BK-03, DATA_MODEL |
| theme | `'system' \| 'light' \| 'dark'` | no | `'system'` | — | DATA_MODEL, item 37 |
| textSize | `'standard' \| 'large' \| 'largest'` | no | `'standard'` | — | DATA_MODEL, item 37 |
| homeTimeZone | TimeZone | no | `'Pacific/Auckland'` | the fallback for the device zone (section 3.4) | section 3 |
| drinkingDayCutoverMinutes | Int, minutes after midnight | no | 300 | 0–360, a multiple of 30 | C21 |
| rapidLossThresholdGPerWeek | Int, g/week | no | 1000 | 750–1000, a multiple of 50 (whole grams avoid float steps) | C46, HS-11 |
| rapidLossConsecutiveWeeks | `2 \| 3` | no | 3 | — | C46 |
| rapidLossExplanationReadAt | Instant | yes | null | must be non-null whenever the threshold ≠ 1000 or the weeks ≠ 3 ("adjustable only after reading the explanation") | C46, HS section 2 |
| alcoholGuidanceSet | `'nz-women' \| 'nz-men'` | yes | null | Null follows the profile sex. At use, the stricter of this and the set for the profile sex (women's when sex is null) applies | C46, HS-05, C25 |
| weeklyPattern | `{ weekday: Int 1–7; templateIds: SeedId[] ≤ 3 }[]` of exactly 7 | yes | null | each ISO weekday (Monday = 1) once; `templateIds` unique; an empty list is a rest day. Several ids allow a strength session and the optional beach walk on one day. Null means the seed default pattern | C51, HS section 6, UX 4a |
| hiddenSeedIds | SeedId[] ≤ 500 | no | `[]` | unique. Seed recipes and ingredients the owner has hidden from suggestions | D3 |

There is no `updatedAt` in settings: `lastBackupAt` is bookkeeping and must not change any other field (section 10.8).

**Resuming onboarding (C41, RD-07).** Item 13 resumes at the first step that is not done, in this order: the alcohol notice (`alcoholNoticeAckAt`), readiness (`missingReadinessAnswers` is not empty), profile (`profileConfirmedAt`), eating schedule (`scheduleConfirmedAt`, skipped while fasting is gated), garden (`gardenConfirmedAt`), then `onboardingCompletedAt`. Welcome is a non-functional introduction and needs no field.

### 4.5 Phase: kickstart_periods, kickstart_checks

Both stores are written **only** through the kickstart repository (section 8.4). Checks are append-only; a period is never removed, and only `endedAt`, `endedTimeZone` and `endReason` can be set, once.

**kickstart_periods** (C08, C45, C56 as decided in DECISIONS: Kickstart runs only while the keto ceiling is on and Kickstart was chosen)

| Field | Type | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| startedAt | Instant | no | — | day 1 is its local date | C45 |
| timeZone | TimeZone | no | — | — | C21 |
| endedAt | Instant | yes | null | > startedAt; written **only** for an early end, so its local date is on or before the scheduled last day | C08, C56 |
| endedTimeZone | TimeZone | yes | null | null iff endedAt is null | C21 |
| endReason | `'left-keto' \| 'readiness-gated' \| 'user-ended'` | yes | null | null iff endedAt is null | C56, C45 |

**Period arithmetic** (`kickstart.ts`; all local dates, each read in its record's own zone through `resolveZone`):
- `day1(P) = localDateOf(P.startedAt, P.timeZone)`; Kickstart day N on `today` is `daysBetween(day1, today) + 1`.
- `extensions(P)` = the number of P's checks with outcome `extended`.
- `scheduledLastDay(P) = addDays(day1, KICKSTART_DAYS + KICKSTART_EXTENSION_DAYS × extensions(P) − 1)`.
- `effectiveLastDay(P)`: for a period with no `endedAt`, the scheduled last day. For an early end, the later of the end's local date in `endedTimeZone` and its local date in the period's own `timeZone`, then capped at the scheduled last day and never before day 1. The day of an early end counts as used, and a period ended in a zone behind its start zone (Kiritimati to Pago Pago) never counts fewer days than passed where it started.
- `effectiveDays(P) = daysBetween(day1, effectiveLastDay(P)) + 1`, so always between 1 and the scheduled length. A running period counts its full scheduled length.
- `kickstartPeriodState(P, e, at, deviceZone, home?)` (the one function item 14's phase engine reads): `'ended'` when `endedAt` is set; otherwise `'not-started'` while day 1 has not arrived at `at` in the device zone or in the start zone (a start dated ahead: no Kickstart figures and no rapid-loss exemption before the period really starts); `'past-last-day'` once `at` is after the scheduled last day in the device zone or in the start zone (the natural end); otherwise `'running'`. `kickstartRunningAt(...)` is `kickstartPeriodState(...) === 'running'`.
- `recordsMoreKickstart(a, b)`: whether history `a` records more Kickstart than `b`: more days, or as many days and more extensions, or as many of both and a later stop-sign check. A restore never replaces a history with one that records less (section 10.6 step 9).
- `extensionWindow(P, e)` = the local dates from `addDays(L, −2)` to `L`, where `L` is the scheduled last day with `e` extensions.

A natural end is derived from the scheduled last day and is never written, so the WT-08 flip happens even with no launch on day 22. A new period starts only by explicit choice: a diet-mode switch never creates one (C56, FL-04).

**The restart rule (D27).** C08 leaves the restart rule to the owner and the owner delegated it to the conservative option. The total of `effectiveDays` over all periods is at most `KICKSTART_MAX_TOTAL_DAYS` (42, the "six weeks in all" of the DECISIONS C08 row), and extensions over all periods are at most 3. `startPeriod()` refuses a new period unless a full 21 days still fit (days already used ≤ 21); an extension is refused if it would take the total past 42 days or past 3 extensions. So a first period of 21 days allows exactly one more 21-day period with no extensions, and a first period with any extension allows no second period. Item 14 additionally treats only the first 21 cumulative Kickstart days ever as rapid-loss-free: every later Kickstart day counts toward HS-11, so a restart never suppresses the GP check-in again.

*Not adopted:* shortening a new period to whatever days remain (`min(21, 42 − used)`). A Kickstart shorter than three weeks is not a documented phase, its notes and band would be wrong, and refusing is the more conservative of the two.

**kickstart_checks** (the "how do you feel" check before an extension; C59)

| Field | Type | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| periodId | Id | no | — | must exist in kickstart_periods (section 5) | C59 |
| askedAt | Instant | no | — | inside the period's current extension window and before its `endedAt` (section 5) | C59, C08 |
| timeZone | TimeZone | no | — | — | C21 |
| dizzyOnStanding | YesNo | no | — | — | HS section 2 stop-signs |
| palpitations | YesNo | no | — | — | same |
| crampsNotSettling | YesNo | no | — | — | same |
| faintAtWork | YesNo | no | — | — | same |
| energyRating | Int 1–5 | yes | null | recorded only; it never gates anything | C59 |
| sleepRating | Int 1–5 | yes | null | same | C59 |
| outcome | `'extended' \| 'stop-sign'` | no | — | `extended` iff all four answers are `no` | C59, WT-09 |

A check is recorded **only** after the owner taps Extend on the extension offer (the `kickstart-extension` card, section 4.12), because extending is a choice ("You can extend Kickstart one week at a time; the app asks how you feel first", HS section 4). Cancelling the check records nothing. "Not now" on the offer dismisses that offer for good, and the phase flips on schedule. A `stop-sign` outcome shows the stop-sign card expanded (C59) and ends the offers for that period. Extensions are the checks with outcome `extended`; that is the single source of truth, so no count is stored anywhere.

### 4.6 Body logs: weights, fasts, symptom_log, water_log, steps_log

**weights** (core `WeighIn` plus fields; a stored row is assignable to `WeighIn`)

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| at | Instant | no | now | — | DATA_MODEL |
| timeZone | TimeZone | no | device zone | — | C21 |
| kg | Num, kg | no | — | 20–400 (`WEIGHT_LIMITS_KG`) | trend.ts |
| source | `'onboarding' \| 'manual'` | no | `'manual'` | at most one `onboarding` row | C42 |
| note | Note(≤280) | yes | null | — | DATA_MODEL |

**fasts** (DATA_MODEL fasts; symptoms moved to symptom_log per C47)

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| startedAt | Instant | no | — | — | FS-03 |
| timeZone | TimeZone | no | device zone | zone at start | C21 |
| endedAt | Instant | yes | null | > startedAt; null while running. There is no maximum length, because logging must stay honest (HS section 3) | HS-02 |
| endedTimeZone | TimeZone | yes | null | null iff endedAt is null | C63 |
| plannedFastMinutes | Int, minutes | yes | null | 1–1440. `fasts.start()` copies the planned figure only when it is a whole number in that range and otherwise stores null; it never fails because of it (the NZ autumn night legitimately gives 1470). Planning more than 1440 is the planner's refusal (C30), not storage's | HS section 3, C30 |
| snackTime | ClockTime | yes | null | — | DATA_MODEL |
| dinnerTime | ClockTime | yes | null | — | DATA_MODEL |
| note | Note(≤500) | yes | null | — | DATA_MODEL |

No streak is stored; streaks are computed from fasts (C63). The lower bound is 1 minute, not 60, because core `windowLength` accepts eating windows up to 1,439 minutes.

**symptom_log** (C47)

| Field | Type | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| at | Instant | no | now | — | C47 |
| timeZone | TimeZone | no | device zone | — | C47 |
| symptom | `'heartburn' \| 'night-cough' \| 'regurgitation'` | no | — | — | HS section 3 |
| severity | Int 1–3 | yes | null | — | C47 |
| note | Note(≤280) | yes | null | — | C47 |

It is reachable whether or not fasting is enabled (C47). The nudge is the `reflux-gp-nudge` card (section 4.12), derived at item 15.

**water_log**

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| at | Instant | no | now | — | DATA_MODEL |
| timeZone | TimeZone | no | device zone | — | C21 |
| ml | Int, mL | no | 250 | 0–3000; `ml > 0` or `electrolyte` | DATA_MODEL |
| electrolyte | Bool | no | false | — | DATA_MODEL |

**steps_log**

| Field | Type | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| date | LocalDate | no | — | primary key | DATA_MODEL |
| steps | Int | no | — | 0–100,000 | UX 2.5 |
| source | `'manual'` | no | `'manual'` | literal (Health Connect is later) | DATA_MODEL |
| updatedAt | Instant | no | now | — | — |

### 4.7 Food: ingredients, ingredient_overrides, recipes, plan_days, food_log

**`IngredientRecord`** is one shape shared by the ~150-item seed dataset in code (item 18, ids are SeedIds) and the owner's own foods in the `ingredients` store (ids are Ids).

**ingredients** (the owner's own foods: label entries and custom foods)

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | an Id (a SeedId is refused here; seed corrections go in ingredient_overrides) | — |
| name | Text(1–80) | no | — | — | DATA_MODEL |
| aliases | Text(1–80)[] ≤ 10 | no | `[]` | unique | DATA_MODEL |
| aisle | Text(1–40) | no | `'Other'` | — | GL-04 |
| packSizesG | Num (0–50000][] ≤ 10 | no | `[]` | strictly ascending | GL-03, C110 |
| packSizeSource | `'typical' \| 'owner'` | yes | null | null iff packSizesG is empty | C69 |
| packSizeEnteredAt | Instant | yes | null | non-null iff packSizeSource is `owner` | C69 |
| nutrientsPer100g | Nutrients (per-100 g limits) | no | — | carbsG on the available basis; every key in unknownNutrients is 0 | NU-01, C01 |
| unknownNutrients | NutrientKey[] | no | `[]` | section 4.3. Source `label` ⇒ a subset of `['fibreG']` (NZ panels must print the rest, C68); `nz-fcdb` or `usda` ⇒ empty (NU-01); `estimate` ⇒ any, but not all eight | C68, D35 |
| carbBasisAsEntered | CarbBasis | no | `'available'` | the basis the figure was typed or imported on | C01, C68 |
| nutrientBasis | `'raw' \| 'cooked' \| 'as-sold'` | no | `'as-sold'` | — | C67 |
| cookedYield | Num (0–5], cooked g per raw g | yes | null | null iff yieldCitation is null | C67 |
| yieldCitation | Text(1–200) | yes | null | for example the USDA Table of Cooking Yields entry | C67 |
| source | NutritionSource | no | `'label'` | — | HS section 4 |
| sourceCitation | Text(1–200) | yes | null | required when source is `nz-fcdb` or `usda` | C97, item 18 |
| allergens | Allergen[] | yes | null | unique. Null means unknown, the default for every label entry | C43 |
| gardenFlag | Bool | no | false | — | DATA_MODEL |
| seasonMonths | Int 1–12 [] ≤ 12 | no | `[]` | unique, ascending | DATA_MODEL |
| substitutes | RefId[] ≤ 10 | no | `[]` | unique; never its own id | C107 |
| gramsPerEach | Num (0–5000], g | yes | null | — | C110 |
| servingSizeG | Num (0–5000], g | yes | null | — | C68 |
| createdAt | Instant | no | now | — | — |
| updatedAt | Instant | no | now | — | — |

*Partly adopted:* the review suggested a cooked yield of (0–2]. The upper bound is 5 instead, because grains and dried legumes gain weight on cooking (cooked rice is about 2.5–3 times its raw weight), and a cited yield for them must be storable.

**ingredient_overrides** (D2: the owner's corrections to a seed ingredient, stored as patches)

| Field | Type | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| seedId | SeedId | no | — | primary key | C69, item 41 |
| changes | IngredientChange[] 1–11 | no | — | `field` unique within the list | C69, C43 |
| createdAt, updatedAt | Instant | no | now | — | — |

```ts
type IngredientChange =
  | { field: 'name'; value: string }                         // Text(1–80)
  | { field: 'aliases'; value: string[] }                    // as ingredients.aliases
  | { field: 'aisle'; value: string }                        // Text(1–40)
  | { field: 'packSizes'; value: { packSizesG: number[]; enteredAt: Instant } } // 1–10 sizes, ascending; packSizeSource becomes 'owner' (C69)
  | { field: 'nutrition'; value: { nutrientsPer100g: Nutrients; unknownNutrients: NutrientKey[]; carbBasisAsEntered: CarbBasis;
        nutrientBasis: 'raw' | 'cooked' | 'as-sold'; source: NutritionSource; sourceCitation: string | null } } // the ingredients rules apply as a group
  | { field: 'addAllergens'; value: Allergen[] | null }      // can only add; null marks the allergens unknown
  | { field: 'substitutes'; value: string[] }                // RefId[] ≤ 10, never the seed's own id
  | { field: 'gramsPerEach'; value: number | null }
  | { field: 'servingSizeG'; value: number | null }
  | { field: 'seasonMonths'; value: number[] }
  | { field: 'gardenFlag'; value: boolean };
```
- `effectiveIngredient(seed, override)` applies each change over the **current** seed at read time, so a later dataset fix to any field the owner did not change still reaches them. Correcting one pack size no longer freezes the nutrients, citation or allergens.
- **Allergens are never taken from an override alone.** The effective allergens are the union of the current seed's and the override's `addAllergens`; `null` on either side means unknown. A later app update that adds `tree-nut` to a seed therefore still warns, whatever the owner changed (HS-24, C43). An owner cannot remove an allergen a seed lists.
- An override whose seed no longer exists in the dataset is kept but ignored when read.
- Hiding a seed from suggestions is `settings.hiddenSeedIds`, not an override.

**recipes.** The owner's recipes and edited copies. Editing a seed recipe creates a new Id with `derivedFromRecipeId` set to the seed's id, and a seed recipe that has an owner copy is not suggested (the copy is), so editing never leaves the original among the suggestions. The seed recipes (item 20) live in code.

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| title | Text(1–100) | no | — | — | DATA_MODEL |
| serves | Int | no | — | 1–50 | DATA_MODEL |
| timeMinutes | Int, min | yes | null | 0–600 | DATA_MODEL |
| lines | RecipeLine[] 1–60 | no | — | see below | DATA_MODEL, NN-04 |
| method | Text(1–500)[] ≤ 40 | no | `[]` | — | DATA_MODEL |
| tags | Text(1–30)[] ≤ 20 | no | `[]` | unique | DATA_MODEL |
| allergens | Allergen[] | no | `[]` | unique. The recipe's declared allergens: what the owner added, plus the line allergens at save. Retained on edit (HS-24): the repository never saves a list missing an allergen that a line's current effective ingredient carries | HS-24 |
| derivedFromRecipeId | RefId | yes | null | — | HS-24 |
| nutritionPerServe | Nutrients (per-item limits) | no | — | snapshot; listed unknown figures are lower bounds | DATA_MODEL |
| unknownNutrients | NutrientKey[] | no | `[]` | the union of the lines' unknown figures at save | D35 |
| confidence | `'database' \| 'estimate'` | no | — | `'estimate'` iff `sourceMix.estimate > 0`, else `'database'` (the C32 rule written as a data predicate) | C32, FL-02 |
| sourceMix | `{ 'label': Int; 'nz-fcdb': Int; 'usda': Int; 'estimate': Int }` | no | — | each ≥ 0; the sum equals `lines.length` | DATA_MODEL |
| createdAt, updatedAt | Instant | no | now | — | — |

`RecipeLine = { ingredientId: RefId; rawG: Num (0–5000]; cookedG: Num (0–5000] | null; displayAs: Text(1–40) | null }`. Raw and cooked are never conflated (NN-04, C29).

**Recipe allergens when read.** Every allergen check (planner, substitutions, the recipe screen) uses `recipeAllergens(recipe, resolveIngredient)`: the union of the stored `allergens` and the **current** effective allergens of every line's ingredient. If any line's ingredient has unknown allergens, or does not resolve at all (a deleted food, or a seed removed from the dataset), the result is marked `allergensUnknown` and the recipe is never offered as safe for a listed allergen without saying so (C43). `allergensUnknown` is therefore derived, not stored.

**plan_days** (C33: a single household-serves field per meal; no day-level field)

| Field | Type | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| date | LocalDate | no | — | primary key | DATA_MODEL |
| dietMode | DietMode | no | — | the mode the day was planned in | FL-04 |
| meals | PlannedMealRecord[] ≤ 6 | no | `[]` | slots unique | C73 |
| eatingWindow | EatingWindow | yes | null | that day's window when it differs from targets (for example, the accepted 5 pm snack) | C73, C30 |
| updatedAt | Instant | no | now | — | — |

`PlannedMealRecord = { slot: 'breakfast' | 'lunch' | 'meal1' | 'snack' | 'dinner'; recipeId: RefId; myServes: Num 0–10; householdServes: Int 1–50 }`. The limits are those of core (`MAX_MY_SERVES`, `HOUSEHOLD_SERVES_LIMITS`). The record maps to core `PlannedMeal` once `perServe` is resolved from the recipe. Household serves never limit `myServes` (portion.ts).

**food_log**

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| at | Instant | no | now | — | DATA_MODEL |
| timeZone | TimeZone | no | device zone | — | C21 |
| sourceKind | `'plan' \| 'recipe' \| 'label' \| 'estimate'` | no | — | no `ingredient` kind (C32) | DATA_MODEL |
| refId | Text(1–120) | yes | null | plan: `<date>#<slot>`; recipe: a recipe RefId; label: an ingredient RefId; estimate: null | DATA_MODEL |
| name | Text(1–100) | no | — | a snapshot of the name | — |
| grams | Num (0–5000], g | yes | null | — | FL-01 |
| weightBasis | `'raw' \| 'cooked' \| 'as-sold'` | yes | null | null iff grams is null | FL-03, C67 |
| servings | Num (0–10] | yes | null | — | FL-02 |
| nutrients | Nutrients (per-item limits) | no | — | snapshot | DATA_MODEL |
| unknownNutrients | NutrientKey[] | no | `[]` | section 4.3. `label` ⇒ a subset of `['fibreG']`; `estimate`, `recipe`, `plan` ⇒ any, but not all eight | C68, D35 |
| confidence | Confidence | no | — | label ⇒ `label`; estimate ⇒ `estimate`; recipe or plan ⇒ not `label` | FL-01, FL-02 |

Invariant: `grams` or `servings` is non-null (or both). The label form (item 23) requires every nutrient a NZ panel must print (energy, protein, fat, saturated fat, carbohydrate, sugars, sodium; C68 adds sugars to UX 3c) and lets only fibre be marked "not on label". An estimate entry marks every figure it does not know.

### 4.8 Garden and pantry

**garden** (C57, C110; the photo is in garden_photos)

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| ingredientId | RefId | yes | null | for example `seed:silverbeet` | DATA_MODEL |
| name | Text(1–60) | no | — | shown even before the dataset exists | UX 1f |
| amount | Num (0–100000] | yes | null | Null means "available, amount not entered" | C57, NN-06 |
| unit | `'g' \| 'each' \| 'bunch'` | yes | null | null iff amount is null | C110 |
| gramsPerUnit | Num (0–5000], g | yes | null | only when unit is `each` or `bunch` | C110 |
| harvestReady | Bool | no | false | — | DATA_MODEL |
| harvestedAt | LocalDate | yes | null | the day it was picked or became available; "days left" counts from it (section 3.2) | DATA_MODEL, NU-07 |
| perishabilityDays | Int 0–365 | yes | null | days it keeps from `harvestedAt` | DATA_MODEL |
| updatedAt | Instant | no | now | — | DATA_MODEL |

**garden_photos** (device only, never in a backup; item 19 writes it)

| Field | Type | Validation |
|---|---|---|
| gardenId | Id | primary key; must exist in garden |
| mimeType | `'image/jpeg' \| 'image/webp'` | — |
| bytes | ArrayBuffer | 1–1,500,000 bytes (item 19 downscales first) |
| width, height | Int 1–2048 | — |
| takenAt | Instant | — |

**pantry**

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| ingredientId | RefId | yes | null | — | DATA_MODEL |
| name | Text(1–60) | no | — | — | DATA_MODEL |
| amount | Num 0–100000 | yes | null | — | DATA_MODEL |
| unit | `'g' \| 'ml' \| 'each'` | yes | null | null iff amount is null | C110 |
| updatedAt | Instant | no | now | — | DATA_MODEL |

### 4.9 Move: sessions

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| date | LocalDate | no | — | — | DATA_MODEL |
| templateId | SeedId | no | — | a template in code; the beach tag is derived from it (C51) | C51, HS-12 |
| status | `'planned' \| 'done' \| 'rested' \| 'skipped'` | no | `'planned'` | — | DATA_MODEL |
| movements | SessionMovement[] ≤ 20 | no | `[]` | — | EX-04 |
| preCheck | PreCheck | yes | null | — | HS sections 3 and 6 |
| exertion, soreness, energy | Int 1–5 | yes | null | only when status is `done` | UX 4c |
| durationMinutes | Int 0–600 | yes | null | — | C51 (walks) |
| completedAt | Instant | yes | null | non-null iff status is `done` | — |
| timeZone | TimeZone | yes | null | null iff completedAt is null | C21 |
| note | Note(≤500) | yes | null | — | DATA_MODEL |

`SessionMovement = { exerciseId: SeedId; variant: 'standard' | 'easier' | 'harder' | 'band' | 'dumbbell'; sets: Int 1–20; reps: Int 1–500 | null; seconds: Int 1–3600 | null; done: SetResult[] ≤ sets }`, where exactly one of `reps` and `seconds` is non-null.
`SetResult = { reps: Int 1–500 | null; seconds: Int 1–3600 | null }`, with `reps` non-null iff the movement's `reps` is non-null (and likewise `seconds`). Each entry is one ticked set, with what was actually done, so a short set or a hold cut short is recorded as it happened. **Volume** (C76) for a movement is the sum of `done[].reps` (or of `done[].seconds` for holds); the progression cap compares these sums week to week (EX-04, C76).
`PreCheck = { painOrInjury, backOrLegSymptoms, tiredOrPoorSleep, heatOrSun, notHydrated, heavyWorkDay: YesNo }`. Any `yes`, including a heavy physical work day, offers the lighter session or rest (HS section 6; HS section 3: "On days of heavy physical work plus a training session, the pre-session check offers the lighter session or a rest day").

### 4.10 Drinks: beverages, drinks_log, alcohol_day_notes, alcohol_milestones

**beverages** (a stored row is assignable to core `Beverage`)

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| name | Text(1–60) | no | — | — | UX 5a |
| volumeMl | Num (0–3000], mL | no | — | `MAX_SERVE_ML` | core |
| abvPercent | Num 0–100, % | no | — | — | core |
| label | StoredDrinkLabel | yes | null | Label figures stay stored after the volume or ABV is edited, but core then ignores them (`labelIgnored`) | NN-01, C92 |
| sortOrder | Int 0–999 | no | — | — | UX 5a |
| archived | Bool | no | false | a hidden preset; past logs keep their snapshot | — |
| createdAt, updatedAt | Instant | no | now | — | — |

**drinks_log** (C94: per-serve figures stored unrounded; totals are rounded once at read time with `totalStandardDrinks`)

| Field | Type and unit | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| at | Instant | no | now | — | DATA_MODEL |
| timeZone | TimeZone | no | device zone | — | C21 |
| beverageId | RefId | yes | null | soft reference: an owner preset (Id), a drink-picker serve in code (SeedId, item 28), or null | DATA_MODEL |
| name | Text(1–60) | no | — | snapshot | — |
| count | Int | no | 1 | 1–100 (`MAX_ENTRY_COUNT`) | core |
| beverage | core `Beverage` with `label: StoredDrinkLabel \| null` | no | — | the measure and label as they were at logging | DATA_MODEL snapshot |
| stdDrinksPerServe | Num 0–`MAX_SERVE_STANDARD_DRINKS` | no | — | if `stdSource` is `label`, `Object.is(stdDrinksPerServe, beverage.label.standardDrinks)` | C94, HS-04 |
| stdSource | `'label' \| 'calculated'` | no | — | `'label'` iff the label applies (non-null, same `volumeMl` and `abvPercent` as the beverage) and its `standardDrinks` is non-null | AL-02 |
| kcalPerServe | Num 0–5000, kcal | yes | null | equals `beverage.label.kcal` when the label applies, else null; null means unknown, never filled in | NN-01, C92 |

The writer computes the last three fields with core `standardDrinks()` and `drinkEnergy()`; callers never pass them. The validator checks only that they agree with the stored label and lie in range. It does **not** recompute them with core, so a later change inside a core function cannot make old rows invalid (section 9.2).

**The figure that is shown and compared** is `shownStdDrinksPerServe(row)` (`derived.ts`): for a `label` row, the stored label figure (AL-02: the label value wins); for a `calculated` row, `Math.max(row.stdDrinksPerServe, standardDrinks(row.beverage).exact)`. The same single figure feeds the display and the HS-05/HS-06 thresholds through `totalStandardDrinks` (C94), so a corrupted low figure can never hide a help card.

*Partly adopted:* the review suggested taking the maximum for every row. For `label` rows it is not taken, because a printed figure lower than the calculation must still win (AL-02, DATA_MODEL "label value wins if present"); those rows are instead checked against their own stored label.

**alcohol_day_notes** (C05)

| Field | Type | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| date | LocalDate | no | today | primary key: the calendar day the note is about (C05 "local date (unique)") | C05 |
| note | Note(≤1000) | yes | null | — | HS section 5 |
| withdrawalTick | Bool | no | false | — | HS-06, AL-08 |
| enteredAt | Instant | no | now | — | C05 |
| timeZone | TimeZone | no | device zone | — | C05 |
| updatedAt | Instant | no | now | ≥ enteredAt | — |

Invariant: `note !== null || withdrawalTick` (an empty note is deleted rather than stored).

**alcohol_milestones** (HS section 5: entered by the owner or a clinician; the app never creates one)

| Field | Type | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | — | — |
| label | Text(1–80) | no | — | owner text; the UI always shows "your milestone" | HS-19 |
| weeklyStdDrinks | Num 0–200 | no | — | — | DATA_MODEL |
| fromDate | LocalDate | no | — | — | DATA_MODEL |
| enteredBy | `'self' \| 'clinician'` | no | — | — | DATA_MODEL |
| note | Note(≤280) | yes | null | — | DATA_MODEL |
| createdAt | Instant | no | now | — | — |

### 4.11 List and transfer: grocery_lists, transfer_pairings

**grocery_lists** (C52, C84, C111; item 24 fills it in, item 31 sends it)

| Field | Type | Null | Default | Validation | Serves |
|---|---|---|---|---|---|
| id | Id | no | — | the list id in the transfer payload | NN-07, C84 |
| version | Int | no | 1 | 1–1,000,000; the repository adds 1 on every edit | C52, NN-07 |
| createdAt, updatedAt | Instant | no | now | — | GL-07 |
| storeName | Text(1–80) | no | profile.storeName | snapshot | GL-08 |
| sentVersion | Int | yes | null | ≤ version; the version last sent | C52, NN-07 |
| sentAt | Instant | yes | null | null iff sentVersion is null; the phone's clock | DATA_MODEL |
| transferId | Id | yes | null | null iff sentVersion is null. A fresh `crypto.randomUUID()` for every send, never derived from the room id or the key (so the backup leaks nothing about the pairing) | DATA_MODEL, C113 |
| receivedVersion | Int | yes | null | ≤ sentVersion (null when sentVersion is null); the version in the verified acknowledgement | C52 |
| receivedAt | Instant | yes | null | null iff receivedVersion is null; **the phone's own clock** when it verified the acknowledgement. No ordering check against sentAt: clocks can move, and a refused write would lose the "received" status | C52 |
| laptopReceivedAt | Instant | yes | null | null iff receivedVersion is null; the received-at time inside the acknowledgement, from the laptop's clock, stored as reported with no ordering check | C52 |
| items | GroceryItem[] ≤ 500 | no | `[]` | item ids unique within the list | GL-* |

`GroceryItem = { id: Id; origin: 'generated' | 'manual'; ingredientId: RefId | null; text: Text(1–100); quantity: Num (0–100000] | null; unit: 'g' | 'ml' | 'each' | 'pack' | null` (null iff quantity is null)`; packSuggestion: Text(1–60) | null; aisle: Text(1–40); substituteHint: Text(1–60) | null; section: 'to-buy' | 'already-have'; fromGardenG: Num 0–100000 | null; gardenAmountUnknown: Bool` (C57)`; fromPantryG: Num 0–100000 | null` (C111)`; auditNote: Text(1–200) | null; price: Price | null; ticked: Bool }`. `origin: 'manual'` marks a line the owner added, which a rebuild keeps (GL-05).
`Price = { amountNzCents: Int 1–1,000,000; basis: 'line' | 'per_kg' | 'each'; enteredAt: Instant }`. Whole cents keep the amount exact; the CSV prints dollars (C111, NN-05, HS-16).

**Status is derived, not stored** (`groceryListStatus(list, now)` in `derived.ts`): `draft` when `sentVersion` is null; `received` when `receivedVersion === version`; `edited-since-sent` when `sentVersion < version` (the screen adds "the laptop has an older copy" when `receivedVersion` is not null); otherwise `waiting` while `now − sentAt < RELAY_TTL_MS` and `expired` after ("Not confirmed by the laptop. If the list is not on the laptop, send it again.", C52; reworded at item 29, see the DECISIONS relay row). The DATA_MODEL `status` field and its index are therefore dropped.

**transfer_pairings** (device only; item 30 owns the shape and may change it with a schema bump. No backup is ever affected, because the store is never exported.)

| Field | Type | Validation |
|---|---|---|
| id | `'singleton'` | one pairing at a time |
| relayUrl | Text(1–200) | an `https:` URL. It is **not** compared with the configured relay origin here: that is build configuration (C81), so the comparison is made where the pairing is used, and a mismatch reads as "not paired" |
| roomId | Text | 22 characters base64url (128 random bits, C113) |
| key | CryptoKey | AES-GCM, length 256, `extractable === false`, usages encrypt and decrypt (C34) |
| pairedAt | Instant | — |

### 4.12 App state: card_state, audit

**card_state** (C44): one row per card and trigger, with a compound primary key.

| Field | Type | Null | Validation | Serves |
|---|---|---|---|---|
| cardId | CardId | no | a key of `CARD_REGISTRY` | C44 |
| trigger | Text(1–80) | no | matches one of `CARD_REGISTRY[cardId].triggers` | C44: a dismissal applies only to its own trigger |
| firstShownAt | Instant | yes | — | C44 |
| dismissedAt | Instant | yes | — | C44, C21 point 3 |
| dismissedTimeZone | TimeZone | yes | null iff dismissedAt is null | section 3.5 |
| doneAt | Instant | yes | null unless the card's dismissal is 'final' (rule `done-only-for-final-cards`) | C44, C46 |

Invariant: at least one timestamp is non-null; otherwise there is no row. `doneAt` is allowed only on a card whose dismissal is final: the rapid-loss and alcohol help cards can never be finished, and `cardStateRepo.done()` refuses them (`not-final`) as well as the validator (health-rules review).

**Trigger patterns.** A trigger is a literal or one of these patterns: `period:<Id>`, `period:<Id>:<n>` with n 0–2, `date:<LocalDate>`, and `v<N>` with N 2–9999. A card that repeats per Kickstart period, per day or per version stores one row per occurrence. The referenced period is a soft reference.

`CARD_REGISTRY` (version 1). Every card has a dismissal rule. "Collapsed" means hidden until `collapsedUntil` (section 3.5) and shown again afterwards while its condition holds. "Final" means a dismissal or done hides that trigger for good.

| cardId | Triggers | Shown when (built at item) | Dismissal | Boundary |
|---|---|---|---|---|
| `backup-reminder` | `weekly` | section 12.2 (12) | snooze per section 12.2 | elapsed |
| `alcohol-help` | `readiness-q7` | Q7 yes or unanswered (13, 28) | returns 30 × 24 h after dismissal (C21, C58) | elapsed |
| `alcohol-help` | `consecutive-days`, `double-guidance`, `withdrawal-tick` | the HS-06 conditions (28) | collapsed; back the next drinking day while the condition holds (C44). For the withdrawal tick this replaces C05's "returns on a new tick and otherwise monthly" with C44's rule, which shows the card more often (D43) | drinking-day cut-over |
| `cholesterol-checkin` | `day-1`, `day-56`, `day-84` | C109: first run, then 56 and 84 elapsed days after `firstLowCarbAt` (16; item 22 adds the planner side) | final for that trigger; the next trigger still comes | — |
| `electrolyte-reminder` | `daily` | C72 (16; item 22 adds the planner side) | collapsed | calendar midnight |
| `rapid-loss` | `steady` | HS-11 as changed by C08, C46 and D27 (14) | collapsed; back the next day while the condition holds. It can never be turned off (C46), and a dismissal never hides it for longer than the day | calendar midnight |
| `weight-fluctuation-explainer` | `once` | after the first weigh-ins (14) (`fluctuation_explained_at` becomes `doneAt`) | final | — |
| `steady-explainer` | `period:<Id>` | the day that period flips to Steady (WT-08). It carries the C55 "keep 23:1" button when the preset is the untouched Kickstart default (14) | final for that period | — |
| `kickstart-stop-signs` | `period:<Id>` | every day of that Kickstart period; shown expanded after a `stop-sign` check (HS section 2, HS-27 per C17, C59; C102 adds the pharmacist line when Q4 is yes) (14) | collapsed | calendar midnight |
| `kickstart-extension` | `period:<Id>:<n>` (n = extensions already in that period) | in the last 3 local days of the scheduled phase, only while an extension is still allowed (C59, D27, D28) (14) | final for that offer; the phase flips on schedule | — |
| `reflux-gp-nudge` | `rolling` | symptoms on 3 or more days in any 14, or severity higher than the previous week (C47) (15) | hidden for 7 × 24 h, then back while the condition holds | elapsed |
| `single-meal-snack` | `date:<LocalDate>` | the 23:1 "Add the 5 pm snack?" offer for that planned day (FL-12, C73) (15) | final for that date | — |
| `update-notice` | `v<N>` | after an upgrade or an import whose migration changed stored values (section 9.2) (12) | final | — |

A later item that adds a card, a trigger or a dismissal rule edits the registry, and that is a validator change, so it bumps the schema version (section 9).

**One visibility rule for every card (`cardHidden` in core `cards.ts`; health-rules review).** Every card's visibility goes through one function, given the moment, the row and the card's dismissal rule. A dismissal or done time dated after now never hides anything until that moment comes, so a phone clock that ran ahead, or a file dated ahead, cannot silence the rapid-loss card, the alcohol help card or the backup reminder. "Collapsed" hides only while `dismissedAt ≤ now < collapsedUntil`; "returns after" and the backup snooze only while `dismissedAt ≤ now < dismissedAt + their length`; `doneAt` counts only for final cards. On top of that, no bookkeeping time can be written ahead of time in the first place (section 12.3).

**audit** (DATA_MODEL: why a number changed)

| Field | Type | Validation | Serves |
|---|---|---|---|
| id | Id | — | — |
| at | Instant | — | — |
| timeZone | TimeZone | the device zone at write, so "21 Oct" in an audit line is the owner's date (PLAN, NN-06) | C21 |
| kind | `'grocery' \| 'migration'` | `grocery` for automatic list deductions (item 24); `migration` for a value a schema migration changed (section 9.2) | NN-06, C57, D13 |
| table | BackupTableName | — | NN-06 |
| recordId | Text(1–120) | — | — |
| reason | Text(1–500) | for example "300 g silverbeet from garden" | NN-06, C57 |

Audit is append-only: no owner edit and no import writes an audit row.

---

## 5. Cross-record invariants, and rules enforced at use

`checkInvariants(snapshot)` checks these on import, after a migration and in the export self-check. On write, the repository checks the affected rule inside its read-write transaction.

1. **Singletons:** profile, targets and settings each have exactly one row, with id `'singleton'`.
2. **Unique keys:** a backup with a duplicate primary key is refused. Import never lets the last copy win.
3. **Fasts:** at most one has `endedAt === null`, and it has the greatest `startedAt`. Sorted by `startedAt`, each fast starts at or after the previous one's `endedAt` (no overlap).
4. **Weights:** at most one row has `source: 'onboarding'`.
5. **Kickstart** (section 4.5):
   a. every check's `periodId` exists;
   b. periods, sorted by `startedAt`, do not overlap: each period's day 1 is after the previous period's effective last day;
   c. an `endedAt`, when set, falls on or before the period's scheduled last day, read both in `endedTimeZone` and in the period's own `timeZone`;
   d. for each period, its checks sorted by `askedAt` (then id): with `e` the number of earlier `extended` checks in that period, the check's local `askedAt` date lies in `extensionWindow(P, e)`, and `askedAt` is before the period's `endedAt` when set;
   e. within a period, only the last check may have outcome `stop-sign`;
   f. `extended` checks over **all** periods number at most `KICKSTART_MAX_EXTENSIONS` (3);
   g. `effectiveDays` over **all** periods total at most `KICKSTART_MAX_TOTAL_DAYS` (42).
6. **Card state:** every `(cardId, trigger)` pair matches the registry.
7. **Garden photos** (write path only; never imported): `gardenId` exists in garden.

Rules inside one record (the "iff" and "equals" rules of section 4) are part of `validateRow`, not of this list.

**Soft references, not checked:** `beverageId`, `recipeId`, `ingredientId`, `refId`, `templateId`, `exerciseId`, `dislikeIngredientIds`, `substitutes`, `derivedFromRecipeId`, `ingredient_overrides.seedId`, `hiddenSeedIds`, `period:<Id>` triggers and `audit.recordId`. Seed datasets change between app versions, and the owner may delete presets; consumers treat a missing target as "unknown" (for allergens, unknown is never safe).

**Rules that depend on something outside the record are enforced where the value is used, not in storage:**
- the BMI floor for the goal (it depends on height, which can change). If the owner raises their height after setting a goal and the goal falls below BMI 18.5, the goal **number is hidden** and the weight card says "Your long-term goal needs updating for your height", with a link to edit it. The number a rule would refuse is never shown;
- readiness gates over the stored deficits, carb ceilings, preset and Kickstart (section 13);
- the stricter alcohol guidance set;
- readiness confirmations' ordering (section 13.2);
- recipe and ingredient allergens from the current dataset (section 4.7);
- whether a stored zone is known to this browser (section 3.4);
- whether a stored pairing's relay URL matches the configured relay origin (section 4.11);
- the drinks figure shown and compared (section 4.10).

**What this guarantees.** Within one app version, everything the app writes passes its own import: writes, import and the export self-check share `validateRow` and `checkInvariants`, and none of the environment checks of section 2.3 is part of them. Across versions, the migration policy (section 9.2) keeps every older backup importable. The guarantee does not cover a bug, a row written with the middleware bypassed, or a damaged database; for those, export offers an unchecked rescue copy (section 10.5) and the upgrade-failed screen offers a rescue copy (section 9.5).

---

## 6. Seeds

**At database creation** (Dexie `populate`, which also runs again after delete-all), validated by `validateRow` before writing:

| Store | Rows |
|---|---|
| profile | the defaults in section 4.4 (sex, height, birth year and goal null; storeName `PAK'nSAVE Pāpāmoa`; createdAt and updatedAt = now) |
| targets | the defaults in section 4.4 (fastingPreset and eatingWindow null; item 13 sets 23:1 or 22:2) |
| settings | the defaults in section 4.4 (everything null that is nullable; cut-over 300; rapid-loss 1000 g and 3 weeks; `hiddenSeedIds` empty) |
| beverages | one row: name "Zero-sugar premix", 330 mL, 5%, `label = { volumeMl: 330, abvPercent: 5, standardDrinks: null, kcal: 94, energyAsEntered: { value: 94, unit: 'kcal' }, origin: 'preset-default' }`, sortOrder 0 (REQUIREMENTS section 2, UX 5a; the calculated 1.30 standard drinks applies, because the label figure is not given) |
| garden | one row: name "Silverbeet", ingredientId `seed:silverbeet`, amount null, unit null, harvestReady true, harvestedAt null (UX 1f, C57) |

Ids are fresh UUIDs; tests find the seeded rows by name. Nothing else is seeded: no readiness rows (unanswered means gated), no card state, no milestones, ever.

**Datasets in code, not in the database:** ingredients (item 18), recipes (item 20), exercises and session templates (item 26), and the NZ drink-picker serves (item 28), all with SeedIds. The exercises, session templates and default week are `packages/core/data/exercises.json`, checked by the core validator `exerciseDataProblems` on every test run. Item 18 MUST define `seed:silverbeet`. A dataset change in an app update needs no migration, and backups stay small; owner corrections reach the new data through patches (section 4.7).

---

## 7. Opening the database

### 7.1 The open sequence

Dexie 4.4.6 does not report a database that is newer than the code. On a `VersionError` it opens again with no version, which succeeds at the installed version; if the declared schema then lacks a store or an index that is installed, it enters "schema patch mode" and changes the newer database. Its built-in version-change handler also closes with automatic reopening left on. (Both checked in `dist/dexie.mjs` of the 4.4.6 tarball.) Old code meets a newer database in real ways: a stale tab, a rolled-back Pages deploy, or a service worker still serving the old precache. So the app checks the version itself before Dexie runs, and never lets Dexie reopen by itself.

```ts
export async function openDietDb(env: StorageEnv, deps: { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange }):
    Promise<{ status: OpenStatus; db: DietDb | null }> {
  const installed = await installedNativeVersion(deps.indexedDB, DB_NAME); // never creates the database
  if (installed !== null && installed > SCHEMA_VERSION * 10) return { status: 'newer-version', db: null }; // DietDb is never constructed
  const db = new DietDb({ ...deps, env });            // autoOpen: false (section 7.2)
  try { await db.open(); } catch (e) { return { status: mapOpenError(e), db: null }; }
  const idb = db.backendDB();
  if (idb.version !== SCHEMA_VERSION * 10 || !sameStoreSet(idb.objectStoreNames, STORE_NAMES)) {
    const status = idb.version > SCHEMA_VERSION * 10 ? 'newer-version' : 'unavailable';
    closeForGood(db, status);                          // close({ disableAutoOpen: true }) and close the write gate
    return { status, db: null };
  }
  return { status: 'ready', db };
}

/** The installed native IndexedDB version of `name`, or null when there is no such database. Never creates one. */
async function installedNativeVersion(factory: IDBFactory, name: string): Promise<number | null> {
  if (typeof factory.databases === 'function') {      // Chrome 71+, fake-indexeddb 6
    return (await factory.databases()).find((d) => d.name === name)?.version ?? null;
  }
  return new Promise((resolve, reject) => {
    const req = factory.open(name);                    // no version: opens at whatever is installed
    req.onupgradeneeded = (e) => { if (e.oldVersion === 0) req.transaction?.abort(); }; // absent: abort, so nothing is created
    req.onsuccess = () => { const v = req.result.version; req.result.close(); resolve(v); };
    req.onerror = (e) => { if (req.error?.name === 'AbortError') { e.preventDefault(); resolve(null); } else reject(req.error); };
  });
}
```
- The pre-check MUST NOT create the database. A plain `indexedDB.open('diet')` on a missing database would create it at native version 1; Dexie would then upgrade from 1, see an existing database and skip `populate`. Aborting the upgrade transaction of a newly created database deletes it, per the IndexedDB specification. Test 22 covers both paths.
- The post-open check uses exact equality (`=== SCHEMA_VERSION × 10`) and the exact store set (so a Dexie `$meta` store, or any extra or missing store, fails). It is defence in depth for the moment between the pre-check and `db.open()`, when another tab could upgrade.
- *Refinement of a review suggestion:* the review proposed `Math.floor(version / 10) === SCHEMA_VERSION`. A patched database at native version 11 passes that test, so exact equality is used instead.

### 7.2 Dexie configuration
```ts
export class DietDb extends Dexie {
  // One typed property per store, e.g. weights!: EntityTable<WeightRecord, 'id'>; card_state!: Table<CardStateRecord, [string, string]>;
  constructor(opts: { name?: string; indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange; env: StorageEnv }) {
    super(opts.name ?? DB_NAME, { indexedDB: opts.indexedDB, IDBKeyRange: opts.IDBKeyRange, autoOpen: false });
    for (const m of MIGRATIONS) {
      const v = this.version(m.version).stores(m.stores);
      if (m.upgrade) v.upgrade((tx) => runUpgrade(tx, m, opts.env, m.version === SCHEMA_VERSION));
    }
    this.on('populate', (tx) => populate(tx, opts.env));
    this.on('versionchange', () => { closeForGood(this, 'reload-needed'); return false; }); // false skips Dexie's own close-and-reopen
    this.on('close', () => closeForGood(this, 'reload-needed'));                              // the browser closed the connection
    this.use(validationMiddleware());
  }
}
```
- **`autoOpen: false`.** The app calls `open()` once, from `openDietDb`. Any query after a close then fails with `DatabaseClosedError` instead of quietly reopening (and possibly recreating) the database. Dexie's own close paths keep `autoOpen` at the constructor's value, so none of them can turn reopening back on.
- **Own version-change handler.** Dexie runs the most recently subscribed handler first, and a handler that returns `false` stops its built-in one. `closeForGood` closes the write gate (section 7.5), calls `db.close({ disableAutoOpen: true })`, stops live queries and sets the open status.
- **Name** `'diet'`, with one database for the app's single origin (C34, DECISIONS "One origin"). Tests pass a fresh `new IDBFactory()` from fake-indexeddb for every test, which gives full isolation.

### 7.3 Validation middleware
DBCore middleware (`stack: 'dbcore'`). For every `add` and `put` mutate request it runs `validateRow(table, value)` on each of `req.values`, and it refuses a `put` that carries no full values (Dexie 4 can send partial updates). On `kickstart_checks` it allows only `add` and an unbounded `deleteRange` (a clear, used by import and upgrade), so checks are append-only even for raw writes; on `kickstart_periods` it refuses keyed `delete` and bounded `deleteRange`. It **skips** requests in a `versionchange` transaction (`req.trans.mode === 'versionchange'`), because migration steps write intermediate shapes; `runUpgrade` and `populate` validate explicitly instead (section 9). The middleware is synchronous. Repositories never call `Table.update` or `Collection.modify`; they read, prepare and `put`. The middleware is defence in depth, so a raw `db.weights.put(bad)` still fails. It does not check the write gate (section 7.5), because import, upgrade and delete-all must still run.

### 7.4 Open status and the storage failure screens
The open status is an in-memory store: `'opening' | 'ready' | 'newer-version' | 'upgrade-failed' | 'unavailable' | 'reload-needed'`. `mapOpenError` maps by `error.name`: `UpgradeError`, `AbortError` during the upgrade, or a `StorageValidationError`/`StorageInvariantError` thrown by `runUpgrade` → `upgrade-failed`; `VersionError` → `newer-version`; `DatabaseClosedError` → `reload-needed`; `MissingAPIError`, `OpenFailedError`, `InvalidStateError` and anything else → `unavailable`.

| Status | Screen | Actions |
|---|---|---|
| `newer-version` | "This phone has records from a newer version of the app. Nothing has been changed. Connect to the internet and reload. If this screen comes back, close the app in every Chrome tab and in Recent apps, then open it again." | Reload |
| `upgrade-failed` | "The app could not update your records. Nothing was changed. Save a rescue copy, then reload. A later version of the app should be able to read it. If this screen comes back after an update, close the app in every Chrome tab and in Recent apps, then open it again." | Save a rescue copy (section 9.5) as the main button, then Reload. Once saved, the screen names the file and where to find it, and offers "Save another copy". **Delete all and Settings are not reachable from this screen** |
| `unavailable` | "This browser cannot store the app's records (private mode or storage blocked)." | Reload |
| `reload-needed` | "The app's records were closed in this window. Another window or tab of the app may have updated, restored or reset them, or the browser closed them. Reload." | Reload |

The card under the "Your records" heading is labelled "What happened" (ux review: no two labels the same). A new version waiting to take over shows its "Update available" banner on these screens too, and their Reload applies it first (with `registerType: 'prompt'`, a plain reload keeps the old version in control, so the screen would come back; wording review).

Every storage failure screen also renders, from static copy in health.ts with no dependence on the database, the not-a-medical-device line and the help numbers: emergency 111, Healthline 0800 611 116, Alcohol Drug Helpline 0800 787 797 or text 8681, and Need to Talk 1737 (HS section 1 header, HS-13 as extended by C17). These screens appear exactly when the rest of the app is unusable, for example during a running fast or straight after an update.

### 7.5 Other tabs and the write gate
- **Write gate** (`gate.ts`): one in-memory flag. While it is closed, every repository write throws `StorageClosedError` before touching Dexie, and `useLiveQuery` subscriptions unsubscribe. `closeForGood` closes it; nothing reopens it except a page reload.
- **Cross-tab channel:** `BroadcastChannel('diet-db')`. Before an import write and before delete-all, the acting tab posts `{ type: 'gate', reason: 'import' | 'delete-all' }`. Every other tab that receives it calls `closeForGood(db, 'reload-needed')`. Dexie's own version-change event covers the delete case; the channel also covers import, which does not change the version but would otherwise let a stale tab's autosave write old form state over the restored records.
- The acting tab closes its own gate first too (section 10.6 step 10, section 11 step 0), and its import and delete-all writers do not use repositories, so they still run.
- **Lock handshake (Web Locks; data-loss review).** The channel alone cannot stop a busy tab: a transaction it created after the message was sent, but before it was handled, would commit on top of the restored records. So every tab holds the lock `'diet-db-open'` in shared mode from before it opens the database until `closeForGood` (which closes the gate and the connection first, then lets go). A restore or delete-all posts the gate message, closes its own gate, gives up its own shared lock, and then writes only inside the same lock in exclusive mode. Any transaction another tab started is therefore created before the restore's and commits first, and a tab that starts opening during the restore waits until it is done. If the exclusive lock is not granted within 3 seconds (a tab that does not answer), nothing is written; the panel says, in the privacy section of health.ts, "The app is still open somewhere else: another Chrome tab or window, or the installed app in Recent apps. Close the app's other tabs, then try again.", says that nothing more will be saved until the app reloads, and offers Try again and Reload. Where a browser has no Web Locks, the handshake is skipped and the channel and version-change events work as before (`apps/mobile-web/src/db/locks.ts`; tested in `locks.test.ts` with a busy second connection, and in real Chromium with a second tab that keeps writing).

### 7.6 Quota
A `QuotaExceededError` on any write aborts that transaction. Nothing is half-written, and the message reads "Phone storage is full. Nothing was saved. Free some space or export a backup."

---

## 8. Writing: the repository contract

### 8.1 Environment
`StorageEnv = { now(): Instant; timeZone(): TimeZone; randomId(): Id; randomBytes(n: number): Uint8Array }`. The production version uses the real clock, the device zone of section 3.4 and `crypto`.

### 8.2 Methods
- **Generic repository** (`crudRepo(table)`), limited per store by section 8.4: `create(input)` (assigns the id and the repository-maintained timestamps; uses `add`, so a duplicate fails), `get(key)`, `list()`, `listByIndex(index, lower, upper)`, `update(key, patch)` (get, merge, prepare, `put`, in one read-write transaction) and `remove(key)`. Each method returns the stored record, or throws `StorageValidationError`, `StorageInvariantError` or `StorageClosedError` (section 2.3).
- **Singletons:** `get()` (always present after populate) and `update(patch)`. `settings.recordBackup(at)` changes only `lastBackupAt`.
- **Special repositories built in item 12:**
  - readiness: `answer(id, yesNo)` stamps the current wording version and `answeredAt`; answering `q3` deletes any `prescriberAgreed` row, and answering `q6` deletes any `gpExerciseDiscussed` row, in the same transaction (D29). A confirmation is refused unless its question has a current-wording row. `list()`, `clear(id)` (tests and future rewording);
  - weights: `addOnboardingWeight()` refuses a second one; `between(fromDate, toDate)` filters with section 3.6;
  - fasts: `start()` refuses while a fast is running and stores `plannedFastMinutes` per section 4.6; `end(id)` sets endedAt and endedTimeZone; `running()`;
  - kickstart: `startPeriod()` refuses an overlap and refuses unless 21 more days fit the 42-day cap; `endPeriod(reason)` sets `endedAt`, `endedTimeZone` and `endReason` once, on the latest period while it is running or not yet started (`kickstartPeriodState`), with `endedAt = max(now, clockHighWater, startedAt + 1 ms)`: never earlier than a record already saved, so a clock set back cannot shorten the count, and a start dated ahead counts 1 day; the new end must still fall on or before the scheduled last day in the end zone and the start zone (rule 5c), otherwise `kickstart-end`. `recordCheck(answers)` is called only from the Extend action, refuses outside the current extension window or after a `stop-sign` check in that period, derives the outcome, and refuses an extension that would pass 3 extensions or 42 days. `startPeriod` and `recordCheck` depend on today, so both refuse with `StorageClockError` ("The phone's date and time look earlier than the last saved record. Check them in the phone's settings, then try again.") while `isClockBehind(now, clockHighWater)`. The high-water mark is read from every backed-up store inside the same transaction. There is no update or remove;
  - drinks: `log({ beverageId, beverage, count, at? })` computes the snapshot figures with core; `update(id, { count, at, beverage })` recomputes them; `remove(id)`; `forDrinkingDays(from, to)`;
  - card_state: `get(cardId, trigger)`, `markShown`, `dismiss` (stores `dismissedTimeZone`), `done` (upserts);
  - garden_photos: `put(gardenId, …)` refuses an unknown garden id; `remove(gardenId)`; removing a garden row removes its photo in the same transaction.
- **Later items** add query helpers (planner, trends and so on), and MUST go through the same preparation and validators.
- **No audit rows** for ordinary owner edits. Audit is for automatic changes (grocery deductions at item 24, migrations).

### 8.3 Preparing a write
Every write goes through `prepare(table, candidate, env)`, which is synchronous: normalise (section 2.3), then the environment checks, then `validateRow`. The environment checks are: every `TimeZone` field being written with a new value is one this device's `Intl` recognises (`zone-unknown`); `profile.birthYear` is not after the current year in the device zone (`future-year`). Values carried over unchanged from a stored row are not re-checked against the environment, so editing an old entry recorded in a zone this browser does not know still saves.

### 8.4 Allowed operations and repository-maintained timestamps

| Store | Generic repository | Special repository | Timestamps the repository maintains |
|---|---|---|---|
| profile | get, update | — | createdAt (populate), updatedAt |
| targets | get, update | — | updatedAt |
| settings | get, update | recordBackup | none |
| readiness | list | answer, clear | answeredAt |
| kickstart_periods | get, list | startPeriod, endPeriod | startedAt and timeZone; endedAt and endedTimeZone |
| kickstart_checks | get, list | recordCheck (append only) | askedAt and timeZone |
| weights | create, get, list, update, remove | addOnboardingWeight, between | at and timeZone when left to the repository |
| fasts | get, list, update (times and note; section 5 rule 3 checked), remove | start, end, running | startedAt and timeZone; endedAt and endedTimeZone |
| symptom_log, water_log, food_log | create, get, list, update, remove | — | at and timeZone when left to the repository |
| steps_log | create, get, list, update, remove | — | updatedAt |
| ingredients, ingredient_overrides, recipes, beverages | create, get, list, update, remove | — | createdAt, updatedAt |
| grocery_lists | create, get, list, update, remove | — (item 31 adds send and acknowledgement) | createdAt, updatedAt; `version` + 1 on every update |
| plan_days, pantry | create, get, list, update, remove | — | updatedAt |
| garden | create, get, list, update, remove (also removes the photo) | — | updatedAt |
| sessions | create, get, list, update, remove | — | completedAt and timeZone when status becomes `done`, cleared otherwise |
| drinks_log | get, list | log, update, remove, forDrinkingDays | at and timeZone when left to the repository |
| alcohol_day_notes | create, get, list, update, remove | — | enteredAt (on create), updatedAt |
| alcohol_milestones | create, get, list, update, remove | — | createdAt |
| card_state | get | markShown, dismiss, done | firstShownAt; dismissedAt and dismissedTimeZone; doneAt |
| audit | create, get, list | — | at and timeZone |
| garden_photos | — | put, remove | none (takenAt comes from the caller) |
| transfer_pairings | — | none at item 12 (item 30 adds them) | pairedAt (item 30) |

`TABLES[store].ops` records the generic column, and the generic repository refuses anything not listed (test 23).

### 8.5 Transactions must not commit early (D15)
IndexedDB commits a transaction as soon as no request is pending at the end of a task. Any `await` on something that is not an IndexedDB request inside a transaction scope (WebCrypto, a timer, a non-Dexie promise, an awaited confirmation, `requestPersistentStorage`) therefore commits what has been done so far. In the import write and in an upgrade, that would make earlier `clear()` calls permanent with nothing added back, wiping the phone. A `try`/`catch` (or `.catch`) inside the scope that swallows a `BulkError` commits a partial write in the same way.

Rules (MUST):
1. **Everything that is not a database request happens before the transaction opens:** parsing, decryption, migration, validation, invariants, confirmation and persistence requests. `prepare()` and every validator are synchronous.
2. **A transaction scope** (the function passed to `db.transaction`, to `version().upgrade()` and to `on('populate')`, and every function nested in it) is synchronous: no `async`, no `await`, no `try`, no `.catch()` or `.finally()`. It issues Dexie requests in order and returns them, chaining with `.then` only on a Dexie request or on `Dexie.Promise.all`. Errors are mapped to codes outside the scope.
3. **Import keeps the snapshot it read for the confirmation in memory** (section 10.6 step 9). If the write reports any failure, the app offers it at once as a rescue download (section 9.5) before anything else happens.
4. **`runUpgrade` rewrites only the stores the step changes** (section 9.3), not every store.

```ts
// The import write: one synchronous scope, requests only.
db.transaction('rw', STORE_NAMES, () => {
  const ops: Promise<unknown>[] = [];
  for (const t of BACKUP_TABLES) ops.push(db.table(t).clear(), db.table(t).bulkAdd(rows[t]));
  ops.push(db.transfer_pairings.clear());
  ops.push(db.garden_photos.where(':id').noneOf(importedGardenIds).delete());
  return Dexie.Promise.all(ops);
});
// A repository update: read, prepare (synchronous; throws to abort), put.
db.transaction('rw', db.weights, () =>
  db.weights.get(id).then((row) => db.weights.put(prepare('weights', merge(row, patch), env))));
```

**The scan** (`tools/scans/txScope.ts`, run in CI on `apps/mobile-web/src/**/*.ts` except tests) parses each file with the TypeScript compiler API, finds every scope as defined in rule 2, and reports: an `async` function, an `await`, a `try` statement, a `.catch(` or `.finally(` call, a `.then(` whose receiver is not a call rooted at `db`, `tx` or `Dexie.Promise`, and any reference to `crypto`, `setTimeout`, `setInterval`, `queueMicrotask`, `fetch`, `navigator`, `window`, `confirm` or `requestPersistentStorage`. Its test feeds it a fixture source with `await crypto.subtle.digest(…)` placed between `clear()` and `bulkAdd()` and expects a report (section 16, test 38).

**Helpers called from a scope (data-loss and tests reviews).** A scope often calls a helper that does the work, so the scan follows calls: every function, arrow function or object-literal method that a scope calls or passes on (declared in the same file, or imported by a relative named import) is checked as a scope too, transitively. So an `await`, a `try`/`catch`, a timer or a non-Dexie async call inside such a helper is reported, as it would be inline. Functions that only run inside a scope by design (the store rules, and `crud.ts` helpers) carry a `@transactionScope` tag so they are scanned even when no call can be seen. A helper that needs a `try` (for example the drink figures) is moved to core and written without one.

---

## 9. Migrations

### 9.1 Version numbers
`SCHEMA_VERSION` starts at **1**. Dexie's `version(n)` takes whole numbers only, and Dexie stores n × 10 as the native IndexedDB version, which section 7.1 relies on. The backup `schemaVersion` **is** the schema version.

### 9.2 Policy
1. **A released version is never edited.** Version 1 is frozen at the item-12 commit. Every later change adds `version(n + 1)` with its own frozen `specs/vN.ts`. Earlier specs stay in the code for ever, because import validates a file against its own version first (section 10.6).
2. **What counts as a schema change.** Any change to fields, types, enums, ranges, intra-record rules, registries (`CARD_REGISTRY`, `READINESS_WORDING`), indexes, the backed-up or device-only store lists, a constant a validator reads, or **the behaviour of a core function a validator calls or restates**. Each needs a new version. The guards:
   - `SPEC_FINGERPRINTS[n]` is the SHA-256 of a stable JSON description of: `TABLES` (store, key, indexes, backup flag, allowed operations, every field's validator description), the backup lists, `CARD_REGISTRY` (cards, trigger patterns, dismissal rules), `READINESS_WORDING`, and `VALIDATOR_CONSTANTS` with their values: everything in `limits.ts`, `WEIGHT_LIMITS_KG`, `PROTEIN_LIMITS_G`, `MAX_SERVE_ML`, `MAX_LABEL_STANDARD_DRINKS`, `MAX_LABEL_KCAL`, `MAX_SERVE_STANDARD_DRINKS`, `MAX_ENTRY_COUNT`, `MAX_MY_SERVES`, `HOUSEHOLD_SERVES_LIMITS`, `KJ_PER_KCAL`, `ETHANOL_DENSITY_G_PER_ML`, `MIN_EATING_MINUTES`, `EARLIEST_BIRTH_YEAR`, `FASTING_PRESETS` (ids and windows), the `ACTIVITY_FACTORS` keys, `NUTRIENT_KEYS`, and the `NUTRITION_SOURCES`, `CONFIDENCES`, `CARB_BASES` and `FASTING_PRESET_IDS` arrays. A test recomputes it for `SCHEMA_VERSION` and fails if it differs. Older fingerprints stay as history.
   - `GOLDEN_VECTORS[n]` pins the outputs of every core function a validator calls or restates, over a fixed input table: `windowLength` (every preset, 60 and 1,439 eating minutes, a midnight wrap), `kjToKcal` (0, 393 and 20,920 kJ), the `source` and `labelIgnored` of `standardDrinks` and the `kcal` presence of `drinkEnergy` (label applies; volume edited; ABV edited; printed figure null), `confidenceOf` for each source, and `recipeConfidence` for each single source and for mixed lists. A test compares the live outputs with `GOLDEN_VECTORS[SCHEMA_VERSION]`, so a behaviour change fails until a new version is added whose migration recomputes the derived fields.
3. **Widening and adding are free; narrowing must map.**
   - A step fills defaults for new fields, maps renamed values and drops removed fields. It never invents a health value. A new required field with no safe default is made nullable instead.
   - **A range on a required field may only widen**, unless the step can map every old value (for example `weights.kg` can never narrow, because no weight can be invented).
   - **Narrowing a safety range** moves each out-of-range value to the nearest value on the safe side (a lower deficit, a higher floor, a more sensitive rapid-loss bound, a stricter ceiling) or to the documented default when there is no "safe side", and records one `MigrationChange` per changed field. That is documented and visible, so it is not C50's "silent clamping", which applies to values arriving through import at the same version.
   - **Removing an enum value** maps it to null, or to the documented default with a `MigrationChange`.
   - Every narrowing or removal MUST have a fixture test that starts from a released fixture holding the old value.
   - Changes become `audit` rows with `kind: 'migration'` (in `runUpgrade`) and are listed on the import confirmation (in `migrateSnapshot`). After an upgrade or import that changed values, the `update-notice` card with trigger `v<N>` says "This update changed some of your settings to fit new limits", with a link to the list.
   - A change to a core function used by a validator is a schema change, and its migration recomputes the derived fields it affects (for example `confidence` from `sourceMix`).
4. **One migration chain, two consumers.** Dexie runs the chain on the phone (`runUpgrade`, section 9.3). Backup import runs the same chain on older files (`migrateSnapshot(fromVersion, snapshot, env)`). Steps must tolerate missing device-only stores and pass them through untouched unless the step is about them.
5. **Backup compatibility is permanent.** Import accepts every schema version from 1 to `SCHEMA_VERSION`, forever, so the chain is never pruned. It refuses anything newer (section 10.6).
6. **No downgrades.** A database newer than the code reports `newer-version` and is never touched (section 7.1).

### 9.3 The Migration interface and `runUpgrade`
```ts
export interface Migration {
  version: number;                                     // the version this step produces
  stores: Readonly<Record<string, string | null>>;     // Dexie stores delta; null deletes a store
  backup: { added: readonly string[]; removed: readonly string[]; deviceOnly: readonly string[] }; // changes to the store lists
  specs: TableSpecs;                                   // this version's complete, frozen field specs
  reads: readonly string[];                            // stores the step needs to see
  rewrites: readonly string[];                         // stores whose rows the step may change ([] for version 1)
  removesRows: readonly string[];                      // rewritten stores whose row count may fall ([] unless declared)
  upgrade: ((s: LooseSnapshot, env: MigrationEnv) => MigrationResult) | null; // null only for version 1; identity when no rows change
}
export type LooseSnapshot = Record<string, unknown[]>;  // device-only stores may be absent (backups)
export interface MigrationEnv { now: Instant; timeZone: TimeZone; randomId(): Id }
export interface MigrationResult { snapshot: LooseSnapshot; changes: readonly MigrationChange[] }
export interface MigrationChange { table: string; recordId: string; field: string; reason: string } // reason from health.ts templates
```
`BACKUP_TABLES_BY_VERSION`, `DEVICE_ONLY_TABLES_BY_VERSION`, `BACKUP_FIELDS_BY_VERSION` and `TABLES_BY_VERSION` are derived from the chain: version 1's lists, then each step's `backup` delta and `specs`. They are part of the fingerprint.

`runUpgrade(tx, m, env, isLast)` (Dexie `upgrade`; a synchronous scope under section 8.5):
1. Read `m.reads ∪ m.rewrites` with `tx.table(name).toArray()`; on the last step (`isLast`), read every existing store instead.
2. Apply `m.upgrade` (pure, synchronous) to those stores. Turn each `MigrationChange` into an `audit` row (`kind: 'migration'`), which adds `audit` to the stores written.
3. On the last step only: run `validateRow` on every row of every backed-up store against the current specs, and `checkInvariants` on the result. A backed-up row that fails throws, Dexie aborts the transaction, and the database stays at its old version, untouched → `upgrade-failed` (section 7.4). A **device-only** row that fails is deleted instead (the app becomes unpaired, or the photo is removed), because those rows can be recreated and blocking the app over them would do more harm.
4. Write back only the rewritten stores (`clear` then `bulkAdd`; CryptoKeys and ArrayBuffers survive, because this is structured clone, not JSON), plus the device-only deletions. All in one `Dexie.Promise.all`.

**The step contract (`checkMigrationResult`; data-loss review).** After step 2, on the phone and in backup import alike, a step's result is checked before anything is written. It MUST hold an array for every store in `rewrites` and for every backed-up store it was given (minus those the new version removes); a store it does not rewrite MUST come back unchanged; and a rewritten store's row count may fall only if the step lists it in `removesRows`. Otherwise a `MigrationError` (`missing-store`, `unexpected-change` or `rows-lost`) is thrown: on the phone it aborts the upgrade (`upgrade-failed`, version untouched), and in import it refuses the file (`invalid-record`). So a step that leaves a store out of its result can never empty that store. Test-only chains for each case, and for valid rows that break section 5 (a second running fast, 49 Kickstart days), are in `testChains.ts`.

### 9.4 Fixtures
For each released version N, `packages/test-fixtures/src/storage/snapshotV{N}.ts` exports a synthetic snapshot covering every backed-up store, every nullable field both null and set, every enum value, and boundary values (for example kg 20 and 400, cut-over 0 and 360, threshold 750, a 42-day Kickstart history), plus a grocery list that has been sent and acknowledged (with a `transferId`). It is a TypeScript object, never a `.json` file, so neither the `*backup*.json` path rule nor the backup-marker content rule fires, and nothing in it describes a real person. A test pins the SHA-256 of each released fixture's JSON serialisation, so a released fixture cannot be edited.

`packages/test-fixtures/src/storage/referenceEnvelopesV1.ts` holds the **fixed reference files** for C99's "a fixture file in an older version still imports": a plain and a locked version-1 envelope over the v1 fixture, made once at item 12 and pinned. The locked one uses a synthetic phrase with spaces (for example "synthetic reference phrase two thousand"), a salt of bytes 0x01–0x10 and an IV of bytes 0xA0–0xAB, and its ciphertext is stored as a string constant. Each envelope is assembled at run time from parts (the marker built as `['diet', 'backup'].join('-')`), so the backup-marker content rule does not fire on the fixture file; the phrase contains spaces and its constant is not named after a password, so the `assigned-secret` scan rule does not fire either. Both MUST decrypt and import in every later version (test 33).

### 9.5 Rescue copy
Offered on the upgrade-failed screen, after a failed import write (section 8.5 rule 3), and when the export self-check fails (section 10.5).
- **Reading** (upgrade-failed case): `rescue.ts` uses raw IndexedDB, not Dexie. It finds the installed version with `installedNativeVersion`, opens `'diet'` with no version (aborting if the database is absent), and reads, in one read-only transaction, the stores in `BACKUP_TABLES_BY_VERSION[v]` that actually exist, where `v = Math.floor(nativeVersion / 10)`. A listed store that does not exist (the failed step may have been the one adding it) is written as an empty array. **Device-only stores are never read.**
- **Allow-list:** each row is built from `BACKUP_FIELDS_BY_VERSION[v][table]` alone (C49). Rows are otherwise not validated.
- **File:** the payload has `kind: 'rescue'` and `schemaVersion: v`. It goes through the same envelope and locking code as a backup, with the lock **on by default**. Its name is `backupFileName(exportedAt, zone, { locked, kind: 'rescue' })`, which gives `diet-backup-YYYY-MM-DD-rescue.json` or `diet-backup-YYYY-MM-DD-rescue-locked.json`; both are ignored by git (section 10.1).
- **Importing a rescue file** reports problems row by row instead of refusing the whole file (section 10.6, steps 6 and 8). The screen says: "This rescue copy may need a later version of the app to open completely. Keep the file." The limits (data-loss and health-rules reviews; `core/storage/backup/rescueImport.ts`):
  - **Kickstart history is never set aside.** A `kickstart_periods` or `kickstart_checks` row that fails (in step 6, or in step 8 after migration), a start or check dated after the file's limit (section 12.3), or a duplicate id among them, refuses the whole copy (`invalid-record`, rule `kickstart-history`, with its own message: "This rescue copy has a Kickstart record that could not be imported (Kickstart periods, record 4), and the Kickstart history is imported whole or not at all. Nothing was imported. Keep the file: a later version of the app may read it."), because an incomplete history would count as less Kickstart and reopen the 42-day and 3-extension caps (D27, D28). The Kickstart rules of section 5 still refuse a rescue copy too.
  - **Profile, targets and settings** must each have exactly one row, a plain object; otherwise the copy is refused (no default row: the defaults are the least cautious values). Each failing field is repaired and listed ("Could not be read from the rescue copy, so set to the app's default or the more cautious choice"): put back to the app's default, except a failing `kickstartOptIn`, which becomes `false`, and a failing `allergens` list, which keeps every entry that can be read (never `[]`, HS-24). A missing or failing **safety setting** (energy floor, deficits, carb ceilings, protein range, saturated-fat budget, rapid-loss threshold, weeks and explanation time, `alcoholGuidanceSet` and `profile.dietMode`) refuses the copy instead.
  - **Other cross-record rules** set the offending rows aside in a fixed order and list them, then the rules are checked again: later rows with a duplicate key; every running fast but the latest, and that one too if a later fast exists; fasts that overlap an earlier kept fast; every onboarding weigh-in but the first; reminder card rows this app does not know. So an unchecked copy made because of a cross-record bug can still be imported.
  - **On the phone, a rescue import never makes a safety setting less cautious** than the phone or the file had: higher energy floor; lower Kickstart and Steady deficits; lower saturated-fat budget; lower rapid-loss threshold and fewer weeks, with the explanation time that allows them; the women's alcohol figures if either side chose them; and every allergen either side lists. Carb ceilings, protein and the diet mode have no one safe direction, so the file's values stay. The phone's own rows may be damaged (that is when rescue copies are made), so each phone value is checked with its field validator first and a value that fails is ignored (the file's is used, never a stand-in such as 0); the phone's rapid-loss bounds count only as a valid set with an explanation time that allows them. What was kept from the phone is listed ("Kept from this phone because it is the more cautious setting"). Otherwise a plain backup is restored as it is, apart from the Kickstart history (section 10.6 step 9) and bookkeeping times dated ahead (section 12.3).
- `lastBackupAt` is never set by a rescue copy, so the backup reminder stays.

### 9.6 Migration tests (section 16 lists them)
Chain shape; stores snapshot; fingerprint; golden vectors; per-version fixture through the pure chain, through Dexie (open a fake database with `MIGRATIONS.slice(0, N)`, load the fixture, close, reopen with the real `DietDb`, compare with the expected migrated snapshot) and through backup import; a failing test-only step leaves version N untouched and the rescue file imports; a newer database is reported and left unchanged. At item 12 only version 1 exists, so the chain tests use **test-only** version-2 chains built in the test files and never shipped: (a) one added field with a default and one renamed enum value; (b) a narrowing (`steadyDeficitPct` max 20 → 18) that maps 20 to 18 and records a change; (c) an added backed-up store and an added device-only store; (d) a removed index that v1 declares (for the newer-version tests).

---

## 10. Backup

### 10.1 File names
- Every file the app generates is named by the one helper in `backup/fileName.ts`: `backupFileName(exportedAt, timeZone, { locked, kind })` gives `diet-backup-YYYY-MM-DD.json`, `diet-backup-YYYY-MM-DD-locked.json`, `diet-backup-YYYY-MM-DD-rescue.json` or `diet-backup-YYYY-MM-DD-rescue-locked.json`; later items add `exportFileName(kind, date)` beside it for the GP summary (item 23, `diet-gp-summary-YYYY-MM-DD.csv` or `.txt`) and the grocery exports (item 24, `diet-grocery-list-YYYY-MM-DD.csv` and `.json`). The date is the local date of `exportedAt` in the device zone (section 3.4), so an export at 08:00 New Zealand time, when it is still the previous day in UTC, carries the New Zealand date.
- Checked in this repository on 19 Oct 2026 with `git check-ignore --no-index`: the four `diet-backup-…` names, `diet-backup-2000-01-01 (1).json` (the browser's duplicate suffix) and the same names in a subfolder are **all ignored**, by `.gitignore:4:*backup*.json`, and they match the scan's `backup-file` path rule (`/backup[^/]*\.json$/i`) (C89). `diet-rescue-2000-01-01.json`, `diet-gp-summary-2000-01-01.csv` and `diet-grocery-list-2000-01-01.json` are **not** ignored today, so item 12 adds `diet-*.json`, `diet-*.csv` and `diet-*.txt` to `.gitignore`, and test 46 runs `git check-ignore` on every output of both helpers.
- The envelope's first field is `format` with the value diet-backup, which matches the scan's `backup-marker` content rule for both variants, because the header is plaintext (C14, C89). **Repository docs MUST NOT contain that key-value pair written as JSON**, or the scan fails on the doc. DATA_MODEL describes the envelope in a table or with unquoted keys, as section 10.2 does. Tests build envelopes at run time with `JSON.stringify`.
- *Not adopted:* a neutral file-name prefix (such as `logbook-backup-…`) so that a Downloads listing does not reveal diet data. C89 fixed `diet-backup-YYYY-MM-DD.json` and the ignore and scan rules are built around it; the file content names itself anyway once opened; and a backup the owner cannot recognise in Downloads is more likely to be deleted, which is the bigger risk.

### 10.2 Envelope
Shown as JavaScript values (synthetic, abbreviated); the file is `JSON.stringify` of the value with no indentation. Keep any copy of these examples in this unquoted form.

**Plain:**
```ts
{
  format: 'diet-backup',
  version: 1,
  encrypted: false,
  payload: {
    schemaVersion: 1,
    kind: 'backup',
    exportedAt: '2000-01-03T06:00:00.000Z',
    appVersion: '0.1.0',
    tables: {
      profile: [{ id: 'singleton', heightCm: 175, sex: null /* … */ }],
      weights: [{ id: '0b6f1d2e-0000-4000-8000-000000000001', at: '2000-01-02T19:00:00.000Z',
                  timeZone: 'Pacific/Auckland', kg: 100, source: 'onboarding', note: null }],
      // … every backed-up store, [] when empty
    },
  },
}
```

**Locked:**
```ts
{
  format: 'diet-backup',
  version: 1,
  encrypted: true,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' },
  cipher: { name: 'AES-GCM', length: 256, iv: 'AAAAAAAAAAAAAAAA', tagLength: 128 },
  ciphertext: '…base64 of AES-GCM(UTF-8(JSON.stringify(payload)))…',
}
```
- `version` is the **envelope** version (1). `payload.schemaVersion` is the data version (section 9). The locked header holds no data, not even the export time.
- **Payload fields:** `schemaVersion` (Int 1 to `SCHEMA_VERSION`), `kind` (`'backup' | 'rescue'`), `exportedAt` (a canonical `Instant`), `appVersion` (Text(1–40) matching `^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$`) and `tables`. Nothing else.
- `payload.tables` has **every** store in `BACKUP_TABLES_BY_VERSION[schemaVersion]` (an empty array when there are no rows) and no other key. Rows are sorted by primary key, and fields appear in spec order, so the same database always gives the same bytes apart from `exportedAt`.
- Base64 is standard with padding (own helper on `btoa`/`atob` with chunking; no dependency). It is canonical: decoding then re-encoding must give the same string.

### 10.3 Allow-list (C49)
`BACKUP_FIELDS_BY_VERSION[v][table]` is the field list of each backed-up store's spec in version v: every field, in spec order, with every nested shape in full. Export builds each row from the current version's list alone (`pick`), so a stray property can never leak. Import requires exactly the file's own version's key set (a missing or extra key is refused).

| Excluded | What | Why |
|---|---|---|
| `transfer_pairings` (whole store) | relay URL, room id, AES key (a non-extractable CryptoKey, which cannot be serialised anyway), paired at | C49: a restore always leaves the app unpaired, never half-paired; the key never leaves the device |
| `garden_photos` (whole store) | photo bytes and metadata | Item 19, C49: photos are never in exports |
| Storage-protection status | — | Not stored at all (section 12) |

No backed-up store contains a device-only field, so the round trip has no field-level exceptions. `grocery_lists.transferId` is random per send (section 4.11), so it reveals nothing about the pairing.

### 10.4 Locking (C99; WebCrypto only)
- **Password:** trim, then `normalize('NFC')`, at both export and import (mobile keyboards add trailing spaces); 10–1,000 characters after trimming; typed twice at export. The warning reads: "If you forget this password, the backup cannot be opened. Nobody can recover it." The password is never stored or logged, and the input is cleared after use. The export inputs use `autocomplete="new-password"` and the import input `autocomplete="current-password"`. The lock toggle is **on** by default, and the plain choice carries "Anyone who opens this file can read your records."
- **Key:** `importKey('raw', utf8(password), 'PBKDF2', false, ['deriveKey'])`, then `deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, km, { name: 'AES-GCM', length: 256 }, false, usages)`. Export derives with `['encrypt', 'decrypt']` so it can verify its own file (section 10.5) without a second derivation; import derives with `['decrypt']`. Export uses `PBKDF2_EXPORT_ITERATIONS` (600,000, the OWASP 2023 figure; about 0.1 s in Node 22 and a second or two on a phone, so a "Locking…" spinner is shown).
- **Iterations on import:** read from the file and accepted from `PBKDF2_IMPORT_MIN_ITERATIONS` (600,000, fixed forever, so a later rise of the export figure never makes an older locked backup unopenable) to `PBKDF2_MAX_ITERATIONS` (10,000,000; it may rise, never fall). Outside that range the file is refused as damaged before any derivation, and the cap keeps a doctored file from hanging the phone.
- **Randomness:** a fresh 16-byte salt and a fresh 12-byte IV for every file (`crypto.getRandomValues`).
- **Additional data:** the header is bound with AES-GCM additional authenticated data, so tampering with any header field makes decryption fail: `aad = UTF-8(JSON.stringify(["diet-backup", 1, true, "PBKDF2", "SHA-256", iterations, saltB64, "AES-GCM", 256, ivB64, 128]))`. The array is built from the **validated** header values in this fixed order, so the file's key order and whitespace do not matter.
- **Encryption:** `encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, key, utf8(JSON.stringify(payload)))`.

### 10.5 Export flow
1. Read every backed-up store in **one** read transaction (a consistent snapshot).
2. `exportedAt = env.now()`. Set `settings.lastBackupAt = exportedAt` in the snapshot copy, and put any bookkeeping time dated after `exportedAt` + 5 minutes back to that limit (section 12.3); nothing else changes, and the database itself is untouched.
3. Build the payload (`kind: 'backup'`) with the allow-list, then **self-check** it with the import validator (section 10.6, steps 5–8, in memory). If the check fails, stop with "The backup could not be checked: <detail>." in plain words, for example "Weigh-ins, record 1: the weight is outside the allowed range (20–400)" (store, position, field and rule from the privacy section of health.ts; never a value or a code name), and offer **"Save an unchecked copy"**: the rescue path of section 9.5, built from this snapshot with the current allow-list, `kind: 'rescue'`, locked by default. That copy does **not** set `lastBackupAt`, so the reminder stays. The owner is never left without any copy because of a bug.
4. If a password was given: encrypt, then **verify the locked file**. Re-parse the envelope text with `decode.ts` steps 2–4 (parse, envelope, header validation), rebuild the additional data from the parsed header, decrypt with the key already derived, and compare the result byte for byte with the plaintext. Any difference stops the export with "The locked backup could not be checked, so it was not saved." A fault in the additional-data order, the base64 chunking or the header serialisation is therefore caught before the owner relies on the file.
5. Create a `Blob` (`application/json`), then an object URL, then click an `<a download>` with the `backupFileName` name; revoke the URL after 60 s. This needs no network (HS-14). The Content Security Policy does not block a download link.
6. Show where to look, with the file name and the time it was made (never "saved": the browser cannot tell whether a download saved): "Open the Files app and look in Downloads for diet-backup-… (made at <time>). If a file of that name was already there, the new one has a number such as (1) before .json." and ask **"Can you see the file?"**. **Yes** calls `settings.recordBackup(exportedAt)`, so the database matches the file, and then, for a locked file, says to copy it off the phone ("Backup recorded. A copy kept only in Downloads is lost with the phone: in Files, share this locked file to your email or cloud storage."), and for a plain one, not to send it as it is ("Backup recorded. This file is not locked: anyone who opens it can read your records. To keep a copy off the phone, export a locked one and share that."). **No** records nothing, and the screen says "The backup may not have saved. Try again." The browser does not report a cancelled, blocked or failed download, so only the owner can confirm it. **Leaving without answering** (on Android, checking Downloads means leaving the app, which may reload it) records nothing either, but the question is kept: the file name, the export time and the records' generation only, in memory and in `sessionStorage` (`screens/backup/pendingCheck.ts`), so the Backup and data card opens at the question again ("You made diet-backup-… at <time> but have not said whether it is in Downloads.") and the Today reminder says the same, until Yes or No. A restore or delete-all in this tab clears it, and in another tab its gate message clears it (`startStorage`). **The records' generation** (`db/generation.ts`): a random id in `localStorage`, made anew when the database is created and when a restore replaces the records. Yes records the backup only while the generation is the one the file was made from; otherwise (a tab Chrome discarded keeps its `sessionStorage` but never got the gate message) it says "The records on this phone were replaced or deleted after diet-backup-… was made, so that file was not recorded as a backup. Export a new one." When this tab's records are closed (a restore or delete-all here that did not finish), Yes says "The file is there, but the app cannot record the backup until it reloads. Reload, then answer again." and keeps the question. The Backup and data card shows "Last backup made <local date>" (or "No backup made yet"), never "saved". While a locked file is made, a status line says "Locking the file… this takes a few seconds." (announced; not left to a faded button label).

### 10.6 Import flow and validation
Import is reachable only after the alcohol notice has been acknowledged (C53). Nothing in the database is touched until step 10.

1. **Size:** a file over `MAX_BACKUP_FILE_BYTES` → `too-large`.
2. **Parse:** `JSON.parse` fails, or the top level is not a plain object, or `format !== 'diet-backup'` → `not-a-backup`. Text that starts like a backup (an opening brace, then the format key with the diet-backup value) but does not parse, such as a truncated file, is `damaged` instead, so the owner does not throw away a file that is theirs (data-loss review).
3. **Envelope:** `version` must be an integer. 1 is accepted; a greater integer → `newer-version`; anything else → `unsupported-version`. `encrypted` must be a boolean. The key set must be exact (plain: format, version, encrypted, payload; locked: format, version, encrypted, kdf, cipher, ciphertext); otherwise → `damaged`.
4. **Unlock** (locked files only): validate the header (kdf.name `PBKDF2`, hash `SHA-256`, iterations an integer in the import range, the salt decoding to 16 bytes, cipher.name `AES-GCM`, length 256, the IV decoding to 12 bytes, tagLength 128, ciphertext canonical base64 of at least 16 bytes); any failure → `damaged`. Then ask for the password, derive the key and decrypt with the additional data. **Any** decryption failure (`OperationError`) → `wrong-password-or-damaged`: "Wrong password, or the file is damaged. Nothing was imported." Retry is allowed and there is no lockout (BK-02). Then parse the plaintext as JSON (a failure → `damaged`).
5. **Payload shape:** a payload whose `schemaVersion` is an integer greater than `SCHEMA_VERSION` is `newer-version` before anything else is checked, since a newer version may have changed the shape. Then: exact keys `schemaVersion`, `kind`, `exportedAt`, `appVersion` and `tables`, with the formats of section 10.2; otherwise → `damaged`. `schemaVersion` greater than `SCHEMA_VERSION` → `newer-version` ("This backup was made by a newer version of the app. Open the app online to update it, then try again."); not an integer from 1 → `unsupported-version`. `tables` must be a plain object whose keys are **exactly** `BACKUP_TABLES_BY_VERSION[schemaVersion]`; a missing store, an extra store or a device-only store name → `invalid-record`. Each value must be an array of plain objects.
6. **Validate against the file's own version:** every row against `TABLES_BY_VERSION[schemaVersion]` (`validateRow` with those specs). For `kind: 'backup'`, any failure → `invalid-record { table, index, field, rule }` and nothing is imported. For `kind: 'rescue'`, failing rows are set aside and listed (step 9), within the limits of section 9.5.
7. **Migrate** with `migrateSnapshot(schemaVersion, tables, env)` (section 9), each step checked against the contract of section 9.3. A thrown error → `invalid-record`. Its changes are listed in step 9 and added as `audit` rows.
8. **Validate against the current version:** every row against the current specs, after any bookkeeping instant dated after the limit (the earlier of the file's `exportedAt` and this phone's now, plus 5 minutes) is put back to that limit (section 12.3); a Kickstart start (`kickstart_periods.startedAt`), a Kickstart check (`askedAt`) or a fast start (`fasts.startedAt`) dated after the limit is refused (rule `future`: in a rescue copy it refuses the Kickstart history, and a fast is set aside and listed); then `checkInvariants` (section 5). A migration step that throws gives "The backup could not be updated to fit this version of the app. Nothing was imported. Keep the file: a later version of the app may read it.", and a missing, extra or unreadable list says it is a list, not a record.
   - For `kind: 'backup'`, any failure → `invalid-record` (or `inconsistent { rule }`), and nothing is imported. The message names the store, position, field and rule in plain words (privacy section of health.ts), never a value or a code name.
   - For `kind: 'rescue'`, failing rows are set aside and listed, and failing singleton fields are put back to their defaults (listed), within the limits of section 9.5 (Kickstart history and safety settings refuse). If the invariants still fail after the rows of section 9.5 are set aside → `inconsistent`.
   - **Safety values (C50).** The same bounds as the app's own writes apply: `energyFloorKj` ≥ 5,000; `kickstartDeficitPct` ≤ 30; `steadyDeficitPct` 15–20; `netCarbCeilingG` 20–50; `moderateNetCarbCeilingG` 50–130; protein 80–200; saturated-fat budget 5–10; rapid-loss threshold 750–1,000 and weeks 2–3; at most 3 Kickstart extensions and 42 Kickstart days in all. A value outside them in a `backup` file **refuses the whole file** with a clear message. It is never silently clamped (C50: "rather than clamping silently"). Separately, every consumer in core still computes with `max(FLOOR_KJ, stored)` and `min(cap, stored)` (C50, C108), so no stored value can lower a safety constant, whatever its source.
   - Environment checks are never applied: a zone this browser does not know is accepted and resolved when read (section 3.4).
9. **Confirm.** Read the phone's current backed-up stores in one read transaction and **keep that snapshot in memory** (section 8.5 rule 3). Show: the file's export date (local), counts per store, whether the file was locked, any values changed by migration, any rows set aside (rescue files: by store, position and rule, never values), and:
   - "This replaces everything on this phone. N records on this phone are not in the file. M records on this phone differ from their copies in the file. Newest record on this phone: <date>; in the file: <date>. The laptop pairing will be removed.", each count worded for 0, 1 and more ("Every record on this phone is in the file.", "1 record on this phone is not in the file.").
   - **M counts by content (data-loss review):** every row present in both whose stable serialisation differs from the file's copy, whatever its timestamps, so an edit to a record with no `updatedAt` still counts. `settings.lastBackupAt` is left out of the comparison (it changes with every confirmed backup). The newest-record dates use the greatest of `updatedAt`, `createdAt`, `at`, `startedAt`, `endedAt`, `enteredAt`, `answeredAt`, `askedAt`, `completedAt`, `dismissedAt`, `doneAt` and `firstShownAt`, never `lastBackupAt`.
   - **A fresh phone (data-loss and ux reviews):** rows still exactly as the section 6 seed wrote them (the default profile, targets and settings, the default drink preset and the silverbeet garden row, apart from their ids and timestamps) are not the owner's records: they are not counted and do not set the phone's newest date. When nothing of the owner's is on the phone (a new phone, or just after delete-all), the summary says "This phone has no records of yours yet. Restoring puts the file's records on it." and shows no loss.
   - **The Kickstart history is never lowered (D27; orchestrator ruling).** When the phone's history records more than the file's (`recordsMoreKickstart`: more days, then more extensions, then a later stop-sign check), for a backup or a rescue copy alike, the phone's `kickstart_periods` and `kickstart_checks` are written instead of the file's, and the summary says so before Replace: "Kickstart history kept from this phone, because it records more Kickstart days, extensions or stop-sign checks than the file." After delete-all the phone has none, so the file's history is restored (HS-15). N and M are counted against what will be written.
   - The confirmation's first line reads "Backup made <date>." or, for a rescue file, "Rescue copy made <date>."; "The laptop pairing will be removed." appears only when the phone is paired; when nothing of the owner's on the phone carries a date (only settings changed), the newest line reads "Newest record in the file: <date>."
   - When N or M is above zero, the first and default button is **"Export what is on this phone first"** and the replace button comes second, drawn in amber as an action that cannot be undone. Otherwise the replace button is first and the export offer second. The replace button reads **"Replace everything on this phone"**; a rescue file with rows set aside shows "Import the rest" in its place. Rescue files also list what was put back to a default and what was kept from the phone (section 9.5). Nothing happens without an explicit tap. "Export what is on this phone first" opens the export panel above, scrolled into view with focus on its lock switch, and leaves the confirmation where it is.
10. **Write.** Post the cross-tab gate message, close this tab's write gate and give up its shared lock (section 7.5), then run the all-or-nothing write (section 10.7) inside the lock in exclusive mode. If the lock is not granted within 3 seconds, nothing is written and the panel says the app is open somewhere else, that nothing was changed, and that Reload cancels the restore; "Try the restore again" counts the phone's records again and shows the confirmation again before anything is replaced. The Backup and data card's "Nothing more will be saved until the app reloads." and its Reload appear only once a restore or delete-all has stopped without finishing, never while one runs. On success, a new records generation is started (section 10.5 step 6). If the write fails for any other reason, offer "Save what was on this phone" at once: the step-9 snapshot as a rescue file (section 9.5), locked by default. On success, `await requestPersistentStorage()` (outside the transaction), then reload the page, which opens on Today. A restore made during setup (offered only after the alcohol notice is acknowledged, C53) reloads onto Settings, Readiness answers instead, so the restored answers are checked first, and the first-run guard shows setup again when the file's setup is not finished (item 13, E64). Readiness reopens by itself: missing answers are computed at run time (section 13), so nothing extra is written (C41).

No audit row is written for an import itself, because that would break round-trip equality. Migration changes from an older file are the only audit rows import adds.

### 10.7 All-or-nothing write
One Dexie read-write transaction covers **every** store, as a synchronous scope (section 8.5): `clear()` each backed-up store and `bulkAdd` its rows in `BACKUP_TABLES` order; `transfer_pairings.clear()`; delete every `garden_photos` row whose `gardenId` is not in the imported garden ids, so a photo survives only a same-phone restore where its garden row comes back. The middleware validates every row again. If anything throws (quota, a validation error, a bug), Dexie aborts the transaction and the database is exactly as it was → `write-failed` ("Nothing was changed").

### 10.8 Round-trip equality (HS-15, BK-01; as reworded per C49)
"Every record round-trips exactly, except the documented device-only data (the laptop pairing and garden photos), which is absent from the file."

Formally, let `S(db)` be, for every store in `BACKUP_TABLES`, its rows as returned by `toArray()` (primary-key order). Then:
1. Export at time T, answer **Yes** to "Can you see the file?", and take `S_before = S(db)` after that, so `settings.lastBackupAt = T` on both sides.
2. Delete all (section 11), import the file, and take `S_after = S(db)`.
3. **Pass** iff `expect(S_after).toStrictEqual(S_before)` for every store: the same keys and the same field sets, with numbers compared by `Object.is` (so `-0` must never be stored, section 2.1), `null` distinguished from absent (absent never occurs), and array order preserved. Object key order is ignored.
4. **And** `transfer_pairings` and `garden_photos` are empty after the import (they were wiped).
5. **And** the file text contains none of: the pairing's `roomId` or `relayUrl` values; the photo's bytes as base64 or as raw characters; the JSON keys `"bytes":`, `"key":`, `"roomId":` or `"relayUrl":` (matched as JSON keys, so ordinary text such as "turkey" does not count). The test fails if any appears.

The same holds for the locked variant, with the right password.

### 10.9 Error codes
`BackupError.code`: `too-large`, `not-a-backup`, `unsupported-version`, `newer-version`, `damaged`, `wrong-password-or-damaged`, `invalid-record`, `inconsistent` or `write-failed`. Each has one plain-English message in the copy file. Messages may name a store, a field and an allowed range, but never a record's value or key (section 2.3).

---

## 11. Delete all (HEALTH_SAFETY section 7; HS-30, new per C17)

**Flow:** Settings, then Backup and data, then Delete all data. (It is not offered on the upgrade-failed screen.) A first confirmation lists what goes and what stays and offers "Export a backup first" (which opens the export panel, scrolled into view with focus on its lock switch). A second, explicit confirmation follows: Cancel is the main button, and "Delete everything on this phone" is drawn in amber (the `caution` button: an amber outline and amber text from the colour tokens; red stays for emergencies). When no backup has ever been confirmed, its warning says "Deleting cannot be undone. No backup has been recorded on this phone, so unless you kept a backup or rescue file, nothing can bring these records back."; otherwise "Deleting cannot be undone. Only a backup file you kept can bring the records back." Then:

0. Close this tab's write gate and post the cross-tab gate message (section 7.5), so no autosave, live query or other tab can write or reopen the database from here on.
1. `db.close({ disableAutoOpen: true })`, and give up this tab's shared lock (section 7.5).
2. Inside the lock in exclusive mode (granted once every other tab has closed its records; not granted within 3 s → reported as blocked, nothing deleted), delete **every IndexedDB database on the origin**: the names from `indexedDB.databases()`, always including `'diet'`. When the list cannot be read (the API is missing, or it rejects), `'diet'` is still deleted, and a rejected list is reported as its own failed step ("listing the stored records"), since other databases may remain (privacy review). `Dexie.delete(name)` covers every store, the pairing (the CryptoKey) and every photo. Other connections close on `versionchange` (section 7.2). If a deletion is still blocked after 3 s, it is reported and no success is claimed.
3. **Cache Storage:** delete every cache whose name does **not** start with `workbox-precache`. Today there are none: `vite.config.ts` sets `runtimeCaching: []`, and the service worker precaches only the app's own files. The precache stays, so the app still opens offline.
4. Clear `localStorage` and `sessionStorage` (each in its own try/catch; the app uses neither today, and this covers future per-device conveniences).
5. Revoke every object URL the app created (photo thumbnails, a pending download).
6. `location.reload()`. The fresh database is created and populated (section 6), the first-run flow starts, and the fresh app stores a new random records generation in `localStorage` (section 10.5 step 6), which holds nothing else.

Each step is idempotent, so a failed run can simply be repeated. The result lists any step that failed. **A failed or blocked run always leaves a way out (ux review):** the panel names what failed in plain words, or says "The app is still open somewhere else: another Chrome tab or window, or the installed app in Recent apps. Close the app's other tabs, then try again." and, when the app's own database was not deleted, "Your records are still on this phone."; when only the list of other stored data could not be read, it says "Your records were deleted, but the app could not check for other stored data. Reload to start fresh."; says "Nothing more will be saved until the app reloads." (the gate is closed for good); and offers Reload and Try again. The Backup and data card shows the same closed line with Reload.

**What remains afterwards** (also stated in the first confirmation):
- the app's own files in the precache and the service-worker registration, which hold no personal data, so the app keeps working offline;
- a fresh database holding only the section 6 seed rows;
- browser-level state that is not app data: the home-screen install and the persistent-storage grant;
- browser features outside the app's storage: a backup password saved in Chrome's password manager (which may sync to the Google account), and Chrome's autofill entries. Free-text health inputs use `autocomplete="off"` to keep these to a minimum, and the confirmation says "If Chrome saved a backup password, remove it in Chrome's settings";
- outside the app's reach: backup files saved to Downloads or shared elsewhere ("delete them in Files"); the laptop extension's last list and its pairing ("also unpair on your laptop", C115); and any ciphertext waiting in the relay, which expires within 15 minutes.

**HS-30 (proposed wording):** "Delete-all empties every store, removes the laptop pairing and every garden photo, deletes every other IndexedDB database and every cache except the app's own files, and clears local and session storage; nothing the app was doing beforehand can write to the fresh database; only the app's files and a fresh database's seed rows remain."

---

## 12. Persistent storage and the weekly backup reminder

### 12.1 Persistent storage (PWA-06, as reworded by C98)
- This is already built at item 5 (`apps/mobile-web/src/pwa/storage.ts`): at every launch, `persisted()` is checked and `persist()` is called if it is false. Chrome shows no prompt, so this is not nagging. The result is held in `storageStore` and shown on About.
- Item 12 adds:
  - an exported hook, `onOnboardingCompleted()`, that calls `requestPersistentStorage()` when `settings.onboardingCompletedAt` is first set (item 13 calls the hook), and another call after a successful import;
  - the status line on the Backup and data card (and the same text on About):
    - `protected`: "Protected from automatic clearing. A backup is still your only copy if the phone is lost or Chrome's data is cleared."
    - `not-protected`: "Not protected yet: the phone may clear the app's records when space runs low. A backup is your only other copy."
    - `unsupported`: "This browser cannot protect the app's records from clearing. A backup is your only other copy."
    - `checking`: "Checking…" (never shown as protected);
  - the stronger reminder below.
- **The status is not stored in the database** (D24). It is rechecked at every launch, and storing a per-device flag would put device-specific data into backups. For the reminder rule only, `'checking'` counts as protected (it lasts milliseconds and must not flash a warning), and `'unsupported'` counts as not protected.
- PWA-06 is restated as: "The request is made at every launch while storage is not already persisted, and the result is shown (unit test with a mocked StorageManager)." The phrase "records survive a week" moves to the end-of-week-1 manual checklist (C98).

### 12.2 Backup reminder (BK-03; stored in card_state and settings)
```ts
backupReminder({ lastBackupAt, onboardingCompletedAt, dismissedAt, storage, now }) → { visible: boolean; prominent: boolean }
```
- No reminder until onboarding is complete (`onboardingCompletedAt === null` → hidden).
- `reference = lastBackupAt ?? onboardingCompletedAt`.
- `weak = storage is 'not-protected' or 'unsupported'`. Then `dueAfter = weak ? 3 days : 7 days` and `snooze = weak ? 1 day : 7 days`. Days are 24 h of elapsed time.
- `due = reference > now || now − reference ≥ dueAfter`: a reference dated after now (a clock that ran ahead) counts as due, not as years of silence.
- `visible = due && !cardHidden(…)` with the backup snooze: a "Not now" hides the card only while `reference ≤ dismissedAt ≤ now < dismissedAt + snooze`; while the reference itself is dated after now, the `reference ≤ dismissedAt` condition is dropped, so a "Not now" made at the correct time still snoozes it.
- Today and the Backup and data card read the clock while they draw, and draw again when the app comes back into view (`visibilitychange`, `pageshow`) and at `backupReminderNextChange(…)` (core), the next moment the answer can change (a snooze ending, a reference or dismissal dated ahead coming due); the update notice does the same with `cardNextChange` (`screens/backup/redraw.ts`).
- `prominent = weak`: the card goes first among Today's reminders, with the extra line "This phone has not promised to keep the app's records. A backup is your only other copy."
- Dismiss upserts `card_state('backup-reminder', 'weekly')` with `dismissedAt = now` and its zone (and `firstShownAt` the first time it is shown). A confirmed export clears the reminder through `lastBackupAt`; an unconfirmed one does not (section 10.5 step 6). The card's buttons are "Back up now" and "Not now".
- It is shown on Today (the Reminders card) and on the Backup and data card. BK-03 tests run with `storage = 'protected'` (due at exactly 7 days), plus the weak variant. The update notice on Today has its own card label, "App update", so the two cards never share a name. "Back up now" opens Settings with the export panel scrolled into view and focus on its lock switch.

### 12.3 Bookkeeping times are never ahead of time (health-rules review; orchestrator rulings)
The bookkeeping instants (core `bookkeeping.ts`: card `firstShownAt`, `dismissedAt` and `doneAt`; `settings.lastBackupAt` and the onboarding, alcohol-notice, profile, schedule and garden confirmation times; `rapidLossExplanationReadAt`; `profile.carbCeilingStartedAt`, `firstLowCarbAt` and `goalSetAt`; `readiness.answeredAt`; every `createdAt` and `updatedAt`, and `ingredients.packSizeEnteredAt`) say when the app did something. Transfer times (`sentAt`, `receivedAt`, `laptopReceivedAt`) are not bookkeeping and are not checked.
- **On write:** `prepare()` refuses a new or changed bookkeeping instant more than `FUTURE_INSTANT_TOLERANCE_MS` (5 minutes) after now (`StorageValidationError` rule `future`): with a correct clock only a bug can produce one.
- **On export and import: put back, never refused.** The limit is `latestAcceptedMs(exportedAt, now)`: the earlier of the file's `exportedAt` and this phone's now, plus 5 minutes (the export passes its own time as now). A bookkeeping instant later than the limit is put back to it, never earlier than an event time of the same row (so "updatedAt is not before enteredAt" still holds), and the row is kept (`clampFutureBookkeeping`): in the snapshot the export writes and self-checks, and in import step 8 for a backup and a rescue copy alike. A clock that ran ahead and was then corrected therefore never blocks a backup, an unchecked copy or a restore, and nothing is listed for it. A future `carbCeilingStartedAt` in a rescue copy becomes the limit (just after the export), never null.
- **Event starts dated ahead are refused instead** (`FUTURE_START_FIELDS`: `kickstart_periods.startedAt`, `kickstart_checks.askedAt`, `fasts.startedAt`), because the app counts from them: a backup holding one is refused, a rescue copy refuses its Kickstart history, and a fast is set aside and listed. On the phone, a Kickstart start dated ahead is `'not-started'` (section 4.5) until day 1 arrives, and End Kickstart closes it as 1 day.
- **When read:** `cardHidden` ignores any dismissal or done time still ahead of now (section 4.12), the backup reminder is due when its reference is ahead (section 12.2), and an elapsed-time start ahead of now is read as now (section 3.1), so a row written before the clock was corrected does no harm.

---

## 13. Readiness answers and the gate input (C41, C06, C07, C24, C54, C58, C102)

### 13.1 Storage
This is the `readiness` store (section 4.4). One row per answered question or confirmation. No row, or an older `wordingVersion`, means **unanswered**. `READINESS_WORDING = { q1: 1, …, q7: 1, prescriberAgreed: 1, gpExerciseDiscussed: 1 }` lives in core. Rewording a question means raising its number, which bumps the schema version and re-asks only that question.

### 13.2 The single gate function's input (built at item 12)
```ts
export type ReadinessQuestionId = 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q7';
export type ReadinessConfirmationId = 'prescriberAgreed' | 'gpExerciseDiscussed';

export interface ReadinessInput {
  /** null = no row, or a row answered under an older wording. null is treated as 'yes' (gated). */
  answers: Readonly<Record<ReadinessQuestionId, YesNo | null>>;
  /** true only under the confirmation rule below. */
  confirmations: Readonly<Record<ReadinessConfirmationId, boolean>>;
  /** minimumAgeFromBirthYear(profile.birthYear, today); 0 when the stored year is after today's year; null when no birth year is stored (C24). */
  minimumAgeYears: number | null;
}
export function readinessInputFromRows(rows: readonly ReadinessRecord[], birthYear: number | null, today: LocalDate): ReadinessInput;
/** Questions with no current answer, in order (drives "resume onboarding" and the after-import prompt). */
export function missingReadinessAnswers(input: ReadinessInput): ReadinessQuestionId[];

/** Item 13: the gate function's input is ReadinessInput plus the current weight check (HS-35). */
export interface GateInput extends ReadinessInput {
  /** isLowWeight(current weight, stored height): below BMI 18.5. Anything but exactly false gates. */
  lowWeight: boolean;
}
/** The only way to build a GateInput from records (readinessInputFromRows plus lowWeight). */
export function gateInputFromRecords(args: { rows; birthYear; heightCm; currentWeightKg; today }): GateInput;
```
- **Current weight (HS-35; item 14).** `currentWeightKg` is always `gateCurrentWeightKg(weights, today, homeTimeZone)`: the lower of the 7-day average and the latest weigh-in on or before today, however old (null with no weigh-in). Core `weightGateInput(records, today)` builds the gate input with it, and every caller uses that: the setup guard and `useReadinessGates`, item 13's actions, the weight screens, the Kickstart actions and the repository re-checks. A weigh-in added, edited or removed runs item 13's gate effects in the same action.
- The rule is `gated(q) = answers[q] !== 'no'`. An unanswered question counts as yes (C41).
- **Confirmation rule (D29).** `confirmations.prescriberAgreed` is true only when its row says `yes` under the current wording, the `q3` row exists under the current wording, and the confirmation's `answeredAt` is at or after the `q3` row's `answeredAt`. `gpExerciseDiscussed` is the same with `q6`. Re-answering Q3 or Q6 (for example after starting insulin) therefore needs a fresh confirmation; the repository also deletes the old one (section 8.2), and this read-time rule covers imported data.

### 13.3 The gate function (built and tested at item 13; outputs fixed here so items 13–15, 21, 22 and 28 agree)
`readinessGates(input: GateInput): ReadinessGates`, a pure function in core, with its input built only by `gateInputFromRecords`, used everywhere a feature is shown or a target is computed (C54: one gate function):

| Output | True when | Source |
|---|---|---|
| `under18` | `gated(q1)` or `minimumAgeYears < 18` | HS section 1, C24 point 3 |
| `fastingGated` | under18 or gated(q2) or gated(q5) or lowWeight or (gated(q3) and not prescriberAgreed) | HS-03 as reworded per C54, C07; HS-35 |
| `kickstartAvailable` | not (under18 or gated(q2) or gated(q5) or lowWeight) and not (gated(q3) and not prescriberAgreed) | DECISIONS (C06/C07/C41 row) |
| `deficitAllowed` (Kickstart and Steady) | not (under18 or gated(q2) or gated(q5) or lowWeight) | same; plan at the estimate, never below the floor |
| `ketoCeilingAvailable` | not (under18 or gated(q2) or gated(q5) or lowWeight) | HS section 1; Q5 per D30 |
| `carbCeilingBelow50Allowed` | ketoCeilingAvailable and not (gated(q3) and not prescriberAgreed) | DECISIONS, C06 |
| `projectionBandAvailable` | deficitAllowed (and, at use, an active carb ceiling) | DECISIONS, C27 |
| `goalSettingAvailable` | not (under18 or gated(q2) or gated(q5) or lowWeight) | HS section 1 (Q5, and "planner only" for Q1); Q2 and low weight at item 13 |
| `energyEstimateAvailable` | not under18 | DECISIONS (C06/C07/C41 row) |
| `alcoholLoggingAvailable` | not under18 | HS section 1 |
| `exercisePlansAvailable` | not gated(q6) or gpExerciseDiscussed | HS section 1, RD-05 |
| `pharmacistReminder`, `bloodPressureSaltWording` | gated(q4) | C41, C102 |
| `alcoholHelpCardFromDayOne` | gated(q7) | C58, AL-09 |
| `reasons` | the reason ids of the closed gates, in this order: `under-18`, `under-18-birth-year`, `pregnant-or-breastfeeding`, `diabetes-medication`, `eating-disorder-or-low-weight`, `low-current-weight`, `exercise-warning` (Q4 and Q7 close nothing) | RD-01–RD-05 |

**Q5 and the carb ceiling (D30, as changed by the orchestrator).** HEALTH_SAFETY's Q5 says "trend shown without targets", and Q1 and Q2 switch keto off explicitly. Readiness answer 5 switches the keto carb ceiling off entirely (`ketoCeilingAvailable` is false, so no ceiling below 50 g either; meals are still planned), and, through `kickstartAvailable`, the 20 g Kickstart ceiling with it. RD-04 at item 13 asserts both. A current weight below BMI 18.5 for the height (`lowWeight`, HS-35) closes the same gates as answer 5.

At item 12, `readinessInputFromRows` and `missingReadinessAnswers` are built and unit-tested. Backup import and migrations rely on "missing = gated" only through these functions, and they write nothing.

---

## 14. Traceability: where each item lands

| Item | What this spec does | Section |
|---|---|---|
| C01 | `carbsG` always available; basis as entered stored | 4.3, 4.7 |
| C04 | Goal fields on profile; the milestone is derived; the BMI check happens at entry and at use, and a goal made invalid by a height change is hidden | 4.4, 5 |
| C05 | `alcohol_day_notes`, with the withdrawal tick; the card's return rule follows C44 (D43) | 4.10, 4.12 |
| C06, C07 | Gate input and outputs; the fasting preset and window are nullable; stored deficits are kept but gated at use; Kickstart preselected off while Q3 is gated | 13, 4.4 |
| C08 | Kickstart periods; at most 3 extensions and 42 days across all periods; restart rule; no automatic restart | 4.5, 5 |
| C10, C25 | Null sex maps to the midpoint constant, so a day energy target exists for the single-meal check | 4.4 |
| C16 | Privacy copy in health.ts goes through the scanner | 1 |
| C17 | HS-30 (delete-all); HS-27 stop-sign card registered; HS-13 numbers on storage failure screens | 11, 4.12, 7.4 |
| C21 | Drinking day with a cut-over setting; Monday display week; rolling 7 days; returns after 30 days; a time zone on every event record; date-line runs | 3, 4.4 |
| C24 | Only the birth year is stored; minimum age feeds the gate input; a future year gates | 4.4, 13 |
| C30 | `plannedFastMinutes` stored only when within 1–1440 | 4.6 |
| C31 | Label energy stored as entered | 4.3 |
| C32 | Recipe confidence rule as a data predicate | 4.7 |
| C33 | `myServes`, one household-serves field per meal | 4.7 |
| C34 | One origin, database name `diet`, non-extractable CryptoKey, delete-all removes every database on the origin | 4.11, 7, 11 |
| C41 | No row (or old wording) = gated; onboarding progress fields; import and migrations reopen readiness through derivation | 4.4, 13 |
| C42 | Goal, allergens, dislikes, gluten-free household, Kickstart opt-in; the onboarding weight is the first weights row | 4.4, 4.6 |
| C43 | Allergen enum, dislikes, `budgetNote`, unknown allergens as null, allergens never lost through overrides or recipe copies; food-safety substitutions deferred | 4.3, 4.4, 4.7, 19 |
| C44 | `card_state` and its registry with a dismissal rule per card; the shown-once flags become `doneAt` | 4.12 |
| C45 | Phase derived; separate Kickstart and Steady deficits; the owner's own carb ceiling | 4.4, 4.5 |
| C46 | Rapid-loss bounds (in grams), explanation-read rule, card never hidden past the day; alcohol guidance set | 4.4, 4.12 |
| C47 | `symptom_log`, independent of fasts; the GP nudge card | 4.6, 4.12 |
| C48 | Import works in a fresh Incognito tab or Guest window (nothing device-specific is needed, unknown zones are accepted) | 3.4, 10 |
| C49 | Whole-store device-only exclusions; per-version allow-lists; equality definition | 10.3, 10.8 |
| C50 | Constants in core; out-of-range refused on import; consumers clamp; narrowing by migration is mapped and shown | 4.3, 9.2, 10.6 |
| C51 | `jogOptIn`, `weeklyPattern` with several templates a day, templates in code | 4.4, 6 |
| C52 | `version`, `sentVersion`, `receivedVersion`, phone-clock `receivedAt`, laptop time kept separately, derived status | 4.11 |
| C55 | `presetChosenBy`; the day-22 "keep 23:1" button lives on the steady-explainer card | 4.4, 4.12 |
| C56 | Period end reasons; no restart on mode switch | 4.5 |
| C57 | `garden.amount` nullable; silverbeet seeded with no amount | 4.8, 6 |
| C58 | Q7 wording version 1 | 4.4 |
| C59 | `kickstart_checks`; outcome rule; the 3-day window; the extension card | 4.5, 4.12, 5 |
| C63 | No streak stored; credited day derived from the fast's end | 3.2, 4.6 |
| C65 | Only the protein range is stored; the effective target is derived | 4.4 |
| C67 | `nutrientBasis`, `cookedYield` with citation | 4.7 |
| C68 | `unknownNutrients` (fibre not on label), serving size, carb basis | 4.3, 4.7 |
| C69 | Pack-size source and entered-at, also as an override patch | 4.7 |
| C70 | `moderateNetCarbCeilingG`, `fibreGuideG`, `waterTargetMl` | 4.4 |
| C72, C109 | Elapsed-time day counts from `carbCeilingStartedAt` and `firstLowCarbAt` | 3.1 |
| C73 | Meal slots; per-date snack offer card | 4.7, 4.12 |
| C76 | Per-set results; volume definition | 4.9 |
| C81 | Relay origin compared at use, never in storage validation | 4.11 |
| C84 | List id and version stored | 4.11 |
| C86 | `.gitignore` patterns confirmed with `git check-ignore`; new patterns for the other exports | 10.1 |
| C89 | File-name helper, envelope marker, ignore and scan tests | 10.1, 16 |
| C92 | Beverage label figures nullable and tied to the measure they were read for; `origin` | 4.3, 4.10 |
| C94 | Unrounded per-serve standard drinks stored; one shown figure for display and thresholds | 4.10 |
| C98 | Persistence checked at every launch, status in memory, honest wording, stronger reminder | 12 |
| C99 | PBKDF2, AES-GCM, header as additional data, iterations read from the file, fixed import minimum, self-verification, fixed reference files | 10.4, 10.5, 9.4 |
| C100 | GP summary: nothing stored; file name through the helper | 10.1, 17 |
| C102 | Blood-pressure salt line on the stop-sign and electrolyte cards (registry) | 4.12, 13 |
| C107 | `substitutes` as ids | 4.7 |
| C108 | Raise-only energy floor | 4.4 |
| C110 | `gramsPerEach`, garden units | 4.7, 4.8 |
| C111 | Price in cents with basis and entered-at; `fromPantryG` | 4.11 |
| C113, C115 | `transferId` never derived from the room id; unpair stays local | 4.11 |
| HS-11 | Rapid-loss card returns daily while its condition holds; later Kickstart periods count | 4.12, 4.5 |
| HS-13 | Help numbers on every storage failure screen | 7.4 |
| HS-15, BK-01 | Section 10.8 | 10.8 |
| BK-02 | Unlock failure leaves the database untouched | 10.6 |
| BK-03 | Section 12.2 | 12.2 |
| PWA-06 | Section 12.1 | 12.1 |
| HS-14 | Export, import, rescue and delete-all make no network requests | 10.5, 16 |
| HS-24 | Recipe allergens unioned with current line allergens at read | 4.7 |
| HS-30 (new) | Section 11 | 11 |

---

## 15. Document updates made in the item-12 commit

- **DATA_MODEL.md:** replace the table list with section 4 in plain language (new stores: kickstart_periods, kickstart_checks, symptom_log, ingredient_overrides, alcohol_day_notes, card_state, garden_photos; `exercises` noted as a dataset in code; the targets changes per C45, C50 and C70; grocery status derived). Add the times, zone-fallback and drinking-day rules to the shared rules. Add C92's sentence: "A beverage preset counts as 'verified' (NN-01) when its kcal comes from the label." Rewrite "Export formats, Backup": the file names, the envelope as a **table of fields** (no JSON key-value pair for the marker, section 10.1), the allow-list and C49's sentence naming both exclusions, the locking parameters, import refusing anything out of range, and the rescue copy.
- **HEALTH_SAFETY.md:** reword HS-15 (C49). Add HS-30 (delete-all) to section 8, because it is built here; C17 already reserved the number. Extend HS-13 to the storage failure screens. Section 7: name the locking method, say that delete-all leaves saved backup files, any saved browser password and the laptop untouched, and that a backup is recorded only when the owner confirms the file is there.
- **TEST_PLAN.md:** reword BK-01 (C49) and BK-03 (weak-storage variant; "Can you see the file?"); add BK-04 (tampered header or ciphertext refused), BK-05 (newer or unknown version refused), BK-06 (out-of-range values refuse the whole file, C50), BK-07 (a write failure leaves the database unchanged and offers the rescue copy), BK-08 (file names ignored by git, files trip the scan rules, C89), BK-09 (the fixed version-1 reference files import), BK-10 (rescue copy on upgrade failure), BK-11 (a newer database is never changed by older code) and an HS-30 case. Reword PWA-06 (C98). End-of-week-1 checklist: "records survive a week" (C98), and do the backup import in an Incognito tab on the same phone with a locked backup (C48).
- **UX_SCREENS.md:** section 7 Settings: remove "units"; add the drinking-day cut-over (C21), the rapid-loss bounds after their explanation (C46), the alcohol guidance set (C46), dislikes (C43) and hidden recipes and foods (D3); the backup entry becomes "Backup and data (export, restore, delete all data, storage status line, last backup made)" (C98). Section 2 card 8: the backup reminder wording of section 12.2.
- **`.gitignore`:** add `diet-*.json`, `diet-*.csv` and `diet-*.txt` (section 10.1).
- **DECISIONS.md:** rows for the decisions in section 19 (grouped as the orchestrator prefers), including the C08 restart rule, the C21 drinking-day defaults, the C46 bounds (owner to confirm at STOP 17), the C43 food-safety deferral, and the C05/C44 choice.
- **IMPLEMENTATION_CHECKLIST.md item 12** acceptance: add HS-30 and BK-04 to BK-11. **README.md** status line.

If any part of this spec is copied into a committed document, keep the envelope examples in the unquoted form of section 10.2.

---

## 16. Tests for item 12

Test titles carry their HS, BK, RD or PWA ids so the coverage table (C118) can map them. Core tests run in Node. Database tests run in Node too (`// @vitest-environment node`), with real Dexie 4.4.6 over `new IDBFactory()` from fake-indexeddb for each test. Component tests use jsdom with fake repositories. Any test password is a phrase containing spaces, so the `assigned-secret` scan rule does not fire.

**Core unit tests (`packages/core/src/storage/*.test.ts`)**
1. *Formats:* each of Instant (canonical only; refuses an offset form, a missing millisecond part, 1999 and 2100), LocalDate, ClockTime, TimeZone (syntax: `America/Argentina/Buenos_Aires`, `Etc/GMT+10` and `UTC` pass; `Etc/Unknown`, an empty string and 65 characters fail; a well-formed name `Intl` does not know passes the validator), Id, SeedId, Text and Note, Int and Num (`-0`, NaN, non-integer).
2. *Every store's validator:* the default or synthetic row passes. For each field: wrong type, null where not allowed, below min, above max, a missing key, an extra key, and `__proto__`, `constructor` or `prototype` keys at depth → refused, with the right `field` and `rule`. A table-driven test generates these cases from the specs, so a new field is covered automatically.
3. *Intra-record rules:* each "iff" and "equals" rule in section 4 has a passing and a failing case (goal trio, preset and window length, label energy provenance including a value of 0, label origin, drinks `stdSource` and label agreement, recipe confidence predicate, Kickstart check outcome, fast and period end zones, garden unit, grocery versions and timestamps, rapid-loss explanation rule, weekly pattern with 0–3 templates, `unknownNutrients` by source and the all-eight refusal, session `done` entries matching reps or seconds, card trigger patterns).
4. *Cross-record invariants* (section 5): two running fasts; overlapping fasts; two onboarding weights; a check whose period is missing; overlapping periods; an `endedAt` after the scheduled last day; an unknown card trigger; duplicate keys.
5. *Kickstart window and cap (C08, C59, D27, D28):* a check on day 3 (too early), on day 18 (valid, last 3 days), on day 22 of an unextended period (too late, after the natural end); a check after a `stop-sign` check in the same period; a 4th extension across two periods; a second period after a first period with 3 extensions (refused: 42 used); two 21-day periods (allowed, 42); a 28-day first period then a new period (refused); an early end on day 10 then a 21-day period with one extension (allowed, 38) and a second extension (refused, 45).
6. *Times:* `drinkingDayOf` at 04:59 and 05:00; a 23:30–01:30 session on one day; NZ 5 Apr 2026 (02:30 twice) and 27 Sep 2026 (skipped hour); cut-overs of 0 and 360; a drink recorded in `Australia/Sydney` uses its own zone. `utcRangeCovering` includes every record for zones at +14 (`Pacific/Kiritimati`) and −11 (`Pacific/Pago_Pago`). **Date line:** drinks in `Pacific/Honolulu` on Monday evening and in `Pacific/Auckland` on Wednesday evening are consecutive; the same gap in one zone is not. `collapsedUntil`: dismissed at 22:00 in Auckland ends at the next Auckland midnight even when read in Honolulu; the alcohol-help boundary uses the cut-over. `resolveZone` falls back to the home zone, then `UTC`, with `fallback: true`.
7. *Readiness:* no rows → all `null` → `missingReadinessAnswers` lists q1–q7; an older wording version → null; a row answered `no` → not missing; minimum age from birth year (in the year turning 18 → 17); a birth year after today's year → minimum age 0. **RD-03 and RD-05 re-answering:** a `prescriberAgreed` row answered before the latest `q3` answer does not count; one answered after does; likewise `gpExerciseDiscussed` with `q6`.
8. *Profile mapping:* null sex → `EstimateSex` `'unspecified'` and the women's guidance set; `alcoholGuidanceSet` `'nz-men'` with a female profile → women's figures (the stricter).
9. *Overrides and allergens:* `effectiveIngredient` applies each change kind over a seed; a seed gains `tree-nut` in a later dataset after an override changed only its pack size → the effective allergens include `tree-nut` and the planner warning appears; `addAllergens: null` → unknown; an override of a removed seed is ignored. `recipeAllergens`: a stored recipe list lacking an allergen that a line's current ingredient now carries still reports it; a line whose ingredient does not resolve → `allergensUnknown`.
10. *Derived:* `shownStdDrinksPerServe` for a label row (stored figure, even when lower than the calculation) and a calculated row with a corrupted low stored figure (the recomputed figure wins); `groceryListStatus` for draft, waiting, expired, received, edited-since-sent; `nutrientCompleteness` counts entries without carbs.
11. *Backup reminder (BK-03):* at 6 d 23 h 59 m hidden; at 7 d visible; dismissed at 7 d, hidden at 13 d 23 h and visible at 14 d; a confirmed export resets it; weak storage visible at 3 d and back 1 day after a dismissal and prominent; onboarding not complete → hidden; `'checking'` treated as protected.
12. *Base64:* every byte value, empty input, 5 MB, refusal of non-canonical input.
13. *Lock (C99):* round trip; the wrong password → `wrong-password-or-damaged` (BK-02); tampering with each header field in turn (iterations ±1, salt, IV, version, encrypted flag, cipher length) → fails; flipping a ciphertext bit → fails; iterations of 599,999 and 10,000,001 refused before derivation; salt length 15 and IV length 11 → `damaged`; a fresh salt and IV each time (two exports differ); the password is trimmed and NFC-normalised; `PBKDF2_IMPORT_MIN_ITERATIONS` stays 600,000 even when a test raises the export figure.
14. *Export self-verification:* an encoder variant with the additional-data order swapped (injected through a test seam) makes the export refuse; so does a broken base64 chunking variant.
15. *Envelope and payload:* plain round trip; refusals for `format` wrong, envelope versions 2, 0, `"1"` and 1.5, `schemaVersion` = current + 1 (`newer-version`), `kind` missing or unknown, `exportedAt` not canonical, `appVersion` not semver or 41 characters, a missing store, an extra store, a device-only store present, a non-array table.
16. *C50 safety (BK-06):* a file with `energyFloorKj` 3000, `kickstartDeficitPct` 50, `steadyDeficitPct` 25, protein max 210, carb ceiling 10, moderate ceiling 140, a rapid-loss threshold of 1,200, 3 extensions plus 1, or 49 Kickstart days → each refused with nothing imported. A test also confirms that the floor and cap constants are not fields of any store.
17. *Migrations:* chain versions consecutive; `SCHEMA_VERSION` = the last entry; `STORES_V1` inline snapshot; `SPEC_FINGERPRINTS[SCHEMA_VERSION]` matches and changes when any `VALIDATOR_CONSTANTS` value changes; `GOLDEN_VECTORS[SCHEMA_VERSION]` matches the live core outputs; the v1 fixture hash is pinned; the v1 fixture passes v1's own specs and lists; test-only chain (a) migrates the v1 fixture and passes the v2 validators; chain (b) maps a stored 20 to 18, records one change, and that change becomes an audit row and the `update-notice` trigger `v2`; chain (c) imports a v1 file with the new backed-up store empty and never expects the device-only one; the pure step tolerates missing device-only stores.
18. *Registry:* `BACKUP_TABLES ∪ DEVICE_ONLY_TABLES` = the store names, with no overlap, for every version; every store has a spec, a fixture row and (if backed up) an allow-list; populate rows pass validation; every card has a dismissal rule.
19. *Import fuzzing:* a seeded PRNG (mulberry32; default seed fixed, `FUZZ_SEED` to explore) applies 2,000 mutations to the v1 fixture's payload. The mutations: delete, add or rename a key; change a type; push a number past each bound or make it `-0`; set a 10,000-character string; duplicate or empty an array; swap an enum value; add `__proto__`; truncate the JSON text; change the store names; change `exportedAt`, `appVersion` or `kind`. Required: `decodeBackupText` either returns a snapshot that passes `validateSnapshot`, or throws a `BackupError`, never any other error. A further 40 mutations of a locked file's header and ciphertext must all give `damaged` or `wrong-password-or-damaged`.
20. *Unknown zone on import:* a backup whose records use a well-formed zone that this `Intl` does not know imports, and its entries are placed with the home zone and `fallback: true`.
21. *Errors carry no values:* sentinel values (kg 123.456, a note "zzsentinel", an `alcohol_day_notes` key of 2000-02-29) written through every failure path (validator, invariant, repository, import, middleware) are absent from the error message, from `String(err)`, from any `cause` chain (there is none) and from the stack text.

**Database integration tests (`apps/mobile-web/src/db/*.test.ts`, real Dexie on fake-indexeddb)**
22. *Open (BK-11):* 28 stores with the section 4.2 keys and indexes (`db.tables` schema compared with `STORES_V1`); native version 10; populate rows present (3 singletons, the "Zero-sugar premix" preset with `origin: 'preset-default'`, the "Silverbeet" garden row with amount null). The pre-check on an empty factory creates nothing (`databases()` is empty afterwards) and the first real open still runs populate; the raw-open fallback (with `databases` removed) does the same. **Newer database:** create a database with test-only chain (d) at version 2, then open with the v1 code → `newer-version`, `DietDb` never constructed, and the database's store list, index list and native version (20) are unchanged with no `$meta` store. Post-open check: a v1 `DietDb` opened directly (pre-check bypassed) against a v2 database that only added a store → closed, `newer-version`, nothing changed.
23. *Generic repositories:* for every store whose generic column in section 8.4 includes create, update or remove: create, get, list, an index range query, update and remove. An invalid write is refused and the store is unchanged. A raw `db.<store>.put(invalid)` is refused by the middleware, and `db.weights.update(id, { kg: 5 })` is refused too. The generic repository refuses update and remove on kickstart_periods and kickstart_checks, and everything on drinks_log except get and list; the middleware refuses a raw `put` or `delete` on kickstart_checks and a keyed `delete` on kickstart_periods. transfer_pairings has no repository at item 12; the tests write it raw.
24. *Special repositories:* the running fast (`start` refused while one is running; `running()`); `start()` with a planned figure of 1470 (the NZ autumn night) stores null and does not throw; kickstart `startPeriod` and `recordCheck` (the cap and window cases of test 5 through the repository; a palpitations "yes" → `stop-sign`, the count unchanged; `endPeriod` twice refused); readiness `answer('q3')` deletes `prescriberAgreed` in the same transaction; `drinks.log` computing the figures; `forDrinkingDays` across midnight; card_state upsert by compound key with `dismissedTimeZone`; a garden photo for an unknown garden refused; removing a garden row removes its photo.
25. *Normalisation:* a note with `\r\n` and a tab saves with `\n` and a space; a single-line name with a newline saves with a space; a computed `-0` saves as `0`; a write with a zone this `Intl` does not know is refused with `zone-unknown`, while editing the note of an old row in such a zone succeeds; a birth year after this year is refused with `future-year`.
26. *BK-01 / HS-15:* fill every backed-up store from the fixture (including a sent and acknowledged grocery list with a `transferId`), add a pairing (a real non-extractable AES-GCM key) and a photo; export plain; answer Yes; delete all; import; section 10.8 equality; pairing and photos empty; the file contains no room id, relay URL, photo bytes or device-only JSON keys. Repeat for a locked file.
27. *BK-02:* a locked export of dataset A; seed different dataset B; import with the wrong password → error; `S(db)` still equals B (including `lastBackupAt`); a retry with the right password → A.
28. *All or nothing (BK-07):* a test middleware throws on the `audit` bulkAdd (the last store) → `write-failed`, `S(db)` is unchanged, and the "Save what was on this phone" offer holds the pre-import snapshot; likewise with an injected `QuotaExceededError`.
29. *Replace semantics and confirmation:* rows not in the file are gone after import; the pairing is cleared; a photo whose garden id is in the file is kept, and others are deleted. The confirmation counts N (not in the file) and M (rows that differ from the file's copy by content, whatever their timestamps; an edited weight, an edited fast and a settings change each count), shows both newest dates, and makes "Export what is on this phone first" the default when N or M is above zero. A fresh phone (seed rows only, or just after delete-all) counts nothing and makes Replace the default.
30. *RD-08:* importing a backup with no readiness rows leaves every gate input gated, and `missingReadinessAnswers` lists q1–q7.
31. *Delete all (HS-30):* with every store filled, a pairing, a photo, an extra IndexedDB database, a runtime cache, a precache cache (mocked `caches`) and localStorage and sessionStorage keys: after `deleteAllData()` and reopening, only the seed rows remain; the extra database is gone; only the `workbox-precache…` cache remains; both storages are empty; a blocked deletion reports failure and claims no success. **No resurrection:** a debounced autosave that fires after step 0 and a live query that re-runs after step 1 do not reopen the database or write any row; after the reload, only seed rows exist.
32. *Upgrades through Dexie:* a v1 database with the fixture opened by test-only chain (a) → migrated and validated, and only the rewritten stores were cleared and refilled (a spy on the other stores sees no writes). A failing v2 step → open reports `upgrade-failed`, the database is still v1 with its data unchanged, and the rescue file imports into a v1 app. A device-only row that fails the last-step validation (a photo 5,000 px wide) is deleted and the upgrade succeeds. A changed relay constant across an upgrade keeps the pairing row; it reads as not paired at use. Chain (c) from a v1 database: rescue during a failure of that step writes the new store as an empty array and reads no device-only store.
33. *Fixed reference files (BK-09, C99):* the pinned version-1 plain and locked envelopes decode, decrypt with the reference phrase and import, and the result equals `migrateSnapshot(1, snapshotV1)`.
34. *Rescue (BK-10):* the file name ends `-rescue-locked.json` by default; the lock is on by default; rows are built from the version's allow-list; a rescue file containing one invalid weight imports the rest after "Import the rest", lists the set-aside row by store and position only, and leaves `lastBackupAt` unchanged.
35. *Export self-check:* two exports of the same data differ only in `exportedAt` (plain); a deliberately corrupted row (written with the middleware disabled in the test) makes export refuse with a message naming the table, field and rule, and offers "Save an unchecked copy", which produces a rescue file and leaves `lastBackupAt` unchanged.
36. *Other tabs:* a `versionchange` from a second connection → `reload-needed`, the gate closed, and a later query fails rather than reopening; a `gate` message on the `diet-db` channel does the same; an import in one connection gates the other.
37. *Transactions:* (a) documents the hazard: an `async` scope that waits for its own transaction's `complete` event (listened for before the first request, so it is deterministic) between `clear()` and `bulkAdd()` leaves the store empty and rejects (`PrematureCommit` or `TransactionInactiveError`). If a later fake-indexeddb stops reproducing this, delete (a) and keep test 38.
38. *Scope scan:* `txScope` reports the fixture with `await crypto.subtle.digest(…)` between `clear()` and `bulkAdd()`, a `try` inside a scope, a `.catch(` inside a scope and a `.then(` on a non-Dexie promise; the same inside a helper the scope calls or passes on (same file, object method, or relative import), including `sleep()` and the review's G1–G3 cases on copies of the real `crud.ts` and `snapshot.ts`; it passes the real `db/` sources.

**Component tests (jsdom)**
39. *Backup and data card:* the storage status line in each state (including "Checking…"); "Last backup made" wording; the lock toggle on by default; the password rules (10 characters minimum, the two entries must match, the unrecoverable warning shown); `autocomplete="new-password"` on export and `"current-password"` on import; the plain-file warning; after an export, "Can you see the file?" — **No** leaves `lastBackupAt` and the reminder unchanged, **Yes** records it; restore shows counts and requires Replace; the wrong-password message; delete-all needs both confirmations and lists what remains.
40. *BK-03 card:* appears from the pure rule, Not now dismisses (persisted through the repository), Back up now starts an export, prominent placement when storage is weak.
41. *Storage failure screens (HS-13):* each of `newer-version`, `upgrade-failed`, `unavailable` and `reload-needed` shows the not-a-medical-device line and 111, 0800 611 116, 0800 787 797, 8681 and 1737, with the database mocked as unavailable; `upgrade-failed` offers the rescue copy and no delete-all.
42. *PWA-06:* the existing App tests, plus the call after a successful import and the call from `onOnboardingCompleted()` the first time `onboardingCompletedAt` is set (and not again).

**Browser end-to-end (Playwright, production build)**
43. *BK-01 in Chromium:* seed records through the UI or a test hook, export (catch the `download` event, check the file name pattern), confirm Yes, delete all, restore with `setInputFiles`, records visible. The same round trip **locked** (the default): the `-locked.json` name, a header of exactly format, version, encrypted, kdf, cipher and ciphertext with 600,000 iterations, a 16-byte salt and a 12-byte IV, the password nowhere in the page, its inputs or its address afterwards, and a restore with the password. *BK-02* in the browser, with the error linked to the cleared, focused field.
44. *HS-14:* the network audit, with the request recorder and the policy-violation recorder attached before the first page load, stays green while export (plain and locked), password unlock, restore, rescue and delete-all run, online and offline. Same-origin requests must be one of the app's own files (the precache manifest read from the served `sw.js`, plus the page, `sw.js` and the Workbox runtime); a planted same-origin request that carries data in its path fails the audit. *HS-30 in Chromium:* with an extra database, a runtime cache and both storages seeded, delete-all leaves only `diet` (seed rows only), the `workbox-precache` cache, empty storages and an active service worker; in a two-tab variant the other tab shows the reload-needed screen. *Two tabs, section 7.5:* a second tab that keeps writing until it notices the gate message cannot write on top of a restore. "Export … first" and "Back up now" leave the lock switch in view and focused.
45. *PWA-06:* Settings shows the result of `navigator.storage.persisted()`.

**Added by the review fix pass (each written to fail on the bug it guards; see the commit)**
- *Kickstart across zones (core `kickstartZones.test.ts`):* a period started in Kiritimati and ended a minute later in Pago Pago counts 1 day; over every pair of 12 zones, 8 starts (including daylight-saving nights), 15 lengths and 0 or 3 extensions, the count is at least 1, at most the scheduled length, at least the start-zone days that passed, and covers the real time; a seeded walk of zone switches never lets Kickstart run past 42 real days or start a period with more than 21 used. Through the repository, toggling the device zone between UTC+14 and UTC−11 counts each of 21 one-minute periods as a day (21 days), so only one more period can start, and it can neither extend past 42 days nor be stretched by flying west.
- *Future times:* `cardHidden` ignores dismissals and done times still ahead; the backup reminder is due when its reference is ahead, and a "Not now" then still snoozes it; repositories refuse a bookkeeping time more than 5 minutes ahead; export and import put one later than the limit back to it (a clock corrected after a write never blocks a backup, an unchecked copy or a restore); a Kickstart start, check or fast start dated ahead is refused on import; `done` is refused for the rapid-loss and alcohol help cards.
- *Second review fix pass (orchestrator rulings A to F):* a phone at 42 Kickstart days keeps its history when an older backup or rescue copy has none, and says so on the confirmation; a clock set back after 20 days of Kickstart still ends it at the newest saved record, and a start or check with the clock behind is refused; a start dated ahead is not running and ends as 1 day; a damaged phone singleton is ignored by the merge, and the same phone's copy is refused in plain words; a missing safety field, an empty or doubled singleton store, a failing alcohol figure or diet mode refuse a rescue copy; a failing Kickstart choice becomes "no" and allergens keep what can be read; a Kickstart row failing only after a test-only migration refuses the copy; an unanswered "Can you see the file?" is dropped by another tab's gate message and cannot be confirmed for a later generation of the records; Today draws again on `visibilitychange`, `pageshow` and at the next change; the network audit is a fixture of every backup test with exact precache revisions, browser-made headers only, no cookie, no WebSocket and a quiet period, with self-tests for each leak; locked rescue copies from every entry point open with their password; a second locked export has a fresh salt and IV.
- *Rescue copies (test-fixtures `rescueImport.test.ts`, app `backup.test.ts`):* failing or duplicate Kickstart history refuses the copy; the Kickstart caps still refuse; a second running fast, a second onboarding weigh-in and an unknown card are set aside and listed in plain words; a failing non-safety singleton field is reset and listed; a failing safety setting refuses; the more cautious safety setting of the phone and the file is written and the ones kept from the phone are listed; a plain backup is never merged.
- *Migration contract (core `migrations.test.ts`, test-fixtures `migrationChains.test.ts`, app `upgrade.test.ts`):* steps that leave out a store, lose rows, or make valid rows that break section 5 (a running fast, 49 Kickstart days) are refused on import and leave a version-1 database exactly as it was. The golden vectors pin the outcome of about 55 boundary rows through `checkRow` and every format predicate on its edges, and the fingerprint covers each format's pattern and bounds.
- *Lock handshake (app `locks.test.ts`):* the exclusive lock waits for every shared holder and times out without running; a restore waits for a busy second connection, and without the lock that connection's writes land on top (the control); a tab that does not let go blocks restore and delete-all with nothing changed; `startStorage` holds the shared lock, closes for good on another tab's gate message, and lets go; a database that fails to open lets go too.
- *Delete all:* a rejected `indexedDB.databases()` still deletes `diet` and reports "listing the stored records".
- *Plain words (core `errors.test.ts`):* every stored field name at any depth has a plain label; no description of any store, field and rule, and no `BackupError` message, holds a code name.
- *Component tests:* the pending "Can you see the file?" survives leaving the screen and a reload; Yes shows the copy-it-off-the-phone note and Close; the Locking status line; focus moves to each new step and to the cleared password field, which carries `aria-invalid` and `aria-describedby`; a fresh phone's restore shows no loss with Replace as the main button; a restore over records puts "Export what is on this phone first" first and draws Replace in amber; a blocked restore or delete-all says the app is open elsewhere, says nothing more will be saved, and offers Reload and Try again; the update notice has its own "App update" label; the storage failure screens name their card "What happened", make the rescue copy the main button and say where the file went.
- *`pnpm --filter <package> test`* runs that package's tests (a coverage scan requires the script).

**Repository scans (`tools/scans/backupFile.test.ts`)**
46. *BK-08 / C89:* `git check-ignore --no-index` reports ignored for every output of `backupFileName` (plain, locked, rescue, rescue-locked, and with " (1)") and of `exportFileName` (GP summary and grocery exports), at the root and in a subfolder; a plain and a locked envelope generated at run time trip the `backup-marker` content rule, and the backup names trip the `backup-file` path rule. `backupFileName` uses the local date: `2000-01-01T19:00:00.000Z` in `Pacific/Auckland` (08:00 on 2 January there, still 1 January in UTC) gives `diet-backup-2000-01-02…`, and `2000-01-01T10:30:00.000Z` (23:30 on 1 January there) gives `diet-backup-2000-01-01…`.

---

## 17. Deliberately left to later items

- **Item 13:** `readinessGates` and the RD tests (RD-04 asserts that Q5 switches the keto carb ceiling off and closes Kickstart, per D30); the onboarding screens and `onboardingResumeStep` from the section 4.4 order; requiring sex before `onboardingCompletedAt`; preselecting `kickstartOptIn: false` while Q3 is gated; the first-run guard (C53: alcohol notice before anything, import only after acknowledgement); writing the onboarding weight; setting the fasting preset; calling `onOnboardingCompleted()`; health.ts wording for the readiness questions.
- **Item 14:** goal entry with the HS-01 checks; the phase engine on `kickstart.ts` (day N, scheduled end, flip, the extension offer, the restart cap and the "first 21 cumulative days" rapid-loss rule of D27, with tests that a 22-day restart does not suppress the card); the rapid-loss rule; the weight, stop-sign, extension and steady-explainer cards; the projection band.
- **Item 15:** the fasting UI and streak computation; symptom-log UI and the nudge rule; reflux options; the single-meal snack card; the planner's refusal to plan more than 1,440 minutes (C30).
- **Item 16:** the full Today dashboard (item 12 adds only the backup reminder).
- **Items 18, 20, 26:** the seed datasets and their validation scripts (`seed:silverbeet` MUST exist; `carbBasis` and `unknownNutrients` per NU-01).
- **Item 19:** photo capture, downscaling and thumbnails (the store exists from item 12); `harvestedAt` entry.
- **Items 21–22:** the targets engine and its clamping functions, effective protein and ceilings (including `moderateNetCarbCeilingG` and the fibre guide default by sex), the planner, the electrolyte and cholesterol card triggers.
- **Item 23:** the food-log UI, with UX 3c's label form gaining sugars, a serving size, fibre "not on label" and the carb basis (C01, C68); the cholesterol "share with your GP" summary (C100). That summary is a derived, local-only export named through `exportFileName`, so it needs no store, it is not part of the backup, and it never goes through the relay.
- **Item 24:** grocery aggregation, audit rows, line `origin`, CSV and JSON list exports through `exportFileName`.
- **Item 27:** per-set logging and the C76 volume cap on `done[]`.
- **Item 28:** alcohol screens and help-card triggers (consecutive days through `areConsecutiveDrinkingDays`).
- **Items 30–31:** pairing creation, the CryptoKey, the relay, a fresh `transferId` per send, acknowledgement handling into `receivedVersion`, `receivedAt` and `laptopReceivedAt`.
- **Item 37:** the theme and text-size UI.
- **Deferred and off:** food-safety substitutions (C43; D33). Turning them on later adds a profile field under section 9.
- **Later:** Health Connect steps; photos in backups (an optional future change, C49).

Each of these items changes storage only by bumping the schema version under section 9.

---

## 18. Judgement calls to put in the owner's plain-English report (none blocks the build)

1. Drinks before 5 am count toward the previous evening; this can be changed in Settings (C21). A day skipped by crossing the date line does not break a run of drinking days.
2. Kickstart can run for at most six weeks in all, counting every Kickstart you ever start. A new Kickstart is allowed only if a full three weeks still fit, and only your first three Kickstart weeks are free of the "losing quickly" card; after that the card can appear in any week, including a restarted Kickstart.
3. The extension check is only offered in the last 3 days of Kickstart, and only after you tap Extend.
4. If you change your answer about diabetes medicines or about exercise warnings, the app asks again for the prescriber or GP confirmation.
5. For an eating-disorder history or low weight (question 5), the keto carb ceiling is switched off entirely, and Kickstart is closed; meals are still planned.
6. The "losing quickly" card can be dismissed only for the day; it comes back the next day while the pattern continues. The alcohol help card's triggers work the same way, including the "felt shaky" tick (this is more cautious than "monthly").
7. The cholesterol check-in reminders each go away once dismissed; the next one still comes at its time. The reflux "see a GP" nudge, once dismissed, returns after a week if symptoms continue.
8. The backup reminder comes after 7 days, or after 3 days if the phone has not agreed to keep the app's storage. A backup only counts once you confirm you can see the file.
9. A backup password must be at least 10 characters, and a forgotten one cannot be recovered. If Chrome offers to save it, that copy is in your Google account, not in the app.
10. Restoring a backup replaces everything on the phone and removes the laptop pairing. Garden photos are not in backups. If the phone has newer records than the file, the app suggests saving them first.
11. If an update ever fails, the app offers a "rescue copy" of your records before anything else.
12. Delete-all removes everything the app stores. It cannot reach backup files you saved elsewhere, a password saved in Chrome, or the list on the laptop.
13. The rapid-loss card can only be made more sensitive: from 0.75 to 1 kg a week, over 2 or 3 weeks (C46; confirm at STOP 17).
14. Only your birth year is stored, not the month. The app asks your sex for the energy estimate and the guidance figures; until it is entered, it uses the cautious figures.
15. Food-safety substitutions are left out for now and switched off (C43).

---

## 19. Decisions made in this spec

Choices that the planning documents and DECISIONS.md do not already fix. Each is the conservative option where the delegation applies. The numbers are stable references used in the text above; the list is grouped by topic, so a few numbers appear out of order. The orchestrator can record them in DECISIONS.md, grouped as it prefers.

**Shape of the data**
- **D1.** One IndexedDB database named `diet` with 28 stores, 26 backed up. Device-only: `transfer_pairings` (C49) and a new `garden_photos` store, so garden rows round-trip with no exceptions and lists never load image bytes. All primary keys are inbound strings (UUID v4 or fixed literals); no auto-increment.
- **D2.** Seed datasets (ingredients, recipes, exercises, session templates, drink-picker serves) stay in code with `seed:` ids; the database holds only what the owner creates or changes. A correction to a seed ingredient is a patch of field groups in `ingredient_overrides`, merged over the current seed when read. Allergens can only be added; the effective list is the union of seed and override, and unknown on either side is unknown.
- **D3.** Editing a seed recipe creates an owner copy, and a seed recipe with a copy is not suggested. `settings.hiddenSeedIds` hides seeds explicitly.
- **D4.** Derived values are not stored, except the documented snapshots (drinks per-serve figures, recipe nutrition, food-log nutrients). Also derived: phase, extension count, streaks, effective targets, drinking days, local dates, grocery list status (the DATA_MODEL `status` field is dropped) and a recipe's "allergens unknown".
- **D5.** Times are canonical `toISOString` instants with the IANA zone on every event record, card dismissal and audit row; bookkeeping instants have no zone; C72 and C109 day counts are elapsed 24-hour periods.
- **D6.** Zones are checked only for syntax in validators. Whether the browser knows a zone is a write-time repository check; when reading, an unknown zone falls back to the home zone, then `Pacific/Auckland`, then `UTC`, and the screen says so.
- **D7.** Drinking-day cut-over default 05:00, adjustable from 00:00 to 06:00 in 30-minute steps (C21 fixes "05:00, adjustable"; the range and step are this spec's).
- **D8.** A date skipped by a time-zone change does not break a run of consecutive drinking days.
- **D9.** "Collapsed for the day" lasts until the next calendar midnight (or, for the alcohol help card, the next drinking-day cut-over) in the zone where the card was dismissed.

**Validation and versions**
- **D10.** Validators are pure functions of the value and the code version (structural and safety rules), shared by the middleware, import, upgrade and the export self-check. Repositories normalise input and add environment checks. Validators never read the clock, configuration or the browser's zone data. Errors carry no values and no record keys, and have no `cause`.
- **D11.** Repositories normalise text and `-0` before validating; import refuses such values instead (C50's "never clamp" applies to import).
- **D12.** Any change to the stored shape, registries, store lists, a validator constant or the behaviour of a core function a validator uses needs a new schema version, guarded by `SPEC_FINGERPRINTS` and `GOLDEN_VECTORS`.
- **D13.** Migrations may widen freely. Narrowing a safety range maps each value to the nearest safe value (or the default), records it as an audit row (`kind: 'migration'`) and shows a one-time `update-notice` card; a required non-safety range may only widen; a removed enum value maps to null or the default with a notice. Each version's specs are frozen and kept, with per-version backed-up and device-only store lists, and import validates a file against its own version before migrating.
- **D14.** `runUpgrade` rewrites only the stores a step changes, validates every row on the last step, deletes failing device-only rows, and fails the upgrade (with a rescue copy offered) on a failing backed-up row.
- **D15.** Transaction scopes are synchronous and contain only Dexie requests; everything else happens before the transaction opens; a repository scan enforces it.
- **D16.** Opening checks the installed version with raw IndexedDB before Dexie runs, uses `autoOpen: false`, replaces Dexie's version-change handler, keeps a write gate and a `diet-db` broadcast channel, and checks the exact native version and store set after opening. Old code never opens a newer database.

**Backup, rescue and delete-all**
- **D17.** Import replaces everything in one all-or-nothing transaction, always leaves the app unpaired, and keeps a garden photo only if its garden row is in the file. The confirmation counts phone records missing from or changed after the file, and defaults to "Export what is on this phone first" when the phone is newer. The pre-import snapshot is kept in memory and offered as a rescue copy if the write fails.
- **D18.** Every app-generated file name goes through one helper: `diet-backup-YYYY-MM-DD[-rescue][-locked].json` (C89 fixes the base name), with `diet-gp-summary-…` and `diet-grocery-list-…` for later exports; `.gitignore` gains `diet-*.json`, `diet-*.csv` and `diet-*.txt`. The local date in the device zone is used. A neutral prefix is not adopted.
- **D19.** Locking: PBKDF2-SHA-256 with 600,000 iterations and AES-256-GCM (C99), the header bound as additional data in the fixed array order of section 10.4; the import minimum stays 600,000 for ever and the maximum is 10,000,000; passwords are 10–1,000 characters after trimming and NFC; the lock is on by default; a locked file is decrypted and compared before it is offered.
- **D20.** The payload carries `kind` (`backup` or `rescue`), a canonical `exportedAt` and a semver `appVersion`. Maximum file size 50 MiB.
- **D21.** `lastBackupAt` is recorded only when the owner answers Yes to "Can you see the file?".
- **D22.** When the export self-check fails, the owner can still save an unchecked rescue copy, locked by default, which does not count as a backup.
- **D23.** The rescue copy reads the database with raw IndexedDB at its own version, applies that version's allow-list, never reads device-only stores, is locked by default, and imports row by row with the failures listed. Delete-all is not offered on the upgrade-failed screen.
- **D24.** The storage-protection status is not stored; it is checked at launch and described honestly ("Protected from automatic clearing; a backup is still your only copy…"; "Checking…").
- **D25.** Backup reminder: due 7 days after the last confirmed backup and back 7 days after a dismissal (BK-03); when storage is not protected, due after 3 days, back after 1 day, and shown first (this spec's reading of C98's "stronger").
- **D45.** Delete-all closes the write gate first and removes every IndexedDB database on the origin, every cache except the app's precache, and local and session storage; the list of what remains includes Chrome's saved password and autofill.

**Health-safety rules in storage**
- **D26.** Rapid-loss bounds are stored from version 1 in whole grams, 750–1,000 g a week in 50 g steps, over 2 or 3 weeks (C46 gives 0.75–1.0 kg; grams and the step are this spec's). The card can never be turned off, and a dismissal hides it only until the next day while its condition holds.
- **D27.** Kickstart is capped at 42 days in all across every period (`KICKSTART_MAX_TOTAL_DAYS`) as well as 3 extensions. A new period is refused unless a full 21 days fit; an extension is refused if it would pass either cap. Only the first 21 cumulative Kickstart days ever are free of the rapid-loss card (item 14). Import refuses a history over the caps.
- **D28.** The extension check is recorded only after an explicit Extend tap, only in the last 3 local days of the scheduled phase and before any early end. Its outcome is `extended` or `stop-sign`; only the last check of a period may be a stop-sign; "Not now" ends that offer. Kickstart stores allow only the kickstart repository's operations (checks append-only; a period's end set once; no removal).
- **D29.** A readiness confirmation counts only when it was answered at or after its question's latest answer under the current wording; re-answering Q3 or Q6 deletes it.
- **D30.** Q5 (eating-disorder history or low weight) switches the keto carb ceiling off entirely, as for Q1 and Q2 (orchestrator override of the earlier "no ceiling below 50 g" reading); meals are still planned, and Kickstart is closed through `kickstartAvailable`.
- **D31.** `profile.sex` is nullable only until onboarding; null maps to the midpoint constant for the energy estimate and the women's figures for alcohol; item 13 requires sex before onboarding completes (C25 wanted a required field). Only the birth year is stored, not the month (less personal data, and the year alone already gives the stricter under-18 result). `kickstartOptIn` defaults to true, and item 13 preselects false while Q3 is gated (C06).
- **D32.** Onboarding progress is stored as `profileConfirmedAt`, `scheduleConfirmedAt` and `gardenConfirmedAt` in settings (C41's resume rule).
- **D33.** Food-safety substitutions are deferred and off (the C43 option).
- **D34.** The allergen enum spells the FSANZ Standard 1.2.3 list as 15 values, with `gluten` as a profile-only alias for wheat, barley, oats and rye (C43 fixes the list; the spelling is this spec's).
- **D35.** Unknown nutrient figures are listed in `unknownNutrients` (a single food stores 0; a computed figure stores the known part as a lower bound); totals count entries that lack a figure and never show a ceiling or budget as met because of one. Label entries may lack only fibre; database entries none; estimates any but not all.
- **D43.** The version-1 card registry and its dismissal rules are as in section 4.12. The withdrawal-tick trigger follows C44 ("collapse for the day") instead of C05 ("monthly"), because it shows the card more often. Cholesterol check-in dismissals are final per trigger. The reflux GP nudge returns 7 days after a dismissal while its condition holds. The C55 "keep 23:1" button sits on the steady-explainer card.
- **D47.** `fasts.plannedFastMinutes` is 1–1440 and stored as null when the planned figure falls outside, so starting a fast never fails because of it.
- **D48.** Every storage failure screen shows the not-a-medical-device line and the help numbers from static copy.
- **D50.** A long-term goal that falls below BMI 18.5 after a height change is hidden, with "Your long-term goal needs updating for your height".

**Other field choices**
- **D36.** `targets.fibreGuideG` (10–70 g, null = the NRV default by sex) and `targets.moderateNetCarbCeilingG` (50–130 g, default 100) are stored from version 1 (C70).
- **D37.** Ingredients carry `cookedYield` (0–5] with a required `yieldCitation` (C67), and the pack-size source and entered-at (C69).
- **D38.** Garden rows carry `harvestedAt`; perishability counts from it.
- **D39.** Sessions store each ticked set's actual reps or seconds; C76 volume is computed from them. The pre-session check gains `heavyWorkDay`.
- **D40.** The weekly pattern holds up to 3 session templates per weekday.
- **D41.** Grocery lists store `version`, `sentVersion`, `receivedVersion`, the phone-clock `receivedAt` (no ordering check) and the laptop's `laptopReceivedAt`; status is derived; `transferId` is random per send; each line records whether it was generated or added by hand.
- **D42.** Drinks: a `label` row's figures must match its stored label; a `calculated` row's figure is only range-checked, and the figure shown and compared is the larger of the stored and recomputed figures. `beverageId` may be a seed id. The seeded preset's label is marked `preset-default`. Label energy may be 0.
- **D44.** Audit rows are append-only, carry a zone and a `kind` (`grocery` or `migration`), and are never written for owner edits or imports.
- **D46.** Allowed operations and repository-maintained timestamps per store are as in section 8.4.
- **D49.** Backup password inputs use `autocomplete="new-password"` (export) and `"current-password"` (import); free-text health inputs use `autocomplete="off"`.
- **D51.** Units are fixed metric, and the DATA_MODEL `units` field is removed (PLAN 7).
- **D52.** Theme `system`/`light`/`dark` and text size `standard`/`large`/`largest` (enum values are this spec's).
- **D53.** Home time zone default `Pacific/Auckland`, editable, used only as a fallback.
