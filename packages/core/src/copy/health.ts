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
import type { AttributionMap } from '../foods/types';
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
  /** The card's 111 row, naming the card's own reasons rather than the notice's (full review F37). */
  // C58: wording awaits owner confirmation at the week-1 review
  helpCardEmergencyDetail: 'Very unwell, shaking badly, confused or having a seizure',
  helpCardNotNow: 'Not now',
  /** The card returns 720 hours after "Not now" while readiness answer 7 still gates (storage spec 4.12). */
  helpCardReturns: 'This card shows again after 30 days.',
  noRiskFreeLevel: 'No alcohol use is risk-free.',
  /**
   * Item 16 (item 28's names): the guidance line on Today's Drinks card, by guidanceFor(...).set
   * (C25, C46). The figures appear only inside these lines, and each ends with noRiskFreeLevel
   * (C66, NN-09). The men's line is the UX_SCREENS section 2 card 7 quote. Item 28 adds the rest.
   */
  guidance: {
    line: {
      'nz-women':
        'NZ guidance for women: no more than 2 standard drinks a day and 10 a week, with at least 2 alcohol-free days. No alcohol use is risk-free.',
      'nz-men':
        'NZ guidance for men: no more than 3 standard drinks a day and 15 a week, with at least 2 alcohol-free days. No alcohol use is risk-free.',
    },
    /**
     * Readiness answer 2 "yes" or unanswered (guidanceShown; full review F30): no figures. For
     * someone who drinks most days it carries the caution of the first-run notice and the help card:
     * a change is talked through first, never a sudden stop (HEALTH_SAFETY section 5; re-check
     * V19). To be checked against the official page at item 42, and confirmed by the owner at STOP
     * 17 with the C58 help-card wording (cross-item ruling 8).
     */
    // F30: wording awaits owner confirmation at the week-1 review
    pregnancy:
      'NZ guidance: if you are pregnant, could be pregnant or are breastfeeding, the safest choice is no alcohol. Your midwife or GP can talk it through. If you drink most days, talk to them before making a change, because stopping suddenly can be risky. No alcohol use is risk-free.',
    // Item 28: the NZ guidance card on the Drinks screen (HEALTH_SAFETY section 5; C25, C60, C66,
    // C78; A13, A26). The figures stay inside `line`; nothing here is compared or drawn.
    cardLabel: 'NZ guidance',
    /**
     * A26, the interim wording (HEALTH_SAFETY section 5): the single-occasion figure is from
     * secondary sources until the owner confirms an official one, so both sets show the lower
     * figure with that note. Context only: never a trigger or a per-occasion total (C78).
     */
    singleOccasion: {
      'nz-women': 'No more than 4 standard drinks on a single occasion (from secondary sources).',
      'nz-men': 'No more than 4 standard drinks on a single occasion (from secondary sources).',
    },
    /**
     * Where the single-occasion figure comes from, said plainly under it, apart from the sources
     * line (which covers only the daily and weekly figures). DOC_REVIEW C78 gives per-sex figures
     * (4 for women, 5 for men), not yet checked on an official page; the owner decides at the
     * week-1 review whether to verify and use them or keep this interim line.
     */
    // C78: wording awaits owner confirmation at the week-1 review
    singleOccasionSource:
      'Some NZ summaries of the guidance give this single-occasion figure. It has not yet been checked against an official page.',
    notPersonal:
      'This is general guidance for adults in New Zealand, not advice for you. Your GP can tell you what applies to you.',
    basis: {
      profile: {
        'nz-women': "The app uses the women's figures, from your profile.",
        'nz-men': "The app uses the men's figures, from your profile.",
      },
      noSex: "The app uses the women's figures, the lower set, until your profile says otherwise.",
      chosen: "The app uses the women's figures, the lower set, as chosen in Settings.",
    },
    howWorkedOut:
      'One NZ standard drink is 10 g of alcohol. Standard drinks are worked out from the size and strength: millilitres × alcohol % × 0.789 ÷ 1,000. When you enter the figure printed on a label, that figure is shown instead.',
    /** Names what it covers, so it never reads as covering the single-occasion figure (C60, C78). */
    sources:
      'Sources for the daily and weekly figures and the alcohol-free days: alcohol.org.nz, bpacnz and Health NZ.',
  },
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
    /** The helpline row's title; its detail line carries "free, 24/7, confidential". */
    helplineTitle: 'Alcohol Drug Helpline',
    helplineDetail: `${helpNumbers.alcoholDrugHelpline.number} · free, 24/7, confidential`,
    emergencyTitle: `Emergency: call ${helpNumbers.emergency.number}`,
    emergencyDetail: 'Seizures, confusion or hallucinations',
  },
  /**
   * Item 21: alcohol energy on the Nutrition today card and the Diet and targets screen, as its own
   * part of the day's total (C11). Never shown while alcohol logging is unavailable (under 18), and
   * an unknown drink is never shown as 0 (NN-01, C92).
   */
  dayEnergy: {
    segment: 'Alcohol {kj} kJ',
    segmentUnknown: 'Alcohol: energy unknown',
    unknownOne: 'Energy is unknown for 1 drink, so the day total is incomplete.',
    unknownMany: 'Energy is unknown for {count} drinks, so the day total is incomplete.',
    foodOnly:
      "Today's energy total includes alcohol as its own part. The floor and the meal checks count food only.",
  },

  // ---- Item 28: the Drinks screen, the Today Drinks card and the Settings Drinks card ----

  /** The one write-failure line for every alcohol form (A48). */
  notSaved: 'That was not saved. Try again.',

  /** The help card, beside item 13's helpCardLabel, helpCardNotNow and helpCardReturns (A10, C44). */
  // C58: wording awaits owner confirmation at the week-1 review
  helpCardReturnsNextDay:
    'If this still applies, the card shows again when the next drinking day starts.',
  // C58: wording awaits owner confirmation at the week-1 review
  helpCardWhyTitle: 'Why this card?',
  // C58: wording awaits owner confirmation at the week-1 review
  helpCardWhy:
    'The app shows this card when the drinking question is answered yes or not yet answered, when drinks are logged on 7 or more days one after another, when 7 days one after another come to double the weekly guidance figure, or when the shaky or sick box is ticked. It stays for a while after the drinking that brought it up, because those days matter most. It is not a judgement.',

  /** The Drinks screen as a whole (UX 5; A1). */
  screen: {
    cardLabel: 'Drinks',
    jumpTo: 'Go to',
    jumpLog: 'Log',
    jumpTrends: 'Trends',
    jumpGuidance: 'Guidance and help',
    opening: 'Your records are still opening.',
    readFailed: 'Your drinks records could not be read just now. The help below is always here.',
  },

  /**
   * When logging is not open (HS-20, C53; RD-01, RD-06; A23). Under 18 the reason is item 13's
   * gate notice for alcohol logging, which already says whether the question was answered.
   */
  access: {
    noticeFirst: 'Drinks can be logged once the alcohol safety notice has been read.',
    /** Only when there are stored alcohol records to keep. */
    kept: 'Your earlier entries are kept.',
  },

  /** Log a drink (UX 5a; AL-01, AL-02, NN-01; A21, A43). */
  log: {
    cardLabel: 'Log a drink',
    /** Only while there is a preset to tap. Names the More button by its name and by what it shows. */
    intro:
      'Tap a drink to add one now. To add several or an earlier time, hold it or tap its More button (⋯).',
    noPresets: 'No drink presets yet. Add one under Edit drink presets, or use Other drink.',
    /** Every preset is hidden (A19: presets are hidden, never deleted). */
    allPresetsHidden:
      'Your drink presets are hidden. Show them again under Edit drink presets, or use Other drink.',
    /** "Zero-sugar premix 330 mL, 5%, 94 kcal, 1.3 std" (UX 5a, word for word for the default). */
    presetSummary: '{name} {volume} mL, {abv}%, {energy}, {std} std',
    kcal: '{kcal} kcal',
    kcalUnknown: 'kcal unknown',
    /** A39: under a preset or an entry whose label figure differs from the calculation. */
    labelDiffers: 'Label figure used. The calculation gives {calculated} std.',
    /** A40: under a preset or an entry whose label energy is implausibly low. */
    kcalLooksLow:
      'The label energy looks lower than the alcohol alone would give, so it is not counted.',
    moreFor: 'More options for {name}',
    countLabel: 'How many',
    whenLabel: 'When',
    now: 'Now',
    earlier: 'Earlier',
    dateLabel: 'Date',
    timeLabel: 'Time',
    add: 'Add',
    cancel: 'Cancel',
    /** {std} is the entry's own total, 2 dp (A43). */
    added: 'Added {count} × {name} ({std} std) at {time}.',
    addedOn: 'Added {count} × {name} ({std} std) on {date} at {time}.',
    undo: 'Undo',
    undone: 'The entry was removed.',
    otherDrink: 'Other drink',
    otherIntro: 'Pick the closest serve, then check the size and strength on the label.',
    serveButton: '{name}, {volume} mL, {abv}%',
    somethingElse: 'Something else',
    volumeLabel: 'Size (mL)',
    abvLabel: 'Alcohol (%)',
    otherEnergyNote:
      'Energy is shown only from a label. Save this drink as a preset to add the label figures.',
    saveAsPreset: 'Also save as a drink preset',
    presetNameLabel: 'Preset name',
    editPresets: 'Edit drink presets',
    loggedToday: 'Logged today',
    nothingToday: 'Nothing logged today.',
    /** C94, A43: under the entries when their rounded figures do not add up to the day's total. */
    roundingNote:
      "The day's total is worked out before rounding, so it can differ a little from these entries added up.",
    /** {std} and {energy} are the entry's own totals (A43). */
    entry: '{time}: {count} × {name}, {std} std, {energy}',
    edit: 'Edit',
    save: 'Save',
    delete: 'Delete',
    deleteConfirm: 'Delete this entry?',
    errors: {
      count: 'Enter a whole number from 1 to 100.',
      volume: 'Enter a size from 1 to 3,000 mL.',
      abv: 'Enter an alcohol percentage from 0 to 100.',
      number: 'Enter a plain number such as 5 or 4.5.',
      time: 'Choose a date and a time.',
      future: 'That time has not come yet.',
      off: 'Drinks logging is off.',
    },
  },

  /** Drink presets (UX 5a "Edit presets"; AL-02, C31, C92, D42; A17–A19, A42). */
  presets: {
    cardLabel: 'Drink presets',
    done: 'Done',
    add: 'Add a drink preset',
    nameLabel: 'Name',
    volumeLabel: 'Size (mL)',
    abvLabel: 'Alcohol (%)',
    labelTitle: 'From the label (optional)',
    labelIntro: 'Label figures count only for the size and strength they were read for.',
    energyLabel: 'Energy per serve',
    energyUnit: 'Energy unit',
    kcal: 'kcal',
    kj: 'kJ',
    stdLabel: 'Standard drinks printed on the label',
    labelWasFor:
      'The label figures were for {volume} mL at {abv}%, so they no longer count. Enter the figures for this size and strength.',
    /** D42: shown while the seeded preset's label is still origin 'preset-default'. */
    presetDefault: "These figures came with the app. Check them against your can's label.",
    matchesLabel: "They match my can's label",
    confirmed: 'Marked as matching your label. Save to keep it.',
    stdDisagrees:
      'The label figure is different from the calculation ({calculated} std). Check what you typed.',
    kcalImplausible:
      'That energy figure looks lower than the alcohol alone would give. Check the label.',
    saveAnyway: 'Save anyway',
    save: 'Save preset',
    cancel: 'Cancel',
    edit: 'Edit',
    hide: 'Hide',
    hideFor: 'Hide {name}',
    editFor: 'Edit {name}',
    showHidden: 'Show hidden presets',
    hiddenTitle: 'Hidden presets',
    unhide: 'Show again',
    hiddenNote: 'Drinks you have already logged keep their details.',
    saved: 'Preset saved.',
    errors: {
      name: 'Enter a name of 60 characters or fewer.',
      energyKcal: 'Enter an energy figure from 0 to 5,000 kcal.',
      energyKj: 'Enter an energy figure from 0 to 20,920 kJ.',
      std: 'Enter a standard-drinks figure from 0 to 100.',
    },
  },

  /** Today and this week, on the Drinks screen and the Today card (UX 2 card 7; C21, C94, C105, C11). */
  summary: {
    cardLabel: 'Today and this week',
    today: 'Today',
    week: 'This week (from Monday)',
    noneLogged: 'None logged',
    oneDrink: '1 drink',
    drinks: '{count} drinks',
    totals: '{drinks} · {std} std',
    /** Read by screen readers in place of `totals`. */
    totalsSpoken: '{drinks}, {std} standard drinks',
    kcal: '{kcal} kcal',
    kcalKj: '{kcal} kcal ({kj} kJ)',
    atLeast: 'at least {energy}',
    unknownPart: '{energy}; {drinks} with kcal unknown',
    allUnknown: 'kcal unknown',
    freeOne: '1 alcohol-free day',
    freeMany: '{count} alcohol-free days',
    detail: '{energy} · {free}',
    /** C21 point 4: the footnote that goes with every alcohol-free count. */
    freeNote: 'Days with nothing logged count as alcohol-free.',
    breakdown: '{count} × {name} {volume} mL',
    breakdownMore: 'and {count} more',
    /** A13: neutral, no figure (the guidance line beside it carries the figures). */
    dayAbove: "Today's total is more than the daily NZ guidance figure.",
    weekAbove: "This week's total is more than the weekly NZ guidance figure.",
    drinkingDay:
      'A drinking day runs from {time} to {time} the next day. You can change this in Settings.',
  },

  /** Trends (UX 5b; HS-19; A13–A15). */
  trends: {
    cardLabel: 'Trends',
    dailyTitle: 'Last 28 days',
    weeklyTitle: 'Weekly totals',
    metric: 'Show',
    metricStd: 'Standard drinks',
    metricDrinks: 'Drinks',
    metricKcal: 'kcal',
    dailyChart: '{metric} per day for the last 28 days.',
    weeklyChart: 'Standard drinks per week for the last 8 weeks.',
    todayTick: 'Today',
    thisWeekTick: 'This week',
    showList: 'Show as a list',
    hideList: 'Hide the list',
    dayRow: '{date}: {value}',
    dayToday: '{date} (so far): {value}',
    /** The list value for the standard-drinks metric. */
    valueStd: '{std} standard drinks',
    notTracked: 'not tracked',
    noneLogged: 'none logged',
    weekRow: 'Week from {date}: {value}',
    weekRowCurrent: 'This week so far: {value}',
    weekValue: '{drinks} · {std} standard drinks · {energy}',
    weekFree: '{value} · {free}',
    rollingLine: '4-week average',
    rollingNote: 'The 4-week average starts once there are 4 full weeks of records.',
    outlinedToday: 'The outlined bar is today so far.',
    kcalNote:
      'kcal bars count only drinks with a label figure. An outlined bar is not complete: today so far, or some drinks with kcal unknown. A day with no bar has no known kcal.',
    /** HS section 5 and HS-19: the only label a milestone ever has on a chart. */
    milestoneLine: 'your milestone',
    empty: 'Nothing logged yet.',
  },

  /** Your milestones (HEALTH_SAFETY section 5: entered by you or your clinician; A15, A16, A47). */
  milestones: {
    cardLabel: 'Your milestones',
    intro:
      'A milestone is a weekly figure that you, or your GP or another health professional, chose. The app never suggests one. It shows on the weekly chart as a dotted line labelled "your milestone".',
    none: 'No milestones entered.',
    add: 'Add a milestone',
    /** The fixed heading of every row: the owner's words are never the milestone's name on screen. */
    rowTitle: 'Your milestone',
    ownWords: 'Your words: "{label}"',
    weeklyLabel: 'Standard drinks a week',
    fromLabel: 'From',
    nameLabel: 'Your own words for it (optional)',
    nameDefault: 'Your milestone',
    whoLabel: 'Who chose this figure?',
    whoSelf: 'Me',
    whoClinician: 'My GP or another health professional',
    noteLabel: 'Note (optional)',
    save: 'Save milestone',
    cancel: 'Cancel',
    saved: 'Milestone saved.',
    row: '{weekly} standard drinks a week, from {date}.',
    bySelf: 'Chosen by you.',
    byClinician: 'Chosen by your GP or another health professional.',
    edit: 'Edit',
    delete: 'Delete',
    deleteConfirm: 'Delete this milestone?',
    errors: {
      weekly: 'Enter a figure from 0 to 200.',
      from: 'Choose a start date.',
      who: 'Say who chose this figure.',
      name: 'Use 80 characters or fewer.',
      note: 'Use 280 characters or fewer.',
    },
  },

  /** How you felt: the next-day note (HEALTH_SAFETY section 5; UX 5c; C05; AL-08). */
  dayNote: {
    cardLabel: 'How you felt',
    intro: 'A note about how you felt, for example on the day after drinking.',
    dayLabel: 'Day',
    noteLabel: 'Note (optional)',
    /** HEALTH_SAFETY section 5, word for word (canonical per C101). */
    withdrawalTick: "I felt shaky, sweaty, anxious or sick when I hadn't had a drink",
    save: 'Save note',
    remove: 'Remove note',
    saved: 'Note saved.',
    removed: 'Note removed.',
    recentTitle: 'Notes from the last 30 days',
    ticked: 'Shaky or sick: ticked',
    open: 'Open the note for {date}',
    /** Another day picked while the form holds unsaved changes and that day already has a note. */
    replaceAsk:
      '{date} already has a saved note. What you typed here has not been saved. Open the saved note instead?',
    replaceYes: 'Open the saved note',
    replaceNo: 'Keep what I typed',
    errors: {
      future: 'Choose today or an earlier day.',
      empty: 'Write a note or tick the box.',
      long: 'Use 1,000 characters or fewer.',
    },
  },

  /** The Help card on the Drinks screen (HS-13, AL-12): firstRunNotice and the help numbers. */
  help: {
    cardLabel: 'Help',
  },

  /** The Drinks card in Settings (UX 7; C21, C46; A25). No figures in the options. */
  settings: {
    cardLabel: 'Drinks',
    cutoverLabel: 'A new drinking day starts at',
    cutoverHint: 'Drinks before this time count toward the evening before.',
    midnight: 'midnight',
    guidanceLabel: 'Guidance figures',
    guidanceMen: "Men's figures",
    guidanceWomen: "Women's figures (the lower set)",
    saved: 'Saved.',
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
     * A restore never lowers the Kickstart history (D27; full review F1, F12): this phone's
     * periods, checks and pre-start answers that the file lacks are kept with the file's, and this
     * says so before Replace.
     */
    kickstartKept:
      "Kickstart history: this phone's Kickstart days, extensions and stop-sign answers are kept with the file's, because a restore never removes them.",
    /** While the phone's Kickstart runs, the settings it runs on are kept from the phone (F13). */
    kickstartSettingsKept:
      'The Kickstart running on this phone keeps going: its diet mode, keto start and Kickstart eating pattern are kept from this phone.',
    /** The restored answers, profile or weigh-ins switch Kickstart off (the phase engine's own rule). */
    kickstartEnds:
      "The Kickstart running on this phone will end after the restore, because the file's readiness answers, profile or weigh-ins switch it off.",
    /** The file holds a fast that was running when it was made (F3). */
    fastRunning:
      'A fast was running when this backup was made (started {start}). It comes back as still running, counted from that start.',
    endFastAtBackup: 'End that fast at {time}, when the backup was made',
    endFastHint: 'Turn this on if you have eaten since. You can correct its end time in History.',
    /**
     * The records changed between the confirmation and Replace (another tab saved something), so
     * nothing was replaced and the confirmation is shown again with fresh counts (F12).
     */
    changedSinceConfirm:
      'The records on this phone changed while this was open, perhaps in another tab, so nothing was replaced. Check what the restore will do again.',
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
    /**
     * Once, on Readiness answers after a restore made during setup (F28): the records are back,
     * and the restored answers are checked before Today.
     */
    restored:
      'Your records from the backup are back on this phone. Check that these answers still apply, then go to Today.',
    restoredContinue: 'These still apply',
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
  /** A file whose Kickstart history cannot be combined with this phone's (restorePlan.ts; F1, V1, V2). */
  kickstartMerge:
    "This backup's Kickstart history cannot be combined with the Kickstart records on this phone: they overlap, together they pass the six-week limit, a Kickstart would start within two weeks of a stop-sign answer, or they differ on when a Kickstart started or how long it ran. A restore never removes Kickstart days, extensions or stop-sign answers from this phone, so nothing was imported. Keep the file.",
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
      // No web page can take back a site permission (full review F10).
      "If you let Chrome use the camera for this app, remove that in Chrome's Site settings, Camera.",
      'Backup files you made or shared: delete them in Files, and in your email or cloud storage if you sent them there.',
      'The list on your laptop and its pairing: also unpair on your laptop.',
      'Copies of your records restored in another browser, such as on a laptop: delete all there too.',
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
    card_state: 'Hidden reminders',
    audit: 'Notes on automatic changes',
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

// ---- Laptop pairing and sending the grocery list (checklist items 30 and 31) ----

/**
 * Pairing with the laptop and, from item 31, sending the grocery list (item 30 design 3.1;
 * UX_SCREENS 6c and 7; DECISIONS Q1 and the item-30 row; DOC_REVIEW C12, C83, C115;
 * HEALTH_SAFETY section 7). Privacy wording: it says plainly what happens and makes no blanket
 * promises (TRANSFER_SECTION_RULES in transferRules.ts). Item 31 adds its sending and status keys
 * to this object; item 33 adds the side panel's.
 */
export const transfer = {
  pairing: {
    settingsCardLabel: 'Laptop',
    settingsRowTitle: 'Laptop pairing',
    settingsRowNotPaired: 'Not paired',
    settingsRowPaired: 'Paired {date}',
    settingsRowChecking: 'Checking…',
    unpairedCardLabel: 'Pair with your laptop',
    intro:
      'Pairing lets this phone send the grocery list to the side panel on your laptop. The list is locked on this phone with a key your laptop makes and gives to this phone through the code you scan.',
    steps: [
      'On the laptop, open the side panel and choose Pair or Pair again. It shows a pairing code: a square barcode.',
      "On this phone, tap Scan the laptop's code, and allow the camera when Chrome asks.",
      "Hold the phone about a hand's length from the laptop screen until this screen says the pairing code is saved.",
    ],
    /** Until item 33 builds the side panel; item 33 removes it. */
    laptopLaterStep:
      'The laptop side panel arrives at a later step of the build checklist. Until then there is no code to scan.',
    /** DECISIONS Q1, widened by the item-30 row: the accepted risk, said where the owner pairs. */
    codeRisk:
      'Show the code on the laptop only while you pair. Anyone who photographs it could read the lists you send, and could change the list the laptop shows, until you pair again.',
    /** Q1 and C83: the key travels only from the laptop screen to this screen. */
    scanOnlyHere:
      'Scan the code only from this screen. Do not scan it with the camera app or copy it: that would put the key where other apps can read it.',
    /** Quoted word for word in HEALTH_SAFETY section 7 (docFidelity.test.ts). */
    cameraNote:
      "The camera is used only while the pairing screen scans the laptop's code. The app keeps no picture and sends nothing.",
    scan: "Scan the laptop's code",
    optional:
      'Pairing is optional. Without it, the list is sent nowhere unless you copy or export it.',
    cameraCardLabel: 'Camera',
    starting: 'Starting the camera…',
    looking: 'Point the camera at the code on the laptop screen and hold the phone still.',
    notAPairingCode:
      "That code is not a pairing code. Point the camera at the code in the laptop's side panel.",
    saving: 'Saving the pairing code…',
    cancel: 'Cancel',
    pairedCardLabel: 'Pairing',
    /** Says only what the phone can know (as the backup wording does, D21). */
    paired: 'This phone has the pairing code from your laptop.',
    pairedOn: 'Paired {date}',
    check: 'Pairing check: {check}',
    checkHint:
      "The laptop's side panel shows the same four letters. If it shows different ones, tap Unpair, then pair again on both.",
    /** Only when pairingRelayStatus is 'pair-again' (never while RELAY_ORIGIN is null). */
    relayPairAgain:
      'This pairing was made for a different relay, or for none, so the list can reach the laptop only as a paste code. To use the relay, update the side panel on the laptop, then pair again on both.',
    /** Until item 31 builds sending; item 31 removes it. */
    laterStep: 'Sending the list from the List tab arrives at a later step of the build checklist.',
    photographed:
      'If you think someone photographed the pairing code, unpair here and on the laptop, then pair again.',
    pairAgain: 'Pair again',
    pairAgainTitle: 'Pair again?',
    pairAgainBody:
      'Pairing again replaces the pairing on this phone. On the laptop, choose Pair again in the side panel, so it shows a new code.',
    pairAgainConfirm: 'Scan the new code',
    unpair: 'Unpair',
    unpairTitle: 'Unpair this phone?',
    unpairBody:
      'This phone forgets the pairing and cannot send the list to the laptop until you pair again.',
    unpairing: 'Removing the pairing…',
    pairedNow:
      'Pairing code saved. Check that the side panel on the laptop shows the same pairing check.',
    unpairedNow: 'This phone is no longer paired.',
    stoppedTimeout: 'Scanning stopped after 2 minutes, to save the battery.',
    stoppedHidden: 'Scanning stopped while the app was in the background.',
    scanAgain: 'Scan again',
    tryAgain: 'Try again',
    errors: {
      /** {site} is location.host, the name Chrome lists under Site settings. */
      'camera-denied':
        "The app is not allowed to use the camera. To allow it, open the Chrome app, tap ⋮ at the top right, then Settings, Site settings, Camera. Choose {site} and set it to Allow. If Chrome itself has no camera permission, open the phone's Settings, then Apps, Chrome, Permissions, Camera, and allow it. Then come back here and tap Scan again.",
      'camera-unavailable':
        'The camera could not be started, or it stopped. Close other apps that use the camera, then tap Scan again.',
      'no-reader':
        'The code reader could not start. Connect to the internet, tap Reload, then scan again.',
      'newer-version':
        'This pairing code comes from a newer version of the side panel than this app can read. Connect to the internet, tap Reload, then scan again. If this message comes back, close the app in every Chrome tab and in Recent apps, then open it again.',
      damaged:
        'This pairing code could not be read. On the laptop, choose Pair again to show a new code, then scan it.',
      'save-failed': 'The pairing code could not be saved. Nothing was changed. Try again.',
      'storage-full': privacy.storageFull,
      'unpair-failed': 'The pairing could not be removed. Try again.',
    },
  },
  /** Both devices' unpair confirmations (C115; item 29 design 3.2 proposed this key). */
  unpairOther: 'Also unpair on your other device.',
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
      'If you used this app before and kept a backup file, you can put those records back now. The file replaces everything entered during setup, including your answers to the questions. If the file is from a finished setup, the app then opens on its answers, so you can check they still apply; otherwise setup carries on from where the file left off.',
    saveFailed: 'That could not be saved. Try again.',
    fixBelow: 'Some details below need a look.',
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
  /**
   * What a yes (or no answer) switches off. Where something else keeps more off (another answer, a
   * question not answered yet, the birth year or the weight), `ifYesAlsoOff` holds the line used
   * instead, so no line says a feature is on or can be chosen while the gates keep it off
   * (readinessText.ts consequenceText).
   */
  ifYes: {
    q1: 'Fasting, keto carb targets, Kickstart, any energy deficit, weight goals, the energy estimate and alcohol logging are switched off. The app works as a food and exercise planner only.',
    q2: 'Fasting, the keto carb ceiling, Kickstart, any energy deficit and weight goals are switched off. Meals are still planned. Please talk to your midwife or GP about what to eat.',
    q3: 'Low-carb eating and fasting can change how diabetes medicines act, and can cause low blood sugar (hypoglycaemia). Check with your prescriber first. Fasting, Kickstart and carb ceilings under 50 g stay off until you confirm your prescriber has agreed. Meals are still planned low-carb, with a carb ceiling of at least 50 g and a smaller energy deficit, so talk to your prescriber before you start using the meal plans.',
    q4: 'This answer does not switch anything off. Check the timing of your medicines with your pharmacist or GP before you change when you eat. If you take blood-pressure medication, check with your pharmacist or GP before adding salt or using salt substitutes.',
    q5: 'Fasting, weight goals, Kickstart, any energy deficit and the keto carb ceiling are switched off. Your weight trend is still shown, without targets.',
    q6: 'Exercise plans stay hidden until you confirm you have discussed exercise with a GP.',
    q7: 'A card with help contacts is shown on Today from the first day. You can put it away for 30 days at a time.',
  },
  /** Answer 3 in Balanced mode, which has no carb ceiling to plan low-carb meals with (F34). */
  ifYesBalanced: {
    q3: 'Low-carb eating and fasting can change how diabetes medicines act, and can cause low blood sugar (hypoglycaemia). Check with your prescriber first. Fasting, Kickstart and carb ceilings under 50 g stay off until you confirm your prescriber has agreed. Meals are still planned with a smaller energy deficit, so talk to your prescriber before you start using the meal plans.',
  },
  ifYesAlsoOff: {
    /** Answer 1 while exercise plans are off too (answer 6, or not answered yet). */
    q1: 'Fasting, keto carb targets, Kickstart, any energy deficit, weight goals, the energy estimate and alcohol logging are switched off. The app works as a food planner only.',
    /** Answer 3 while something else keeps the energy deficit (and so these) off too. */
    q3: 'Low-carb eating and fasting can change how diabetes medicines act, and can cause low blood sugar (hypoglycaemia). Check with your prescriber first. Fasting, Kickstart and carb ceilings under 50 g stay off until you confirm your prescriber has agreed, and for as long as anything else you tell the app keeps them off. Talk to your prescriber before you start using the meal plans.',
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
      'You have confirmed your prescriber agreed, so fasting, Kickstart and carb ceilings under 50 g can be chosen. If your medication or dose changes, tap "My medication or dose has changed": they then stay off until you confirm again.',
    gpExerciseDiscussed:
      'You have confirmed you discussed exercise with a GP, so exercise plans can be shown. If your symptoms change, tap "My symptoms have changed".',
  },
  /** The prescriber's agreement is recorded, but something else keeps the features off. */
  confirmedAlsoOff: {
    prescriberAgreed:
      'You have confirmed your prescriber agreed. Fasting, Kickstart and carb ceilings under 50 g stay off for as long as anything else you tell the app keeps them off. If your medication or dose changes, tap "My medication or dose has changed".',
  },
  changed: {
    q3: 'My medication or dose has changed',
    q6: 'My symptoms have changed',
  },
  changedDone: {
    q3: "Saved. The app now needs your prescriber's agreement again before fasting, Kickstart or carb ceilings under 50 g can be chosen.",
    q6: 'Saved. Exercise plans are off until you confirm you have discussed exercise with a GP again.',
  },
  summaryTitle: 'What your answers change',
  summaryNone: 'Your answers did not switch anything off.',
  summarySome: 'Your GP knows more about your health than this app does.',
  changeLater: 'You can change these answers any time in Settings, under Readiness answers.',
  unanswered: 'Not answered yet. Until you answer, the app treats this as Yes.',
  /** A feature hidden with its reason (RD-01 to RD-05). */
  featureOff: '{feature} is off because of what you told the app about {reasons}.',
  /** In GATED_FEATURES order (readiness/gates.ts). Singular, for "{feature} is off". */
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
    exercisePlans: 'Exercise planning',
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
    /** Settings, Readiness answers: the birth year is not changed there. */
    whereToChange: 'If the birth year is wrong, correct it in Settings, Profile.',
    profileLink: 'Open Profile',
  },
  /** A current weight below BMI 18.5 for the height counts as a yes to question 5 (HS-35). The BMI figure is never shown. */
  weightCheck: {
    lowWeight:
      'The weight you entered is low for your height. The app keeps to the same settings as a Yes to question 5: no fasting, no Kickstart, no energy deficit, no keto carb ceiling and no weight goals. If the weight or height is a typing slip, correct it above.',
    /** Settings, Profile, which has no weight field: the stored current weight. */
    lowWeightStored:
      'Your current weight is low for this height. The app keeps to the same settings as a Yes to question 5: no fasting, no Kickstart, no energy deficit, no keto carb ceiling and no weight goals. If the height is a typing slip, correct it above.',
    changeAnswer: 'Change answer 5',
    summaryLine:
      'Your latest weight is low for your height, so the app keeps to the same settings as a Yes to question 5.',
    /** Settings, Readiness answers: neither the weight nor the height is changed there. */
    whereToChange:
      'If a weigh-in or your height is wrong, correct it on the Weight screen or in Settings, Profile.',
    weightLink: 'Open Weight',
  },
  settingsRow: { title: 'Readiness answers', detail: 'What the app switches on and off' },
  settingsAnswersLabel: 'Your answers',
  settingsIntro:
    'These answers decide which parts of the app are switched on. A change applies at once. Your logs and weigh-ins are kept. Changing answer 3 or 6 asks for its confirmation again, and a Yes to answer 3 turns your Kickstart choice off. A change that switches Kickstart off ends a running Kickstart, and changing it back does not start it again; for a Yes or No, the app asks you first.',
  /** A readiness answer or a profile save that would end a running Kickstart asks first (F23, F32). */
  endsKickstart: {
    title: 'This ends Kickstart',
    answer:
      'This answer also ends your Kickstart today. Changing the answer back will not restart it.',
    profile:
      'With this birth year or height, your Kickstart ends today. Changing it back will not restart it. If it is a typing slip, correct it before you save.',
    confirm: 'Save and end Kickstart',
    cancel: 'Cancel',
  },
  // Item 15 (design 5.2): a question nobody answered is never stated as a fact (C41).
  featureOffUnansweredOne: '{feature} stays off until you answer the question about {reasons}.',
  featureOffUnansweredMany: '{feature} stays off until you answer the questions about {reasons}.',
  answerQuestionsLink: 'Answer the questions',
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
    'Your long-term goal is below a BMI of 18.5 for this height, so the app does not use it at this height. The goal itself is kept.',
  settingsRow: {
    title: 'Profile',
    detail: 'Height, sex, birth year, activity, household and food',
  },
  errors: {
    required: 'Fill this in.',
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
  /** The same line while a Kickstart runs, with the Phase card's due date (F39). */
  kickstartRunsUntil:
    'Kickstart is due to finish on {date}. After that, the app uses 22:2 (5 pm snack + dinner) instead.',
  /** UX 1e, word for word with 140 filled (docFidelity.test.ts); {proteinG} follows the protein range (C65). */
  kickstartLine:
    "One meal has to carry about {proteinG} g protein. If a day's dinner can't, the app will offer the 5 pm snack. That's not a broken fast.",
  /** With Kickstart chosen, any pattern other than the untouched 23:1 default (E19). */
  ownPattern: 'You chose your own pattern. The app keeps it every day, during Kickstart and after.',
  /** Settings: a Kickstart default stored before answer 4 turned yes is not used (C07). */
  kickstartDefaultSetAside:
    'The app had chosen 23:1 for Kickstart before your answer to question 4. It uses 22:2 (5 pm snack + dinner) instead, until you choose a pattern and save it.',
  presetsLegend: 'Choose a pattern',
  /** HEALTH_SAFETY.md section 3 preset names. */
  presetNames: { '22:2': '5 pm snack + dinner', '23:1': 'One meal' },
  /** {range} from formatClockRange, the one range style (item 15): "Eat 11:00 am – 7:00 pm". */
  presetDetail: 'Eat {range}',
  presetDetailNamed: '{name} · Eat {range}',
  kickstartChip: 'Kickstart',
  custom: 'Custom times',
  none: 'No fasting plan for now',
  noneDetail: 'Meals at ordinary times. You can choose a pattern later in Settings.',
  /** The same choice inside Settings, where "later in Settings" is not true (full review F29). */
  noneDetailInSettings: 'Meals at ordinary times.',
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

/**
 * The garden step (UX 1f; C57). Fixed copy never claims a homegrown weight. Item 19's garden
 * screen reuses these keys for the same ideas (one "Ready to use" in both places), and the step's
 * rows show item 19's core row text (gardenRowView), so amounts read the same in both places.
 */
export const garden = {
  title: 'Your garden',
  // Item 19 review: meal plans and the shopping list are not built yet, so this says so.
  intro:
    'List what you grow. Meal plans and the shopping list arrive at a later step of the build checklist, and will use this list.',
  silverbeetListed: 'Silverbeet is listed already.',
  empty: 'No crops listed yet.',
  available: 'Available, amount not entered',
  // Item 19: "Ready to use", since the switch also covers produce already picked (G25).
  ready: 'Ready to use',
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
  readyLabel: 'Ready to use',
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
    /** Under the figures while the weekly change is empty (full review F29; minimumDaysFor(7)). */
    needsWeekly:
      'The weekly change needs weigh-ins on at least 3 days in each of the last two weeks.',
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
      'The shaded range is a rough typical range, not a promise and not a target. In Steady it follows about 0.5–1 kg a week, and never faster than the pace set for the Weight check-in card in Settings.',
    // Only while the chart draws the steeper first block (item 14 review: never promised otherwise).
    aboutBandKickstart:
      'In your first Kickstart it is steeper for two weeks, mostly water and glycogen, then flattens.',
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
    // After a stop-sign answer: never "a fast drop is expected" (F7, F20).
    kickstartPausedNote:
      'Kickstart is paused after the stop-sign you reported: no deficit is planned for the rest of it, and eating more is fine.',
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
      'Your recent weight is below a BMI of 18.5 for your height. Please check in with your GP, and look again at readiness question 5. Kickstart, the typical range and the long-term goal are switched off, and your weigh-ins and trend still show.',
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
    // After the gate's own reason, "Weight goal setting is off because of …" (F31).
    gatedKept: 'Your weigh-ins and trend still show.',
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
    // The one wording of the Kickstart stop-sign advice: Today, Weight and Diet and targets (F36).
    action: 'Eat, add salt and fluids, and talk to Healthline or a GP if it continues.',
    // The blood-pressure variant is readiness.bloodPressure.stopSign (item 13's key; section 1 point 6).
    emergency: `Call ${helpNumbers.emergency.number} if you faint or feel very unwell.`,
    // A stop-sign answer's pause still holds after an early end (F4).
    pausedUntil:
      'Because of the stop-sign you reported, no deficit is planned until the end of {date}, the day this Kickstart was due to finish. After that the app plans with the Steady deficit.',
    // A "yes" outside a recorded check: before a start, or in a check that could not be saved.
    pausedToday:
      'Because of the stop-sign you reported today, no deficit is planned for the rest of today.',
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
    // The stop-sign card that takes focus says the rest (item 14 review: no repeated sentence).
    stopSign: 'Thanks for telling the app. Kickstart will not be extended.',
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
    // The Kickstart deficit is set to 0%, or there is no rough guide (F35).
    offerNoDeficit:
      'You can start a Kickstart: three weeks with protein protected, net carbs at 20 g and daily electrolytes. Your Kickstart deficit is set to 0%, so no deficit is planned. The app asks how you feel first.',
    offerNoGuide:
      'You can start a Kickstart: three weeks with daily electrolytes. Its deficit, protein at the top of your range and net carbs at 20 g are not used until there is a rough guide. The app asks how you feel first.',
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
    // A Kickstart ended before its first day (the clock was ahead): its day 1 is still held.
    unavailableEndedAhead:
      "The Kickstart you ended was dated {date} by the phone's clock, so a new one can start the day after that.",
    unavailableRecentStopSign:
      'A stop-sign was reported in the last two weeks, so a new Kickstart cannot start yet.',
    // A "yes" before a start is held for the rest of that day only (W31).
    unavailableStopSignToday:
      'You answered yes to a stop-sign question today, so a Kickstart cannot start today.',
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
    // A Kickstart a readiness answer, the birth year or the weight ended (F23, F32).
    labelEnded: 'Kickstart has ended',
    endedReadiness:
      'Kickstart ended because of a change to your readiness answers, your birth year or your weight. Changing it back does not start it again.',
    deficit:
      'The app now plans with the smaller Steady deficit instead of the bigger Kickstart one.',
    // The Steady deficit is not smaller than the Kickstart one that was set (F4).
    deficitSteady: 'The app now plans with the Steady deficit.',
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
    /** While answer 4 is "yes" or unanswered, with no one-tap 23:1 (C07). */
    answer4: schedule.kickstartDefaultSetAside,
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
      /** Before Start: {names} are painFreeOnlyExercises(...) names (start.ts), so the note names its movements. */
      inSession: 'In this session: {names}.',
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
      'With pain or back or leg symptoms, rest comes first. The lighter session also leaves out any movement marked "Only if pain-free"; leave out anything that hurts.',
    heavyWork:
      'On a heavy physical work day, the lighter session is the plan, not a fallback, and it counts in full.',
    fasted:
      'Exercising while fasted is allowed; choose a lighter session and break the fast afterwards if the plan says so.',
    eatFirst: "You can also eat first. It's fine to widen the window.",
    /**
     * A Kickstart stop-sign answer in the last 336 hours (cross-item ruling 9); in place of allNo.
     * {day} is that answer's local day.
     */
    recentStopSign: `On {day} you told the app about dizziness, palpitations, cramps or feeling faint, so today it is the lighter session or rest. Talk to Healthline (${helpNumbers.healthline.number}) or your GP if it continues. Call ${helpNumbers.emergency.number} if you faint or feel very unwell.`,
    /**
     * A running fast past 24 hours (ruling 9): the HEALTH_SAFETY.md section 3 sentence, word for
     * word, then "It's fine to eat now.", in place of allNo and fasted. When item 15 lands, its
     * fasting.card.overCeiling and fineToEat hold the same words.
     */
    overCeiling:
      "Fasts over 24 hours are outside what this app supports. Break the fast if you feel unwell, and talk to a GP before fasting this long again. It's fine to eat now.",
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
    'Lighter session: the easier version of each movement, at the bottom of its range, with one set fewer where there is more than one. The warm-up and cool-down stay.',
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
    /** After a version change part-way through a session, when its ticked sets already hold this session's amount. */
    sessionDone:
      "This session's amount for this movement is done. You can still log it if you do more.",
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
    // Item 27: the switch is on Move's "Beach walks and jogging" card, under these lines.
    needsOptIn: 'It also needs your opt-in, with the switch below.',
    readyOptIn:
      'You have four tolerated walks. Jogging stays off unless you turn on the switch below.',
    paused:
      'After your last jog, effort or soreness was above 3 or not rated, or the next check showed pain or back or leg symptoms. The beach walk is shown again until one more tolerated walk.',
    tolerated:
      'A tolerated walk is a beach walk of at least {minutes} minutes, with every check before it answered no, effort and soreness rated 3 or less, and no pain or back or leg symptoms at your next check. At most one walk a day counts.',
    /** With jog.optional when jogging is unlocked: turning it on never adds a jog by itself. */
    addToPlan: 'To add a beach jog, use Change weekly plan.',
    shownAsWalk: 'Jogging is not on right now, so this day shows the beach walk.',
    toggle: {
      label: 'Beach jogging (optional)',
      hint: 'Once four tolerated walks are logged, you can add jog and walk intervals with Change weekly plan. Jogging is never required.',
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
      'jog-locked':
        'Jogging is not on right now. It needs your opt-in and four tolerated walks, and it pauses after a jog that was not tolerated.',
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
      'earlier-yes':
        'Earlier today you answered yes on the check, so no other session starts today. You can still do the lighter session from that check, or rest. Both count.',
      'already-today':
        'Today already has a session like this one. The plan has at most one strength session and one beach session a day.',
      'back-to-back':
        'Strength sessions need a day without strength between them, so this one cannot start today. To change your training days, use Change weekly plan.',
      'jog-limit':
        'Jogging is on 2 days a week at most, and not two days in a row, so this jog cannot start today.',
      'jog-on-strength-day':
        'Jog days and strength days stay apart, and today already has the other kind of session.',
      'strength-count': 'This week already has 3 strength sessions, the most the plan has.',
      'rest-days':
        'Today would be a sixth active day in 7 days in a row. At least 2 days in every 7 are rest days, and rest counts.',
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

// ---- Move screens: the week, today's sessions, the session log, history and the plan (item 27) ----

/**
 * The Move screens' own wording (UX_SCREENS.md 2 card 6 and 4a–4d; checklist item 27). Every
 * safety sentence (stop signs, beach prompts, the check, rest, progression, jogging) is item 26's
 * `move` section; this section holds labels, states and the session log. Nothing here may say a
 * day was missed or failed: rest and recovery count as success (HEALTH_SAFETY.md section 6).
 */
export const moveScreen = {
  listComma: ', ',
  listAnd: ' and ',
  seeWeek: 'See this week',
  blockedKept:
    'Your logged sessions are kept, and Move shows them again once exercise plans are back on.',
  today: {
    planned: 'Today: {names}',
    allDone: 'Done for today.',
    minutes: 'About {minutes} minutes',
    inProgress: 'In progress',
    start: 'Start {name}',
    continue: 'Continue {name}',
    finish: 'Finish {name}',
    restInstead: 'Rest instead of {name}',
    undoRest: 'Undo rest for {name}',
    changeChoice: 'Change the choice for {name}',
    unknownTemplate: 'A session no longer in the app',
  },
  week: {
    /** The strip's hidden sentence per day ({day} is the weekday's name). */
    day: {
      restDay: '{day}: rest day, counts as success',
      planned: '{day}: {names}',
      done: '{day}: {names}, done',
      rested: '{day}: rested, that counts',
      notDone: '{day}: {names}, not done. Rest counts too.',
    },
    today: '{text} (today)',
    minutesRange: '{low} to {high}',
    planRow: 'Choose your training days. Rest days stay in the plan.',
    jogAsWalkDays: 'Jogging is not on right now, so the beach walk is shown on {days}.',
    fallbackToday:
      'Your weekly plan did not fit the plan rules, so the standard week is shown. You can change it on Move.',
  },
  chooser: {
    title: "Today's sessions",
    nothing: 'Nothing more is planned for today.',
  },
  safety: {
    /** Above item 13's "My symptoms have changed" on the stop-signs card. */
    changedLine:
      'If any of these happened during activity, tell the app. Exercise plans then stay off until you confirm you have discussed exercise with a GP again.',
  },
  before: {
    /** {ml} is heatWaterMl of the session's longer length estimate (move/display.ts). */
    heatWater:
      'In the heat, carry at least {ml} mL of water, and drink about 500 mL for each hour you are active.',
  },
  session: {
    lighterChip: 'Lighter',
    restBetween: 'Rest about {amount} between sets.',
    walkBetween: 'Walk for about {amount} between jogs.',
    walkBetweenBrisk: 'Walk easily for about {amount} between brisk walks.',
    howTo: 'How to do it',
    changeVersion: 'Change version',
    versionLegend: 'Version of {name}',
    setLine: 'Set {n}: {amount}',
    doneMark: 'done',
    amountLabel: 'Set {n}',
    less: 'Less for set {n}',
    more: 'More for set {n}',
    setDone: 'Set {n} done',
    undoSet: 'Undo set {n}',
    extraSet: 'Log an extra set',
    logAnyway: 'Log a set anyway',
    walkLine: 'Walk: {amount}',
    walkAmountLabel: 'Walk time',
    walkLess: 'Less walk time',
    walkMore: 'More walk time',
    walkDone: 'Walk done',
    undoWalk: 'Undo walk',
    finish: 'Finish session',
    unknownMovement: 'This movement is no longer in the app. Its logged sets are kept.',
    refusedKept:
      'Sets already ticked today are kept, and they count. You can still finish and rate this session.',
    dayChanged:
      'This session started on {day}. Its ticked sets are kept and count, and you can still rate it.',
    maxSets: 'One movement holds at most 20 sets.',
  },
  finish: {
    scale: '{low}, {high}',
    noteLabel: 'Note (optional)',
    noteHint: 'Anything worth remembering about this session.',
    save: 'Save',
    saveChanges: 'Save changes',
    back: 'Back to the session',
    saved: 'Saved.',
    walkRatings:
      'A walk counts toward jogging only when at least {minutes} minutes are ticked and effort and soreness are rated 3 or less.',
    jogRatings:
      'Jogging stays on only when effort and soreness are rated 3 or less. A jog left unfinished counts as not rated.',
    noTicks: "No sets are ticked yet. Only ticked sets count toward next week's amounts.",
    noCheckDone:
      'This session came from a backup without a quick check, so its ratings cannot be changed here.',
  },
  history: {
    title: 'Recent sessions',
    empty: 'Sessions you log show here.',
    more: 'Show more',
    ratings: 'Effort {exertion}, soreness {soreness}, energy {energy}',
    notRated: 'not rated',
    note: 'Note: {note}',
    movement: '{name}: {amounts}',
  },
  beach: {
    title: 'Beach walks and jogging',
    toleratedButton: 'What is a tolerated walk?',
  },
  plan: {
    title: 'Your week',
    intro:
      'Choose what each day holds. A day with nothing planned is a rest day, and rest counts. Nothing is saved until you tap Save plan.',
    dayButton: '{day}: {summary}',
    restDay: 'Rest day',
    strengthLegend: 'Strength session on {day}',
    beachLegend: 'Beach session on {day}',
    none: 'None',
    jogHint:
      'Beach jogging can be added here once it is unlocked: four tolerated walks and the switch turned on, under Beach walks and jogging on Move.',
    jogKeptAsWalk:
      'Jogging is not on right now, so the beach walk is shown on {days}. Saving this plan keeps the walk there.',
    problemsTitle: 'To save this plan:',
    rollingRest:
      'Counting the sessions already done in the last few days, this plan would leave fewer than 2 rest days in some 7 days in a row. Keep a rest day sooner, or save this plan after your next rest day.',
    save: 'Save plan',
    standard: 'Use the standard week',
    back: 'Back to Move',
  },
  amount: {
    rep: '1 rep',
    reps: '{n} reps',
    seconds: '{n} seconds',
    minute: '1 minute',
    minutes: '{n} minutes',
    mixed: '{minutes} {seconds}',
    perSide: '{amount} each side',
  },
  errors: {
    readFailed: "Move's records could not be read.",
    reload: 'Reload the app',
    noCheck: 'This session has no quick check, so it could not be saved. Nothing was changed.',
    /** Item 26's sessionWriteProblem 'lighter-only': after a yes, only the easier versions. */
    lighterOnly:
      'After a yes on the quick check, this session holds only the easier versions, so this could not be saved. Nothing was changed.',
    changed:
      'This session changed on another screen or at midnight, so nothing was saved. Check this screen and try again.',
  },
} as const;

// ---- Item 15: the fasting timer and history, and the reflux log ----

/**
 * Fasting wording (HEALTH_SAFETY.md section 3; UX_SCREENS.md 1e and section 2 card 2; DOC_REVIEW
 * C09, C10, C29, C30, C54, C55, C62, C63, C64; item 15 design). The app never insists on a fast:
 * every offer, after-window line and widen line says it is fine to eat or to widen the window,
 * and nothing frames rest or food as losing a streak (HS-18).
 */
export const fasting = {
  card: {
    label: 'Fast',
    gatedLabel: 'Fasting',
    pill: '{ratio} · {name}',
    detailsLink: 'Fasting and reflux',
    refluxLink: 'Log a reflux symptom',
    start: 'Start fast',
    end: 'End fast',
    undo: 'Undo',
    started: 'Fast started.',
    notRunning: 'No fast running.',
    ofPlanned: 'of {planned}',
    overCeilingUnit: 'in total (past 24 h)',
    startedAt: 'Started {time}',
    startedOn: 'Started {day} at {time}',
    eatWindow: 'Eat {range}',
    eatWindowTomorrow: 'Eat tomorrow {range}',
    eatBy: 'Eat by {time}',
    eatByTomorrow: 'Eat by {time} tomorrow',
    snackAndDinner: '5 pm snack, dinner by {end}',
    windowOpenUntil: 'Eating window open until {end}.',
    noPattern: 'No eating pattern chosen yet.',
    choosePattern: 'Choose a pattern',
    windowOpen: "Your eating window is open. It's fine to eat now.",
    nearCeiling: "This fast is close to 24 hours. It's fine to eat now.",
    fineToEat: "It's fine to eat now.",
    // After a Kickstart stop-sign answer, or a pre-start "yes" that day (F20; HEALTH_SAFETY 2, 3).
    stopSignPause:
      "You told the app about a stop-sign, so it is not timing fasts to your eating window for now. It's fine to eat now.",
    // HEALTH_SAFETY.md section 3, word for word (HS-02).
    overCeiling:
      'Fasts over 24 hours are outside what this app supports. Break the fast if you feel unwell, and talk to a GP before fasting this long again.',
    cappedPlan:
      "Your next eating window opens more than 24 hours after this fast began. It's fine to eat earlier: eating by {time} keeps this fast within 24 hours.",
    // The gap between the two fasts, which stays true for the whole fast (item 15 review).
    joined:
      "This fast started {gap} after your last fast ended, so it counts as part of the same fast. It's fine to eat before starting another.",
    joinedJustNow:
      "This fast started less than a minute after your last fast ended, so it counts as part of the same fast. It's fine to eat before starting another.",
    // Start tapped less than an hour after the last fast ended, as after a 23:1 dinner (F21).
    joinAsk:
      'Your last fast ended at {end}, less than an hour ago, so a fast started now counts as part of it. A fast started from {time} counts on its own.',
    joinAskStart: 'Start now',
    joinAskWait: 'Not now',
    ended: 'Fast ended after {length}.',
    noteLabel: 'How did you feel? (optional)',
    noteHint: 'Up to 500 characters.',
    addNote: 'Add a note',
    saveNote: 'Save note',
    cancel: 'Cancel',
    noteSaved: 'Note saved.',
    changeStart: 'Change start time',
    clockBehind:
      "The phone's clock reads earlier than this fast's start. Check the date and time in the phone's settings.",
    // After End with the clock behind: the fast is stored as ending where it began (review).
    endedAtStart:
      'The fast was saved as ending at its start time. You can change the end time in History once the clock is right.',
    alreadyRunning: 'A fast is already running.',
    alreadyEnded: 'This fast was already ended on another screen.',
    notLatest: 'Only the most recent fast can be reopened. You can change its times in History.',
    notEnded: 'This fast is still running, so there is nothing to undo.',
    undoExpired: 'It is too late to undo that. You can change the end time in History.',
    notFound: 'This entry was removed on another screen. Nothing was changed.',
    invalid:
      'That could not be saved: a value is out of range, or the note has characters that cannot be stored. Nothing was changed.',
    failed: 'That could not be saved. Nothing was changed. Try again.',
    readFailed: `Your fasting records could not be read. Reload the app. If you feel unwell while fasting, eat something, and call Healthline or ${helpNumbers.emergency.number} if it doesn't settle.`,
  },
  day: { today: 'today', yesterday: 'yesterday', tomorrow: 'tomorrow' },
  // HEALTH_SAFETY.md section 3, word for word (FS-05).
  alcoholNote: 'Alcohol on an empty stomach hits harder and affects blood sugar.',
  // HEALTH_SAFETY.md section 3 (FS-04); the action sentence word for word.
  stopSigns: {
    label: 'Stop-signs',
    intro: 'While fasting, watch for:',
    signs: ['Dizziness', 'Fainting', 'Heart palpitations', 'Confusion', 'Severe weakness'],
    action: `Break your fast and, if it doesn't settle, call Healthline ${helpNumbers.healthline.number} or ${helpNumbers.emergency.number}.`,
  },
  // HEALTH_SAFETY.md section 1; C07, C54. The reasons are item 13's GateNotice.
  gated: {
    title: 'Fasting is switched off',
    kept: 'Nothing you have logged is deleted.',
    openFast: 'A fast you started is still open.',
    endOpenFast: 'End it now',
    refused: 'Fasting is switched off, so a fast cannot be started.',
  },
  // Readiness question 4 (HEALTH_SAFETY.md section 1; C07): item 13's sentence, one wording.
  pharmacist: schedule.pharmacistNote,
  // UX_SCREENS.md section 2 card 2 as live templates (C64). Protein figures are rounded down.
  mealCheck: {
    headline: {
      tonightDinner: "Tonight's dinner carries {protein} g protein.",
      tomorrowDinner: "Tomorrow's dinner carries {protein} g protein.",
      todayMeal: "Today's meal carries {protein} g protein.",
      tomorrowMeal: "Tomorrow's meal carries {protein} g protein.",
    },
    headlineAtLeast: {
      tonightDinner: "Tonight's dinner carries at least {protein} g protein.",
      tomorrowDinner: "Tomorrow's dinner carries at least {protein} g protein.",
      todayMeal: "Today's meal carries at least {protein} g protein.",
      tomorrowMeal: "Tomorrow's meal carries at least {protein} g protein.",
    },
    headlineUnknown: {
      tonightDinner: "Tonight's dinner: protein unknown.",
      tomorrowDinner: "Tomorrow's dinner: protein unknown.",
      todayMeal: "Today's meal: protein unknown.",
      tomorrowMeal: "Tomorrow's meal: protein unknown.",
    },
    proteinShort: 'One meal needs about {target} g.',
    energyShort: "The day's planned food comes in under the day's energy target.",
    // A planned meal's energy is not known and the known part is under the target (HS-37): the
    // check fails, so the snack and the widen line stay, but nothing says the day comes in under.
    energyNotKnown:
      "The energy in some of the day's planned food is not known yet, so the app cannot check it against the day's energy target.",
    // No energy target (no rough energy guide yet): energy is not shown to be met, so the snack
    // and the widen line are offered (item 21's energyForMealChecks returns null then).
    energyUnavailable:
      "The day's energy target is not available yet, so the app cannot check that this day's food meets it.",
    portionLarge:
      'Carrying that much protein in one sitting would take more than about 600 g of meat, fish, eggs or other protein food.',
    offerSnack: "Add the 5 pm snack? It's fine to widen the window.",
    addSnack: 'Add 5 pm snack',
    notNow: 'Not now',
    // UX_SCREENS.md section 2 card 2, word for word (HS-18).
    widen: "It's fine to widen the window.",
    planShort: {
      today: "Today's plan comes in under your protein or energy target.",
      tomorrow: "Tomorrow's plan comes in under your protein or energy target.",
    },
    widenDetail: 'Eating earlier, or a little more, is fine.',
    afterWindow:
      "Today's food came in under your protein or energy target. It's fine to eat a bit more now.",
    afterWindowTomorrow: 'Tomorrow, the 5 pm snack is there if you want it.',
    afterWindowReflux:
      "Today's food came in under your protein or energy target. It's fine to eat a bit more now; something small may sit better with reflux than a large late meal. Tomorrow, an earlier meal or the 5 pm snack may suit you better.",
    afterWindowUnchecked:
      "The day's energy target is not available yet, so the app cannot check today's food against it. It's fine to eat a bit more now.",
    afterWindowUncheckedReflux:
      "The day's energy target is not available yet, so the app cannot check today's food against it. It's fine to eat a bit more now; something small may sit better with reflux than a large late meal. Tomorrow, an earlier meal or the 5 pm snack may suit you better.",
    addSnackTomorrow: 'Add 5 pm snack tomorrow',
    snackAdded: {
      today: '5 pm snack added for tonight. Eat {range}.',
      tomorrow: '5 pm snack added for tomorrow. Eat {range}.',
    },
    // During a fast whose 24 hours end before that window opens (item 15 review), or during a
    // stop-sign pause (F20): no window time.
    snackAddedNoRange: {
      today: '5 pm snack added for tonight.',
      tomorrow: '5 pm snack added for tomorrow.',
    },
    undo: 'Undo',
    unavailableOneMeal:
      "There is no meal check until meals are planned in the app. One meal has to carry a whole day's protein, and it's fine to add the 5 pm snack.",
    // When the snack can no longer be added for that date (item 15 review).
    unavailableOneMealNoSnack:
      "There is no meal check until meals are planned in the app. One meal has to carry a whole day's protein, and it's fine to widen the window.",
  },
  pattern: {
    label: 'Eating pattern',
    change: 'Change pattern',
    nextToday: 'Next eating window: today at {time}.',
    nextTomorrow: 'Next eating window: tomorrow at {time}.',
    clearsChanges: 'Saving also removes the change made for {days}.',
    refluxLink: 'Reflux options and symptom log',
    fastingLink: 'Fasting timer, history and reflux log',
  },
  history: {
    label: 'History',
    // C63: shown from 2 days; there is never a message about losing or resetting it.
    streak: '{days} days in a row with a completed fast.',
    empty: 'No completed fasts yet.',
    over24: 'Over 24 hours',
    // Worded for any number of joined fasts (item 15 review).
    joined: 'Started {gap} after the fast before it, so it counts as part of one fast of {length}.',
    joinedFirst:
      'The next fast started less than an hour after this one ended, so this counts as part of one fast of {length}.',
    showMore: 'Show more',
    edit: 'Edit',
    delete: 'Delete',
    deleteConfirm: 'Delete this fast? This cannot be undone.',
    deleteAction: 'Delete fast',
    cancel: 'Cancel',
    save: 'Save',
    startDate: 'Start date',
    startTime: 'Start time',
    endDate: 'End date',
    endTime: 'End time',
    endBeforeStart: 'The end must be after the start.',
    future: 'A fast cannot start or end later than now.',
    overlap: 'These times overlap another fast.',
  },
  // The UX_SCREENS.md section 2 top line; item 16 builds the line from these.
  status: {
    fasting: 'Fasting {duration}.',
    snackOpens: 'Snack window opens {time}.',
    windowOpens: 'Eating window opens {time}.',
    windowOpensTomorrow: "Tomorrow's eating window opens at {time}.",
    windowOpenUntil: 'Eating window open until {time}.',
    // Item 16: a fast still running while fasting is switched off (HS-03, RD-06); no window times.
    openWhileOff: 'A fast you started is still open ({duration}). You can end it below.',
  },
} as const;

/** Reflux wording (HEALTH_SAFETY.md section 3; DOC_REVIEW C47, C62, C104; item 15 design). */
export const reflux = {
  label: 'Reflux',
  intro: 'Log a symptom when it happens.',
  symptoms: {
    heartburn: 'Heartburn',
    'night-cough': 'Night cough',
    regurgitation: 'Regurgitation',
  },
  logged: 'Logged: {symptom} at {time}.',
  severityQuestion: 'How strong was it?',
  severity: { '1': 'Mild', '2': 'Moderate', '3': 'Strong' },
  notRated: 'Not rated',
  noteLabel: 'Note (optional)',
  noteHint: 'Up to 280 characters.',
  addNote: 'Add a note',
  save: 'Save',
  cancel: 'Cancel',
  undo: 'Undo',
  edit: 'Edit',
  delete: 'Delete',
  deleteConfirm: 'Delete this entry? This cannot be undone.',
  dateLabel: 'Date',
  timeLabel: 'Time',
  symptomLabel: 'Symptom',
  severityLabel: 'How strong',
  future: 'An entry cannot be later than now.',
  recentTitle: 'Last 14 days',
  recentRow: '{day}, {time} · {symptom} · {severity}',
  recentRowUnrated: '{day}, {time} · {symptom}',
  none: 'No symptoms logged in the last 14 days.',
  // A judgement call for the owner's item-42 review (HEALTH_SAFETY.md section 3).
  chestPain: `If chest pain spreads to your arm, jaw, neck or back, or comes with breathlessness, sweating or feeling faint, call ${helpNumbers.emergency.number} now rather than logging it.`,
  // HEALTH_SAFETY.md section 3.
  gpLine: 'See a GP if symptoms persist or worsen.',
  noDiagnosis: 'The app does not diagnose.',
  options: {
    title: { today: 'Options for today', tomorrow: 'Options for tomorrow' },
    why: 'A large meal late in the evening can make reflux worse.',
    earlier: 'Eat an hour earlier: {range}.',
    earlierNextDay:
      "The next day's window then opens at {time}, so the fast in between stays under 24 hours.",
    earlierAction: 'Eat 1 hour earlier',
    split: 'Split the meal: the 5 pm snack, then a smaller dinner.',
    splitAction: 'Add 5 pm snack',
    splitAlready:
      'Your eating window already starts by 5 pm, so a snack then and a smaller dinner fit in it.',
    changed: {
      today: 'Changed for today: eat {range}.',
      tomorrow: 'Changed for tomorrow: eat {range}.',
    },
    // During a stop-sign pause no window time is named (F20).
    changedNoRange: {
      today: 'Changed for today.',
      tomorrow: 'Changed for tomorrow.',
    },
    undo: 'Undo',
    keepsFastShort:
      'This change keeps the fast next to it under 24 hours, so it cannot be undone on its own.',
    preferEarlier: 'Prefer an earlier dinner',
    preferSplit: 'Prefer a split meal (5 pm snack and a smaller dinner)',
  },
  // C47: a judgement call for the owner's item-42 review.
  nudge: {
    days: 'You have logged reflux symptoms on {days} days in the last 2 weeks.',
    stronger: 'Your reflux symptoms were stronger this week than the week before.',
    action: "It's worth seeing your GP about them.",
    notNow: 'Not now',
  },
} as const;

// ---- Diet and targets, and the Nutrition today card (checklist item 21) ----

/**
 * The Diet and targets screen, the Nutrition today card and the planner's floor lines
 * (HEALTH_SAFETY section 4; UX 2 card 3, UX 3a and UX 7; C10, C11, C61, C65, C70, C71; item 21
 * design section 4.2). Neutral indicator wording: going over a ceiling or budget changes a colour
 * and nothing is judged (HS-09). Every number stated here is checked against the core constants
 * (TARGET_COPY_FACTS; health.test.ts). The blood-pressure stop-sign and electrolyte lines are item
 * 13's readiness.bloodPressure keys (cross-item ruling 5), and the electrolyte wording is item 16's
 * reminders.electrolytes (one reminder, one wording); the activity labels are item 13's
 * profile.activity. The badge words, the "at least" and "not known" wording and the attribution
 * footer are item 18's foods section (item 18-20 contract 4 to 6).
 */
export const targets = {
  settingsRow: {
    title: 'Diet and targets',
    detail: 'Diet mode, energy, protein, carbs, saturated fat and fibre',
  },
  screen: {
    title: 'Diet and targets',
    intro:
      'These figures guide the planner and the Nutrition card on Today. They are guides, not medical advice: your GP or a dietitian can tailor them to you.',
    missingAnswers:
      'Some readiness questions have no answer yet, so the app treats them as yes. Answer them to see your figures.',
    readFailed: 'These figures could not be read. Reload the app to try again.',
  },
  links: {
    profile: { title: 'Profile', detail: 'Add or check your height and birth year' },
    weight: { title: 'Weight', detail: 'Log a weigh-in' },
  },
  dietMode: {
    label: 'Diet mode',
    legend: 'Choose a mode',
    names: {
      keto: 'Keto-preferred',
      'moderate-low-carb': 'Moderate low-carb',
      balanced: 'Balanced',
    },
    details: {
      keto: 'Net carbs under your keto ceiling.',
      'moderate-low-carb': 'Net carbs under a wider ceiling.',
      balanced: 'No carb ceiling. Net carbs are still shown.',
      // The reason is the gate's own, on the card below (F31).
      ceilingOff: 'No carb ceiling for now.',
    },
    change: 'Change diet mode',
    switchNote:
      'Switching never deletes anything. Your plans and logs stay as they are, and suggestions are put in a new order for the mode you choose.',
    saving: 'Changing the diet mode…',
    switched: 'Diet mode is now {mode}.',
    failed: 'The diet mode could not be changed. Nothing was changed.',
    leaveKickstart: {
      title: 'Leaving keto ends Kickstart',
      body: 'Kickstart runs only with the keto carb ceiling. If you switch now, Kickstart ends today. It does not start again by itself if you come back to keto.',
      confirm: 'Switch and end Kickstart',
      cancel: 'Keep keto',
    },
  },
  energy: {
    label: 'Energy',
    roughGuideTerm: 'Rough guide',
    roughGuide: '{kj} kJ a day (about {kcal} kcal)',
    basisTerm: 'Based on',
    basisAverage: 'Your 7-day average weight, {kg} kg, and your activity',
    basisHighestRecent:
      'Your highest weigh-in in the last 7 days, {kg} kg on {date}, and your activity',
    basisLatestOlder: 'Your last weigh-in, {kg} kg on {date}, and your activity',
    staleWeight:
      'That weigh-in is more than 14 days old. Log a weight to bring the guide up to date.',
    how: 'The rough guide is a standard estimate from your height, weight, age, sex and activity. It is an estimate, not a measurement.',
    unavailable: {
      unanswered:
        'The app does not estimate energy until the under-18 readiness question is answered.',
      under18Answer:
        'The app does not estimate energy because your readiness answers say you are under 18.',
      under18BirthYear:
        'The app does not estimate energy because your birth year means you may be under 18.',
      missingHeight: 'A rough guide needs your height.',
      missingBirthYear: 'A rough guide needs your birth year.',
      missingWeight: 'A rough guide needs a weigh-in.',
      ageOutOfRange:
        'The rough guide works only for ages from 18 to 110. Check your birth year in your profile.',
      heightOutOfRange:
        'The rough guide works only for heights from 120 to 230 cm. Check your height in your profile.',
      weightOutOfRange:
        'The rough guide works only for weights from 30 to 350 kg. Check your weigh-ins.',
    },
    targetTerm: "Today's energy target",
    target: '{kj} kJ (about {kcal} kcal)',
    noTarget: 'None',
    kickstart:
      'Kickstart: {pct}% below the rough guide, with protein held at {protein} g and net carbs at {carbs} g.',
    kickstartNoDeficit:
      'Kickstart with no deficit, because you set the Kickstart deficit to 0%. Protein is held at {protein} g and net carbs at {carbs} g.',
    kickstartSuspended: {
      // After the gate's own reason, "Kickstart is off because of …" (F31).
      readiness: 'Kickstart figures are not in use.',
      'diet-mode': 'Kickstart figures are used only in keto mode.',
      'mode-changed':
        'Kickstart figures are not in use, because the app cannot confirm keto mode has run without a break since this Kickstart began. A Kickstart does not start again by itself.',
      'stop-sign':
        'Kickstart figures are paused for the rest of this Kickstart, because your last check reported a stop-sign. No deficit is planned.',
      'no-estimate': 'Kickstart figures are not in use until there is a rough guide.',
    },
    steady: 'Steady: {pct}% below the rough guide.',
    // After the gate's own reason, "The energy deficit is off because of …" (F31).
    plannedAtGuide: 'Meals are planned at the rough guide.',
    pregnancyNote:
      'The rough guide does not include the extra energy needed in pregnancy or while breastfeeding. A midwife or your GP can give you a figure.',
    floorBinds:
      'This is the energy floor. The planner never plans a day below {floorKj} kJ (about {floorKcal} kcal). The floor is a safety net, not a target.',
    estimateBelowFloor:
      'Your rough guide is below the {floorKj} kJ floor, so meals are planned at the floor with no deficit. Your GP or a dietitian can give you a better figure.',
    noTargetNeedsGuide:
      'With no rough guide there is no energy target, so the planner does not fill days by itself and Kickstart figures are not used. The {floorKj} kJ floor (about {floorKcal} kcal) still applies to every plan.',
    noTargetNotEstimated: 'There is no energy target. The planner plans ordinary portions.',
    kickstartDeficitLabel: 'Kickstart deficit',
    kickstartDeficitHint:
      'Used only while a Kickstart is running. Up to 30% below the rough guide; you can choose less, never more.',
    kickstartUnavailable:
      'Kickstart is not available because of an answer in your readiness questions.',
    steadyDeficitLabel: 'Steady deficit',
    steadyDeficitHint: 'From 15% to 20% below the rough guide; 15% unless you change it.',
    deficitOption: '{pct}%',
    deficitNotInUse: 'Not in use today: the energy floor applies.',
    floorLabel: 'Energy floor, kJ',
    floorHint:
      'Never below 5,000 kJ (about 1,200 kcal). You can set a higher floor, up to 20,000 kJ.',
    floorTooLow: 'The floor cannot go below 5,000 kJ.',
    floorTooHigh: 'The floor can be at most 20,000 kJ.',
  },
  // The stop-sign advice is weight.stopSigns' one wording (F36).
  protein: {
    label: 'Protein',
    minLabel: 'Lowest, g a day',
    maxLabel: 'Highest, g a day',
    hint: 'From 80 to 200 g a day; 120 to 140 g unless you change it.',
    minAboveMax: 'The lowest figure cannot be above the highest.',
    kickstart: 'During Kickstart, meals are checked against the top of your range: {max} g.',
    steady:
      'Outside Kickstart, meals are checked against the bottom of your range ({min} g) and planned inside it.',
    unchanged: 'Protein does not change with the deficit or with your eating window.',
    review: 'Worth reviewing with your GP or a dietitian, who can tailor it to you.',
    plainNote: 'Shown as information only. Your GP or a dietitian can tailor protein to you.',
  },
  carbs: {
    label: 'Carbs',
    ketoLabel: 'Keto net-carb ceiling, g a day',
    ketoHint: 'From 20 to 50 g; 30 g unless you change it.',
    moderateLabel: 'Moderate low-carb ceiling, g a day',
    moderateHint: 'From 50 to 130 g; 100 g unless you change it.',
    kickstart:
      'During Kickstart net carbs are {carbs} g. Your own ceiling applies again after Kickstart.',
    balanced: 'Balanced mode has no carb ceiling. Net carbs are still shown.',
    heldAt50:
      'Your keto ceiling stays at 50 g until you confirm your prescriber has agreed. Low-carb eating and fasting can change how diabetes medicines act; check with your prescriber first.',
    // After the gate's own reason, "The keto carb ceiling is off because of …" (F31).
    offShown: 'Net carbs are still shown, without a ceiling.',
    meaning: 'Net carbs are carbohydrate without the fibre.',
  },
  saturatedFat: {
    label: 'Saturated fat',
    budgetLabel: "Budget, % of the day's planned energy",
    budgetHint: 'From 5% to 10%; 10% unless you change it.',
    percentOption: '{pct}%',
    today: "Today's budget: {g} g, from {pct}% of {kj} kJ.",
    noBudget: 'A budget needs an energy target, so saturated fat is shown without one.',
    plainNote: 'Saturated fat is shown on Today without a budget.',
    why: 'Keeping saturated fat down is part of the cholesterol-conscious default. Going over only changes the colour of the bar.',
  },
  guides: {
    label: 'Fibre and water',
    fibreLabel: 'Fibre guide, g a day',
    fibreDefault:
      'Default: {g} g a day, from the Nutrient Reference Values for Australia and New Zealand.',
    fibreHint: 'From 10 to 70 g. Leave it empty to use the default.',
    waterLabel: 'Water guide, mL a day',
    waterDefault:
      'Default: {ml} mL a day, from the Nutrient Reference Values for Australia and New Zealand. Drink more on hot days and when you are active.',
    waterHint: 'From 1,000 to 6,000 mL. Leave it empty to use the default.',
  },
  form: {
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved.',
    failed: 'This could not be saved. Nothing was changed.',
    wholeNumber: 'Enter a whole number.',
    range: 'Enter a number from {min} to {max}.',
    storedDiffers:
      'The stored value, {stored}, is outside the allowed range, so {used} is used instead.',
  },
  today: {
    label: 'Nutrition today',
    energy: 'Energy',
    energyOf: '{eaten} of {target} kJ',
    energyOnly: '{eaten} kJ',
    food: 'Food {kj} kJ',
    protein: 'Protein',
    proteinOf: '{eaten} of {target} g',
    proteinOfRange: '{eaten} of {min}–{max} g',
    fibre: 'Fibre',
    fibreOf: '{eaten} of {guide} g guide',
    netCarbs: 'Net carbs',
    satFat: 'Saturated fat',
    ofCeiling: '{eaten} / {ceiling} g',
    gramsOnly: '{eaten} g',
    /**
     * In place of "Nothing logged yet today." until food logging exists (full review F24), so the
     * zeros never read as a day without food. Item 23 removes it with its own empty-day line.
     */
    laterStep:
      'Food logging arrives at a later step in the build checklist. Until then no food is counted here.',
    missingOne: '1 entry has no {nutrient} figure, so the total is at least what is shown.',
    missingMany:
      '{count} entries have no {nutrient} figure, so the total is at least what is shown.',
    nutrientNames: {
      energyKj: 'energy',
      proteinG: 'protein',
      carbsG: 'carbohydrate',
      saturatedFatG: 'saturated fat',
      fibreG: 'fibre',
    },
    floorDay: "Today's energy figure is the {floorKj} kJ floor: a safety net, not a target.",
    plainNote: 'Shown without targets. Your GP or a dietitian can tell you what suits you.',
  },
  /** The planner's floor lines (item 22 shows them; HS-10, NU-06, C108, T3). */
  plannerFloor: {
    refused:
      'The planner did not fill this day: it would come to under {floorKj} kJ (about {floorKcal} kcal), and it never plans a day below that floor.',
    manualBelow:
      'This day comes to under {floorKj} kJ (about {floorKcal} kcal), the floor the planner never goes below. Add food if you can.',
    noGuide:
      'The planner does not fill days by itself without a rough guide of your energy needs. Diet and targets shows what is missing.',
  },
} as const;

// ---- Item 16: Today and About ----

/**
 * Today's dashboard (UX_SCREENS section 2; item 16 design section 3.2). Cards for features not
 * built yet say so in one line with no figures, and no line sets a goal or scores the day.
 */
export const today = {
  cards: {
    water: 'Water',
    steps: 'Steps',
    movement: 'Movement',
    drinks: 'Drinks',
  },
  setupFirst: 'Today opens once setup is finished.',
  readFailed: "Today's records could not be read.",
  reload: 'Reload the app',
  laterStep: {
    /** Settings' "Coming later" card: the UX 7 settings not built yet (full review F33). */
    settings:
      'The store name, beach jogging, and hidden recipes and foods arrive at later steps of the build checklist.',
  },
  water: {
    none: 'None logged yet',
    add: 'Add 250 mL',
    added: 'Added 250 mL. Today: {total}.',
    undo: 'Undo',
    undone: 'Removed. Today: {total}.',
    undoneEmpty: 'Removed. None logged today.',
    electrolytes: 'Electrolytes today',
    unitMl: 'mL',
    unitL: 'L',
  },
  steps: {
    none: 'Not entered today',
    // Typed in or copied by "Same as yesterday": "saved" is true of both (item 16 review).
    enteredAt: 'saved at {time}',
    enter: 'Enter steps',
    edit: 'Edit',
    sameAsYesterday: 'Same as yesterday: {steps}',
    field: 'Steps today',
    save: 'Save',
    cancel: 'Cancel',
    remove: "Remove today's entry",
    errors: {
      empty: 'Enter the number of steps.',
      format: 'Use whole numbers only, such as 12000 or 12,000.',
      'too-many': 'That is more than 100,000 steps. Check the number.',
    },
  },
  saveFailed: 'That was not saved. Try again.',
  quickActions: {
    title: 'Quick actions',
    /** UX_SCREENS section 2, in order. */
    labels: {
      'log-weight': 'Log weight',
      'finish-meal': 'Finish meal',
      'swap-recipe': 'Swap recipe',
      'complete-workout': 'Complete workout',
      'add-harvest': 'Add harvest',
      'add-drink': 'Add drink',
      'open-grocery-list': 'Open grocery list',
    },
    // Short, so it stays in view above the list on a phone at 200% zoom (item 16 review).
    laterNote: 'Actions marked Later are not built yet and do nothing.',
    markerLater: 'Later',
    markerOff: 'Off',
  },
} as const;

/**
 * Today's Reminders card (UX_SCREENS section 2, card 8; HEALTH_SAFETY section 4; C72, C109). The
 * electrolyte body names minerals and garden foods, never a supplement; the blood-pressure line is
 * readiness.bloodPressure.electrolyte and the medication-timing body is fasting.pharmacist, so
 * each sentence has one wording. The electrolyte lines and their order are item 21's
 * electrolyteCopyKeys, which item 22's planner card reuses with this wording.
 */
export const reminders = {
  cholesterol: {
    title: {
      'day-1': 'Lipid test',
      'day-56': 'Cholesterol check-in: 8 weeks',
      'day-84': 'Cholesterol check-in: 12 weeks',
    },
    // HEALTH_SAFETY.md section 4, word for word.
    body: 'Low-carb eating can move cholesterol in either direction. A lipid blood test before you start and again after 8–12 weeks is the only way to know. Your GP can arrange one.',
    hide: 'Hide this reminder',
  },
  electrolytes: {
    title: 'Electrolyte reminder',
    body: 'Electrolytes: sodium, potassium, magnesium. Garden sources: silverbeet, spinach, avocado.',
    hide: 'Hide for today',
  },
  medicationTiming: {
    title: 'Medication timing',
  },
} as const;

/**
 * About (UX_SCREENS section 7; HS-13). The data-sources card names a food database only once one
 * is approved at checklist item 10, with its attribution (item 18: foods.about and
 * foods.attribution give the Database line, the catalogue line and the attribution).
 */
export const about = {
  dataSources: {
    intro: 'Every food figure in the app will carry a badge that says where it came from:',
    /** The Label and Estimate lines; the Database line is foods.about.databaseBadgeNone or databaseBadge (item 18). */
    badges: {
      label: 'Label: you typed it in from a product label.',
      estimate: "Estimate: it was worked out from a recipe's ingredients, or approximated.",
    },
  },
  /** DOC_REVIEW C34: the records share their origin with every site of the same GitHub account. */
  sharedOrigin:
    'The app is published on GitHub Pages. Any other site published from the same GitHub account could read the records the app keeps on this phone, so no other site is published from that account.',
} as const;

// ---- Item 18: the food catalogue and how unknown figures read ----

/**
 * Attribution text per approved food database, copied word for word from the dated item-10
 * "Nutrition data licence" DECISIONS row (item 18 design 6.1). Empty while no source is approved:
 * tools/scans/docFidelity.test.ts keeps its keys equal to APPROVED_NUTRIENT_SOURCES (S5). The one
 * place in this file that may name a database, and the one string exempt from the foods rules.
 */
const FOOD_ATTRIBUTION: AttributionMap = Object.freeze({});

/**
 * The food catalogue, "Foods in the app", and the words every screen uses for a nutrient figure
 * that is not known (checklist item 18; HS-37; DOC_REVIEW C43, C67, C69, C97, C107, C110). An
 * unknown figure reads "not known", a sum with some known parts "at least", never 0 and never an
 * estimate. Items 20 to 24 reuse these words rather than adding their own (item 18–20 contract 4).
 */
export const foods = {
  screen: {
    title: 'Foods in the app',
    findLabel: 'Find a food',
    intro:
      'The everyday foods the app knows, with their aisles, typical pack sizes, allergens and seasons. Tap a food for its details.',
    searchLabel: 'Food name',
    searchHint: 'Type at least 2 letters of its name or another name, such as chard.',
    count: '{count} foods',
    matchesLabel: 'Matches',
    matchOne: '1 matching food',
    matchCount: '{count} matching foods',
    noMatch: 'No food in the list matches that.',
    readFailed: 'The food list could not be read. Reload the app.',
    rowGarden: 'Often grown at home',
    rowCooked: 'Cooked weight',
    rowContains: 'Contains {list}',
    rowCheckLabel: 'Check the label for allergens',
    rowConflict: 'Has {list}, which you listed',
  },
  detail: {
    otherNames: 'Other names',
    noOtherNames: 'None',
    aisle: 'Aisle',
    packs: 'Typical pack sizes',
    packsTypical: 'Typical sizes, not checked against a store.',
    packsOwner: 'Your sizes, entered {date}.',
    packsByThe: 'Sold by the {one}',
    packsOf: 'Packs of {list} {many}',
    packsIn: '{sizes} {many}',
    packsLoose: '{sizes}, also sold loose',
    eachWeighs:
      'One {one} weighs about {grams} g as bought (typical), used only to count how many to buy.',
    notSold: 'For weighing after cooking. The shopping list uses {name}.',
    cookedForm: 'Also listed cooked, for weighing after cooking: {name}.',
    allergens: 'Allergens',
    allergensNone: 'None of the 15 allergens the app tracks.',
    allergensSingle:
      'None of the 15 allergens the app tracks is in it by nature, but packed foods can carry a “may contain” line, so check the label.',
    allergensContains: 'Contains {list}.',
    allergensBrandMore: 'Other allergens depend on the brand: check the label.',
    allergensBrandOnly: 'Allergens depend on the brand: check the label.',
    allergenConflict: 'Has {list}, which you listed to avoid.',
    allergenUnknownForYou:
      'Its allergens are not fully known, so it is never shown as free of the ones you listed.',
    season: 'In season in the Bay of Plenty',
    seasonAllYear: 'All year',
    seasonRange: '{from} to {to}',
    seasonNote: 'A general guide to when local produce is usually plentiful.',
    garden: 'Grown at home',
    gardenYes: 'Often grown in home gardens',
    swaps: 'Swaps',
    swapCheckLabel: '{name} (check the label)',
    swapsNoneShown:
      'None to show with your allergen and gluten-free settings and the foods you do not want suggested.',
    cookedFormLabel: 'Cooked form',
    nutritionCaption: {
      raw: 'Nutrition per 100 g, raw',
      cooked: 'Nutrition per 100 g, cooked',
      'as-sold': 'Nutrition per 100 g, as sold',
    },
    badgeLine: 'Badge: {badge}',
  },
  months: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
  /** Running-text words in ALLERGENS order (profile.allergenNames are capitalised labels). */
  allergenWords: {
    peanut: 'peanuts',
    'tree-nut': 'tree nuts',
    milk: 'milk',
    egg: 'egg',
    fish: 'fish',
    crustacea: 'crustacea (prawns, crab, crayfish)',
    mollusc: 'molluscs (mussels, oysters, squid)',
    sesame: 'sesame',
    soy: 'soy',
    lupin: 'lupin',
    wheat: 'wheat',
    barley: 'barley',
    oats: 'oats',
    rye: 'rye',
    sulphites: 'sulphites',
  },
  allergenCovered: '{allergen} ({choice})',
  glutenWord: 'gluten',
  listComma: ', ',
  listAnd: ' and ',
  listOr: ' or ',
  nutrientNames: {
    energyKj: 'Energy',
    proteinG: 'Protein',
    fatG: 'Fat',
    saturatedFatG: 'Saturated fat',
    carbsG: 'Net carbs',
    sugarsG: 'Sugars',
    fibreG: 'Fibre',
    sodiumMg: 'Sodium',
  },
  nutrientNamesLower: {
    energyKj: 'energy',
    proteinG: 'protein',
    fatG: 'fat',
    saturatedFatG: 'saturated fat',
    carbsG: 'carbohydrate',
    sugarsG: 'sugars',
    fibreG: 'fibre',
    sodiumMg: 'sodium',
  },
  figures: {
    notKnown: 'not known',
    atLeast: 'at least {value}',
    kj: '{value} kJ',
    g: '{value} g',
    mg: '{value} mg',
  },
  /** The only badge words (HEALTH_SAFETY section 4): a figure that is not known has no badge. */
  badges: { label: 'Label', database: 'Database', estimate: 'Estimate' },
  notLoaded:
    'Nutrition figures for this food are not in the app yet. They can be added from a published table of food values if its licence allows. Until then each figure shows as not known, never as 0, and the app does not fill it in.',
  // Used only if checklist item 10 approves neither database (item 18 design 6.4).
  notLoadedNone:
    'Nutrition figures for this food are not in the app, because no published table of food values could be used. Each figure shows as not known, never as 0. You can enter figures from a product label in the food log.',
  releaseUnreadable:
    'The nutrition figures could not be read, so each one shows as not known. Reload the app. If this stays, the figures need fixing in an update.',
  partlyKnown: {
    database:
      'The table this food comes from has no figure for {list}. Each missing figure shows as not known.',
    label:
      'The label figures entered for this food have no figure for {list}. Each missing figure shows as not known.',
    estimate:
      'The estimate entered for this food has no figure for {list}. Each missing figure shows as not known.',
  },
  sourceLine: 'From {source}: {foodName}.',
  sourceOwn: {
    label: 'Figures entered from a product label.',
    estimate: 'Figures entered as an estimate.',
  },
  // HEALTH_SAFETY section 4: one footer that is true for whatever is on the screen (C97). A
  // database figure from a source that is not approved is shown as Estimate, so it never needs a
  // footer that cannot name its database.
  footer: {
    noDatabase:
      'Label figures are as you typed them, and Estimates are approximate. No figure here is from a food database. Your plate will differ.',
    withDatabase:
      'Database figures are averages from {sources}. Label figures are as you typed them, and Estimates are approximate. Your plate will differ.',
  },
  totals: {
    someMissingOne:
      '1 ingredient has no {nutrient} figure yet, so the total is at least what is shown.',
    someMissingMany:
      '{count} ingredients have no {nutrient} figure yet, so the total is at least what is shown.',
    noneLoaded:
      'No nutrition figures are loaded yet for its ingredients, so its nutrition is not known.',
  },
  planner: {
    energyNotKnown:
      'The planner did not fill this day: the energy in some of its meals is not known yet, so it cannot check that the day reaches {floorKj} kJ.',
    energyNotKnownOwner:
      "The energy in some of this day's meals is not known yet, so the app cannot check that the day reaches {floorKj} kJ (about {floorKcal} kcal).",
  },
  today: {
    foodNotKnown: 'Food: not known',
    foodAtLeast: 'Food: at least {value}',
    figuresNotLoaded:
      "Food figures are not loaded yet, so the app cannot tell whether today's food reaches your energy floor or your protein target.",
  },
  kickstart: {
    figuresNotLoaded:
      "Until food figures are loaded, the app cannot warn you when a day's food is under your energy floor or short of your protein target. Enter label figures for your main protein foods, or keep the 5 pm snack.",
  },
  derived: {
    daysMissingOne:
      '1 day has entries with no {nutrient} figure, so the average is at least what is shown.',
    daysMissingMany:
      '{count} days have entries with no {nutrient} figure, so the average is at least what is shown.',
  },
  about: {
    catalogue:
      'The app lists {count} everyday foods with their aisles, typical pack sizes, allergens and seasons. Their nutrition figures are not loaded yet, so each one shows as not known.',
    catalogueLoaded:
      'The app lists {count} everyday foods. Nutrition figures are loaded for {loaded} of them; any figure not in the table shows as not known.',
    attributionNote:
      'Any table of food values the app uses is named here, with the attribution its licence asks for.',
    linkTitle: 'Foods in the app',
    linkDetail: 'Names, aisles, pack sizes and allergens',
    databaseBadgeNone:
      'Database: it would come from a published table of food values. None is used yet, so no figure has this badge.',
    databaseBadge: 'Database: it comes from {sources}, attributed below.',
    sourceEdition: '{name}, {edition}',
  },
  attribution: FOOD_ATTRIBUTION,
} as const;

// ---- Item 19: the garden and pantry screen ----

/**
 * Garden and pantry screen (checklist item 19; UX_SCREENS 3d; REQUIREMENTS section 3D; DOC_REVIEW
 * C57, C110). Item 13's `garden` section is the setup step's wording (UX 1f); this screen reuses its
 * available, ready, notReady, keepsFor, keepsForOne, addTitle, nameLabel, nameHint, amountLabel,
 * amountHint, unitLegend, unitOptions, readyLabel, keepsLabel and errors for the same ideas, so both
 * places say the same thing.
 * Written here, not quoted from the docs. The app makes no food-safety claim (C43 and D33 defer food
 * safety): keep days are the owner's own figure, reported back, never judged. An amount the owner has
 * not entered is never shown as a weight (REQUIREMENTS 3D, C57). Photo wording promises only what the
 * app does (HEALTH_SAFETY section 7).
 */
export const gardenScreen = {
  loading: 'Opening your records…',
  readFailed: 'The garden and pantry could not be read. Reload to try again.',
  closed: 'Nothing more will be saved until the app reloads.',
  reload: 'Reload',
  saved: 'Saved.',
  removed: 'Removed.',
  gone: 'This was removed in the meantime. Nothing was changed.',
  saveOrCancelFirst: 'Save or cancel the open form first.',
  foodLink: { cardLabel: 'At home', detail: 'Crops, harvests and the cupboard' },
  gardenCard: 'Garden',
  readyPill: '{count} ready',
  addHarvest: 'Add harvest',
  addCrop: 'Add a crop',
  emptyGarden: 'No crops listed. Add what you grow.',
  pantryCard: 'Pantry',
  addPantry: 'Add to pantry',
  emptyPantry: 'Nothing listed. Add what is in the cupboard.',
  readySwitch: 'Ready',
  readySwitchName: '{crop}: ready to use',
  amount: {
    notEnteredNotReady: 'Amount not entered',
    someNotMeasured: 'Some, not measured',
    noneLeft: 'None left',
    grams: '{amount} g',
    millilitres: '{amount} mL',
    each: '{amount} each',
    eachWithGrams: '{amount} each, about {grams} g per item',
    bunchOne: '1 bunch',
    bunchMany: '{amount} bunches',
    bunchOneWithGrams: '1 bunch, about {grams} g',
    bunchManyWithGrams: '{amount} bunches, about {grams} g per bunch',
  },
  unitWords: { g: 'grams', each: 'items', bunch: 'bunches', ml: 'millilitres' },
  pantryUnitOptions: { g: 'Grams', ml: 'Millilitres', each: 'Each' },
  freshness: {
    pickedToday: 'Picked today',
    pickedYesterday: 'Picked yesterday',
    pickedOn: 'Picked {date}',
    daysLeftMany: '{days} days left',
    daysLeftOne: '1 day left',
    lastDay: 'Last day you said it keeps',
    pastKeepsMany: 'Past the {days} days you said it keeps',
    pastKeepsOne: 'Past the 1 day you said it keeps',
    // 1 day and more: item 13's garden.keepsForOne and garden.keepsFor.
    keepsForZero: 'Keeps less than a day after picking',
  },
  updated: { today: 'Updated today', yesterday: 'Updated yesterday', on: 'Updated {date}' },
  // The notes below describe the meal plan (item 22) and the grocery list (item 24), so no row
  // shows one until both exist (core rows.ts PLAN_AND_LIST_BUILT; item 19 review).
  notCounted: {
    'not-ready': 'The plan and the list leave it out until it is ready to use.',
    'past-keeps':
      'Past the days you said it keeps, so the plan and the list leave it out. Add a new harvest or remove it.',
    // And only once the ingredient dataset exists (item 18); before it, an unlinked row has no note.
    'not-linked':
      'Not matched to a food yet, so the plan and the list leave it out. Pick a matching food when you edit it.',
    'none-left': 'None left, so the list leaves it out.',
  },
  // No claim that the amount is counted: the list asks before counting a row not changed lately.
  amountUnknownNote: 'Add an amount so the list can work out how much to buy.',
  pantryUnmeasuredNote: 'The list asks you before counting it. Add an amount to save that step.',
  suggestions: 'Matching foods',
  matchedTo: 'Matched to {food}',
  cropForm: {
    editTitle: 'Edit {crop}',
    gramsPerUnit: { each: 'Grams per item (optional)', bunch: 'Grams per bunch (optional)' },
    gramsPerUnitHint:
      'Weigh one if you can. Without it, the amount stays a count and is never turned into a weight.',
    pickedOn: 'Picked on (optional)',
    pickedOnHint: 'Leave it empty while it is still in the ground.',
    keepsHint: 'How many days it keeps after picking. Leave it empty if you are not sure.',
    save: 'Save',
    cancel: 'Cancel',
    remove: 'Remove crop',
    removeConfirm: 'Remove {crop} from the garden?',
    removeConfirmWithPhoto:
      'Remove {crop} from the garden? Its photo is removed too, and photos are not in backups.',
    removeYes: 'Remove',
    removeNo: 'Keep it',
    duplicate: '{crop} is already in the garden.',
    editExisting: 'Edit {crop}',
  },
  harvest: {
    title: 'Add harvest',
    whichCrop: 'Which crop?',
    anotherCrop: 'Another crop',
    cropRequired: 'Choose a crop.',
    useExisting: 'Use {crop}',
    listedNow: 'Listed now: {amount}',
    listedNowPicked: 'Listed now: {amount}, picked {date}',
    listedNowNotReady: 'Listed now: {amount}, not ready yet',
    listedNowNoAmount: 'Listed now: amount not entered',
    howMuch: 'How much did you pick? (optional)',
    howMuchHint: 'Leave it empty if you did not weigh or count it.',
    pickedOn: 'Picked on',
    pickedOnHint: 'Leave it as today unless you picked it earlier.',
    modeLegend: 'What about the amount already listed?',
    modeAdd: 'Add to it. Days left count from {date}.',
    modeAddNoDate: 'Add to it',
    modeReplace: 'Replace it. The earlier pick is treated as used up.',
    modeRequired: 'Choose whether to add to the amount listed or replace it.',
    // Nothing listed needs no notice, so 'nothing-listed' has no line here.
    replaceOnly: {
      'not-ready-before': 'The amount listed was not ready yet, so this replaces it.',
      'past-keeps-before':
        'The amount listed is past the days you said it keeps, so this replaces it.',
      'no-amount-picked':
        'With no amount entered, this replaces the {amount} listed with "amount not entered".',
      'unit-differs': 'The amount listed is in a different unit, so this replaces it.',
      'weight-differs':
        'The amount listed has a different weight for each one, so this replaces it.',
    },
    replaceDate: 'The earlier pick is treated as used up. Days left count from {date}.',
    tooMuch: 'Together that is more than 100,000 {units}. Replace the amount instead.',
    save: 'Save harvest',
    cancel: 'Cancel',
    saved: 'Saved: {crop}, {amount}.',
  },
  pantryForm: {
    addTitle: 'Add to pantry',
    editTitle: 'Edit {item}',
    name: 'Item',
    nameHint: 'For example, rolled oats or tinned tomatoes.',
    amount: 'Amount (optional)',
    amountHint:
      'Leave it empty if you have some but have not measured it. Enter 0 when it has run out.',
    unitLegend: 'Unit',
    save: 'Save',
    cancel: 'Cancel',
    remove: 'Remove item',
    removeConfirm: 'Remove {item} from the pantry?',
    removeYes: 'Remove',
    removeNo: 'Keep it',
    duplicate: '{item} is already in the pantry.',
    editExisting: 'Edit {item}',
  },
  errors: {
    digitsOnly: 'Type digits only, without commas, such as 1200 or 2.5.',
    decimals: 'Use at most two decimal places, such as 2.5.',
    gramsPerUnitRange: 'Enter a weight above 0 and up to 5,000 grams, or leave it empty.',
    pantryAmountRange: 'Enter an amount from 0 to 100,000, or leave it empty.',
    dateFormat: 'Enter a date.',
    dateFuture: 'The date cannot be after today.',
    dateTooEarly: 'Enter a date from the year 2000 on.',
    saveFailed: 'This could not be saved. Nothing was changed. Try again.',
  },
  photo: {
    legend: 'Photo',
    savesAlone: 'Photo changes save straight away.',
    saveFirst: 'Save or cancel your changes first, then add a photo.',
    add: 'Add a photo',
    replace: 'Replace photo',
    remove: 'Remove photo',
    removeConfirm: 'Remove this photo? Photos are not in backups, so it cannot be brought back.',
    removeYes: 'Remove photo',
    removeNo: 'Keep it',
    removed: 'Photo removed.',
    note: 'Photos stay on this phone. The location and camera details inside a photo are removed from the copy the app keeps. The original in your gallery or camera app is not changed. Photos are not in backups or in anything the app sends.',
    preparing: 'Getting the photo ready…',
    kept: 'Photo kept on this phone.',
    alt: 'Photo of {crop}',
    errors: {
      'file-too-large':
        'This photo file is too big (over 30 MB). Pick a smaller one, or take it again with the camera.',
      'too-many-pixels': 'This photo is too big for the phone to resize. Pick a smaller one.',
      unreadable:
        'This photo could not be read. Try another one, or take it again with the camera.',
      'output-too-large': 'This photo could not be made small enough to keep. Try another one.',
      'not-cleaned':
        'The details stored inside this photo could not be removed, so it was not kept.',
    },
  },
} as const;

// ---- Item 20: recipes ----

/**
 * The recipe screens (checklist item 20; HS-24, HS-39; DOC_REVIEW C01, C32, C43, C70, C102,
 * C107). Figures, badges, the footer and allergen words are item 18's (foods): a recipe adds no
 * wording for an unknown figure, no badge word and no footer (item 18–20 contract 4). Nothing here
 * names a data source or attributes anything to the Heart Foundation (C60, C97), and no string
 * says a recipe is healthy, safe, allergen-free or fits a ceiling.
 */
export const recipes = {
  routeTitles: {
    recipes: 'Recipes',
    recipe: 'Recipe',
  },
  foodLink: {
    cardLabel: 'Meals',
    title: 'Recipes',
    detail: '{count} recipes, with a silverbeet week',
  },
  list: {
    intro:
      'Recipes written for this app: cholesterol-conscious, and built around silverbeet, other greens and everyday New Zealand proteins. Each recipe’s figures are added up from its ingredients’ food values; a figure the app does not have yet reads “not known”.',
    sections: {
      week: 'Silverbeet week',
      dinners: 'Dinners',
      snacks: 'Snacks',
      other: 'Breakfast and lunch',
      ownOther: 'Your other recipes',
    },
    weekHint:
      'Seven dinners that put silverbeet first, one for each day of a week. Day 2 uses chicken cooked on day 1.',
    weekMedicines:
      'Eating a lot more leafy greens than usual can matter for some medicines. If you take regular medicine, ask your pharmacist or GP before a big change.',
    dayLabel: 'Day {day}',
    serves: 'Serves {serves}',
    servesTime: 'Serves {serves} · About {minutes} min',
    readFailed: 'The recipes could not be read. Reload the app to try again.',
    dataFailed: 'The recipes could not be loaded. Reload the app to try again.',
  },
  chips: {
    style: {
      keto: 'Keto',
      'moderate-low-carb': 'Moderate low-carb',
      balanced: 'Balanced',
    },
    styleWritten: {
      keto: 'Written for keto',
      'moderate-low-carb': 'Written for moderate low-carb',
      balanced: 'Written for balanced eating',
    },
    carbsNotWorkedOut: 'Carbs not worked out',
    heartSmart: 'Heart-smart',
    flagged: 'More saturated fat',
    yourVersion: 'Your version',
    allergenConflict: 'Contains {allergens}',
    checkLabels: 'Check labels for allergens',
    glutenHousehold: 'Contains a gluten cereal',
    disliked: 'Has a food you do not want suggested',
    hidden: 'Hidden from suggestions',
  },
  labels: {
    off: 'Keto labels are not shown because of what you told the app about {reasons}.',
    gatesFailed:
      'Keto labels are not shown because your readiness answers could not be read. Reload the app to try again.',
    prescriberCheck:
      'Low-carb eating can change how diabetes medicines act and can cause low blood sugar. Check with your prescriber before you use these recipes for low-carb eating.',
  },
  detail: {
    atAGlance: 'At a glance',
    makesTerm: 'Makes',
    timeTerm: 'Time',
    notFound:
      'This recipe is not in the app any more. It may have been taken out in an app update, or your version of it was removed.',
    allRecipes: 'All recipes',
    makes: '{serves} serves',
    makesOne: '1 serve',
    time: 'About {minutes} minutes',
    yourVersionOf: 'Your version of {title}.',
    seeOriginal: 'See the original recipe',
    copyExists: 'You have your own version of this recipe.',
    openVersion: 'Open your version',
    methodNote:
      'The method is the original recipe’s, so it may still name an ingredient you swapped.',
    pregnancyNote:
      'If you are pregnant or breastfeeding, ask your midwife or GP which foods to take care with, including leftovers and cold cooked meat.',
  },
  style: {
    written: {
      keto: 'Written for keto.',
      'moderate-low-carb': 'Written for moderate low-carb.',
      balanced: 'Written for balanced eating.',
    },
    notYet: 'Its carbs are not worked out yet.',
    knownAbove:
      'Its carbs are not worked out yet, but the part that is known is already {amount} a serve.',
    figures: '{style}: {amount} of net carbs a serve.',
    unknown: 'Net carbs are not worked out yet.',
  },
  ingredients: {
    label: 'Ingredients',
    cookingFor: 'Cooking for',
    cookingForHint: 'This changes the amounts only. The nutrition figures stay those of one serve.',
    fewer: 'One fewer serve',
    more: 'One more serve',
    amountsFor: 'Amounts for {serves} serves, as raw weights unless a line says cooked.',
    amountsForOne: 'Amounts for 1 serve, as raw weights unless a line says cooked.',
    grams: '{grams} g',
    underOneGram: 'under 1 g',
    asWritten: 'As written for {serves} serves: {amount}',
    eggCount: 'About {count} eggs',
    eggCountOne: 'About 1 egg',
    cooked: 'About {grams} cooked',
    inGarden: 'In your garden',
    inSeason: 'In season now',
    swapHint: 'Or use {names}',
    leftoverLine: 'Usually left over from {title}',
    notInApp: 'This ingredient is not in the app any more.',
    nameMissing: 'Ingredient not in the app',
    addsSalt: 'This adds salt.',
  },
  method: {
    label: 'Method',
  },
  leftovers: {
    uses: 'Made with leftovers from {title}. No leftovers? Cook the amounts listed fresh.',
    makes: 'Cook extra for {title}.',
  },
  nutrition: {
    label: 'One serve',
    caption: 'Per serve',
    caption100: 'Per 100 g of the raw ingredients as listed',
    per100Switch: 'Show per 100 g of raw ingredients',
    per100Note: 'Per 100 g of the raw ingredients as listed, not of the cooked dish.',
    plannedLabel: 'Your planned portion',
    plannedServes: 'You planned {serves} serves of this.',
    confidenceHelp: {
      database:
        'Database: no ingredient’s figures are approximate; they come from a published table of food values or a label you entered.',
      estimate: 'Estimate: at least one ingredient’s figures are approximate.',
    },
    neverLabel: 'A recipe is worked out from its ingredients, so it never shows Label.',
  },
  heart: {
    heartSmart:
      'Heart-smart: its fats are mainly unsaturated, and {portion} has at most {capG} g of saturated fat.',
    capReference: 'That limit is a third of the 24 g saturated-fat reference used for food labels.',
    capBudget: 'That limit is a third of today’s {budgetG} g saturated-fat budget.',
    flagged:
      'More saturated fat: {reasons}. That does not take it off the menu; it uses the day’s saturated-fat budget faster.',
    reasons: {
      'butter-cream': 'butter or cream',
      'coconut-fat': 'coconut oil or coconut cream',
      'processed-meat': 'processed meat',
      'fatty-cut': 'a fatty cut of meat',
      'cheese-over-40g': 'more than 40 g of cheese in {portion}',
      'saturated-fat-high': 'more than {capG} g of saturated fat in {portion}',
    },
    portion: {
      serve: 'a serve',
      mine: 'your portion',
    },
    neither: 'No heart-smart label: more than a quarter of its fat is saturated.',
    unknown: 'Heart-smart: not worked out yet, because some figures are missing.',
    budgetNotRead:
      'Heart-smart: not worked out, because today’s saturated-fat budget could not be read.',
    why: 'The cholesterol-conscious default favours olive oil, avocado, nuts and seeds, oily fish, chicken, eggs within six a week, legumes in small amounts, non-starchy vegetables and garden greens.',
  },
  allergens: {
    label: 'Allergens',
    contains: 'Contains {allergens}.',
    noneRecorded: 'No allergens are recorded for its ingredients.',
    checkLabels:
      'Some of its packaged ingredients have allergens that depend on the brand: check their labels.',
    inherited: 'Listed because the recipe this was made from contains {allergens}.',
    conflict: 'This recipe contains {allergens}, which you listed as allergens to avoid.',
    unknownForYou:
      'Its allergens are not fully known, so it is never shown as free of {allergens}. Check the labels of its packaged ingredients.',
    glutenHousehold:
      'Gluten-free household is on in your profile, and this recipe contains {cereals}.',
    source:
      'The allergens shown are those the Food Standards Code requires on food labels, as recorded for each ingredient. Check the label of what you buy.',
  },
  actions: {
    label: 'What next',
    addToPlan: 'Add to plan',
    logAsEaten: 'Log as eaten',
    scale: 'Scale servings',
    substitute: 'Substitute ingredient',
    later: 'Later',
    laterNote: 'This arrives at a later step of the build checklist.',
    removeVersion: 'Go back to the original recipe',
  },
  swap: {
    title: 'Substitute ingredient',
    whichLegend: 'Which ingredient?',
    forLegend: 'Swap {ingredient} for',
    none: 'No swaps are listed for {ingredient}.',
    hiddenAllergenOne: '1 other swap contains an allergen you listed, so it is not shown.',
    hiddenAllergenMany:
      '{count} other swaps contain an allergen you listed, so they are not shown.',
    hiddenDislikeOne: '1 other swap is a food you do not want suggested, so it is not shown.',
    hiddenDislikeMany:
      '{count} other swaps are foods you do not want suggested, so they are not shown.',
    hiddenGlutenFree:
      'Gluten-free swaps are shown when Gluten-free household is on in your profile.',
    hiddenGlutenHouseholdOne:
      '1 other swap contains a gluten cereal, so it is not shown while Gluten-free household is on.',
    hiddenGlutenHouseholdMany:
      '{count} other swaps contain a gluten cereal, so they are not shown while Gluten-free household is on.',
    candidateNone: 'No allergens recorded',
    candidateGarden: 'In your garden',
    amountNote: 'The new ingredient uses the same raw weight. Its cooked weight is not known.',
    use: 'Use {ingredient}',
    chooseFirst: 'Choose a swap',
    cancel: 'Cancel',
    saving: 'Saving your version…',
    done: 'Swapped {from} for {to}. This is your version now; the original recipe stays in the app.',
    doneUpdate: 'Swapped {from} for {to} in your version.',
    undo: 'Undo',
    undone: 'Your version was removed. The original recipe is back.',
    blockedFigures:
      'Swapping an ingredient saves your own version of the recipe. The app can save one only when it has food values for every ingredient in it, and it does not have them yet.',
    blockedMissing:
      'One of this recipe’s ingredients is not in the app any more, so it cannot be changed. You can go back to the original recipe.',
    notAllowed: 'That swap is no longer offered. Nothing was changed.',
    failed: 'The swap could not be saved. Nothing was changed.',
  },
  remove: {
    confirmTitle: 'Go back to the original recipe?',
    confirmBody:
      'Your version is removed and the original recipe takes its place, with its own ingredients, allergens and figures.',
    confirm: 'Remove my version',
    keep: 'Keep my version',
    removing: 'Removing your version…',
    done: 'Your version was removed. This is the original recipe.',
    inPlan: 'Your version is in your meal plan. Change those meals first, then try again.',
    failed: 'Your version could not be removed. Nothing was changed.',
  },
} as const;

// ---- Item 22: the seven-day planner ----

/**
 * The seven-day planner (item 22 design section 4.2; UX_SCREENS 3a, 3b; HS-R18, HS-R20, P41,
 * HS-16, NN-05). Neutral wording: no "left" energy, no allergen-free or health claims, no prices.
 * Under plain figures the "not filled" lines name no target and no figure (V40). Placeholders are
 * filled with fillTemplate; numbers go through item 18's formatNumber.
 */
export const planner = {
  routeTitle: 'Plan',
  slots: {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    meal1: 'First meal',
    snack: 'Snack',
    snackAtFive: '5 pm snack',
    mainMeal: 'Main meal',
    dinner: 'Dinner',
  },
  slotsLower: {
    breakfast: 'breakfast',
    lunch: 'lunch',
    meal1: 'first meal',
    snack: 'snack',
    snackAtFive: '5 pm snack',
    mainMeal: 'main meal',
    dinner: 'dinner',
  },
  dayNames: { today: 'Today', tomorrow: 'Tomorrow' },
  portion: {
    half: 'Half a serve',
    one: '1 serve',
    many: '{serves} serves',
    cookingFor: 'cooking for {count}',
    joined: '{portion} · {cookingFor}',
  },
  screen: {
    readFailed: 'The meal plan could not be read. Reload the app to try again.',
    dataFailed:
      'The recipes could not be loaded, so the meal plan cannot be shown. Reload the app to try again.',
  },
  week: {
    label: 'Meal plan',
    heading: 'Week of {date}',
    intro: 'Tap a day to choose its meals.',
    previous: 'Previous week',
    next: 'Next week',
    thisWeek: 'This week',
    today: 'Today',
    past: 'Past day',
    nothingPlanned: 'Nothing planned yet',
    mealSummary: '{slot}: {title}',
    readOnly: 'This week has passed. Its plan is kept as it was.',
    chips: {
      underFloor: 'Under the energy floor',
      energyNotKnown: 'Energy not known',
      notCountedOne: '1 meal not counted',
      notCountedMany: '{count} meals not counted',
      snackAdded: '5 pm snack added',
    },
    fill: 'Fill empty meals',
    copy: 'Copy to the following week',
    noFillFigures:
      "Food figures are not loaded yet, so the planner cannot check a day's energy and does not fill days by itself. You can still choose meals yourself.",
    noFillLabels:
      'With allergens listed in your profile, recipes whose allergens are not fully known are never planned automatically. You can add them yourself after a label check.',
    noFillLabelsGluten:
      'With Gluten-free household on, shared dinners whose allergens are not fully known are never planned automatically. You can add them yourself after a label check.',
    noFillNoEstimate:
      'The planner does not fill or copy days by itself while the app has no energy estimate for you. You can choose every meal yourself.',
  },
  household: {
    // UX_SCREENS 3a, word for word with {count} = 3 (docFidelity).
    banner: 'Dinner for {count}; my portion shown separately.',
    solo: 'Cooking dinner for others too? Set the number of people in your profile.',
  },
  day: {
    windowLabel: 'Eating window',
    window: 'Eat {range}.',
    noFastingPlan:
      'No fasting plan is chosen, so this day plans breakfast, lunch and dinner, and a snack if you want one.',
    fastingOff:
      'Fasting is off, so this day plans breakfast, lunch and dinner, and a snack if you want one.',
    oneMeal:
      "One meal on this day. It has to carry the day's protein, about {protein} g. If it cannot, it's fine to add the 5 pm snack or widen the window.",
    addSnack: 'Add a 5 pm snack to this day',
    snackAdded: '5 pm snack added for this day. Eat {range}.',
    // During a stop-sign pause no window time is named (F20; DECISIONS 2026-10-22).
    snackAddedNoRange: '5 pm snack added for this day.',
    removeSnack: 'Remove the 5 pm snack',
    removeSnackFirst: 'To remove the 5 pm snack, remove the snack meal first.',
    sitting: {
      dinner: "This day's dinner carries {protein} g protein.",
      dinnerAtLeast: "This day's dinner carries at least {protein} g protein.",
      dinnerUnknown: "This day's dinner: protein unknown.",
      meal: "This day's meal carries {protein} g protein.",
      mealAtLeast: "This day's meal carries at least {protein} g protein.",
      mealUnknown: "This day's meal: protein unknown.",
    },
    refluxNote:
      'A reflux symptom was logged recently. An earlier meal or a split meal may suit this day better.',
    mealsLabel: 'Meals',
    nothingPlanned: 'Nothing planned.',
    choose: 'Choose a meal',
    change: 'Change',
    remove: 'Remove',
    addSnackMeal: 'Add a snack',
    outsideLabel: "Not counted in this day's figures",
    outsideNote:
      "These meals were planned before this day's eating window or meals changed. They are not counted in the day's figures, and they stay until you remove them.",
    past: 'This day has passed. Its plan is kept as it was.',
    tooFar: 'Plans open one week ahead, so this day cannot be planned yet.',
    removeConfirm: 'Remove {title} from {day}?',
    removeYes: 'Remove',
    removeNo: 'Keep it',
    removing: 'Removing…',
    removed: 'Removed {title}.',
    added: 'Added {title}.',
    saved: 'Saved.',
    notFound: 'This day could not be found.',
    weekLinkDetail: 'Back to the week',
    usesGarden: 'Uses {foods} from your garden',
    usesLeftovers: 'Uses leftovers from {title}',
    recipeMissing: 'A recipe that is not in the app any more',
  },
  figures: {
    label: 'Planned food',
    intro: 'Figures for your own portions. Cooking for more people never changes them.',
    none: 'Nothing planned yet, so there are no figures for this day.',
    // A past day (item 22 review): no "yet".
    nonePast: 'Nothing was planned for this day, so there are no figures for it.',
    notLoaded:
      'Food figures are not loaded yet, so the app cannot tell whether this day reaches your energy floor or your protein target.',
    notLoadedPlain: "Food figures are not loaded yet, so the app cannot add up this day's food.",
  },
  picker: {
    titleChoose: 'Choose {slot} for {day}',
    titleChange: 'Change {slot} for {day}',
    suggestions: 'Suggestions',
    gardenFirst: 'Recipes that use two or more foods ready in your garden come first.',
    gardenFirstOne: 'Recipes that use food ready in your garden come first.',
    checkLabelsLegend: 'Check labels first',
    checkLabelsNote:
      'The allergens of these recipes are not fully known. Picking one asks you to check the labels before it is added.',
    showAll: 'Show all {count}',
    none: 'No recipe fits this meal with your current settings.',
    recipesLink: 'All recipes',
    notShown: {
      allergenOne: '1 recipe with an allergen you listed is not shown.',
      allergenMany: '{count} recipes with an allergen you listed are not shown.',
      householdGlutenOne:
        '1 recipe with gluten cereals is not shown for a meal shared in a Gluten-free household.',
      householdGlutenMany:
        '{count} recipes with gluten cereals are not shown for a meal shared in a Gluten-free household.',
      dislikeOne: '1 recipe with a food you do not want suggested is not shown.',
      dislikeMany: '{count} recipes with a food you do not want suggested are not shown.',
      hiddenOne: '1 recipe you hid is not shown.',
      hiddenMany: '{count} recipes you hid are not shown.',
      ceilingOne: '1 recipe with more net carbs than your carb ceiling on its own is not shown.',
      ceilingMany:
        '{count} recipes with more net carbs than your carb ceiling on their own are not shown.',
      oneMealOne: '1 light dish is not offered as the only meal of a one-meal day.',
      oneMealMany: '{count} light dishes are not offered as the only meal of a one-meal day.',
    },
    portionLabel: 'Your portion',
    portionHint: 'How many serves of the recipe you eat.',
    portionFewer: 'Half a serve less',
    portionMore: 'Half a serve more',
    cookingForLabel: 'Cooking for',
    add: 'Add to {day}',
    save: 'Save changes',
    cancel: 'Cancel',
    saving: 'Saving…',
    replaces: 'This replaces {title}.',
    current: 'Planned now: {title}',
  },
  // P41 (contract 10 rule 3): the label check's wording is item 22's.
  labelCheck: {
    title: 'Check the labels first',
    listIntro: 'Check these labels for {allergens}:',
    once: 'This check covers this one meal. The app asks again each time this recipe is added.',
    confirm: 'I have checked these labels',
    cancel: 'Cancel',
  },
  conflict: {
    title: 'This recipe contains an allergen you listed',
    confirm: 'Add it anyway',
    cancel: 'Cancel',
  },
  refused: {
    pastDay: 'This day has passed, so its plan cannot be changed.',
    futureDay: 'Plans open one week ahead, so this day cannot be planned yet. Nothing was changed.',
    slot: "This meal is not in this day's eating window now. Nothing was changed.",
    recipeMissing: 'This recipe is not in the app any more. Nothing was changed.',
    allergen: 'This recipe contains {allergens}, which you listed. Nothing was changed.',
    labelCheck:
      'Your allergen list or this meal changed, so this recipe needs a label check first. Nothing was changed.',
    portion: 'Choose a portion from half a serve to 4 serves.',
    failed: 'This could not be saved. Nothing was changed.',
  },
  reasons: {
    energyNotKnownAim:
      'The planner did not fill this day: the energy in some of its meals is not known yet, so it cannot check that the day reaches its energy target.',
    energyShort:
      "The planner did not fill this day: the recipes that fit came in under the day's energy target.",
    proteinNotKnown:
      "The planner did not fill this day: the protein in some of its meals is not known yet, so it cannot check the day's protein.",
    proteinShort:
      "The planner did not fill this day: the recipes that fit came in under the day's protein, about {protein} g.",
    plainNotKnown:
      'The planner did not fill this day: some figures for its meals are not known yet. You can choose its meals yourself.',
    plainNotFilled:
      'The planner did not fill this day with the recipes that fit. You can choose its meals yourself.',
    oneMealShort:
      "The planner did not fill this day: one meal could not carry the day's protein and energy. Add the 5 pm snack for this day, then try again.",
    oneMealShortNoSnack:
      "The planner did not fill this day: one meal could not carry the day's protein and energy. It's fine to widen the window in your eating schedule.",
    oneMealDish:
      'The planner did not fill this day: a light dish cannot be the only meal of this day.',
    oneMealReflux:
      "The planner did not fill this day: after a reflux symptom it plans no more than one serve as a day's only meal. A split meal or the 5 pm snack may suit this day better.",
    // During a stop-sign pause nothing offers an option that moves the window (F20).
    oneMealRefluxPause:
      "The planner did not fill this day: after a reflux symptom it plans no more than one serve as a day's only meal.",
    carbsNotKnown:
      'The planner did not fill this day: the carbs in some of its meals are not known yet, so it cannot check the day against your carb ceiling.',
    carbsOver:
      'The planner did not fill this day: the recipes that fit came to more net carbs than your carb ceiling.',
    satFatNotKnown:
      'The planner did not fill this day: the saturated fat in some of its meals is not known yet, so it cannot check the day against your saturated-fat budget.',
    satFatOver:
      'The planner did not fill this day: the recipes that fit came to more saturated fat than your saturated-fat budget.',
    noCandidates:
      'The planner did not fill this day: no recipe fits its meals with your current settings.',
    notWantedDay:
      'The planner did not fill this day: {title} is now hidden or has a food you do not want suggested.',
    labelCheck:
      'Not copied: {title} needs a label check for your allergens. Add it yourself if you want it.',
    allergen: 'Not copied: {title} contains {allergens}, which you listed.',
    recipeMissing: 'Not copied: a recipe planned that day is not in the app any more.',
    portion: 'Not copied: a portion planned that day is more than 4 serves.',
    hasMeals: 'Not copied: that day already has meals.',
    pastDay: 'That day has passed.',
    slotSkipped: "{slot} was not copied: it is not in that day's eating window.",
    notWanted: '{title} was not copied: it is hidden or has a food you do not want suggested.',
  },
  fill: {
    title: 'Fill empty meals',
    intro:
      'The planner fills only empty meals on days that have not passed, and changes nothing you planned. Nothing is saved until you choose Use this plan.',
    dayProposed: '{day}: {meals}',
    meal: '{slot}: {title}, {portion}',
    dayRefused: '{day}: {reason}',
    proposedHeading: 'Meals to add',
    refusedHeading: 'Days not filled',
    use: 'Use this plan',
    cancel: 'Cancel',
    saving: 'Saving…',
    nothing: 'Nothing could be filled.',
    doneOne: 'Filled 1 day.',
    doneMany: 'Filled {count} days.',
    changed: 'Some days changed before they were saved, so they were not filled.',
  },
  copy: {
    title: 'Copy to the following week',
    intro:
      "Each day's meals are copied to the same day of the following week, only where that day has no meals yet. Each day is checked again first.",
    dayProposed: '{day}: {meals}',
    dayRefused: '{day}: {reason}',
    proposedHeading: 'Meals to copy',
    refusedHeading: 'Days not copied',
    use: 'Copy',
    cancel: 'Cancel',
    saving: 'Copying…',
    nothing: 'Nothing could be copied.',
    doneOne: 'Copied 1 day.',
    doneMany: 'Copied {count} days.',
    changed: 'Some days changed before they were saved, so they were not copied.',
  },
  budget: {
    label: 'Budget',
    noteLabel: 'Budget note',
    noteHint: "A note for yourself about the week's shopping. The app shows it as you typed it.",
    yourNote: 'Your note: {note}',
    empty: 'No budget note yet.',
    noPrices: 'The planner does not use prices, so it shows no costs.',
    gardenMealsOne: '1 planned meal uses food from your garden.',
    gardenMealsMany: '{count} planned meals use food from your garden.',
    leftoverMealsOne: '1 planned meal reuses leftovers.',
    leftoverMealsMany: '{count} planned meals reuse leftovers.',
    save: 'Save note',
    clear: 'Clear note',
    saved: 'Saved.',
    tooLong: 'Use at most 200 characters.',
  },
  hidden: {
    cardLabel: 'Hidden recipes',
    intro: 'The planner does not suggest these recipes. They stay in the recipe list.',
    none: 'No recipes are hidden.',
    showNamed: 'Suggest {title} again',
    hide: 'Hide from suggestions',
    unhide: 'Suggest again',
    hiddenNote: "Hidden from the planner's suggestions.",
  },
  addFromRecipe: {
    title: 'Add to plan',
    dayLegend: 'Day',
    mealLegend: 'Meal',
    noMeal: "This recipe is not planned for any meal in that day's eating window.",
    added: "Added to {day}'s {slot}.",
    openDay: "Open {day}'s plan",
  },
} as const;

/** All sections, for scanning and review. */
export const healthCopy = {
  helpNumbers,
  general,
  alcohol,
  privacy,
  transfer,
  onboarding,
  readiness,
  profile,
  schedule,
  garden,
  weight,
  move,
  moveScreen,
  fasting,
  reflux,
  targets,
  today,
  reminders,
  about,
  // Item 18.
  foods,
  // Item 19.
  gardenScreen,
  // Item 20.
  recipes,
  // Item 22.
  planner,
} as const;
