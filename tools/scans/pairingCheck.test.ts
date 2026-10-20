import { describe, expect, it } from 'vitest';
import { transfer } from '../../packages/core/src/copy/health';
import { fillTemplate } from '../../packages/core/src/copy/template';
import { TRANSFER_SECTION_RULES } from '../../packages/core/src/copy/transferRules';
import { pairingCheckOfBits } from '../../packages/grocery/src/transfer/pairingCode';
import { commerceRules, healthPhraseRules, healthTextHomeRules, personalDataRules } from './rules';

// S5 (checklist item 30 design 5.3; P18; HS-38): the four-letter pairing check is shown on the
// phone and the laptop, so every one of the 65,536 possible lines must pass every wording rule.
// Its consonant alphabet means it can never spell a word, a help number or a unit.

const RULES: readonly RegExp[] = [
  ...[...healthPhraseRules, ...commerceRules, ...healthTextHomeRules, ...personalDataRules].map(
    (r) => r.pattern,
  ),
  ...TRANSFER_SECTION_RULES,
];

/** The rules a line breaks (patterns are tested from the start, whatever their flags). */
function broken(line: string): RegExp[] {
  return RULES.filter((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(line);
  });
}

const line = (check: string) => fillTemplate(transfer.pairing.check, { check });

describe('S5. Every pairing check line passes every wording rule (P18)', () => {
  it('all 65,536 lines pass, and none has a digit', () => {
    const failing: string[] = [];
    for (let bits = 0; bits <= 0xffff; bits++) {
      const text = line(pairingCheckOfBits(bits));
      if (/\d/.test(text) || broken(text).length > 0) failing.push(text);
    }
    expect(failing).toEqual([]);
  });

  it.each(['WEAN', 'EARN', 'SAFE', 'SYNC', '1737', '8681', 'X111', 'GP MK'])(
    'a first-draft check such as "%s" would have failed',
    (check) => {
      const text = line(check);
      expect(/\d/.test(text) || broken(text).length > 0, text).toBe(true);
    },
  );
});
