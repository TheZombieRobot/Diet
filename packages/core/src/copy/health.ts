/**
 * Every user-facing health sentence in the app and extension lives in this file, so CI can scan
 * it and the owner can review it in one place (checklist conventions and item 42). A scan rule
 * (healthTextHomeRules in tools/scans/rules.ts) keeps help numbers, help-line names and health
 * professionals out of the screens' own text, so they can only come from here.
 *
 * Wording comes from docs/HEALTH_SAFETY.md and docs/UX_SCREENS.md. Change the docs first, then
 * this file; tools/scans/docFidelity.test.ts checks the quoted sentences word for word. The short
 * labels of the help-number rows, the privacy note on About and the `privacy` section (backup,
 * restore, rescue copy, delete-all and storage status, from the item 12 storage design and
 * HEALTH_SAFETY.md section 7) are not quoted word for word in the docs; they are written here and
 * follow the same section rules. Placeholders in braces are filled with fillTemplate
 * (copy/template.ts) and never carry a record's value or key.
 *
 * Sections are scanned with their own extra rules in `health.test.ts`: for example, alcohol copy
 * may never mention streaks, targets or limits. Sections are added as each screen is built.
 */
import { FLOOR_KJ, KICKSTART_MAX_DEFICIT_PCT, KICKSTART_NET_CARBS_G } from '../storage/limits';

/**
 * New Zealand help numbers (HEALTH_SAFETY.md, top; HS-13), with the wording of their rows on the
 * About screen. A service with a `text` number also gets a tap-to-text row.
 */
export const helpNumbers = {
  intro: 'Tap a number to call or text it.',
  emergency: { name: 'Emergency', number: '111' },
  healthline: { name: 'Healthline (24/7 health advice)', number: '0800 611 116' },
  alcoholDrugHelpline: {
    name: 'Alcohol Drug Helpline (24/7, free, confidential)',
    number: '0800 787 797',
    text: '8681',
    textName: 'Alcohol Drug Helpline by text',
    textDetail: 'Text 8681',
  },
  needToTalk: {
    name: 'Need to Talk (free call or text)',
    number: '1737',
    text: '1737',
    textName: 'Need to Talk by text',
    textDetail: 'Text 1737',
  },
} as const;

/**
 * The not-a-medical-device sentence (HEALTH_SAFETY.md, top: "That sentence ... appears on the
 * first-run screen and on the About screen"; UX 1a quotes it; C101). Defined once for both places.
 */
const NOT_A_MEDICAL_DEVICE =
  'The app is a personal logbook and planner. It is not a medical device, does not diagnose, and does not replace your GP, a dietitian, or an addiction service.';

/** Statements shown on first run and on the About screen (HEALTH_SAFETY.md, top; UX 1a). */
export const general = {
  welcome: NOT_A_MEDICAL_DEVICE,
  about: NOT_A_MEDICAL_DEVICE,
  readinessOutcome: 'Nothing you have told the app rules this out; your GP knows more.',
  /** The Privacy card on About (DOC_REVIEW C34; item 5 review). */
  privacy:
    'Your records stay on this phone, and the app sends nothing anywhere. Later, when you tap Send to laptop, it will send the grocery list only, encrypted. There is no account and no analytics.',
} as const;

/** Alcohol wording (HEALTH_SAFETY.md sections 1 and 5; UX 1b, 5c; C58). */
export const alcohol = {
  firstRunNotice:
    'If you drink most days or heavily at weekends, cutting down suddenly can be dangerous. Talk to your GP or the Alcohol Drug Helpline (0800 787 797, text 8681) before making a big change. Call 111 for seizures, confusion or hallucinations.',
  /** The "talk to someone" card (HEALTH_SAFETY.md section 5, with the C58 opening). */
  helpCard:
    "If you've been drinking most days or heavily at weekends for a while and are thinking about changing that, the safest first step is a conversation, not a sudden stop. Alcohol Drug Helpline 0800 787 797 (call or text 8681), free and 24/7, or your GP. If someone is very unwell, shaking badly, confused or having a seizure, call 111.",
  helpCardLabel: 'Talk to someone',
  helpCardNotNow: 'Not now',
  /** The card returns 720 hours after "Not now" while readiness answer 7 still gates (storage spec 4.12). */
  helpCardReturns: 'This card shows again after 30 days.',
  noRiskFreeLevel: 'No alcohol use is risk-free.',
  /**
   * The first-run notice screen (UX 1b; mock-up Notice.dc.html). It cannot be put off: no string
   * here offers to skip it or come back later (health.test.ts).
   */
  notice: {
    title: 'A safety note we show everyone',
    why: 'Why am I seeing this?',
    whyText: [
      'Everyone sees this note before using the app, whatever they drink and however they answer the questions that follow.',
      `After drinking most days or heavily at weekends, a sudden big change can bring on withdrawal, which can be dangerous. Talk to someone before a big change. If you have already cut down or stopped and feel unwell, get help now: call ${helpNumbers.emergency.number} for seizures, confusion or hallucinations, or call the Alcohol Drug Helpline on ${helpNumbers.alcoholDrugHelpline.number}.`,
      'The app records what you drink and shows the New Zealand guidance. It never makes a plan to change your drinking. That is a conversation for you and your GP or the helpline.',
    ],
    acknowledge: 'I understand',
    helplineDetail: `${helpNumbers.alcoholDrugHelpline.number} · free, 24/7, confidential`,
    emergencyTitle: `Emergency: call ${helpNumbers.emergency.number}`,
    emergencyDetail: 'Seizures, confusion or hallucinations',
  },
} as const;

/**
 * Backup, restore, rescue copy, delete-all and storage-status wording, and the static safety block
 * on the storage failure screens (storage spec sections 7.4, 7.6, 9.2, 9.5, 10, 11 and 12; C49,
 * C98, C99; D21, D24, D48). HEALTH_SAFETY.md section 7 treats privacy as a safety feature, so this
 * text is reviewed and scanned with the rest. A backup is recorded only when the owner confirms
 * they can see the file, so no wording here ever says a backup was saved.
 */
export const privacy = {
  /** The status line on the Backup and data card and on About (section 12.1; C98). Never stored (D24). */
  storageStatus: {
    protected:
      "Protected from automatic clearing. A backup is still your only copy if the phone is lost or Chrome's data is cleared.",
    notProtected:
      "Not protected yet: the phone may clear the app's records when space runs low. A backup is your only other copy.",
    unsupported:
      "This browser cannot protect the app's records from clearing. A backup is your only other copy.",
    checking: 'Checking…',
  },
  backupCard: {
    title: 'Backup and data',
    lastBackup: 'Last backup made {date}',
    noBackup: 'No backup made yet',
    exportAction: 'Export a backup',
    restoreAction: 'Restore from a backup',
    deleteAllAction: 'Delete all data',
    notReady: 'The records are still opening.',
    /** After a restore or delete-all that did not finish (never while one runs): this tab's records are closed. */
    closed: 'Nothing more will be saved until the app reloads.',
    reload: 'Reload',
  },
  /** The weekly reminder on Today and on the Backup and data card (section 12.2; BK-03). */
  backupReminder: {
    /** The label of the Reminders card on Today (UX_SCREENS section 2, card 8). */
    cardLabel: 'Reminders',
    /** The label of the update-notice card on Today, so the two cards have different names. */
    updateCardLabel: 'App update',
    title: 'Back up your records',
    body: 'Your records are kept only on this phone. Export a backup and keep the file somewhere else too.',
    weakStorage:
      "This phone has not promised to keep the app's records. A backup is your only other copy.",
    backUpNow: 'Back up now',
    notNow: 'Not now',
  },
  /** Export (sections 10.4 and 10.5; C99; D19, D21, D22). */
  exportBackup: {
    intro: 'This saves a file with all your records to Downloads.',
    lockLabel: 'Lock the file with a password',
    saveFile: 'Save the backup file',
    tryAgain: 'Try again',
    passwordLabel: 'Password',
    passwordRepeatLabel: 'Type the password again',
    passwordRule: 'At least 10 characters.',
    passwordTooShort: 'The password needs at least 10 characters.',
    passwordTooLong: 'The password can have at most 1,000 characters.',
    passwordsDiffer: 'The two passwords are not the same.',
    forgottenWarning:
      'If you forget this password, the backup cannot be opened. Nobody can recover it.',
    plainWarning: 'Anyone who opens this file can read your records.',
    /** Shown, and announced, while a locked file is made (the key takes a moment on a phone). */
    locking: 'Locking the file… this takes a few seconds.',
    working: 'Making the file…',
    /** The browser cannot say whether a download really saved (D21), so this names what was made. */
    checkDownloads:
      'Open the Files app and look in Downloads for {fileName} (made at {time}). If a file of that name was already there, the new one has a number such as (1) before .json.',
    canYouSeeIt: 'Can you see the file?',
    yes: 'Yes',
    no: 'No',
    /** After Yes on a locked file: the backup counts, and the file should leave the phone too. */
    recorded:
      'Backup recorded. A copy kept only in Downloads is lost with the phone: in Files, share this locked file to your email or cloud storage.',
    /** After Yes on a file that is not locked: it should not be sent anywhere as it is. */
    recordedPlain:
      'Backup recorded. This file is not locked: anyone who opens it can read your records. To keep a copy off the phone, export a locked one and share that.',
    close: 'Close',
    notConfirmed: 'The backup may not have saved. Try again.',
    /** Yes, but this tab's records are closed (a restore or delete-all that did not finish): the question is kept. */
    notRecordedClosed:
      'The file is there, but the app cannot record the backup until it reloads. Reload, then answer again.',
    /** Yes, but the records were replaced or deleted after the file was made (in another tab, or before a reload). */
    notRecordedChanged:
      'The records on this phone were replaced or deleted after {fileName} was made, so that file was not recorded as a backup. Export a new one.',
    /** On the Backup and data card when the owner left the "Can you see the file?" step unanswered. */
    pendingCheck: 'You made {fileName} at {time} but have not said whether it is in Downloads.',
    selfCheckFailed: 'The backup could not be checked: {detail}.',
    saveUnchecked: 'Save an unchecked copy',
    uncheckedNote: 'This copy was not checked, so it does not count as a backup.',
    lockCheckFailed: 'The locked backup could not be checked, so it was not saved.',
    exportFailed: 'The backup could not be made. Nothing was changed. Try again.',
  },
  /** Restore (section 10.6; BK-02; D17). */
  importBackup: {
    intro:
      'Pick a diet-backup file from Downloads or wherever you keep it. Nothing on this phone changes until you confirm.',
    chooseFile: 'Choose a backup file',
    passwordLabel: 'Backup password',
    unlock: 'Unlock the file',
    unlocking: 'Unlocking the file… this takes a few seconds.',
    reading: 'Reading the file…',
    replacing: 'Replacing the records…',
    countsTitle: 'Records in the file:',
    storeCount: '{table}: {count}',
    noRecords: 'none',
    cancel: 'Cancel',
    writeFailedNext: 'Reload the app before you try again.',
    fileMade: 'Backup made {date}.',
    /** A rescue copy is not a backup (D22, D23). */
    rescueMade: 'Rescue copy made {date}.',
    fileLocked: 'The file was locked with a password.',
    filePlain: 'The file was not locked.',
    /** The summary, sentence by sentence, with the counts worded for 0, 1 and more (D17). */
    replaceIntro: 'This replaces everything on this phone.',
    freshPhone: "This phone has no records of yours yet. Restoring puts the file's records on it.",
    missingNone: 'Every record on this phone is in the file.',
    missingOne: '1 record on this phone is not in the file.',
    missingMany: '{count} records on this phone are not in the file.',
    differNone: 'No record on this phone differs from its copy in the file.',
    differOne: '1 record on this phone differs from its copy in the file.',
    differMany: '{count} records on this phone differ from their copies in the file.',
    newest: 'Newest record on this phone: {phoneNewest}; in the file: {fileNewest}.',
    /** When nothing of the owner's on this phone carries a date (only settings were changed). */
    newestFileOnly: 'Newest record in the file: {fileNewest}.',
    /** Only when this phone is paired with a laptop. */
    pairingRemoved: 'The laptop pairing will be removed.',
    /**
     * A file whose Kickstart history records less than this phone's never lowers it (D27; the
     * data-loss review): the phone's periods and checks are kept, and this says so before Replace.
     */
    kickstartKept:
      'Kickstart history kept from this phone, because it records more Kickstart days, extensions or stop-sign checks than the file.',
    exportFirst: 'Export what is on this phone first',
    replace: 'Replace everything on this phone',
    importRest: 'Import the rest',
    migrationChanges: 'Changed to fit this version of the app:',
    setAside: 'Records that could not be imported:',
    /** Rescue files: singleton fields the copy could not keep, set to the default or the more cautious value. */
    resetToDefault:
      "Could not be read from the rescue copy, so set to the app's default or the more cautious choice:",
    resetRow: '{table}: the {field}',
    wholeRecord: 'whole record',
    /** Rescue files: a safety setting kept from this phone because it is the more cautious one. */
    keptStricter: 'Kept from this phone because it is the more cautious setting:',
    rescueNote:
      'This rescue copy may need a later version of the app to open completely. Keep the file.',
    saveWhatWasHere: 'Save what was on this phone',
    tryAgain: 'Try again',
    /** After a restore the other tabs did not let go of: nothing was written. */
    blockedNothingChanged: 'Nothing was changed.',
    reloadCancels: 'Reload cancels the restore: you will need to choose the file again.',
    /** Counts the phone's records again and shows the confirmation again before anything is replaced. */
    tryRestoreAgain: 'Try the restore again',
  },
  /**
   * An import refused for a whole list or for the file itself rather than for one record (section
   * 10.6 steps 5 and 7), so the message does not speak of "a record".
   */
  backupListErrors: {
    missing: 'The backup is missing a list this app needs ({table}). Nothing was imported.',
    unknown: 'The backup has a list this app does not know. Nothing was imported.',
    deviceOnly:
      'The backup has a list that belongs only on the phone, never in a backup ({table}). Nothing was imported.',
    unreadable: 'The backup has a list this app cannot read ({table}). Nothing was imported.',
    migration:
      'The backup could not be updated to fit this version of the app. Nothing was imported. Keep the file: a later version of the app may read it.',
  },
  /** A rescue copy whose Kickstart history cannot be imported whole (section 9.5; D27, D28). */
  kickstartHistory:
    'This rescue copy has a Kickstart record that could not be imported ({record}), and the Kickstart history is imported whole or not at all. Nothing was imported. Keep the file: a later version of the app may read it.',
  /** One message per BackupError code (section 10.9). {detail} names a store, a field and a rule, never a value. */
  backupErrors: {
    'too-large': 'This file is too big to be a backup from this app. Nothing was imported.',
    'not-a-backup': 'This file is not a backup from this app. Nothing was imported.',
    'unsupported-version': 'This backup is in a format this app cannot read. Nothing was imported.',
    'newer-version':
      'This backup was made by a newer version of the app. Open the app online to update it, then try again.',
    damaged: 'This backup file is damaged. Nothing was imported.',
    'wrong-password-or-damaged': 'Wrong password, or the file is damaged. Nothing was imported.',
    'invalid-record':
      'The backup has a record this app cannot accept: {detail}. Nothing was imported.',
    inconsistent: 'The records in the backup do not fit together: {detail}. Nothing was imported.',
    'write-failed': 'The backup could not be written to this phone. Nothing was changed.',
  },
  /** The rescue copy (section 9.5; D23). It does not count as a backup. */
  rescue: {
    saveRescueCopy: 'Save a rescue copy',
    saveAnother: 'Save another copy',
    note: 'A rescue copy keeps your records in a file. It does not count as a backup.',
    failed: 'The rescue copy could not be made. Try again, or reload.',
  },
  /**
   * When the app is open somewhere else and will not let go of the records (a restore or
   * delete-all waits up to 3 seconds for it; section 7.5).
   */
  otherTabs:
    "The app is still open somewhere else: another Chrome tab or window, or the installed app in Recent apps. Close the app's other tabs, then try again.",
  /** Delete all data (section 11; HS-30; D45). */
  deleteAll: {
    title: 'Delete all data',
    goes: 'This deletes every record on this phone, the laptop pairing and every garden photo.',
    staysTitle: 'What stays',
    stays: [
      "The app's own files, so it still opens offline.",
      'A fresh start with the default drink preset and silverbeet in the garden.',
      'The home-screen icon and the storage protection setting.',
      "If Chrome saved a backup password, remove it in Chrome's settings.",
      'Backup files you made or shared: delete them in Files, and in your email or cloud storage if you sent them there.',
      'The list on your laptop and its pairing: also unpair on your laptop.',
      'A list waiting to be sent expires within 15 minutes.',
    ],
    exportFirst: 'Export a backup first',
    next: 'Continue',
    finalWarning:
      'Deleting cannot be undone. Only a backup file you kept can bring the records back.',
    /** No backup confirmed on this phone (settings.lastBackupAt is null); a file may still exist. */
    finalWarningNoBackup:
      'Deleting cannot be undone. No backup has been recorded on this phone, so unless you kept a backup or rescue file, nothing can bring these records back.',
    confirm: 'Delete everything on this phone',
    cancel: 'Cancel',
    deleting: 'Deleting…',
    stepsFailed: 'Some data could not be deleted ({steps}). Try again.',
    /** The records were not deleted because the app is open somewhere else. */
    recordsKept: 'Your records are still on this phone.',
    /** Only the list of other stored databases could not be read: the records themselves are gone. */
    listFailedOnly:
      'Your records were deleted, but the app could not check for other stored data. Reload to start fresh.',
    tryAgain: 'Try again',
    /** Plain names of the delete-all steps, for stepsFailed. */
    steps: {
      gate: 'closing the records',
      'list-databases': 'listing the stored records',
      databases: 'the records',
      caches: 'stored app data',
      'local-storage': 'saved preferences',
      'session-storage': 'tab preferences',
      files: 'open files',
    },
  },
  /** The storage failure screens (section 7.4; D48), shown when the rest of the app is unusable. */
  storageFailure: {
    title: 'Your records',
    /** The card label under the page heading (the heading already says "Your records"). */
    cardLabel: 'What happened',
    helpTitle: 'Help numbers',
    'newer-version':
      'This phone has records from a newer version of the app. Nothing has been changed. Connect to the internet and reload. If this screen comes back, close the app in every Chrome tab and in Recent apps, then open it again.',
    'upgrade-failed':
      'The app could not update your records. Nothing was changed. Save a rescue copy, then reload. A later version of the app should be able to read it. If this screen comes back after an update, close the app in every Chrome tab and in Recent apps, then open it again.',
    unavailable: "This browser cannot store the app's records (private mode or storage blocked).",
    'reload-needed':
      "The app's records were closed in this window. Another window or tab of the app may have updated, restored or reset them, or the browser closed them. Reload.",
    reload: 'Reload',
    saveRescueCopy: 'Save a rescue copy',
    /** Static safety block: the not-a-medical-device line and the help numbers (HS-13 as extended by C17). */
    notMedicalDevice: general.about,
    helpLine: `Emergency ${helpNumbers.emergency.number}. Healthline ${helpNumbers.healthline.number}. Alcohol Drug Helpline ${helpNumbers.alcoholDrugHelpline.number}, or text ${helpNumbers.alcoholDrugHelpline.text}. Need to Talk ${helpNumbers.needToTalk.number}.`,
  },
  /** A write refused for lack of space (section 7.6). */
  storageFull: 'Phone storage is full. Nothing was saved. Free some space or export a backup.',
  /**
   * A Kickstart write refused because now is earlier than the newest saved record (section 8.2;
   * clock.ts isClockBehind): a clock set back must never make lived Kickstart days count as fewer.
   */
  clockBehind:
    "The phone's date and time look earlier than the last saved record. Check them in the phone's settings, then try again.",
  /** The update-notice card (section 9.2; D13). */
  updateNotice: 'This update changed some of your settings to fit new limits.',
  updateNoticeLink: 'See what changed',
  updateNoticeClose: 'Close',
  /** The reason of a migration audit row (MigrationChange.reason). */
  migrationChange: '{field} was changed to fit the limits of app version {version}.',
  /** Next to entries whose recorded time zone this browser does not know (section 3.4; D6). */
  zoneFallback: 'Times shown in your home time zone',
  /** Plain names of the device-only stores, named when a file wrongly holds one (never backed up). */
  deviceOnlyNames: {
    transfer_pairings: 'Laptop pairing',
    garden_photos: 'Garden photos',
  },
  /** Plain names of the backed-up stores, for the import confirmation's counts and set-aside rows. */
  storeNames: {
    profile: 'Profile',
    readiness: 'Readiness answers',
    targets: 'Targets',
    settings: 'Settings',
    kickstart_periods: 'Kickstart periods',
    kickstart_checks: 'Kickstart checks',
    weights: 'Weigh-ins',
    fasts: 'Fasts',
    symptom_log: 'Symptoms',
    water_log: 'Water',
    steps_log: 'Steps',
    ingredients: 'Your foods',
    ingredient_overrides: 'Food corrections',
    recipes: 'Recipes',
    plan_days: 'Planned days',
    food_log: 'Food log',
    garden: 'Garden',
    pantry: 'Pantry',
    sessions: 'Sessions',
    beverages: 'Drink presets',
    drinks_log: 'Drinks log',
    alcohol_day_notes: 'Drink day notes',
    alcohol_milestones: 'Your milestones',
    grocery_lists: 'Grocery lists',
    card_state: 'Reminder card states',
    audit: 'Automatic change notes',
  },
  /**
   * Why a record in a backup (or the export self-check) was not accepted, in plain words. Built by
   * describeRecordProblem (storage/backup/errors.ts) from a store, a position, a field and a rule,
   * never from a value or a record key (section 2.3). The codes stay on the error object for tests.
   */
  recordProblem: {
    withField: '{table}, record {position}: the {field} {rule}',
    withoutField: '{table}, record {position}: the record {rule}',
    /** A record named by store and position only. */
    position: '{table}, record {position}',
    /** A row set aside for a rule across records: the rule reads as a sentence. */
    crossRecord: '{table}, record {position}: {rule}',
    list: '{table}: the list {rule}',
    unknownList: 'the file has a list this app does not accept',
    someList: 'A list',
    file: 'the file {rule}',
    allowed: '{rule} ({allowed})',
    /** Rule ids of StorageValidationError (section 2.3). */
    rules: {
      type: 'has the wrong kind of value',
      missing: 'is missing',
      'extra-key': 'has an item this app does not know',
      'forbidden-key': 'has an item this app does not accept',
      format: 'is not in the form this app expects',
      range: 'is outside the allowed range',
      enum: 'has a value this app does not know',
      length: 'is too long or too short',
      unique: 'has the same item twice',
      order: 'is out of order',
      iff: 'does not match the details that go with it',
      equals: 'does not match the figure it must equal',
      pattern: 'is not in the form this app expects',
      'zone-unknown': 'names a time zone this phone does not know',
      'future-year': 'is a year still to come',
      future: 'is dated after the backup was made or after the time on this phone',
      notAccepted: 'is not accepted',
    },
    /** Cross-record rules (section 5). */
    invariants: {
      singleton: 'the profile, targets or settings do not have exactly one record',
      'unique-key': 'two records have the same key',
      'fast-running': 'two fasts are marked as running, or the running fast is not the latest',
      'fast-overlap': 'two fasts overlap',
      'weight-onboarding': 'two weigh-ins are marked as the first one',
      'kickstart-check-period': 'a Kickstart check belongs to no Kickstart period',
      'kickstart-overlap': 'two Kickstart periods overlap',
      'kickstart-end': 'a Kickstart period ends after its scheduled last day',
      'kickstart-check-window': 'a Kickstart check falls outside the days it can be asked',
      'kickstart-stop-sign': 'a Kickstart check comes after a stop-sign check',
      'kickstart-extensions': 'there are more than 3 Kickstart extensions in all',
      'kickstart-days': 'there are more than 42 Kickstart days in all',
      'card-trigger': 'a reminder card is one this app does not know',
      'garden-photo': 'a garden photo has no garden record',
    },
    /** Plain names of stored fields (any store), for the messages above. */
    fields: {
      abvPercent: 'alcohol percentage',
      activityLevel: 'activity level',
      aisle: 'aisle',
      alcoholGuidanceSet: 'alcohol guidance figures',
      alcoholNoticeAckAt: 'time the alcohol notice was read',
      aliases: 'other names',
      allergens: 'allergens',
      amount: 'amount',
      amountNzCents: 'price amount',
      answer: 'answer',
      answeredAt: 'time of the answer',
      archived: 'hidden setting',
      askedAt: 'time of the check',
      at: 'time',
      auditNote: 'note',
      backOrLegSymptoms: 'back or leg symptoms answer',
      basis: 'price basis',
      beverage: 'drink details',
      beverageId: 'drink preset',
      birthYear: 'birth year',
      budgetNote: 'budget note',
      bytes: 'photo',
      carbBasisAsEntered: 'carbohydrate basis',
      carbCeilingStartedAt: 'time the carb ceiling started',
      carbsG: 'carbohydrate',
      cardId: 'card',
      changes: 'corrections',
      completedAt: 'time it was done',
      confidence: 'confidence badge',
      cookedG: 'cooked weight',
      cookedYield: 'cooked yield',
      count: 'count',
      crampsNotSettling: 'cramps answer',
      createdAt: 'time it was created',
      date: 'date',
      derivedFromRecipeId: 'original recipe',
      dietMode: 'diet mode',
      dinnerTime: 'dinner time',
      dislikeIngredientIds: 'disliked foods',
      dislikeTerms: 'disliked words',
      dismissedAt: 'time it was dismissed',
      dismissedTimeZone: 'time zone of the dismissal',
      displayAs: 'display name',
      dizzyOnStanding: 'dizziness answer',
      done: 'sets done',
      doneAt: 'time it was finished',
      drinkingDayCutoverMinutes: 'drinking-day start time',
      durationMinutes: 'duration',
      eatingWindow: 'eating window',
      electrolyte: 'electrolyte tick',
      end: 'end time',
      endReason: 'reason it ended',
      endedAt: 'end time',
      endedTimeZone: 'time zone at the end',
      energy: 'energy rating',
      energyAsEntered: 'energy as entered',
      energyFloorKj: 'energy floor',
      energyKj: 'energy',
      energyRating: 'energy rating',
      enteredAt: 'time it was entered',
      enteredBy: 'who entered it',
      equipmentBands: 'bands setting',
      equipmentDumbbells: 'dumbbells setting',
      estimate: 'count of estimated lines',
      exerciseId: 'exercise',
      exertion: 'exertion rating',
      faintAtWork: 'feeling faint answer',
      fastingPreset: 'fasting pattern',
      fatG: 'fat',
      fibreG: 'fibre',
      fibreGuideG: 'fibre guide',
      field: 'corrected item',
      firstLowCarbAt: 'time low-carb eating first started',
      firstShownAt: 'time it was first shown',
      fromDate: 'start date',
      fromGardenG: 'amount from the garden',
      fromPantryG: 'amount from the pantry',
      gardenAmountUnknown: 'garden amount tick',
      gardenConfirmedAt: 'time the garden step was saved',
      gardenFlag: 'garden setting',
      gardenId: 'garden record',
      glutenFreeHousehold: 'gluten-free household setting',
      goalKg: 'long-term goal',
      goalReferenceKg: 'weight when the goal was set',
      goalSetAt: 'time the goal was set',
      grams: 'weight',
      gramsPerEach: 'grams per item',
      gramsPerUnit: 'grams per unit',
      harvestReady: 'ready-to-harvest setting',
      harvestedAt: 'harvest date',
      heatOrSun: 'heat or sun answer',
      heavyWorkDay: 'heavy work day answer',
      height: 'photo height',
      heightCm: 'height',
      hiddenSeedIds: 'hidden recipes and foods',
      homeTimeZone: 'home time zone',
      householdServes: 'household serves',
      householdSize: 'household size',
      id: 'record key',
      ingredientId: 'food',
      items: 'list items',
      jogOptIn: 'jogging setting',
      kcal: 'energy in kcal',
      kcalPerServe: 'energy per serve',
      key: 'pairing key',
      kg: 'weight',
      kickstartDeficitPct: 'Kickstart deficit',
      kickstartOptIn: 'Kickstart choice',
      kind: 'kind',
      label: 'label',
      laptopReceivedAt: 'time the laptop received it',
      lastBackupAt: 'time of the last backup',
      lines: 'ingredient lines',
      max: 'maximum',
      meals: 'meals',
      method: 'method steps',
      mimeType: 'photo type',
      min: 'minimum',
      ml: 'amount of water',
      moderateNetCarbCeilingG: 'moderate low-carb ceiling',
      movements: 'movements',
      myServes: 'my serves',
      name: 'name',
      netCarbCeilingG: 'keto carb ceiling',
      notHydrated: 'hydration answer',
      note: 'note',
      nutrientBasis: 'nutrient basis',
      nutrients: 'nutrients',
      nutrientsPer100g: 'nutrients per 100 g',
      nutritionPerServe: 'nutrition per serve',
      'nz-fcdb': 'count of NZ database lines',
      onboardingCompletedAt: 'time setup was finished',
      origin: 'origin',
      outcome: 'outcome',
      packSizeEnteredAt: 'time the pack sizes were entered',
      packSizeSource: 'pack size source',
      packSizesG: 'pack sizes',
      packSuggestion: 'pack suggestion',
      painOrInjury: 'pain or injury answer',
      pairedAt: 'time of pairing',
      palpitations: 'palpitations answer',
      periodId: 'Kickstart period',
      perishabilityDays: 'days it keeps',
      plannedFastMinutes: 'planned fast length',
      preCheck: 'pre-session check',
      presetChosenBy: 'pattern choice',
      price: 'price',
      profileConfirmedAt: 'time the profile was saved',
      proteinG: 'protein',
      proteinRangeG: 'protein range',
      quantity: 'quantity',
      questionId: 'question',
      rapidLossConsecutiveWeeks: 'weeks for the losing-quickly card',
      rapidLossExplanationReadAt: 'time the losing-quickly explanation was read',
      rapidLossThresholdGPerWeek: 'weekly amount for the losing-quickly card',
      rawG: 'raw weight',
      reason: 'reason',
      receivedAt: 'time it was received',
      receivedVersion: 'received version',
      recipeId: 'recipe',
      recordId: 'record',
      refId: 'source',
      refluxPreferEarlier: 'earlier dinner setting',
      refluxPreferSplit: 'split dinner setting',
      relayUrl: 'relay address',
      reps: 'repetitions',
      roomId: 'pairing room',
      saturatedFatBudgetPct: 'saturated-fat budget',
      saturatedFatG: 'saturated fat',
      scheduleConfirmedAt: 'time the eating schedule was saved',
      seasonMonths: 'season months',
      seconds: 'seconds',
      section: 'list section',
      seedId: 'food',
      sentAt: 'time it was sent',
      sentVersion: 'sent version',
      serves: 'serves',
      servingSizeG: 'serving size',
      servings: 'servings',
      sets: 'sets',
      severity: 'severity',
      sex: 'sex',
      sleepRating: 'sleep rating',
      slot: 'meal slot',
      snackTime: 'snack time',
      sodiumMg: 'sodium',
      soreness: 'soreness rating',
      sortOrder: 'order',
      source: 'source',
      sourceCitation: 'source reference',
      sourceKind: 'kind of entry',
      sourceMix: 'source counts',
      standardDrinks: 'standard drinks',
      start: 'start time',
      startedAt: 'start time',
      status: 'status',
      stdDrinksPerServe: 'standard drinks per serve',
      stdSource: 'standard drinks source',
      steadyDeficitPct: 'Steady-phase deficit',
      steps: 'steps',
      storeName: 'store name',
      substituteHint: 'substitute hint',
      substitutes: 'substitutes',
      sugarsG: 'sugars',
      symptom: 'symptom',
      table: 'list',
      tags: 'tags',
      takenAt: 'time the photo was taken',
      templateId: 'session plan',
      templateIds: 'session plans',
      text: 'text',
      textSize: 'text size',
      theme: 'theme',
      ticked: 'tick',
      timeMinutes: 'time',
      timeZone: 'time zone',
      tiredOrPoorSleep: 'tiredness answer',
      title: 'title',
      transferId: 'transfer key',
      trigger: 'card occasion',
      unit: 'unit',
      unknownNutrients: 'unknown nutrients',
      updatedAt: 'time it was last changed',
      usda: 'count of USDA lines',
      value: 'value',
      variant: 'variant',
      version: 'version',
      volumeMl: 'volume',
      waterTargetMl: 'water target',
      weekday: 'weekday',
      weeklyPattern: 'weekly session plan',
      weeklyStdDrinks: 'weekly standard drinks',
      weightBasis: 'weight basis',
      width: 'photo width',
      withdrawalTick: 'shaky-or-sick tick',
      wordingVersion: 'question wording version',
      yieldCitation: 'yield reference',
    },
  },
} as const;

// ---- First-run flow, readiness, profile, eating schedule and garden (checklist item 13) ----

/** A whole number with a thousands comma, such as 5,000 (no Intl, so it never follows the device locale). */
const withThousands = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The setup frame and its steps (UX section 1; C41, C53; item 13 design section 5.3). */
export const onboarding = {
  frame: {
    stepOf: 'Step {step} of {count}',
    back: 'Back',
    continue: 'Continue',
    helpLink: 'Help numbers and About',
    backToSetup: 'Back to setup',
    opening: 'Opening your records…',
    openingSlow:
      'Opening your records is taking longer than usual. If nothing changes, reload the app.',
    openingFailed:
      'The app could not read your records. Reload to try again. Nothing has been changed.',
    restoreLink: 'Restore from a backup instead',
    restoreTitle: 'Restore from a backup',
    restoreIntro:
      'If you used this app before and kept a backup file, you can put those records back now. The file replaces everything entered during setup, including your answers to the questions. The app then opens on the answers from the file, so you can check they still apply.',
    saveFailed: 'That could not be saved. Try again.',
    fixBelow: 'Some details need a look before you continue.',
  },
  welcome: {
    title: 'Welcome',
    next: 'First comes a safety note we show everyone. Then a few questions, so the app can switch off parts that may not fit your situation, and some details about you, your eating times and your garden. You can change your answers later in Settings.',
    helpTitle: 'Help numbers',
  },
  finish: {
    title: 'Setup is finished',
    body: 'Your answers are saved on this phone. You can change them any time in Settings.',
    start: 'Go to Today',
  },
  settingsCardLabel: 'Your setup',
} as const;

/**
 * The readiness questions and what each answer switches off (HEALTH_SAFETY.md section 1; C06,
 * C24, C41, C58, C102; D29). The answers only ever switch features off; nothing here says a
 * feature suits the person or that they are cleared for it.
 */
export const readiness = {
  title: 'A few questions first',
  intro:
    'Your answers decide which parts of the app are switched on. They stay on this phone. If you are not sure, answer Yes: the app then takes the more careful option.',
  questionOf: 'Question {n} of {count}',
  yes: 'Yes',
  no: 'No',
  /** HEALTH_SAFETY.md section 1, word for word (docFidelity.test.ts). */
  questions: {
    q1: 'Are you under 18?',
    q2: 'Are you pregnant or breastfeeding?',
    q3: 'Do you take insulin, a sulfonylurea or any medication for diabetes?',
    q4: 'Do you take medication that must be taken with food, or blood-pressure or cholesterol medication?',
    q5: 'Have you ever been treated for an eating disorder, or is your weight currently low?',
    q6: 'Has a doctor ever told you not to exercise, or do you get chest pain, dizziness or faint during activity?',
    q7: 'Do you drink alcohol most days, or heavily at weekends?',
  },
  /** What a yes (or no answer) switches off or on. */
  ifYes: {
    q1: 'Fasting, keto carb targets, Kickstart, any energy deficit, weight goals, the energy estimate and alcohol logging are switched off. The app works as a food and exercise planner only.',
    q2: 'Fasting, the keto carb ceiling, Kickstart, any energy deficit and weight goals are switched off. Meals are still planned. Please talk to your midwife or GP about what to eat.',
    q3: 'Low-carb eating and fasting can change how diabetes medicines act, and can cause low blood sugar (hypoglycaemia). Check with your prescriber first. Fasting, Kickstart and carb ceilings under 50 g stay off until you confirm your prescriber has agreed. Meals are still planned low-carb, with a carb ceiling of at least 50 g and a smaller energy deficit, so talk to your prescriber before you start using the meal plans.',
    q4: 'Fasting is allowed. Check the timing of your medicines with your pharmacist or GP before you change when you eat. If you take blood-pressure medication, check with your pharmacist or GP before adding salt or using salt substitutes.',
    q5: 'Fasting, weight goals, Kickstart, any energy deficit and the keto carb ceiling are switched off. Your weight trend is still shown, without targets.',
    q6: 'Exercise plans stay hidden until you confirm you have discussed exercise with a GP.',
    q7: 'A card with help contacts is shown on Today from the first day. You can put it away for 30 days at a time.',
  },
  confirmations: {
    prescriberAgreed:
      'My prescriber has agreed to fasting, a bigger energy deficit (Kickstart) and carbs under 50 g with my diabetes medication',
    gpExerciseDiscussed: 'I have discussed exercise with a GP',
  },
  confirmationHints: {
    prescriberAgreed:
      'Fasting, Kickstart and carb ceilings under 50 g become available when you confirm your prescriber has agreed to fasting, a bigger energy deficit and carbs under 50 g with your diabetes medication.',
    gpExerciseDiscussed:
      'Exercise plans become available when you confirm you have discussed exercise with a GP.',
  },
  confirmationLapses: 'If you change this answer, the app asks for this confirmation again.',
  confirmed: {
    prescriberAgreed:
      'You have confirmed your prescriber agreed, so fasting, Kickstart and carb ceilings under 50 g can be chosen. If your medication or dose changes, tap "My medication or dose has changed" until you have checked again.',
    gpExerciseDiscussed:
      'You have confirmed you discussed exercise with a GP, so exercise plans can be shown. If your symptoms change, tap "My symptoms have changed".',
  },
  changed: {
    q3: 'My medication or dose has changed',
    q6: 'My symptoms have changed',
  },
  changedDone: {
    q3: 'Saved. Fasting, Kickstart and carb ceilings under 50 g are off until you confirm your prescriber has agreed again.',
    q6: 'Saved. Exercise plans are off until you confirm you have discussed exercise with a GP again.',
  },
  summaryTitle: 'What your answers change',
  summaryNone: 'Your answers did not switch anything off.',
  summarySome: 'Your GP knows more about your health than this app does.',
  changeLater: 'You can change these answers any time in Settings, under Readiness answers.',
  unanswered: 'Not answered yet. Until you answer, the app treats this as Yes.',
  /** A feature hidden with its reason (RD-01 to RD-05). */
  featureOff: '{feature} is off because of what you told the app about {reasons}.',
  /** In GATED_FEATURES order (readiness/gates.ts). */
  featureNames: {
    fasting: 'Fasting',
    kickstart: 'Kickstart',
    deficit: 'The energy deficit',
    ketoCeiling: 'The keto carb ceiling',
    carbCeilingBelow50: 'A carb ceiling under 50 g',
    projectionBand: 'The four-week range',
    goalSetting: 'Weight goal setting',
    energyEstimate: 'The energy estimate',
    alcoholLogging: 'Alcohol logging',
    exercisePlans: 'Exercise plans',
  },
  /** In READINESS_REASON_IDS order (storage/readiness.ts). */
  reasonPhrases: {
    'under-18': 'being under 18',
    'under-18-birth-year': 'your birth year',
    'pregnant-or-breastfeeding': 'pregnancy or breastfeeding',
    'diabetes-medication': 'diabetes medication',
    'eating-disorder-or-low-weight': 'an eating disorder or low weight',
    'low-current-weight': 'your current weight',
    'exercise-warning': 'exercise warning signs',
  },
  listComma: ', ',
  listAnd: ' and ',
  changeAnswersLink: 'Change your answers',
  /** The birth year and answer 1 disagree (C24 point 3); {year} is when the under-18 settings lift. */
  ageCheck: {
    birthYearUnder18:
      'This birth year means you may be under 18. Until 1 January {year}, the app keeps to its under-18 settings: no fasting, no keto carb targets, no Kickstart, no weight goals, no energy estimate and no alcohol logging.',
    answeredUnder18:
      'You answered that you are under 18, but this birth year says you are at least 18. The app keeps to its under-18 settings until you change that answer.',
    changeAnswer: 'Change my answer',
    summaryLine:
      'Your birth year means you may be under 18, so the app keeps to its under-18 settings until 1 January {year}.',
  },
  /** A current weight below BMI 18.5 for the height counts as a yes to question 5 (HS-35). The BMI figure is never shown. */
  weightCheck: {
    lowWeight:
      'The weight you entered is low for your height. The app keeps to the same settings as a Yes to question 5: no fasting, no Kickstart, no energy deficit, no keto carb ceiling and no weight goals. If the weight or height is a typing slip, correct it above.',
    changeAnswer: 'Change answer 5',
    summaryLine:
      'Your latest weight is low for your height, so the app keeps to the same settings as a Yes to question 5.',
  },
  settingsRow: { title: 'Readiness answers', detail: 'What the app switches on and off' },
  settingsAnswersLabel: 'Your answers',
  settingsIntro:
    'These answers decide which parts of the app are switched on. A change applies at once, and nothing you have recorded is deleted.',
  /** Held here for item 14's stop-sign card and item 22's electrolyte reminder (C102). */
  bloodPressure: {
    stopSign: `Eat and drink fluids. If you take blood-pressure medication, check with your pharmacist or GP before adding salt. Talk to Healthline (${helpNumbers.healthline.number}) or your GP if it continues.`,
    electrolyte:
      'If you take blood-pressure medication, check with your pharmacist or GP before adding salt or using salt substitutes.',
  },
} as const;

/** The profile step and the Settings profile screen (UX 1d; C04, C24, C25, C42, C43). */
export const profile = {
  title: 'About you',
  intro:
    'These details set your energy estimate, the guidance figures and shopping amounts. They stay on this phone.',
  cards: {
    body: 'You',
    goal: 'Goal',
    activity: 'Activity and equipment',
    household: 'Household and food',
  },
  heightLabel: 'Height (cm)',
  weightLabel: 'Current weight (kg)',
  weightOptionalHint: 'Optional. You can add weigh-ins later, or not at all.',
  birthYearLabel: 'Year you were born',
  birthYearHint: 'Only the year is kept.',
  sexLegend: 'Sex',
  sexHint: 'Used only for the energy estimate and the NZ guidance figures.',
  sexOptions: { female: 'Female', male: 'Male' },
  goalLabel: 'Long-term goal weight (kg)',
  goalHint:
    'Optional. This goal is long-term: the app never sets a date for it, and the four-week chart is not a promise.',
  /** UX 1d, word for word (docFidelity.test.ts). */
  kickstartLabel: 'Strong start for 3 weeks: bigger deficit, protein protected, daily electrolytes',
  /** HEALTH_SAFETY.md sections 2 and 4, with the figures taken from the core constants. */
  kickstartHint: `Kickstart plans up to ${KICKSTART_MAX_DEFICIT_PCT}% below your estimated energy needs for three weeks, with net carbs at ${KICKSTART_NET_CARBS_G} g, protein at the top of its range and a daily electrolyte reminder. The app never plans a day below ${withThousands(FLOOR_KJ)} kJ. Most of the fast drop expected in these weeks is water and glycogen, with some fat.`,
  activityLegend: 'Activity',
  activityHint: 'A physically demanding job with lots of steps counts as active.',
  activity: {
    sedentary: 'Mostly sitting',
    moderate: 'Moderately active',
    'active-job': 'Physically active job',
    'very-active': 'Very active job and training',
  },
  bandsLabel: 'I have resistance bands',
  dumbbellsLabel: 'I have dumbbells',
  householdLabel: 'People eating dinner at home',
  householdHint: 'Used for shared dinners and grocery amounts. Your own portion stays the same.',
  householdFewer: 'One fewer person',
  householdMore: 'One more person',
  allergensLegend: 'Allergens to avoid',
  allergensHint:
    'Recipes and swaps with these are flagged. A food whose allergens are not known is never shown as free of them.',
  /** In USER_ALLERGENS order (storage/allergens.ts). */
  allergenNames: {
    peanut: 'Peanuts',
    'tree-nut': 'Tree nuts',
    milk: 'Milk',
    egg: 'Egg',
    fish: 'Fish',
    crustacea: 'Crustacea (prawns, crab, crayfish)',
    mollusc: 'Molluscs (mussels, oysters, squid)',
    sesame: 'Sesame',
    soy: 'Soy',
    lupin: 'Lupin',
    wheat: 'Wheat',
    barley: 'Barley',
    oats: 'Oats',
    rye: 'Rye',
    sulphites: 'Sulphites',
    gluten: 'Gluten (wheat, barley, oats and rye)',
  },
  dislikesLabel: 'Foods you do not want suggested',
  dislikesHint: 'Add one food at a time, such as liver.',
  dislikesAdd: 'Add',
  dislikeRemove: 'Remove {term}',
  glutenFreeLabel: 'Gluten-free household',
  glutenFreeHint: 'When this is on, gluten-free swaps are suggested for shared meals.',
  save: 'Save',
  saved: 'Saved.',
  goalHiddenAfterHeight:
    'Your long-term goal is below a BMI of 18.5 for this height, so it is hidden until you change it.',
  settingsRow: {
    title: 'Profile',
    detail: 'Height, sex, birth year, activity, household and food',
  },
  errors: {
    required: 'Enter this to continue.',
    notANumber: 'Enter a plain number, such as 175 or 82.5.',
    oneDecimal: 'Use at most one decimal place.',
    heightRange: 'Enter a height from 120 to 230 cm.',
    weightRange: 'Enter a weight from 20 to 400 kg.',
    birthYearRange: 'Enter a year from 1900 to {year}.',
    sexRequired: 'Choose one. It is used only for the energy estimate and the guidance figures.',
    goalRange: 'Enter a goal from 20 to 400 kg.',
    goalNeedsWeight: 'Enter your current weight to set a long-term goal.',
    goalNeedsHeight: 'Enter your height to set a long-term goal.',
    goalNotBelow:
      'A long-term goal is a weight below your current weight. Leave it empty if you do not want one.',
    goalBelowFloor:
      'This goal is below a BMI of 18.5 for your height, so the app cannot use it. Choose a higher goal, or leave it empty.',
    householdRange: 'Choose from 1 to 20 people.',
    dislikeTooLong: 'Use at most 40 characters.',
    dislikeDuplicate: 'That food is already on the list.',
    dislikeTooMany: 'The list holds up to 50 foods.',
  },
} as const;

/** The eating schedule (UX 1e; HEALTH_SAFETY.md section 3; C07, C55, C101; mock-up Schedule.dc.html). */
export const schedule = {
  title: 'Eating schedule',
  kickstartTitle: 'Kickstart: 23:1 for the 3 weeks of Kickstart',
  kickstartWhen:
    'The 3 weeks count from the day you start Kickstart. On any other day, the app uses 22:2 (5 pm snack + dinner) instead.',
  /** UX 1e, word for word with 140 filled (docFidelity.test.ts); {proteinG} follows the protein range (C65). */
  kickstartLine:
    "One meal has to carry about {proteinG} g protein. If a day's dinner can't, the app will offer the 5 pm snack. That's not a broken fast.",
  presetsLegend: 'Choose a pattern',
  /** HEALTH_SAFETY.md section 3 preset names. */
  presetNames: { '22:2': '5 pm snack + dinner', '23:1': 'One meal' },
  presetDetail: 'Eat {start} – {end}',
  presetDetailNamed: '{name} · Eat {start} – {end}',
  kickstartChip: 'Kickstart',
  custom: 'Custom times',
  none: 'No fasting plan for now',
  noneDetail: 'Meals at ordinary times. You can choose a pattern later in Settings.',
  chooseFirst: 'Choose a pattern to see its times.',
  windowTitle: 'Your window',
  startLabel: 'First bite',
  endLabel: 'Last bite',
  /** Screen 1e (FL-08): "Eating 5:00 pm to 7:00 pm = 2 hours. Fasting 22 hours." */
  windowSummary: 'Eating {start} to {end} = {eating}. Fasting {fasting}.',
  /** The Fast card (FL-08, FL-14): "2 h eating, 22 h fasting". */
  windowShort: '{eating} eating, {fasting} fasting',
  hourOne: '1 hour',
  hours: '{n} hours',
  minuteOne: '1 minute',
  minutes: '{n} minutes',
  hoursShort: '{n} h',
  minutesShort: '{n} m',
  dayBarLabels: ['12 am', '6 am', '12 pm', '6 pm', '12 am'],
  neverInsist:
    'The app never insists on a fast. On a day when food or energy runs short, it is fine to widen the window.',
  /** UX 1e, word for word (docFidelity.test.ts). */
  refluxLabel: 'I get reflux; prefer earlier or split dinner',
  refluxHint:
    'Very large late dinners can make reflux worse. The app will suggest an earlier dinner, or a snack plus a smaller dinner.',
  pharmacistNote:
    'If you take medicine that must be taken with food, or blood-pressure or cholesterol medication, check the timing with your pharmacist or GP before you choose when you eat.',
  diabetesNote:
    'You confirmed your prescriber agreed to fasting with your diabetes medication. If your medication or dose changes, go to Settings, Readiness answers and tap "My medication or dose has changed".',
  noneSaved:
    'No eating schedule is saved yet. Meals are planned at ordinary times until you choose one.',
  settingsRow: { title: 'Eating schedule', detail: 'Your eating window' },
  save: 'Save',
  saved: 'Saved.',
  errors: {
    invalidTime: 'Enter a time such as 6:00 pm.',
    sameTime: 'The first and last bite need different times.',
    tooShort: 'The eating window must be at least 1 hour.',
    choosePattern: 'Choose a pattern, or No fasting plan for now.',
  },
} as const;

/** The garden step (UX 1f; C57). Fixed copy never claims a homegrown weight. */
export const garden = {
  title: 'Your garden',
  intro: 'Crops you grow are used first in meal plans and taken off the shopping list.',
  silverbeetListed: 'Silverbeet is listed already.',
  empty: 'No crops listed yet.',
  available: 'Available, amount not entered',
  amount: '{amount} {unit}',
  unitNames: { g: 'g', each: 'each', bunchOne: 'bunch', bunch: 'bunches' },
  ready: 'Ready to harvest',
  notReady: 'Not ready yet',
  keepsForOne: 'Keeps about 1 day',
  keepsFor: 'Keeps about {days} days',
  remove: 'Remove {name}',
  addTitle: 'Add a crop',
  nameLabel: 'Crop',
  nameHint: 'For example, spinach or lettuce.',
  amountLabel: 'Amount (optional)',
  amountHint: 'Leave it empty if you have not weighed or counted it.',
  unitLegend: 'Unit',
  unitOptions: { g: 'Grams', each: 'Each', bunch: 'Bunches' },
  readyLabel: 'Ready to harvest',
  keepsLabel: 'Keeps for (days, optional)',
  add: 'Add to garden',
  continue: 'Continue',
  skip: 'Skip for now',
  skipHint: 'You can add crops later.',
  errors: {
    nameRequired: 'Enter the crop name.',
    nameLength: 'Use at most 60 characters.',
    amount: 'Enter an amount above 0, such as 300.',
    unitRequired: 'Choose a unit for the amount.',
    keeps: 'Enter whole days from 0 to 365.',
  },
} as const;

/** Weight log, phases and trend (HEALTH_SAFETY section 2; UX_SCREENS section 2 card 1; item 14). */
export const weight = {
  card: {
    label: 'Weight',
    latest: 'Latest',
    latestOn: 'Latest, {date}',
    average7: '7-day average',
    average14: '14-day average',
    goalStat: 'Long-term goal',
    milestoneStat: 'Next milestone {kg} kg',
    needsShort: 'Needs more weigh-ins',
    needs7: 'The 7-day average needs weigh-ins on at least 3 of the last 7 days.',
    needs14: 'The 14-day average needs weigh-ins on at least 6 of the last 14 days.',
    notSetShort: 'Not set',
    needsUpdatingShort: 'Needs updating',
    needsHeightShort: 'Needs your height',
    kg: '{kg} kg',
    noWeighIns: 'No weigh-ins yet. Log one to start your trend.',
    noWeighInsBlock: 'No weigh-ins yet in these four weeks.',
    logWeight: 'Log weight',
    details: 'Weigh-ins and trend',
  },
  entry: {
    fieldLabel: 'Weight (kg)',
    lastHint: 'Last weigh-in: {kg} kg, {date}.',
    sameAsLast: 'Same as last time',
    less: 'Less 0.1 kg',
    more: 'More 0.1 kg',
    save: 'Save weigh-in',
    cancel: 'Cancel',
    saved: 'Saved {kg} kg at {time}.',
    changeWhen: 'Change the date or time',
    dateLabel: 'Date',
    timeLabel: 'Time',
    noteLabel: 'Note (optional)',
    future: 'That time is still to come. Choose a time up to now.',
    notANumber: 'Enter the weight as a number, such as 82.5.',
    outOfRange: 'Enter a weight from 20 to 400 kg.',
    bigChange: 'That is {diff} kg from your last weigh-in. Is the number right?',
    saveAnyway: 'Save anyway',
    checkAgain: 'Check the number',
    saveFailed: 'The weigh-in could not be saved. Nothing was changed. Try again.',
  },
  list: {
    label: 'Weigh-ins',
    empty: 'No weigh-ins yet.',
    row: '{date}, {time}: {kg} kg',
    firstWeight: 'First weight',
    edit: 'Edit',
    delete: 'Delete',
    deleteConfirm: 'Delete this weigh-in? This cannot be undone.',
    deleteYes: 'Delete weigh-in',
    cancel: 'Cancel',
    saveChanges: 'Save changes',
    showOlder: 'Show older weigh-ins',
    deleteFailed: 'The weigh-in could not be deleted. Nothing was changed. Try again.',
  },
  trend: {
    label: 'Trend',
    weeklyChange: 'Weekly change',
    down: 'Down {kg} kg a week',
    up: 'Up {kg} kg a week',
    level: 'About level',
    notEnough: 'Not enough weigh-ins yet',
    howToReadLabel: 'How to read this',
    howToRead:
      'Weight moves from day to day with water, salt and the food in your stomach: a litre of water is a kilogram. The 7-day average smooths that out, so it is the number to watch.',
  },
  chart: {
    ariaWithBand:
      'Chart of your weight over four weeks, with a shaded typical range. The range is not a promise.',
    ariaNoBand: 'Chart of your weight over four weeks.',
    ariaLong: 'Chart of your weight over the last {days} days.',
    week: 'Week {n}',
    bandLegend: 'Shaded: typical range, not a promise',
    lineLegend: 'Dots: weigh-ins. Line: 7-day average.',
    trendLine: 'This is a trend, not a promise.',
    noAnchor: 'The shaded range shows once there is a weigh-in near the start of these four weeks.',
    viewsLabel: 'Chart length',
    fourWeeks: '4 weeks',
    days30: '30 days',
    days90: '90 days',
    aboutBand:
      'The shaded range is a rough typical range, not a promise and not a target. In Steady it follows about 0.5–1 kg a week, and never faster than your weight check-in setting. In your first Kickstart it is steeper for two weeks, mostly water and glycogen, then flattens.',
  },
  phase: {
    label: 'Phase',
    kickstartChip: 'Kickstart, week {week} of {weeks}',
    steadyChip: 'Steady',
    kickstartNote:
      'Kickstart: a fast drop is expected now. Most of it is water and glycogen, with some fat. Typical first weeks on a carb ceiling see several kilograms go.',
    kickstartExtendedNote:
      'Extended Kickstart. The early drop, mostly water and glycogen, belongs to your first three Kickstart weeks; from here the pace is watched the same way as in Steady.',
    kickstartLaterNote:
      'Kickstart. The early drop, mostly water and glycogen, belongs to your first three Kickstart weeks; from here the pace is watched the same way as in Steady.',
    kickstartDue: 'Kickstart is due to finish on {date}.',
    // A start dated ahead (the phone's clock was ahead when it started; item 12's 'not-started').
    notStartedNote:
      "Your Kickstart has not started yet: by this phone's date, its first day has not come. Until it does, you are in Steady.",
    notStartedDay1:
      "By this phone's date, its first day is {date}. If the date was wrong when you started it, you can end it now.",
    extensionsUsed: 'Extensions used: {used} of 3.',
    steadyPace: 'About 0.5–1 kg a week is the pace associated with keeping weight off.',
    steadyRebound:
      'The rebound after Kickstart (a kilogram or two returning when carbs or salt go up) is water, not failure.',
    gated:
      'Kickstart, the typical range and the pace notes are switched off by your readiness answers or age. Your weigh-ins and trend still show.',
    gatedUnanswered:
      'Kickstart, the typical range and the pace notes stay off until the readiness questions are answered. Your weigh-ins and trend still show.',
    lowWeight:
      'Your recent weight is below a BMI of 18.5 for your height. Please check in with your GP, and look again at readiness question 5. Your weigh-ins and trend still show.',
    readinessLink: 'See your readiness answers',
  },
  goal: {
    label: 'Long-term goal',
    none: 'No long-term goal set.',
    set: 'Set a long-term goal',
    change: 'Change the long-term goal',
    milestoneLabel: 'Next milestone',
    milestoneExplain:
      'The long-term goal is approached a step at a time. Your next milestone is {kg} kg, no more than 20% below your current weight.',
    milestoneIsGoal:
      'Your long-term goal is within 20% of your current weight, so it is also your next milestone.',
    milestoneNeedsWeighIn: 'Log a weigh-in to see your next milestone.',
    fieldLabel: 'Long-term goal (kg)',
    fieldHint:
      'This is long-term. It never sets your daily amounts, your pace or the typical range.',
    save: 'Save long-term goal',
    remove: 'Remove long-term goal',
    removeConfirm: 'Remove the long-term goal? Your weigh-ins stay.',
    cancel: 'Cancel',
    belowBmiFloor:
      'A long-term goal cannot be set below a BMI of 18.5 for your height. Choose a higher one.',
    notBelowWeight:
      'A long-term goal is a weight below your current weight. Leave it empty if you do not want one.',
    needsHeight:
      'Enter your height in your profile first, so the app can check a long-term goal against a BMI of 18.5.',
    needsWeighIn: 'Log a weigh-in first, then set the long-term goal.',
    notANumber: 'Enter the weight as a number, such as 82.5.',
    outOfRange: 'Enter a weight from 20 to 400 kg.',
    needsUpdating: 'Your long-term goal needs updating for your height.',
    gated:
      'Setting a long-term goal is switched off by your readiness answers or age. Your weigh-ins and trend still show.',
    saveFailed: 'The long-term goal could not be saved. Nothing was changed. Try again.',
  },
  fluctuation: {
    label: 'About daily changes',
    body: 'Day-to-day weight goes up and down with water, salt and the food in your stomach: a litre of water is a kilogram. Watch the 7-day average rather than any one morning.',
    gotIt: 'Got it',
  },
  rapidLoss: {
    label: 'Weight check-in',
    body: "You're still losing quickly. That's worth a check-in with your GP, especially on a low-carb plan.",
    detail:
      'Your 7-day average has dropped by more than {threshold} kg a week, {weeks} weeks in a row.',
    hideToday: 'Hide for today',
    returns: 'It comes back tomorrow while the pattern continues.',
  },
  rapidLossSettings: {
    label: 'Weight check-in card',
    explain1:
      'This card suggests a check-in with your GP when your weekly average keeps falling quickly. It never shows in your first three Kickstart weeks, when a fast drop is mostly water and glycogen.',
    open: 'Read about this setting',
    openAfterRead: 'Change this setting',
    close: 'Close',
    explain2: 'By default it shows after 3 weeks in a row of losing more than 1 kg a week.',
    explain3:
      'You can make it more sensitive: from 0.75 kg a week, or 2 weeks in a row instead of 3. You cannot make it less sensitive or turn it off.',
    readIt: 'I have read this',
    thresholdLabel: 'Show it when the 7-day average falls faster than',
    thresholdOption: '{kg} kg a week',
    weeksLabel: 'Weeks in a row',
    weeksOption: '{n} weeks',
    reset: 'Back to the default',
    saved: 'Saved.',
    saveFailed: 'The setting could not be saved. Nothing was changed. Try again.',
  },
  stopSigns: {
    label: 'Kickstart stop-signs',
    intro:
      'Stop-signs during Kickstart: dizziness on standing, palpitations, cramps that electrolytes do not settle, or feeling faint at work.',
    action: 'Eat, add salt and fluids, and talk to Healthline or a GP if it continues.',
    // The blood-pressure variant is readiness.bloodPressure.stopSign (item 13's key; section 1 point 6).
    emergency: 'Call 111 if you faint or feel very unwell.',
    afterCheckRunning:
      'You told the app about a stop-sign, so Kickstart will not be extended. Eating more today is fine, and you can end Kickstart now.',
    afterCheckEnded:
      'You told the app about a stop-sign. Kickstart has ended. Eating more today is fine.',
    endNow: 'End Kickstart now',
    hideToday: 'Hide for today',
  },
  extension: {
    label: 'Kickstart',
    offer: 'Kickstart is due to finish on {date}. You can extend it by one week if you feel well.',
    extend: 'Extend by one week',
    notNow: 'Not now',
    extended: 'Kickstart extended by one week. It is now week {week} of {weeks}.',
    stopSign:
      'Thanks for telling the app. Kickstart will not be extended. Eating more today is fine, and you can end Kickstart now.',
    refusedWindow: 'Kickstart could not be extended: the offer is open only in its last 3 days.',
    refusedCap:
      'Kickstart could not be extended: it can run for at most 6 weeks and 3 extensions in all.',
    refusedStopSign:
      'Kickstart could not be extended: a stop-sign was reported for this Kickstart.',
    saveFailed: 'Your answers could not be saved. Nothing was changed. Try again.',
  },
  check: {
    title: 'How do you feel?',
    introExtend: 'Answer each one. Any yes means Kickstart is not extended this time.',
    introStart: 'Answer each one. Any yes means Kickstart does not start this time.',
    dizzyOnStanding: 'Dizziness when you stand up?',
    palpitations: 'Palpitations (a racing, pounding or fluttering heartbeat)?',
    crampsNotSettling: 'Cramps that electrolytes do not settle?',
    faintAtWork: 'Feeling faint at work?',
    yes: 'Yes',
    no: 'No',
    energyLabel: 'Energy (optional)',
    sleepLabel: 'Sleep (optional)',
    ratingScale: '1 is very low, 5 is very good.',
    unanswered: 'Answer all four questions first.',
    confirmExtend: 'Extend Kickstart',
    confirmStart: 'Start Kickstart',
    cancel: 'Cancel',
  },
  start: {
    offer:
      'You can start a Kickstart: three weeks with the bigger deficit, protein protected, net carbs at 20 g and daily electrolytes. The app asks how you feel first.',
    offerWindow:
      'Starting it also moves the eating window to 23:1 (one meal) while Kickstart runs.',
    pendingLabel: 'Kickstart',
    pendingIntro: 'You chose Kickstart during setup. It starts only when you confirm it here.',
    pendingWindow: 'Until it starts, the eating window is 22:2 (5 pm snack + dinner).',
    action: 'Start a Kickstart',
    pendingAction: 'Start Kickstart today',
    notNow: 'Not now',
    declined: 'Kickstart was not started. You can start one later from the Weight screen.',
    started: 'Kickstart started today. It runs for three weeks.',
    presetSet:
      'During Kickstart the eating window is 23:1 (one meal). You can change it in Settings, Eating schedule.',
    stopSign: 'Because of that answer, Kickstart has not started.',
    unavailableMode: 'Kickstart runs only in keto-preferred mode.',
    unavailableGated: 'Kickstart is switched off by your readiness answers or age.',
    unavailableLowWeight:
      'Kickstart is not offered while your recent weight is below a BMI of 18.5 for your height.',
    unavailableToday: 'A new Kickstart can start from tomorrow.',
    unavailableRecentStopSign:
      'A stop-sign was reported in the last two weeks, so a new Kickstart cannot start yet.',
    unavailableCap:
      'Kickstart can run for at most 6 weeks in all, and a new one needs a full three weeks, so another one cannot start.',
    saveFailed: 'Kickstart could not be started. Nothing was changed. Try again.',
  },
  end: {
    action: 'End Kickstart now',
    confirm:
      'End Kickstart today? A new one can start later only if a full three weeks still fit in the 6-week limit.',
    yes: 'End Kickstart',
    cancel: 'Cancel',
    ended: 'Kickstart ended. You are in Steady now.',
    alreadyEnded: 'Kickstart has already finished.',
    saveFailed: 'Kickstart could not be ended. Nothing was changed. Try again.',
  },
  steadyExplainer: {
    label: 'Kickstart has finished',
    deficit:
      'The app now plans with the smaller Steady deficit instead of the bigger Kickstart one.',
    carbs: 'Net carbs go back to your own ceiling of {g} g.',
    window:
      '23:1 was for Kickstart. Outside Kickstart the eating window is 22:2 (5 pm snack + dinner).',
    use231: 'Use 23:1 instead',
    kept231: 'The eating window is 23:1. You can change it in Settings, Eating schedule.',
    ok: 'OK',
  },
  presetMoved: {
    label: 'Eating window',
    body: 'The eating window is now 22:2 (5 pm snack + dinner). 23:1 (one meal) is the Kickstart default and is used only while Kickstart runs.',
    use231: 'Use 23:1 instead',
    ok: 'OK',
  },
} as const;

// ---- Move: exercise safety, the pre-session check, the week and the jog (checklist item 26) ----

/**
 * Move wording (HEALTH_SAFETY.md section 6; UX_SCREENS.md 4a–4d; checklist items 26 and 27). The
 * stop rules and the beach prompts are HEALTH_SAFETY.md section 6 word for word (DOC_REVIEW C77;
 * tools/scans/docFidelity.test.ts checks them). Movement names, how-to lines and form cues live in
 * packages/core/data/exercises.json and may not carry safety wording (DATASET_WORDING_BANS):
 * everything about pain, stopping, symptoms, rest or the beach is here. Placeholders in braces
 * are filled with fillTemplate.
 */
export const move = {
  /** The keys exercises link to (Exercise.safetyKeys), shown before Start (HS-12, HS-28). */
  safety: {
    stopRules: {
      title: 'Stop signs',
      body: 'Stop immediately and seek help for chest pain or pressure, severe shortness of breath, fainting or near-fainting, sudden severe headache, or pain that changes how you move.',
      emergency: `Call ${helpNumbers.emergency.number} for chest pain that does not settle within a few minutes.`,
    },
    painFreeOnly: {
      title: 'Only if pain-free',
      body: 'Do this movement only if it is pain-free. If it hurts at all, leave it out today.',
    },
    beachPrompts: {
      title: 'At the beach',
      /** Always shown through beachPromptLines (exercise/safety.ts), never from this list directly. */
      items: [
        'Swim only between the red and yellow flags when lifeguards are on patrol; Bay of Plenty surf beaches are usually patrolled from October to the end of March, with hours on Safeswim. Outside patrol, wade no deeper than knee height. Rips: relax and float, raise a hand, do not fight the current.',
        'Local lifeguards warn that an outgoing afternoon tide with rising swell is a risky combination.',
        'Sun: in the warmer months, train before 10 am or after 4 pm where possible; hat, sunscreen reapplied after sweating or swimming, long sleeves.',
        'Heat and hydration: carry water; 500 mL per hour of activity in the heat is the in-app default.',
        'Sand: start barefoot work on firm, wet sand; soft sand is harder on calves and Achilles. Check for glass and shells. Do not jump from dunes.',
        'Never swim alone, never after drinking.',
      ],
      /** Shown after the hydration line only when keto is on and the keto ceiling is available (beachPromptLines). */
      electrolytes:
        "On the carb ceiling, sweat takes salt and other electrolytes with it, so keep up today's electrolytes as well as water.",
    },
  },
  /** The pre-session check, before every session (HS section 6; UX 4b; storage PreCheck). */
  preCheck: {
    title: 'Quick check before you start',
    intro: 'Answer all six. Any yes means a lighter session or rest today, and both count.',
    questions: {
      painOrInjury: 'Pain or injury',
      backOrLegSymptoms: 'Back or leg symptoms',
      tiredOrPoorSleep: 'Very tired or poor sleep',
      heatOrSun: 'Hot day or sun exposure',
      notHydrated: 'Not well hydrated',
      heavyWorkDay: 'A heavy physical work day',
    },
    yes: 'Yes',
    no: 'No',
    mustAnswer: 'Answer all six to continue.',
    allNo: `${general.readinessOutcome} You can start the planned session, or choose the lighter session or rest.`,
    anyYes: 'You answered yes, so today it is the lighter session or rest. Both count.',
    painFirst:
      'With pain or back or leg symptoms, rest comes first. The lighter session also leaves out the hip hinge; leave out anything that hurts.',
    heavyWork:
      'On a heavy physical work day, the lighter session is the plan, not a fallback, and it counts in full.',
    fasted:
      'Exercising while fasted is allowed; choose a lighter session and break the fast afterwards if the plan says so.',
    eatFirst: "You can also eat first. It's fine to widen the window.",
    notDiagnosis:
      'The app does not diagnose injuries and cannot tell you that exercise is right for you. If pain or symptoms keep coming back, talk to your GP.',
  },
  choices: {
    planned: 'Planned session',
    lighter: 'Lighter session',
    rest: 'Rest today',
    skip: 'Rest instead',
  },
  lighter:
    'Lighter session: the easier version of each movement and one set fewer. The warm-up and cool-down stay.',
  structure: {
    warmUp: 'Warm-up, 5 minutes',
    main: 'Main part',
    coolDown: 'Cool-down',
  },
  /** Finish ratings, 1–5 (UX 4c). The direction is fixed here; C51's tolerated walk relies on it. */
  finish: {
    title: 'How did it go?',
    exertion: { label: 'Effort', low: '1 = very easy', high: '5 = very hard' },
    soreness: { label: 'Soreness', low: '1 = none', high: '5 = very sore' },
    energy: { label: 'Energy', low: '1 = very low', high: '5 = very high' },
  },
  /** Rest is never a failure (HS section 6; UX 2 card 6, 4a). */
  rest: {
    restDay: 'Rest day, that counts',
    countsAsSuccess: 'counts as success',
    general: 'Rest and recovery count as success.',
    rested: 'Rested. That counts.',
  },
  /** The progression cap (HS section 6; DOC_REVIEW C76). */
  progression: {
    rule: 'Each movement goes up by about 10% a week at most, one small step at a time. Add reps before trying the harder version.',
    capped: 'Set lower to keep this week within about 10% of last week.',
    hold: 'Last week had only lighter sessions or rest for this movement, so this week stays at the amount of the week before, with no increase.',
    weekReached:
      "This week's amount for this movement is done. You can still log it if you do more.",
    newVariant: 'New version, so it starts at the bottom of the range.',
    tryNext:
      'Top of the range in your last two sessions. Next time you could try {variant}, starting again at the bottom of the range.',
    restart:
      'It has been a few weeks since this movement, so it starts again from the first amount.',
  },
  /** Beach jogging, opt-in only (HS section 6; UX 4d; C51). */
  jog: {
    optional:
      'Beach jogging is optional. Your work already counts as activity, so jogging is never required.',
    locked: 'Jogging unlocks after four tolerated walks.',
    progress: 'Tolerated walks so far: {count} of 4.',
    needsOptIn: 'It also needs your opt-in in Settings, under Equipment.',
    readyOptIn:
      'You have four tolerated walks. Jogging stays off unless you turn it on in Settings, under Equipment.',
    paused:
      'After your last jog, effort or soreness was above 3 or not rated, or the next check showed pain or back or leg symptoms. The beach walk is shown again until one more tolerated walk.',
    tolerated:
      'A tolerated walk is a beach walk of at least {minutes} minutes, with every check before it answered no, effort and soreness rated 3 or less, and no pain or back or leg symptoms at your next check. At most one walk a day counts.',
    shownAsWalk: 'Jogging is not on right now, so this day shows the beach walk.',
    toggle: {
      label: 'Beach jogging (optional)',
      hint: 'Adds jog and walk intervals to the weekly plan once four tolerated walks are logged. Jogging is never required.',
    },
  },
  /** The weekly plan (HS section 6 programming rules; EX-05). In WEEK_PROBLEM_CODES order. */
  week: {
    title: 'This week',
    edit: 'Change weekly plan',
    restChip: 'Rest',
    dayDone: 'Done',
    notDone: 'Not done. Rest counts too.',
    stripStrength: '{labels}: full-body sessions of about {minutes} minutes.',
    stripWalk: 'Walk: optional beach walk.',
    stripJog: 'Jog: optional jog and walk intervals.',
    fallback:
      'Your weekly plan did not fit the plan rules, so the standard week is shown. You can change it with Change weekly plan.',
    problems: {
      'unknown-template': 'A session in this plan is no longer in the app. Choose another.',
      'day-too-full': 'Plan at most one strength session and one beach session on a day.',
      'strength-count': 'Plan 2 or 3 strength sessions a week.',
      'rest-days': 'Keep at least 2 rest days a week. Rest days are part of the plan.',
      'strength-back-to-back': 'Leave a day between strength sessions, Sunday to Monday included.',
      'jog-locked': 'Jogging unlocks after four tolerated walks.',
      'jog-limit': 'Jog on 2 days a week at most, and not two days in a row.',
      'jog-on-strength-day': 'Keep jog days and strength days apart.',
    },
  },
  /**
   * Why a session cannot start (sessionStartGate), in START_PROBLEM_CODES order. RD-05 uses
   * readiness.featureOff instead.
   */
  start: {
    problems: {
      'unknown-template': 'This session is no longer in the app.',
      'jog-locked':
        'Jogging is not on right now, so this jog cannot start. The beach walk is shown instead.',
      'not-planned-today':
        'This session is not planned for today. To change your training days, use Change weekly plan.',
      'already-today':
        'Today already has a session like this one. The plan has at most one strength session and one beach session a day.',
      'back-to-back':
        'Strength sessions need a rest day between them, so this one waits for another day.',
      'strength-count': 'This week already has 3 strength sessions, the most the plan has.',
      'rest-days':
        'This week already has 5 active days. The other 2 are rest days, and rest counts.',
    },
  },
  /** Card header chip (mock-up "Bodyweight"). */
  equipment: {
    none: 'Bodyweight',
    bands: 'Bodyweight and bands',
    dumbbells: 'Bodyweight and dumbbells',
    both: 'Bodyweight, bands and dumbbells',
  },
  /** When getExerciseData() throws (never expected; CI checks the data). */
  dataError:
    'The exercise plans could not be loaded. Nothing was changed. Reload the app; if this keeps happening, the app needs an update.',
} as const;

/** All sections, for scanning and review. */
export const healthCopy = {
  helpNumbers,
  general,
  alcohol,
  privacy,
  onboarding,
  readiness,
  profile,
  schedule,
  garden,
  weight,
  move,
} as const;
