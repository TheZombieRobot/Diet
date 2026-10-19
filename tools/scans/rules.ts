/**
 * Static safety scans (checklist item 3; TEST_PLAN.md section 1 "Static scans").
 *
 * Each rule names the HEALTH_SAFETY.md / TEST_PLAN.md IDs it enforces. Patterns are deliberately
 * strict: if a legitimate sentence trips one, reword the sentence rather than weakening the rule.
 * The same phrase lists are reused by browser tests that scan rendered text on every screen.
 */

export interface ContentRule {
  id: string;
  /** HEALTH_SAFETY.md / TEST_PLAN.md IDs this rule enforces. */
  enforces: readonly string[];
  description: string;
  pattern: RegExp;
}

export interface PathRule {
  id: string;
  enforces: readonly string[];
  description: string;
  test: (path: string, sizeBytes: number) => boolean;
}

const rule = (
  id: string,
  enforces: readonly string[],
  description: string,
  pattern: RegExp,
): ContentRule => ({ id, enforces, description, pattern });

/**
 * Health wording that must never appear in anything the app or extension can show.
 * Sources: HEALTH_SAFETY.md sections 1, 2, 4, 5 and the HS-07, HS-08, HS-19, HS-21 rows.
 */
export const healthPhraseRules: readonly ContentRule[] = [
  // HS-07: no taper, reduction schedule or quit instruction.
  rule('taper-cut-down-by', ['HS-07', 'AL-11'], '"cut down by"', /\bcut(?:ting|s)?\s+down\s+by\b/i),
  rule('taper-reduce-by', ['HS-07', 'AL-11'], '"reduce by"', /\breduc(?:e|es|ed|ing)\s+by\b/i),
  rule('taper-taper', ['HS-07', 'AL-11'], '"taper"', /\btaper(?:s|ed|ing)?\b/i),
  rule('taper-quit-date', ['HS-07', 'AL-11'], '"quit date"', /\bquit(?:ting)?\s+dates?\b/i),
  rule(
    'taper-stop-drinking',
    ['HS-07', 'AL-11'],
    '"stop drinking"',
    /\bstop(?:s|ped|ping)?\s+drinking\b/i,
  ),
  rule('taper-wean', ['HS-07', 'AL-11'], '"wean"', /\bwean(?:s|ed|ing)?\b/i),
  rule(
    'taper-schedule',
    ['HS-07'],
    'reduction schedule or plan',
    /\breduction\s+(?:schedule|plan)s?\b/i,
  ),
  rule('detox', ['NN-09'], '"detox"', /\bdetox\w*/i),

  // HS-08: no blood-alcohol or driving language.
  rule('bac', ['HS-08', 'AL-11'], '"BAC" (case-sensitive, so "bacon" is fine)', /\bBAC\b/),
  rule('blood-alcohol', ['HS-08', 'AL-11'], '"blood alcohol"', /\bblood[\s-]+alcohol\b/i),
  rule('safe-to-drive', ['HS-08', 'AL-11'], '"safe to drive"', /\bsafe\s+to\s+drive\b/i),
  rule('legal-limit', ['HS-08', 'AL-11'], '"legal limit"', /\blegal\s+limits?\b/i),
  rule('driving', ['HS-08'], 'anything about driving', /\bdriv(?:e|es|ing|er|ers|en)\b/i),
  rule('sober-up', ['HS-08'], '"sober up"', /\bsober(?:ing)?\s+up\b/i),

  // HS-19: never converts energy into permission to drink; no rewards.
  rule(
    'energy-left',
    ['HS-19'],
    '"calories left" and similar',
    /\b(?:calories|kcal|kilojoules|kj|energy)\s+(?:left|remaining|to\s+spare)\b/i,
  ),
  rule(
    'remaining-energy',
    ['HS-19'],
    '"remaining calories" and similar',
    /\bremaining\s+(?:calories|kcal|kilojoules|kj|energy)\b/i,
  ),
  rule('earned', ['HS-19'], '"earned" / "earn"', /\bearn(?:s|ed|ing)?\b/i),
  rule('allowance', ['HS-19'], '"allowance"', /\ballowances?\b/i),
  rule(
    'drinks-budget',
    ['HS-19'],
    'drinks as a budget',
    /\bdrinks?\s+(?:budget|left|remaining|allowed|to\s+spare)\b/i,
  ),
  rule('reward', ['HS-19'], 'rewards', /\breward(?:s|ed|ing)?\b/i),
  rule(
    'treat-yourself',
    ['HS-19'],
    '"treat yourself" / "you deserve"',
    /\b(?:treat\s+yourself|you\s+deserve)\b/i,
  ),
  rule(
    'safe-amount',
    ['NN-09'],
    'implying an amount of alcohol is safe',
    /\bsafe\s+(?:amount|level|limit|number|allowance)s?\b/i,
  ),

  // HEALTH_SAFETY.md section 1: never "you are safe to fast/train/diet".
  rule(
    'safe-to',
    ['HS-safety-1'],
    '"safe to fast/train/diet/..."',
    /\bsafe\s+to\s+(?:fast|train|diet|exercise|drink|stop|lose)\b/i,
  ),

  // HS-21 / HS-26: no "kilograms in N days" claims, no target-by-date.
  rule(
    'kg-in-time',
    ['HS-21', 'HS-26', 'NN-03'],
    'a weight amount tied to a time span',
    /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|kilos?|kilograms?|lbs?|pounds?)\b[^.\n]{0,40}?\b(?:in|by|within|over|per)\s+(?:\d+|a|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(?:days?|weeks?|months?|fortnights?)\b/i,
  ),
  rule(
    'lose-n-kg',
    ['HS-21', 'NN-03'],
    '"lose N kg"',
    /\blos(?:e|ing)\s+(?:up\s+to\s+)?\d+(?:[.,]\d+)?\s*(?:kg|kgs|kilos?|kilograms?)\b/i,
  ),
  rule(
    'kg-by',
    ['HS-21', 'HS-26'],
    '"N kg by <date>"',
    /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|kilos?|kilograms?)\s+by\s+/i,
  ),
  rule('guarantee', ['HS-21'], 'guarantees about results', /\bguarantee(?:s|d)?\b/i),

  // HEALTH_SAFETY.md section 2: no "ideal weight", no body-fat estimates.
  rule('ideal-weight', ['HS-safety-2'], '"ideal weight"', /\bideal\s+(?:body\s+)?weight\b/i),
  rule('body-fat', ['HS-safety-2'], 'body-fat estimates', /\bbody[\s-]?fat\b/i),

  // HEALTH_SAFETY.md section 4: no supplements, no ketosis-measurement claims, no "fat-burning".
  rule('fat-burning', ['HS-safety-4'], '"fat-burning"', /\bfat[\s-]?burn\w*/i),
  rule(
    'supplement',
    ['HS-safety-4'],
    'supplement recommendations',
    /\bsupplement(?:s|ed|ing|ation)?\b/i,
  ),
  rule(
    'ketone-measure',
    ['HS-safety-4'],
    'ketosis measurement claims',
    /\bketones?\s+(?:strips?|meters?|levels?|readings?|tests?)\b/i,
  ),

  // HEALTH_SAFETY.md section 3: no extended or compensatory fasting.
  rule(
    'extended-fast',
    ['HS-safety-3'],
    'extended or dry fasting',
    /\b(?:extended|dry|water)\s+fast(?:s|ing)?\b/i,
  ),
  rule('compensate', ['HS-safety-3'], 'fasting to compensate', /\bcompensat(?:e|es|ed|ing|ion)\b/i),
];

/**
 * Price, stock and cart-status wording (HS-16, NN-05, CX-08). Prices may only ever come from the
 * owner (timestamped) through one formatting function, so no literal currency appears in source.
 */
export const commerceRules: readonly ContentRule[] = [
  rule('currency-literal', ['HS-16', 'NN-05'], 'a literal "$" amount', /\$\s?\d|\$\$\{/),
  rule('currency-code', ['HS-16', 'NN-05'], 'a literal NZ$ / NZD amount', /\bNZ\$|\bNZD\s?\d/),
  rule(
    'currency-words',
    ['HS-16'],
    'an amount in dollars or cents',
    /\b\d+(?:\.\d{1,2})?\s?(?:dollars?|cents?)\b/i,
  ),
  rule(
    'stock-status',
    ['HS-16', 'CX-08'],
    '"in stock" / "out of stock" / "low stock"',
    /\b(?:in|out\s+of|low|no)\s+stock\b/i,
  ),
  rule('stock-level', ['HS-16'], '"stock level"', /\bstock\s+(?:levels?|status)\b/i),
  rule(
    'cart-status',
    ['HS-16', 'CX-08'],
    '"added to cart" and similar',
    /\badded\s+to\s+(?:your\s+)?(?:cart|trolley)\b/i,
  ),
  rule(
    'in-cart',
    ['HS-16', 'CX-08'],
    '"in your cart" and similar',
    /\bin\s+(?:your\s+|the\s+)?(?:cart|trolley)\b/i,
  ),
  rule(
    'specials',
    ['HS-16'],
    'promotions',
    /\b(?:on\s+special|on\s+sale|price\s+drop|cheapest)\b/i,
  ),
];

/** Personal data must never be committed (DECISIONS.md, 2026-10-18). */
export const personalDataRules: readonly ContentRule[] = [
  rule(
    'lipid-result',
    ['privacy'],
    'a lipid or cholesterol result',
    /\b(?:LDL|HDL|non-HDL|triglycerides?|total\s+cholesterol)\b[^\n]{0,30}?\d+(?:[.,]\d+)?\s*(?:mmol|mg\/dl)/i,
  ),
  rule(
    'mmol',
    ['privacy'],
    'a blood-test unit (the app never stores lab results)',
    /\bmmol\s*\/\s*l\b/i,
  ),
  rule(
    'first-person-health',
    ['privacy'],
    'a first-person health number',
    /\b(?:I\s+weigh|my\s+weight\s+(?:is|was)|I\s+am\s+\d+\s*(?:kg|cm)|my\s+(?:BMI|cholesterol|LDL|HDL|blood\s+pressure|height)\s+(?:is|was)|I\s+drink\s+\d)\b/i,
  ),
  rule(
    'date-of-birth',
    ['privacy'],
    'a date of birth',
    /\b(?:DOB|date\s+of\s+birth)\b\s*[:=-]?\s*\d/i,
  ),
  rule('nhi', ['privacy'], 'an NHI (National Health Index) reference', /\bNHI\b/),
  rule(
    'nz-mobile',
    ['privacy'],
    'a personal NZ mobile number',
    /(?:\+64\s?|\b0)2[0-9][\s-]?\d{3,4}[\s-]?\d{3,4}\b/,
  ),
  rule(
    'email',
    ['privacy'],
    'an email address that is not a known no-reply or example address',
    /\b[A-Z0-9._%+-]+@(?!(?:example\.(?:com|org|net)|users\.noreply\.github\.com)\b)(?!anthropic\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  ),
  rule(
    'backup-marker',
    ['privacy', 'HS-15'],
    'an app backup file (they live only on your phone)',
    /"format"\s*:\s*"diet-backup/,
  ),
  rule('private-key', ['secrets'], 'a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/),
  rule('github-token', ['secrets'], 'a GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/),
  rule('aws-key', ['secrets'], 'an AWS access key', /\bAKIA[0-9A-Z]{16}\b/),
  rule(
    'assigned-secret',
    ['secrets'],
    'a hard-coded secret',
    /\b(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
  ),
];

const MEDIA =
  /\.(?:jpe?g|heic|heif|png|gif|webp|bmp|tiff?|avif|mp4|mov|m4v|webm|m4a|mp3|wav|aac)$/i;
const ICON_DIRS = /^(?:apps\/[^/]+\/public\/|packages\/ui\/src\/assets\/)/;

export const personalPathRules: readonly PathRule[] = [
  {
    id: 'private-folder',
    enforces: ['privacy'],
    description: 'files under docs/handoff/ or docs/private/ are never committed',
    test: (p) => /^docs\/(?:handoff|private)\//.test(p),
  },
  {
    id: 'handoff-file',
    enforces: ['privacy'],
    description: "the owner's original handoff document is never committed",
    test: (p) => /handoff/i.test(p.split('/').pop() ?? ''),
  },
  {
    id: 'backup-file',
    enforces: ['privacy', 'HS-15'],
    description: 'app backup files live only on the phone',
    test: (p) => /\.backup(?:\.[^/]*)?\.json$/i.test(p),
  },
  {
    id: 'data-dump',
    enforces: ['privacy'],
    description: 'database files or exports',
    test: (p) => /\.(?:sqlite3?|db|idb|leveldb|har)$/i.test(p),
  },
  {
    id: 'media-outside-icons',
    enforces: ['privacy'],
    description:
      'photos, video or audio (only small app icons are allowed, in public/ or ui assets)',
    test: (p) => MEDIA.test(p) && !ICON_DIRS.test(p),
  },
  {
    id: 'large-media',
    enforces: ['privacy'],
    description: 'an image over 300 KB is probably a photo, not an icon',
    test: (p, size) => MEDIA.test(p) && size > 300 * 1024,
  },
];

/**
 * Nothing may phone home (HS-14, TR-11, HEALTH_SAFETY.md section 7) and there are no AI calls at
 * runtime. Network APIs are allowed only in files listed in NETWORK_ALLOWED_FILES.
 */
export const networkRules: readonly ContentRule[] = [
  rule('fetch', ['HS-14', 'TR-11'], 'fetch()', /\bfetch\s*\(/),
  rule('xhr', ['HS-14', 'TR-11'], 'XMLHttpRequest', /\bXMLHttpRequest\b/),
  rule('beacon', ['HS-14', 'TR-11'], 'sendBeacon', /\bsendBeacon\b/),
  rule('websocket', ['HS-14', 'TR-11'], 'WebSocket', /\bnew\s+WebSocket\b/),
  rule('eventsource', ['HS-14', 'TR-11'], 'EventSource', /\bnew\s+EventSource\b/),
  rule(
    'import-scripts',
    ['HS-14'],
    'importScripts from a URL',
    /\bimportScripts\s*\(\s*['"`]https?:/,
  ),
  rule('dynamic-import-url', ['HS-14'], 'import() from a URL', /\bimport\s*\(\s*['"`]https?:/),
];

/** Files that may use network APIs. Added deliberately, one at a time, with a reason. */
export const NETWORK_ALLOWED_FILES: readonly string[] = [];

/** AI services and telemetry: banned in source and in the dependency tree. */
export const aiAndTelemetryRules: readonly ContentRule[] = [
  rule(
    'ai-endpoint',
    ['no-ai-runtime'],
    'an AI service endpoint or SDK',
    /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|@anthropic-ai\/sdk|['"]openai['"]|@google\/generative-ai|@google\/genai|\blangchain\b|api\.mistral\.ai|api\.cohere\.ai/i,
  ),
  rule(
    'remote-asset',
    ['HEALTH_SAFETY-7'],
    'fonts, icons or scripts fetched from a CDN (they must be bundled)',
    /https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|use\.typekit\.net|kit\.fontawesome\.com|www\.googletagmanager\.com|www\.google-analytics\.com)/i,
  ),
];

/** Package names (or prefixes) that collect telemetry or analytics. */
export const TELEMETRY_PACKAGES: readonly string[] = [
  '@sentry/',
  'posthog',
  'posthog-',
  'mixpanel',
  'mixpanel-',
  '@amplitude/',
  'amplitude-js',
  '@segment/',
  'analytics-node',
  '@vercel/analytics',
  '@vercel/speed-insights',
  'newrelic',
  '@newrelic/',
  '@datadog/',
  'dd-trace',
  'logrocket',
  'logrocket-',
  'hotjar',
  '@hotjar/',
  'firebase',
  '@firebase/',
  'applicationinsights',
  '@microsoft/applicationinsights',
  'react-ga',
  'react-ga4',
  'ga-4-react',
  'plausible-tracker',
  '@bugsnag/',
  'rollbar',
  '@honeybadger-io/',
  'smartlook',
  '@fullstory/',
  'heap-api',
  '@opentelemetry/exporter-',
  'universal-analytics',
  'insight',
];

/** Licences allowed anywhere in the dependency tree (SPDX identifiers). */
export const ALLOWED_LICENSES: readonly string[] = [
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Apache-2.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'BlueOak-1.0.0',
  'Unlicense',
  'Python-2.0',
  'MPL-2.0',
];
