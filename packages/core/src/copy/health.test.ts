import { describe, expect, it } from 'vitest';
import { BACKUP_ERROR_CODES } from '../storage/backup/errors';
import { BACKUP_TABLES } from '../storage/tables';
import { ACTIVITY_FACTORS } from '../energy/energyEstimate';
import { GATED_FEATURES, READINESS_REASON_IDS } from '../readiness/gates';
import { USER_ALLERGENS } from '../storage/allergens';
import { FLOOR_KJ, KICKSTART_MAX_DEFICIT_PCT, KICKSTART_NET_CARBS_G } from '../storage/limits';
import { READINESS_QUESTION_IDS } from '../storage/readiness';
import {
  alcohol,
  fasting,
  general,
  healthCopy,
  helpNumbers,
  onboarding,
  privacy,
  profile,
  readiness,
  reflux,
  schedule,
} from './health';
import { fillTemplate, joinList } from './template';

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

  it('delete-all lists what stays, including saved passwords, backup files and the laptop (HS-30)', () => {
    const stays = privacy.deleteAll.stays.join(' ');
    expect(stays).toContain("If Chrome saved a backup password, remove it in Chrome's settings.");
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
