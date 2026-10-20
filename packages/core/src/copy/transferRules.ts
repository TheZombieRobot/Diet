/**
 * The transfer section's wording rules (checklist items 30 and 31; the item-30/31 transfer
 * contract, section 9): pairing and sending are privacy wording, so they say plainly what happens,
 * with no blanket promises. health.test.ts applies them to the `transfer` section of health.ts;
 * tools/scans/pairingCheck.test.ts applies them to every pairing check line. One list for both
 * items: item 31 adds keys to the section, never a second list. Not imported by app code.
 */
export const TRANSFER_SECTION_RULES: readonly RegExp[] = Object.freeze([
  /\b(?:100\s*%|completely|totally|fully|perfectly|always)\s+(?:private|secure|safe|anonymous|protected)\b/i,
  /\banonymous(?:ly)?\b/i,
  /\bsecure(?:ly)?\b/i,
  /\bsafe(?:ly)?\b/i, // also covers item 31's "you are safe"
  /\b(?:unbreakable|uncrackable|unhackable|military[\s-]grade|bank[\s-]grade|hack[\s-]?proof)\b/i,
  /\b(?:no\s*one|nobody)\s+(?:else\s+)?can\s+(?:ever\s+)?(?:read|see|open)\b/i,
  // "a key that only this phone and the laptop have" and its kin: a promise codeRisk contradicts.
  /\bonly\s+(?:this\s+phone|you|your\s+\w+)\b[^.]{0,60}\b(?:have|has|can)\b/i,
  /\bsync(?:ed|ing|s)?\b/i,
  // Item 29 R31 (item 31): no promise of take-once delivery or an exact deletion time.
  /\bnever\s+twice\b|\b(?:only|exactly)\s+once\b/i,
  /\b(?:deleted|removed|gone)\s+(?:immediately|instantly|at\s+once|for\s+good)\b/i,
  // C52 (item 31): only the verified acknowledgement may say the laptop has the list.
  /\b(?:arrived|delivered)\b/i,
]);
