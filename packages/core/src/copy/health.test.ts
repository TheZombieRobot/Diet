import { describe, expect, it } from 'vitest';
import { BACKUP_ERROR_CODES } from '../storage/backup/errors';
import { BACKUP_TABLES } from '../storage/tables';
import { alcohol, general, healthCopy, helpNumbers, privacy } from './health';
import { fillTemplate } from './template';

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
    // A forgotten backup password cannot be recovered, and a backup is the only other copy.
    /\b(?:we|support|the\s+app)\s+can\s+(?:recover|reset)\b/i,
    /\breset\s+(?:your|the)\s+password\b/i,
    /\b(?:cannot|can't|never)\s+(?:be\s+)?lost\b/i,
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
