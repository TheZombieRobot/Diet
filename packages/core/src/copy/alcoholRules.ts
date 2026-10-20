/**
 * The extra wording rules for alcohol copy (HEALTH_SAFETY.md section 5; HS-19, NN-09, C16, C66; UX 5
 * "deliberately absent"). They run over every string of healthCopy.alcohol (health.test.ts) and, in
 * the browser, over the Drinks screen, the Today Drinks card and the Talk to someone card only
 * (e2e/rendered-text.spec.ts), never over the rest of the app: Today legitimately shows required
 * wording these would flag, such as the weight card's "long-term goal". Not exported from the core
 * index; tests and the rendered-text scan import this file directly.
 */
export const ALCOHOL_SECTION_RULES: readonly RegExp[] = Object.freeze([
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
  // Item 28 (C66): the guidance is never framed as permission. "safest" in the help card and
  // "safety" in the notice are different words and are allowed.
  /\bup\s+to\b/i,
  /\bsafe\b/i,
  /\ballowed\b/i,
  /\bOK\s+to\b/i,
  /\bwithin\s+(?:your|the)\b/i,
  /\bbelow\s+(?:the\s+)?guidance\b/i,
  /\bunder\s+(?:the\s+)?guidance\b/i,
  // Item 28 (A34): no praise, progress or comparison framing.
  /\b(?:great|nice|good)\s+(?:job|work|going|effort|news)\b/i,
  /\bkeep\s+(?:it\s+)?up\b/i,
  /\bon\s+track\b/i,
  /\bachiev\w*/i,
  /\bsuccess\w*/i,
  /\bmet\s+your\b/i,
  /\bin\s+a\s+row\b/i,
  /\bsober\w*/i,
  /\bclean\b/i,
  /\bbinge\w*/i,
  /\bfail\w*/i,
  /\bbad\b/i,
]);
