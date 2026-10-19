/**
 * Every user-facing health sentence in the app and extension lives in this file, so CI can scan
 * it and the owner can review it in one place (checklist conventions and item 42).
 *
 * Wording comes from docs/HEALTH_SAFETY.md and docs/UX_SCREENS.md. Change the docs first, then
 * this file. Sections are scanned with their own extra rules in `health.test.ts`: for example,
 * alcohol copy may never mention streaks, targets or limits.
 *
 * Sections are added as each screen is built; only wording already fixed by the docs is here.
 */

/** New Zealand help numbers (HEALTH_SAFETY.md, top; HS-13). */
export const helpNumbers = {
  emergency: { name: 'Emergency', number: '111' },
  healthline: { name: 'Healthline (24/7 health advice)', number: '0800 611 116' },
  alcoholDrugHelpline: {
    name: 'Alcohol Drug Helpline (24/7, free, confidential)',
    number: '0800 787 797',
    text: '8681',
  },
  needToTalk: { name: 'Need to Talk (free call or text)', number: '1737' },
} as const;

/** Statements shown on first run and on the About screen (HEALTH_SAFETY.md, top; UX 1a). */
export const general = {
  welcome:
    'This is a private logbook and planner. It is not a medical device and does not replace your GP.',
  about:
    'This app is a personal logbook and planner. It is not a medical device, does not diagnose, and does not replace your GP, a dietitian, or an addiction service.',
  readinessOutcome: 'Nothing you have told the app rules this out; your GP knows more.',
} as const;

/** Alcohol wording (HEALTH_SAFETY.md section 5; UX 1b, 5c). */
export const alcohol = {
  firstRunNotice:
    'If you drink most days or heavily at weekends, cutting down suddenly can be dangerous. Talk to your GP or the Alcohol Drug Helpline (0800 787 797, text 8681) before making a big change. Call 111 for seizures, confusion or hallucinations.',
  helpCard:
    "If you've been drinking most days for a while and are thinking about changing that, the safest first step is a conversation, not a sudden stop. Alcohol Drug Helpline 0800 787 797 (call or text 8681), free and 24/7, or your GP. If someone is very unwell, shaking badly, confused or having a seizure, call 111.",
  noRiskFreeLevel: 'No alcohol use is risk-free.',
} as const;

/** All sections, for scanning and review. */
export const healthCopy = { helpNumbers, general, alcohol } as const;
