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

/** Statements shown on first run and on the About screen (HEALTH_SAFETY.md, top; UX 1a). */
export const general = {
  welcome:
    'This is a private logbook and planner. It is not a medical device and does not replace your GP.',
  about:
    'The app is a personal logbook and planner. It is not a medical device, does not diagnose, and does not replace your GP, a dietitian, or an addiction service.',
  readinessOutcome: 'Nothing you have told the app rules this out; your GP knows more.',
  /** The Privacy card on About (DOC_REVIEW C34; item 5 review). */
  privacy:
    'Your records stay on this phone, and the app sends nothing anywhere. Later, when you tap Send to laptop, it will send the grocery list only, encrypted. There is no account and no analytics.',
} as const;

/** Alcohol wording (HEALTH_SAFETY.md section 5; UX 1b, 5c). */
export const alcohol = {
  firstRunNotice:
    'If you drink most days or heavily at weekends, cutting down suddenly can be dangerous. Talk to your GP or the Alcohol Drug Helpline (0800 787 797, text 8681) before making a big change. Call 111 for seizures, confusion or hallucinations.',
  helpCard:
    "If you've been drinking most days for a while and are thinking about changing that, the safest first step is a conversation, not a sudden stop. Alcohol Drug Helpline 0800 787 797 (call or text 8681), free and 24/7, or your GP. If someone is very unwell, shaking badly, confused or having a seizure, call 111.",
  noRiskFreeLevel: 'No alcohol use is risk-free.',
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

/** All sections, for scanning and review. */
export const healthCopy = { helpNumbers, general, alcohol, privacy } as const;
