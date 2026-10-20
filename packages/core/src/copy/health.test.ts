import { describe, expect, it } from 'vitest';
import { BACKUP_ERROR_CODES } from '../storage/backup/errors';
import { BACKUP_TABLES } from '../storage/tables';
import { ACTIVITY_FACTORS } from '../energy/energyEstimate';
import { PRE_CHECK_KEYS } from '../exercise/preCheck';
import { START_PROBLEM_CODES } from '../exercise/start';
import { WEEK_PROBLEM_CODES } from '../exercise/week';
import { HEAT_WATER_ML_PER_HOUR } from '../move/display';
import { GATED_FEATURES, READINESS_REASON_IDS } from '../readiness/gates';
import { USER_ALLERGENS } from '../storage/allergens';
import { FLOOR_KJ, KICKSTART_MAX_DEFICIT_PCT, KICKSTART_NET_CARBS_G } from '../storage/limits';
import { READINESS_QUESTION_IDS } from '../storage/readiness';
import { TARGET_COPY_FACTS } from '../targets/copyFacts';
import { DIET_MODES } from '../targets/dietModes';
import {
  about,
  alcohol,
  fasting,
  general,
  healthCopy,
  helpNumbers,
  move,
  moveScreen,
  onboarding,
  privacy,
  profile,
  readiness,
  reflux,
  reminders,
  schedule,
  targets,
  today,
  transfer,
  weight,
} from './health';
import { fillTemplate, joinList } from './template';
import { TRANSFER_SECTION_RULES } from './transferRules';

/** Every string inside a copy section, with its path for readable failures. */
function strings(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  }
  return [];
}

/**
 * Extra rules per section, on top of the repository-wide banned phrases (tools/scans/rules.ts).
 * Every section must be listed here, so a new section cannot skip review.
 */
const SECTION_RULES: Record<keyof typeof healthCopy, readonly RegExp[]> = {
  helpNumbers: [],
  general: [
    /\byou(?:'re|\s+are)\s+safe\b/i,
    // The privacy note says plainly what happens to the records, with no blanket promises.
    /\b(?:100\s*%|completely|totally|fully|perfectly)\s+(?:private|secure|safe|anonymous)\b/i,
    /\banonymous(?:ly)?\b/i,
    /\bsecure\b/i,
  ],
  // HEALTH_SAFETY.md section 5, HS-19, NN-09, UX 5 "deliberately absent".
  alcohol: [
    /\bstreaks?\b/i,
    /\bbadges?\b/i,
    /\btargets?\b/i,
    /\blimits?\b/i,
    /\ballowance\b/i,
    /\bgoals?\b/i,
    /\bwell\s+done\b/i,
    /\bcongrat\w*/i,
    /\bproud\b/i,
    /\bsafe\s+(?:level|amount|limit)\b/i,
    /\byou\s+should\s+stop\b/i,
    // Item 13: help after a change is never played down (the notice's "Why am I seeing this?").
    /\b(?:too\s+late|works\s+best\s+before|only\s+before|no\s+point)\b/i,
    // Item 21 (C11): alcohol energy is never a budget, and nothing is "left" or "remaining".
    /\bbudget\b/i,
    /\bleft\b/i,
    /\bremaining\b/i,
  ],
  // HEALTH_SAFETY.md section 7 (privacy as a safety feature); storage spec sections 10–12.
  privacy: [
    // Say plainly what happens to the records, with no blanket promises.
    /\b(?:100\s*%|completely|totally|fully|perfectly|always)\s+(?:private|secure|safe|anonymous|protected)\b/i,
    /\banonymous(?:ly)?\b/i,
    /\bsecure(?:ly)?\b/i,
    /\byou(?:'re|\s+are)\s+safe\b/i,
    // D21: only the owner can confirm a backup file exists, so nothing claims one was saved.
    /\bbackups?\s+(?:was\s+|is\s+|has\s+been\s+)?(?:saved|complete|successful|done)\b/i,
    /\bbacked\s+up\b/i,
    /\bsaved\s+successfully\b/i,
    // The browser cannot tell whether a download saved, so no file is said to be saved (wording review).
    /\byou\s+saved\b|\bsaved\s+at\b/i,
    // A forgotten backup password cannot be recovered, and a backup is the only other copy.
    /\b(?:we|support|the\s+app)\s+can\s+(?:recover|reset)\b/i,
    /\breset\s+(?:your|the)\s+password\b/i,
    /\b(?:cannot|can't|never)\s+(?:be\s+)?lost\b/i,
  ],
  // Item 13 (design section 5.8): the readiness answers only switch features off, so nothing in
  // the first-run copy says a feature is safe, suits the person, or that they are cleared for it.
  onboarding: [/\bsafe(?:ly)?\b/i, /\bsuits?\s+you\b/i],
  readiness: [
    /\bsafe(?:ly)?\b/i,
    /\bsuits?\s+you\b/i,
    /\bcleared\b/i,
    /\bdiagnos\w*/i,
    /\byou\s+can\s+(?:fast|diet|train)\b/i,
    /\brisk[\s-]+free\b/i,
  ],
  profile: [
    /\bsafe(?:ly)?\b/i,
    /\b(?:ideal|target|dream|perfect|normal|healthy)\s+weight\b/i,
    /\blos(?:e|es|ing)\b/i,
  ],
  schedule: [
    /\bsafe(?:ly)?\b/i,
    /\bstreak\w*/i,
    /\b(?:penalt\w*|fail\w*|cheat\w*)\b/i,
    /\bmust\s+fast\b/i,
  ],
  // C57: fixed copy never claims a homegrown weight.
  garden: [/\d\s*g\b/i],
  // HEALTH_SAFETY.md section 2 (weight); REQUIREMENTS 3A; HS-21, HS-26.
  weight: [
    // No celebration of speed and no punishment of rebounds.
    /\b(?:great\s+(?:job|work|progress)|well\s+done|congrat\w*|amazing|awesome|keep\s+it\s+up|on\s+track|ahead\s+of|behind\s+(?:schedule|plan)|cheat\w*|bad\s+day|proud)\b/i,
    /(?<!\bnot\s)\bfail(?:s|ed|ing|ure|ures)?\b/i, // "not failure" only
    /(?<!\bnot\s(?:a\s)?)\bpromise[sd]?\b/i, // "not a promise" only (HS-21, HS-26)
    /(?<!\bnot\s(?:a\s)?)\btargets?\b/i, // never a target (HS-26)
    /(?<!long-term\s)\bgoals?\b/i, // every goal is labelled long-term (HS-21)
    /\bideal\b/i, // no "ideal weight"
    /\bunderweight\b/i, // the low-weight line names the BMI, not a label
    /\bdeadline\b/i,
    /\byou\s+(?:should|must)\b/i,
  ],
  // Item 26 (HEALTH_SAFETY.md sections 1 and 6): nothing is promised safe, rest is never a failure,
  // running is never required, nothing is "made up" or "caught up", and no energy-burned figure.
  move: [
    /\bsafe\b/i,
    /\bstreaks?\b/i,
    /\bmissed\b/i,
    /\bfail(?:ed|s|ing|ure)?\b/i,
    /\bbehind\b/i,
    /\blazy\b/i,
    /\bpush\s+through\b/i,
    /\bno\s+pain,?\s+no\s+gain\b/i,
    /\b(?:must|have\s+to|should)\s+(?:run|jog)\b/i,
    /\bcatch(?:ing)?\s+up\b/i,
    /\bmake\s+up\s+for\b/i,
    /\bburn(?:s|ed|ing)?\b/i,
  ],
  // Item 27 (HEALTH_SAFETY.md sections 1 and 6): nothing is promised safe, no day is missed or
  // failed, rest is never skipping, nothing is made up or caught up, no running or training is
  // required, and no scores, targets or goals.
  moveScreen: [
    /\bsafe(?:ly)?\b/i,
    /\bstreaks?\b/i,
    /\bmissed\b/i,
    /\bfail(?:ed|s|ing|ure)?\b/i,
    /\bbehind\b/i,
    /\blazy\b/i,
    /\bskip(?:s|ped|ping)?\b/i,
    /\bcatch(?:ing)?\s+up\b/i,
    /\bmake\s+up\s+for\b/i,
    /\bburn(?:s|ed|ing)?\b/i,
    /\b(?:must|have\s+to|should)\s+(?:run|jog|train|exercise)\b/i,
    /\bpush\s+through\b/i,
    /\bwell\s+done\b/i,
    /\bcongrat\w*/i,
    /\btargets?\b/i,
    /\bgoals?\b/i,
    /\byou\s+(?:didn['’]t|did\s+not|haven['’]t|have\s+not)\b/i,
    /\bdiagnos\w*/i,
  ],
  // HEALTH_SAFETY.md section 3, HS-02, HS-18, C16, C63: no streak loss, no penalty or reward, no
  // insisting on a fast. "broken fast" is not banned here: the required 1e line ("That's not a
  // broken fast.") lives in item 13's schedule section, and FL-12 is checked on the rendered card.
  fasting: [
    /\b(?:los(?:e|es|t|ing)|break(?:s|ing)?|broke|broken|reset(?:s|ting)?|end(?:s|ed|ing)?|ruin\w*|kill\w*)\s+(?:your\s+|the\s+|a\s+|this\s+)?streak\b|\bstreak\s+(?:is\s+|was\s+|has\s+been\s+)?(?:lost|broken|reset|ended|over|gone)\b/i,
    /\b(?:cheat\w*|fail\w*|guilt\w*|penalt\w*|slip(?:s|ped|ping)?|willpower|disciplin\w*|badges?|reward\w*|perfect\w*|well\s+done|congrat\w*|proud)\b/i,
    /\b(?:must|have\s+to|need\s+to|should)\s+(?:keep\s+)?fast\w*\b/i,
    /\b(?:don['’]t|do\s+not|never)\s+eat\b/i,
    /\b(?:keep|stay)\s+(?:fasting|on\s+(?:your|the)\s+fast)\b/i,
    /\b(?:push|power|tough\s+it)\s+(?:through|on|out)\b/i,
    /\b(?:extend|lengthen|longer)\s+(?:your\s+|the\s+|this\s+)?fast\b/i,
    /\bmake\s+up\s+for\b/i,
    /\byou(?:['’]re|\s+are)\s+safe\b/i,
  ],
  // HEALTH_SAFETY.md section 3: the app does not diagnose and recommends no medicine (C47).
  reflux: [
    /\byou\s+(?:have|may\s+have|probably\s+have|might\s+have)\s+(?:reflux|GERD|GORD|oesophagitis|esophagitis|an?\s+ulcer|a\s+hernia|angina|a\s+heart\s+attack)\b/i,
    /\b(?:antacids?|omeprazole|pantoprazole|lansoprazole|esomeprazole|PPIs?|gaviscon|ranitidine|famotidine)\b/i,
    /\bcur(?:e|es|ed|ing)\b/i,
    /\byou(?:['’]re|\s+are)\s+safe\b/i,
  ],
  // Item 21 (HEALTH_SAFETY section 4, HS-09, NU-05, C11, C16): neutral indicator wording; no
  // "left" or "remaining" energy, and nothing that judges intake.
  targets: [
    /\bbad\b/i,
    /\bfail\w*/i,
    /\bcheat\w*/i,
    /\bnaughty\b/i,
    /\bguilt\w*/i,
    /\bsinful\b/i,
    /\bblew\b|\bblown\b/i,
    /\bexceed\w*/i,
    /\bwarning\b/i,
    /\bdanger\w*/i,
    /\bleft\b/i,
    /\bremaining\b/i,
    /\bspare\b/i,
    /\bideal\b/i,
    /\bstarv\w*/i,
    /\bpunish\w*/i,
    /\bstrict\w*/i,
    /\bmust\b/i,
  ],
  // Item 16 (design 3.6): no pressure to fast, no scores, no steps or water goals.
  today: [
    /\bstreaks?\b/i,
    /\bwell\s+done\b/i,
    /\bcongrat\w*/i,
    /\bgoals?\b/i,
    /\btargets?\b/i,
    /\bsafe(?:ly)?\b/i,
    /\bkeep\s+(?:going|fasting|it\s+up)\b/i,
    /\bdon['’]t\s+(?:eat|break|give\s+up)\b/i,
    /\bbroken?\b/i,
    /\bfail\w*/i,
    /\bbad\b/i,
    /\bcheat\w*/i,
    /\bshould\b/i,
    /\bmust\b/i,
  ],
  // No supplement forms (HEALTH_SAFETY section 4) and no reassurance.
  reminders: [
    /\bstreaks?\b/i,
    /\bcongrat\w*/i,
    /\bwell\s+done\b/i,
    /\bguarantee\w*/i,
    /\byou(?:['’]re|\s+are)\s+safe\b/i,
    /\b(?:tablets?|pills?|capsules?|powders?|sachets?)\b/i,
  ],
  // The general rules, and no food data source by name until item 18 records the licence (C97,
  // NU-09). Case-sensitive on purpose: these are proper names. Item 18 replaces this rule.
  about: [
    /\byou(?:'re|\s+are)\s+safe\b/i,
    /\b(?:100\s*%|completely|totally|fully|perfectly)\s+(?:private|secure|safe|anonymous)\b/i,
    /\banonymous(?:ly)?\b/i,
    /\bsecure\b/i,
    /Food Composition Database|\bFCDB\b|\bUSDA\b|FoodData|New Zealand Food/,
  ],
  // Items 30 and 31 (HEALTH_SAFETY.md section 7): one list, shared with the pairing-check scan.
  transfer: TRANSFER_SECTION_RULES,
};

describe('health copy', () => {
  it('every section has declared rules', () => {
    expect(Object.keys(SECTION_RULES).sort()).toEqual(Object.keys(healthCopy).sort());
  });

  for (const [section, rules] of Object.entries(SECTION_RULES)) {
    it(`${section} copy obeys its section rules`, () => {
      const found = strings(healthCopy[section as keyof typeof healthCopy], section).flatMap(
        ([path, text]) =>
          rules.filter((r) => r.test(text)).map((r) => `${path}: ${String(r)} in "${text}"`),
      );
      expect(found).toEqual([]);
    });
  }

  it('alcohol copy says no alcohol use is risk-free (NN-09)', () => {
    expect(alcohol.noRiskFreeLevel).toBe('No alcohol use is risk-free.');
  });

  it('the first-run notice and help card carry the helpline, text number and 111 (HS-13, HS-20)', () => {
    for (const text of [alcohol.firstRunNotice, alcohol.helpCard]) {
      expect(text).toContain(helpNumbers.alcoholDrugHelpline.number);
      expect(text).toContain(helpNumbers.alcoholDrugHelpline.text);
      expect(text).toContain(helpNumbers.emergency.number);
    }
  });

  it('help numbers match HEALTH_SAFETY.md exactly', () => {
    expect(helpNumbers).toEqual({
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
    });
  });

  it('each tap-to-text row names its service and shows its own text number', () => {
    for (const service of [helpNumbers.alcoholDrugHelpline, helpNumbers.needToTalk]) {
      expect(service.textDetail).toBe(`Text ${service.text}`);
      expect(service.textName).toBe(`${service.name.replace(/\s*\(.*$/, '')} by text`);
    }
  });

  it('the privacy note says records stay on the phone, with no account and no analytics', () => {
    expect(general.privacy).toContain('stay on this phone');
    expect(general.privacy).toContain('Send to laptop');
    expect(general.privacy).toContain('encrypted');
    expect(general.privacy).toContain('no account and no analytics');
  });

  it('the storage status lines are honest: protection never replaces a backup, and checking is never shown as protected (C98, D24)', () => {
    for (const line of [
      privacy.storageStatus.protected,
      privacy.storageStatus.notProtected,
      privacy.storageStatus.unsupported,
    ]) {
      expect(line).toMatch(/A backup is (?:still )?your only (?:other )?copy/);
    }
    expect(privacy.storageStatus.checking).toBe('Checking…');
    expect(privacy.storageStatus.checking).not.toMatch(/protected/i);
    expect(privacy.backupReminder.weakStorage).toBe(
      "This phone has not promised to keep the app's records. A backup is your only other copy.",
    );
  });

  it('export says a forgotten password cannot be recovered, and warns about plain files (C99, D19)', () => {
    expect(privacy.exportBackup.forgottenWarning).toBe(
      'If you forget this password, the backup cannot be opened. Nobody can recover it.',
    );
    expect(privacy.exportBackup.plainWarning).toBe(
      'Anyone who opens this file can read your records.',
    );
    expect(privacy.exportBackup.canYouSeeIt).toBe('Can you see the file?');
  });

  it('every backup error code has exactly one message, and wrong password says nothing was imported (BK-02)', () => {
    expect(Object.keys(privacy.backupErrors).sort()).toEqual([...BACKUP_ERROR_CODES].sort());
    expect(privacy.backupErrors['wrong-password-or-damaged']).toBe(
      'Wrong password, or the file is damaged. Nothing was imported.',
    );
    for (const message of Object.values(privacy.backupErrors)) {
      expect(message).toMatch(/Nothing was (?:imported|changed)\.|then try again\.$/);
    }
  });

  it('templates fill only their named placeholders', () => {
    expect(fillTemplate(privacy.backupCard.lastBackup, { date: '1 January 2000' })).toBe(
      'Last backup made 1 January 2000',
    );
    expect(() => fillTemplate(privacy.backupCard.lastBackup, {})).toThrow(RangeError);
  });

  it('every storage failure screen carries the not-a-medical-device line and every help number (HS-13, D48)', () => {
    const { storageFailure } = privacy;
    expect(storageFailure.notMedicalDevice).toBe(general.about);
    for (const number of [
      helpNumbers.emergency.number,
      helpNumbers.healthline.number,
      helpNumbers.alcoholDrugHelpline.number,
      helpNumbers.alcoholDrugHelpline.text,
      helpNumbers.needToTalk.number,
    ]) {
      expect(storageFailure.helpLine).toContain(number);
    }
    expect(storageFailure['upgrade-failed']).toContain('Save a rescue copy');
  });

  it('every backed-up store has a plain name for the restore confirmation, and nothing else does', () => {
    expect(Object.keys(privacy.storeNames)).toEqual([...BACKUP_TABLES]);
  });

  it('the export and restore steps never claim a backup was saved, and say what a rescue copy is (D21, D22)', () => {
    expect(privacy.exportBackup.saveFile).toBe('Save the backup file');
    expect(privacy.rescue.note).toContain('does not count as a backup');
    expect(privacy.exportBackup.uncheckedNote).toContain('does not count as a backup');
  });

  it('delete-all lists what stays, including saved passwords, the camera permission, backup files and the laptop (HS-30, F10)', () => {
    const stays = privacy.deleteAll.stays.join(' ');
    expect(stays).toContain("If Chrome saved a backup password, remove it in Chrome's settings.");
    expect(stays).toContain("Chrome's Site settings, Camera");
    expect(stays).toContain('Backup files');
    expect(stays).toContain('unpair on your laptop');
    expect(privacy.deleteAll.confirm).toBe('Delete everything on this phone');
  });
});

describe('first-run copy (item 13; U30)', () => {
  it('the notice offers no way to put it off', () => {
    const notice = strings(alcohol.notice, 'alcohol.notice');
    expect(notice.length).toBeGreaterThan(5);
    for (const [path, text] of notice) {
      expect(text, path).not.toMatch(/\b(?:skip|later|not\s+now|dismiss)\b/i);
    }
    expect(alcohol.notice.whyText).toHaveLength(3);
  });

  it('the help card and question 7 carry the weekend wording (C58; AL-09b)', () => {
    expect(alcohol.helpCard).toContain('drinking most days or heavily at weekends');
    expect(readiness.questions.q7).toBe('Do you drink alcohol most days, or heavily at weekends?');
  });

  it('asks exactly the seven questions, with the consequences the tests name (RD-02 to RD-04, C06)', () => {
    expect(Object.keys(readiness.questions)).toEqual([...READINESS_QUESTION_IDS]);
    expect(Object.keys(readiness.ifYes)).toEqual([...READINESS_QUESTION_IDS]);
    for (const part of [
      'hypoglycaemia',
      'can change how diabetes medicines act',
      'Check with your prescriber first',
      'at least 50 g',
    ]) {
      expect(readiness.ifYes.q3).toContain(part);
    }
    expect(readiness.ifYes.q2).toContain('midwife or GP');
    expect(readiness.ifYes.q2).toContain('weight goals');
    expect(readiness.ifYes.q5).toContain('trend is still shown');
  });

  it('the under-18 notice says "may be under 18" and names no fixed age (C24)', () => {
    expect(readiness.ageCheck.birthYearUnder18).toContain('may be under 18');
    expect(readiness.ageCheck.birthYearUnder18).not.toMatch(/\b17\b|\bstill\b/);
  });

  it('the prescriber switch names everything it unlocks, and a confirmation never says features "are on" (C06, E53)', () => {
    for (const part of ['fasting', 'bigger energy deficit (Kickstart)', 'carbs under 50 g']) {
      expect(readiness.confirmations.prescriberAgreed).toContain(part);
    }
    for (const text of Object.values(readiness.confirmed)) expect(text).not.toContain(' are on');
    expect(readiness.confirmed.prescriberAgreed).toContain(`"${readiness.changed.q3}"`);
    expect(schedule.diabetesNote).toContain(`"${readiness.changed.q3}"`);
    expect(readiness.confirmed.gpExerciseDiscussed).toContain(`"${readiness.changed.q6}"`);
  });

  it('the Kickstart hint takes its figures from the core constants', () => {
    expect(profile.kickstartHint).toContain(`${KICKSTART_MAX_DEFICIT_PCT}%`);
    expect(profile.kickstartHint).toContain(`${KICKSTART_NET_CARBS_G} g`);
    expect(FLOOR_KJ).toBe(5000);
    expect(profile.kickstartHint).toContain('5,000 kJ');
  });

  it('the Kickstart line filled with 140 is the UX 1e sentence; the goal hint is long-term and not a promise (HS-21)', () => {
    expect(fillTemplate(schedule.kickstartLine, { proteinG: 140 })).toBe(
      "One meal has to carry about 140 g protein. If a day's dinner can't, the app will offer the 5 pm snack. That's not a broken fast.",
    );
    expect(profile.goalHint).toContain('long-term');
    expect(profile.goalHint).toContain('the four-week chart is not a promise');
  });

  it('the blood-pressure lines use the C102 words; Welcome only says what is switched off', () => {
    for (const text of [...Object.values(readiness.bloodPressure), readiness.ifYes.q4]) {
      expect(text).toContain('blood-pressure medication');
      expect(text).toContain('check with your pharmacist or GP before adding salt');
    }
    expect(readiness.ifYes.q4.endsWith(readiness.bloodPressure.electrolyte)).toBe(true);
    expect(readiness.bloodPressure.stopSign).toContain(helpNumbers.healthline.number);
    expect(onboarding.welcome.next).toContain('switch off');
    expect(onboarding.welcome.next).not.toMatch(/suits you/i);
    expect(general.welcome).toBe(general.about);
  });

  it('every gated feature, reason, activity level and allergen has its words, in order', () => {
    expect(Object.keys(readiness.featureNames)).toEqual([...GATED_FEATURES]);
    expect(Object.keys(readiness.reasonPhrases)).toEqual([...READINESS_REASON_IDS]);
    expect(Object.keys(profile.activity).sort()).toEqual(Object.keys(ACTIVITY_FACTORS).sort());
    expect(Object.keys(profile.allergenNames)).toEqual([...USER_ALLERGENS]);
  });

  it('a feature-off line reads as one sentence with its reasons joined', () => {
    const reasons = joinList(
      [readiness.reasonPhrases['under-18'], readiness.reasonPhrases['under-18-birth-year']],
      readiness.listComma,
      readiness.listAnd,
    );
    expect(
      fillTemplate(readiness.featureOff, { feature: readiness.featureNames.goalSetting, reasons }),
    ).toBe(
      'Weight goal setting is off because of what you told the app about being under 18 and your birth year.',
    );
    expect(joinList([], ', ', ' and ')).toBe('');
    expect(joinList(['a'], ', ', ' and ')).toBe('a');
    expect(joinList(['a', 'b', 'c'], ', ', ' and ')).toBe('a, b and c');
  });
});

describe('Move copy (item 26)', () => {
  it('HS-28: the stop signs name all five red flags, with 111 for chest pain', () => {
    for (const flag of [
      'chest pain or pressure',
      'severe shortness of breath',
      'fainting or near-fainting',
      'sudden severe headache',
      'pain that changes how you move',
    ]) {
      expect(move.safety.stopRules.body).toContain(flag);
    }
    expect(move.safety.stopRules.emergency).toContain(helpNumbers.emergency.number);
    expect(move.safety.stopRules.title).toBe('Stop signs');
  });

  it('ruling 9: the recent stop-sign line names the day, Healthline and 111; the jog switch never claims to change the plan', () => {
    expect(move.preCheck.recentStopSign).toContain('On {day} ');
    expect(move.preCheck.recentStopSign).toContain(helpNumbers.healthline.number);
    expect(move.preCheck.recentStopSign).toContain(`Call ${helpNumbers.emergency.number}`);
    expect(move.jog.toggle.hint).toContain('with Change weekly plan');
    expect(move.jog.toggle.hint).not.toMatch(/^Adds/);
    expect(move.jog.toggle.hint).toContain('never required');
  });

  it('item 27: the jog lines point at the switch on Move, and the heat line keeps the per-hour figure', () => {
    for (const text of [move.jog.needsOptIn, move.jog.readyOptIn, move.jog.toggle.hint]) {
      expect(text).not.toMatch(/Settings|Equipment/);
    }
    expect(moveScreen.before.heatWater).toContain(`${HEAT_WATER_ML_PER_HOUR} mL for each hour`);
  });

  it('every check question, week problem and start problem has its words, in order; required sentences are kept', () => {
    expect(Object.keys(move.preCheck.questions)).toEqual([...PRE_CHECK_KEYS]);
    expect(Object.keys(move.week.problems)).toEqual([...WEEK_PROBLEM_CODES]);
    expect(Object.keys(move.start.problems)).toEqual([...START_PROBLEM_CODES]);
    expect(move.jog.locked).toBe('Jogging unlocks after four tolerated walks.');
    expect(move.preCheck.fasted).toBe(
      'Exercising while fasted is allowed; choose a lighter session and break the fast afterwards if the plan says so.',
    );
    expect(move.rest.restDay).toBe('Rest day, that counts');
  });

  it('the check never diagnoses, puts rest first with pain, never insists on a fast, and fixes the rating direction', () => {
    expect(move.preCheck.allNo).toContain(general.readinessOutcome);
    expect(move.preCheck.notDiagnosis).toContain('does not diagnose');
    expect(move.preCheck.notDiagnosis).toContain('cannot tell you that exercise is right for you');
    expect(move.preCheck.painFirst).toContain('leave out anything that hurts');
    expect(move.preCheck.eatFirst).toContain("It's fine to widen the window.");
    expect(move.finish.exertion.low).toMatch(/^1 = .*easy/);
    expect(move.finish.exertion.high).toMatch(/^5 = .*hard/);
  });
});

describe('fasting and reflux copy (item 15)', () => {
  it('every template fills with its named placeholders and no others', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '');
    for (const [path, text] of [...strings(fasting, 'fasting'), ...strings(reflux, 'reflux')]) {
      const values = Object.fromEntries(placeholders(text).map((name) => [name, 'x']));
      expect(fillTemplate(text, values), path).not.toMatch(/[{}]/);
    }
  });

  it('every offer, after-window and widen line says it is fine to eat or widen (HS-18, C62)', () => {
    const m = fasting.mealCheck;
    for (const text of [
      m.offerSnack,
      m.widen,
      m.afterWindow,
      m.afterWindowReflux,
      m.afterWindowUnchecked,
      m.afterWindowUncheckedReflux,
      m.unavailableOneMeal,
      m.unavailableOneMealNoSnack,
      fasting.card.windowOpen,
      fasting.card.nearCeiling,
      fasting.card.fineToEat,
      fasting.card.cappedPlan,
      fasting.card.joined,
      fasting.card.joinedJustNow,
    ]) {
      expect(text).toMatch(/\bfine to\b/);
    }
  });

  it('the meal-check and streak lines never say "broken fast" or anything about losing a streak (FL-12, C63)', () => {
    const lines = [
      ...strings(fasting.mealCheck, 'mealCheck'),
      ['history.streak', fasting.history.streak],
    ];
    for (const [path, text] of lines) {
      expect(text, path).not.toMatch(/broken\s+fast|\bstreak\b.*\b(?:lost|reset|broken|over)\b/i);
    }
    expect(fasting.history.streak).toBe('{days} days in a row with a completed fast.');
  });

  it('the stop-signs and the chest-pain line carry Healthline and 111 from the help numbers (FS-04)', () => {
    expect(fasting.stopSigns.action).toContain(helpNumbers.healthline.number);
    expect(fasting.stopSigns.action).toContain(helpNumbers.emergency.number);
    expect(fasting.stopSigns.signs).toEqual([
      'Dizziness',
      'Fainting',
      'Heart palpitations',
      'Confusion',
      'Severe weakness',
    ]);
    expect(reflux.chestPain).toContain(helpNumbers.emergency.number);
  });
});

// Item 13 review: wording that has to hold wherever it shows (setup and Settings) and whatever
// the other answers are. The gate-dependent choice between lines is tested in the app
// (onboarding/readinessText.test.ts); these pin the sentences the review found untrue.
describe('first-run wording holds in every place it shows (item 13 review)', () => {
  it('no readiness line says fasting is allowed, and the "has changed" lines promise nothing', () => {
    for (const [path, text] of strings(readiness, 'readiness')) {
      expect(text, path).not.toMatch(/\ballowed\b|until you have checked again/);
    }
    expect(readiness.changedDone.q3).not.toMatch(/\bare off until\b/);
    expect(readiness.ifYesAlsoOff.q3).toContain('hypoglycaemia');
    expect(readiness.confirmedAlsoOff.prescriberAgreed).toContain(`"${readiness.changed.q3}"`);
  });

  it('Settings wording says what Settings can do: no "continue", no field it lacks, nothing said to be kept that is not', () => {
    expect(onboarding.frame.fixBelow).not.toMatch(/continue/i);
    expect(profile.errors.required).not.toMatch(/continue/i);
    expect(readiness.weightCheck.lowWeightStored).not.toMatch(/weight or height/);
    expect(profile.goalHiddenAfterHeight).not.toMatch(/until you change it/);
    expect(readiness.settingsIntro).toContain('asks for its confirmation again');
    expect(readiness.settingsIntro).not.toMatch(/nothing .* deleted/);
    expect(onboarding.frame.restoreIntro).toContain('otherwise setup carries on');
    expect(alcohol.notice.helplineTitle).toBe('Alcohol Drug Helpline');
  });
});

describe('Diet and targets copy (item 21; C-1 to C-7)', () => {
  /** "5,000" from 5000, as the copy writes it. */
  const n = (x: number) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const facts = TARGET_COPY_FACTS;

  it('C-2: every number the copy states equals the core constants', () => {
    const cases: [string, readonly string[]][] = [
      [targets.energy.floorHint, [`${n(facts.floorKj)} kJ`, `${n(facts.maxFloorKj)} kJ`]],
      [targets.energy.floorTooLow, [`${n(facts.floorKj)} kJ`]],
      [targets.energy.floorTooHigh, [`${n(facts.maxFloorKj)} kJ`]],
      [targets.energy.kickstartDeficitHint, [`${facts.kickstartMaxPct}%`]],
      [targets.energy.steadyDeficitHint, [`${facts.steady.min}% to ${facts.steady.max}%`]],
      [
        targets.carbs.ketoHint,
        [`${facts.keto.min} to ${facts.keto.max} g`, `${facts.keto.default} g`],
      ],
      [
        targets.carbs.moderateHint,
        [`${facts.moderate.min} to ${facts.moderate.max} g`, `${facts.moderate.default} g`],
      ],
      [targets.carbs.heldAt50, [`${facts.keto.max} g`]],
      [
        targets.protein.hint,
        [
          `${facts.protein.limits.min} to ${facts.protein.limits.max} g`,
          `${facts.protein.defaults.min} to ${facts.protein.defaults.max} g`,
        ],
      ],
      [
        targets.saturatedFat.budgetHint,
        [`${facts.satFat.min}% to ${facts.satFat.max}%`, `${facts.satFat.default}%`],
      ],
      [targets.guides.fibreHint, [`${facts.fibre.min} to ${facts.fibre.max} g`]],
      [targets.guides.waterHint, [`${n(facts.water.min)} to ${n(facts.water.max)} mL`]],
      [targets.energy.staleWeight, [`${facts.staleWeightDays} days`]],
      [targets.energy.unavailable.ageOutOfRange, [facts.estimateLimits.ageYears.join(' to ')]],
      [
        targets.energy.unavailable.heightOutOfRange,
        [`${facts.estimateLimits.heightCm.join(' to ')} cm`],
      ],
      [
        targets.energy.unavailable.weightOutOfRange,
        [`${facts.estimateLimits.weightKg.join(' to ')} kg`],
      ],
    ];
    for (const [text, parts] of cases) for (const part of parts) expect(text).toContain(part);
  });

  it('C-3: the diet-mode names read as UX 3a, in the order of DIET_MODES', () => {
    expect(Object.keys(targets.dietMode.names)).toEqual([...DIET_MODES]);
    expect(Object.values(targets.dietMode.names).join(' / ')).toBe(
      'Keto-preferred / Moderate low-carb / Balanced',
    );
  });

  it('C-4, C-5: the electrolyte line is the required sentence, in one wording; the floor is a safety net, not a target', () => {
    // One reminder, one wording: the targets section has no electrolyte lines of its own (item 16
    // merge); the reminder and item 22's planner card read reminders.electrolytes.
    expect(Object.keys(targets)).not.toContain('electrolytes');
    expect(reminders.electrolytes.body).toBe(
      'Electrolytes: sodium, potassium, magnesium. Garden sources: silverbeet, spinach, avocado.',
    );
    for (const text of [targets.energy.floorBinds, targets.today.floorDay]) {
      expect(text.toLowerCase()).toContain('safety net, not a target');
    }
  });

  it('C-6: every template fills from its own placeholders', () => {
    const values = Object.fromEntries(
      [
        ...['kj', 'kcal', 'kg', 'date', 'pct', 'protein', 'carbs', 'floorKj', 'floorKcal'],
        ...['max', 'min', 'g', 'ml', 'stored', 'used', 'eaten', 'target', 'guide', 'ceiling'],
        ...['count', 'nutrient', 'mode'],
      ].map((name) => [name, 1]),
    );
    for (const [path, text] of [
      ...strings(targets, 'targets'),
      ...strings(alcohol.dayEnergy, 'alcohol.dayEnergy'),
    ]) {
      expect(fillTemplate(text, values), path).not.toMatch(/[{}]/);
    }
    expect(() => fillTemplate(targets.energy.floorBinds, { floorKj: 5000 })).toThrow(RangeError);
  });

  it('C-7: the pregnancy note names a midwife and GP; the stop-sign lines carry Healthline and 111', () => {
    expect(targets.energy.pregnancyNote).toContain('midwife');
    expect(targets.energy.pregnancyNote).toContain('GP');
    // F36: one wording of the Kickstart stop-sign advice, its 111 taken from helpNumbers.
    expect(weight.stopSigns.emergency).toContain(helpNumbers.emergency.number);
    expect(readiness.bloodPressure.stopSign).toContain(helpNumbers.healthline.number);
  });
});

describe('Today and About copy (item 16; U9)', () => {
  it('TD-02: the later-step lines carry no figure and say the feature arrives later', () => {
    for (const [path, text] of strings(today.laterStep, 'laterStep')) {
      expect(text, path).not.toMatch(/\d/);
      expect(text, path).toMatch(/later step/);
    }
    expect(today.quickActions.laterNote).not.toMatch(/\d/);
  });

  it('the quick-action labels are the UX_SCREENS section 2 list, in order', () => {
    expect(Object.values(today.quickActions.labels)).toEqual([
      'Log weight',
      'Finish meal',
      'Swap recipe',
      'Complete workout',
      'Add harvest',
      'Add drink',
      'Open grocery list',
    ]);
  });

  it('C97: the data-sources card has one line per badge and names no food data source', () => {
    expect(about.dataSources.badges.map((line) => line.split(':')[0])).toEqual([
      'Label',
      'Database',
      'Estimate',
    ]);
    for (const [path, text] of strings(about, 'about')) {
      expect(text, path).not.toMatch(
        /Food Composition Database|\bFCDB\b|\bUSDA\b|FoodData|New Zealand Food/,
      );
      expect(text, path).not.toMatch(/food composition/i);
    }
  });

  it('every template fills with its named placeholders and no others', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '');
    for (const [path, text] of [...strings(today, 'today'), ...strings(reminders, 'reminders')]) {
      const values = Object.fromEntries(placeholders(text).map((name) => [name, 'x']));
      expect(fillTemplate(text, values), path).not.toMatch(/[{}]/);
    }
    expect(fillTemplate(fasting.status.openWhileOff, { duration: '2 h' })).toBe(
      'A fast you started is still open (2 h). You can end it below.',
    );
  });

  it('C102, T31: the electrolyte reminder names minerals and garden foods; its blood-pressure line is one wording', () => {
    expect(reminders.electrolytes.body).toBe(
      'Electrolytes: sodium, potassium, magnesium. Garden sources: silverbeet, spinach, avocado.',
    );
    expect(readiness.ifYes.q4.endsWith(readiness.bloodPressure.electrolyte)).toBe(true);
  });
});

// Item 30 (A20): the pairing wording (Q1, C115, HEALTH_SAFETY section 7).
describe('transfer copy (item 30)', () => {
  it('the transfer section uses the one shared rule list, which catches the first draft’s promise', () => {
    expect(SECTION_RULES.transfer).toBe(TRANSFER_SECTION_RULES);
    const firstDraft =
      'The list is locked on this phone with a key that only this phone and the laptop have.';
    expect(TRANSFER_SECTION_RULES.some((rule) => rule.test(firstDraft))).toBe(true);
  });

  it('pairing never says the laptop received the list (only item 31’s verified status may)', () => {
    for (const [path, text] of strings(transfer.pairing, 'pairing')) {
      expect(text, path).not.toMatch(/\b(?:received|delivered|arrived)\b/i);
    }
  });

  it('says what a photographed code allows, to scan only from this screen, and to unpair on both devices', () => {
    expect(transfer.pairing.codeRisk).toContain('photographs');
    expect(transfer.pairing.codeRisk).toContain('change the list');
    expect(transfer.pairing.codeRisk).toContain('until you pair again');
    expect(transfer.pairing.scanOnlyHere).toContain('camera app');
    expect(transfer.unpairOther).toBe('Also unpair on your other device.');
  });

  it('has exactly eight error messages, and the camera steps fill in the site name', () => {
    expect(Object.keys(transfer.pairing.errors)).toHaveLength(8);
    const filled = fillTemplate(transfer.pairing.errors['camera-denied'], {
      site: 'thezombierobot.github.io',
    });
    expect(filled).toContain('Choose thezombierobot.github.io and set it to Allow.');
    expect(filled).not.toContain('{');
  });
});

describe('plain words on the screens the owner reads (full review F24, F41)', () => {
  it('the rough guide is explained without the name of an equation or a factor', () => {
    expect(targets.energy.how).not.toMatch(/Mifflin|St Jeor|equation|factor/i);
    expect(targets.energy.how).toContain('estimate, not a measurement');
  });

  it('the typical range names the Settings card that sets its pace, by its own label', () => {
    expect(weight.chart.aboutBand).toContain(weight.rapidLossSettings.label);
    expect(weight.chart.aboutBand).toContain('Settings');
  });

  it("the Nutrition card's empty line says food logging comes later, with no figure", () => {
    expect(targets.today.laterStep).toMatch(/later step/);
    expect(targets.today.laterStep).not.toMatch(/\d/);
  });
});
