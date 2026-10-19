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
  },
  /** The weekly reminder on Today and on the Backup and data card (section 12.2; BK-03). */
  backupReminder: {
    title: 'Back up your records',
    body: 'Your records are kept only on this phone. Export a backup and keep the file somewhere else too.',
    weakStorage:
      "This phone has not promised to keep the app's records. A backup is your only other copy.",
    backUpNow: 'Back up now',
    notNow: 'Not now',
  },
  /** Export (sections 10.4 and 10.5; C99; D19, D21, D22). */
  exportBackup: {
    lockLabel: 'Lock the file with a password',
    passwordLabel: 'Password',
    passwordRepeatLabel: 'Type the password again',
    passwordRule: 'At least 10 characters.',
    passwordTooShort: 'The password needs at least 10 characters.',
    passwordTooLong: 'The password can have at most 1,000 characters.',
    passwordsDiffer: 'The two passwords are not the same.',
    forgottenWarning:
      'If you forget this password, the backup cannot be opened. Nobody can recover it.',
    plainWarning: 'Anyone who opens this file can read your records.',
    locking: 'Locking…',
    checkDownloads: 'Your phone should now show {fileName} in Downloads. Check it is there.',
    canYouSeeIt: 'Can you see the file?',
    yes: 'Yes',
    no: 'No',
    notConfirmed: 'The backup may not have saved. Try again.',
    selfCheckFailed: 'The backup could not be checked: {table} {field} failed {rule}',
    saveUnchecked: 'Save an unchecked copy',
    uncheckedNote: 'This copy was not checked, so it does not count as a backup.',
    lockCheckFailed: 'The locked backup could not be checked, so it was not saved.',
  },
  /** Restore (section 10.6; BK-02; D17). */
  importBackup: {
    chooseFile: 'Choose a backup file',
    passwordLabel: 'Backup password',
    unlocking: 'Unlocking…',
    fileMade: 'Backup made {date}.',
    fileLocked: 'The file was locked with a password.',
    filePlain: 'The file was not locked.',
    replaceSummary:
      'This replaces everything on this phone. {missing} records on this phone are not in the file. {changed} records on this phone were changed after the file was made. Newest record on this phone: {phoneNewest}; in the file: {fileNewest}. The laptop pairing will be removed.',
    exportFirst: 'Export what is on this phone first',
    replace: 'Replace',
    importRest: 'Import the rest',
    migrationChanges: 'Changed to fit this version of the app:',
    setAside: 'Records that could not be imported:',
    setAsideRow: '{table}, record {position}: {rule}',
    rescueNote:
      'This rescue copy may need a later version of the app to open completely. Keep the file.',
    saveWhatWasHere: 'Save what was on this phone',
  },
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
      'The backup has a record this app cannot accept ({detail}). Nothing was imported.',
    inconsistent: 'The records in the backup do not fit together ({detail}). Nothing was imported.',
    'write-failed': 'The backup could not be written to this phone. Nothing was changed.',
  },
  /** The rescue copy (section 9.5; D23). It does not count as a backup. */
  rescue: {
    saveRescueCopy: 'Save a rescue copy',
    note: 'A rescue copy keeps your records in a file. It does not count as a backup.',
  },
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
      'Backup files you saved or shared: delete them in Files.',
      'The list on your laptop and its pairing: also unpair on your laptop.',
      'A list waiting to be sent expires within 15 minutes.',
    ],
    exportFirst: 'Export a backup first',
    confirm: 'Delete everything on this phone',
    blocked: "Close the app's other tabs, then try again.",
    stepsFailed: 'Some data could not be deleted ({steps}). Try again.',
  },
  /** The storage failure screens (section 7.4; D48), shown when the rest of the app is unusable. */
  storageFailure: {
    'newer-version': 'This phone has records from a newer version of the app. Reload to update.',
    'upgrade-failed':
      'The app could not update your records. Nothing was changed. Save a rescue copy, then reload; a later version will fix this.',
    unavailable: "This browser cannot store the app's records (private mode or storage blocked).",
    'reload-needed': 'The app was updated, reset or restored in another tab. Reload.',
    reload: 'Reload',
    saveRescueCopy: 'Save a rescue copy',
    /** Static safety block: the not-a-medical-device line and the help numbers (HS-13 as extended by C17). */
    notMedicalDevice: general.about,
    helpLine: `Emergency ${helpNumbers.emergency.number}. Healthline ${helpNumbers.healthline.number}. Alcohol Drug Helpline ${helpNumbers.alcoholDrugHelpline.number}, or text ${helpNumbers.alcoholDrugHelpline.text}. Need to Talk ${helpNumbers.needToTalk.number}.`,
  },
  /** A write refused for lack of space (section 7.6). */
  storageFull: 'Phone storage is full. Nothing was saved. Free some space or export a backup.',
  /** The update-notice card (section 9.2; D13). */
  updateNotice: 'This update changed some of your settings to fit new limits.',
  updateNoticeLink: 'See what changed',
  /** The reason of a migration audit row (MigrationChange.reason). */
  migrationChange: '{field} was changed to fit the limits of app version {version}.',
  /** Next to entries whose recorded time zone this browser does not know (section 3.4; D6). */
  zoneFallback: 'Times shown in your home time zone',
} as const;

/** All sections, for scanning and review. */
export const healthCopy = { helpNumbers, general, alcohol, privacy } as const;
