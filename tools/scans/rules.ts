/**
 * Static safety scans (checklist item 3; TEST_PLAN.md section 1 "Static scans").
 *
 * Each rule names the HEALTH_SAFETY.md / TEST_PLAN.md IDs it enforces. Patterns are deliberately
 * strict: if a legitimate sentence trips one, reword the sentence rather than weakening the rule.
 * Every apostrophe in a pattern is written ['’] so the typographic apostrophe is caught too.
 *
 * Health and commerce wording is checked against the text a person would see (extract.ts): string
 * literals, template literals, `+` concatenations and JSX text in code (comments are skipped), and
 * markup or data files with tags removed and HTML entities decoded. Privacy, secret, network and
 * AI rules read the raw text of every file.
 *
 * The rendered text of every screen is scanned too: e2e/rendered-text.spec.ts runs
 * healthPhraseRules and commerceRules over what the built app shows in the browser (checklist
 * item 5).
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
  /** `bytes` is the file content when it is available (used for image metadata checks). */
  test: (path: string, sizeBytes: number, bytes?: Uint8Array) => boolean;
}

const rule = (
  id: string,
  enforces: readonly string[],
  description: string,
  pattern: RegExp,
): ContentRule => ({ id, enforces, description, pattern });

const re = (source: string, flags = 'i') => new RegExp(source, flags);

// Building blocks for the weight-claim rules (HS-21, HS-26, NN-03). `{}` is how extract.ts writes
// an interpolated value, so `Lose {kg} kg in {weeks} weeks` is caught as well as `Lose 5 kg`.
const PLACEHOLDER = String.raw`\$?\{[^}]*\}`;
const NUM = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?|${PLACEHOLDER}|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|half\s+a|a\s+few|a\s+couple\s+of|several)`;
const NUM_START = String.raw`(?:\b|(?=[$\{]))`;
const KG = String.raw`(?:kgs?|kilos?|kilogram(?:me)?s?)`;
const WEIGHT_UNIT = String.raw`(?:kgs?|kilos?|kilogram(?:me)?s?|lbs?|pounds?)`;
/** Up to three words between a preposition and a time unit: "in the first three weeks". */
const FEW_WORDS = String.raw`(?:(?:[\w’'-]+|${PLACEHOLDER})\s+){0,3}?`;
const TIME_UNIT = String.raw`(?:days?|weeks?|months?|fortnights?|Kickstart)`;
const ENERGY_UNIT = String.raw`(?:calories|calorie|cals?|kcals?|kilojoules?|kjs?|energy)`;

/**
 * Health wording that must never appear in anything the app or extension can show.
 * Sources: HEALTH_SAFETY.md sections 1 to 5 and the HS-07, HS-08, HS-19, HS-21 rows.
 */
export const healthPhraseRules: readonly ContentRule[] = [
  // HS-07: no taper, reduction schedule or quit instruction; section 5: never says stop drinking.
  rule(
    'taper-cut-down-by',
    ['HS-07', 'AL-11'],
    '"cut down by" / "cut back to" and similar',
    /\bcut(?:ting|s)?\s+(?:[\w’'-]+\s+){0,3}?(?:down|back)\s+(?:by|to)\b/i,
  ),
  rule(
    'taper-reduce-by',
    ['HS-07', 'AL-11'],
    '"reduce ... by"',
    /\breduc\w*\s+(?:[\w’'-]+\s+){0,3}?by\b/i,
  ),
  rule(
    'taper-ease-off',
    ['HS-07'],
    '"ease off by" and similar',
    /\b(?:ease|wind)\s+(?:off|back|down)\s+(?:by|to)\b/i,
  ),
  rule('taper-taper', ['HS-07', 'AL-11'], '"taper"', /\btaper(?:s|ed|ing)?\b/i),
  rule(
    'taper-quit-date',
    ['HS-07', 'AL-11'],
    '"quit date" / "quit day" / "stop date"',
    /\bquit(?:ting)?[\s-]+(?:dates?|days?)\b|\b(?:date|day)\s+to\s+(?:quit|stop)\b|\bstop[\s-]+dates?\b/i,
  ),
  rule(
    'taper-stop-drinking',
    ['HS-07', 'AL-11'],
    '"stop drinking" / "quit alcohol" / "give up drinking" and similar',
    /\b(?:quit(?:s|ting)?|stop(?:s|ped|ping)?|give\s+up|giving\s+up|gave\s+up|cut(?:ting)?\s+out)\s+(?:your\s+|all\s+)?(?:drinking|alcohol)\b/i,
  ),
  rule('taper-wean', ['HS-07', 'AL-11'], '"wean"', /\bwean(?:s|ed|ing)?\b/i),
  rule(
    'taper-schedule',
    ['HS-07'],
    'a reduction schedule or step-down plan',
    /\breduction\s+(?:schedule|plan)s?\b|\b(?:step|cut|wind|taper)[\s-]+down\s+plans?\b|\b(?:weekly|daily)\s+reductions?\b/i,
  ),
  rule(
    'taper-fewer-drinks',
    ['HS-07'],
    '"one fewer drink" and similar reduction steps',
    /\bone\s+fewer\s+drinks?\b|\bhalve\s+your\s+(?:drinking|drinks|alcohol)\b|\bdrop\s+to\s+\S+\s+(?:drinks?|cans?|beers?|glasses)\b/i,
  ),
  rule('detox', ['NN-09'], '"detox"', /\bdetox\w*/i),

  // HS-08: no blood-alcohol or driving language.
  rule('bac', ['HS-08', 'AL-11'], '"BAC" (case-sensitive, so "bacon" is fine)', /\bBAC\b/),
  rule(
    'blood-alcohol',
    ['HS-08', 'AL-11'],
    '"blood alcohol" and similar',
    /\bblood[\s-]+alcohol\b|\balcohol\s+(?:level|content|concentration)s?\s+in\s+(?:your\s+|the\s+)?blood\b/i,
  ),
  rule(
    'breath-alcohol',
    ['HS-08'],
    'breath alcohol, breathalysers, BrAC',
    /\bbreath(?:[\s-]+alcohol|alys[ei]rs?|alyz[ei]rs?)\b|\bBrAC\b/i,
  ),
  rule('safe-to-drive', ['HS-08', 'AL-11'], '"safe to drive"', /\bsafe[\s-]+to[\s-]+drive\b/i),
  rule('legal-limit', ['HS-08', 'AL-11'], '"legal limit"', /\blegal[\s-]+limits?\b/i),
  rule(
    'the-limit',
    ['HS-08'],
    '"over / under the limit"',
    /\b(?:over|under|below)\s+the\s+limit\b/i,
  ),
  rule('behind-the-wheel', ['HS-08'], '"behind the wheel"', /\bbehind\s+the\s+wheel\b/i),
  rule(
    'operate-vehicle',
    ['HS-08'],
    '"operate a vehicle / machinery"',
    /\boperat\w*\s+(?:a\s+|any\s+|heavy\s+)?(?:vehicles?|cars?|machinery)\b/i,
  ),
  rule(
    'driving',
    ['HS-08'],
    'anything about driving (exercise cues say "push", not "drive")',
    /\bdriv(?:e|es|ing|er|ers|en)\b/i,
  ),
  rule('sober-up', ['HS-08'], '"sober up"', /\bsober(?:s|ed|ing)?\s+up\b/i),
  rule(
    'clearance-rate',
    ['HS-08'],
    '"one drink an hour" (a blood-alcohol estimate in disguise)',
    /\bdrinks?\s+(?:an|per|each|every)\s+hour\b/i,
  ),
  rule('out-of-system', ['HS-08'], '"out of your system"', /\bout\s+of\s+your\s+system\b/i),

  // HS-19: never converts energy into permission to drink; no rewards.
  rule(
    'energy-left',
    ['HS-19'],
    '"calories left" and similar',
    re(
      String.raw`(?:\b${ENERGY_UNIT}|${PLACEHOLDER})\s+(?:left|remaining|to\s+spare|to\s+go|left\s+over|spare)\b`,
    ),
  ),
  rule(
    'remaining-energy',
    ['HS-19'],
    '"remaining calories" and similar',
    re(String.raw`\bremaining\s+${ENERGY_UNIT}\b`),
  ),
  rule('earned', ['HS-19'], '"earned" / "earnt" / "earn"', /\bearn(?:s|ed|t|ing)?\b/i),
  rule('allowance', ['HS-19'], '"allowance"', /\ballowances?\b/i),
  rule(
    'drinks-left',
    ['HS-19'],
    'drinks, cans or standard drinks "left" / "to go" / "allowed"',
    /\b(?:std|standard\s+drinks?|units?|cans?|beers?|glasses|wines?|drinks?)\s+(?:left|remaining|to\s+go|to\s+spare|allowed|budget|spare)\b/i,
  ),
  rule(
    'drink-budget',
    ['HS-19'],
    'drinks as a budget ("room for", "budget for drinks", "can still have")',
    re(
      String.raw`\b(?:alcohol|drinks?|drinking)\s+(?:budget|allowance|credits?)\b|\bbudget\s+for\s+(?:drinks?|alcohol|a\s+drink|beers?|wine)\b|\broom\s+for\b|\b(?:spare|leftover|left-over|bank(?:ed)?)\s+${ENERGY_UNIT}\b|\ballowed\s+drinks?\b|\bcan\s+still\s+have\b|\bbonus\s+drinks?\b`,
    ),
  ),
  rule('reward', ['HS-19'], 'rewards', /\breward(?:s|ed|ing)?\b/i),
  rule(
    'treat-yourself',
    ['HS-19'],
    '"treat yourself" / "you deserve" / "well deserved"',
    /\b(?:treat\s+yourself|you\s+deserve|well[\s-]+deserved)\b/i,
  ),
  rule(
    'safe-amount',
    ['NN-09'],
    'implying an amount of alcohol is safe',
    /\b(?:safe|healthy|low[\s-]+risk)\s+(?:amount|level|limit|number|allowance|drinking)s?\b/i,
  ),
  rule(
    'alcohol-reward-label',
    ['HEALTH_SAFETY-5', 'AL-05'],
    'alcohol-free streaks or badges, or a drinks "limit" / "target"',
    /\balcohol[\s-]free\b[^.\n]{0,40}\b(?:streaks?|in\s+a\s+row|badges?)\b|\b(?:streaks?|badges?)\b[^.\n]{0,40}\balcohol[\s-]free\b|\b(?:weekly|daily|drinks?|drinking|alcohol)\s+(?:limits?|targets?)\b/i,
  ),

  // HEALTH_SAFETY.md sections 1 and 6, NN-09: never "you are safe to fast/train/diet".
  rule(
    'safe-to',
    ['HEALTH_SAFETY-1', 'NN-09', 'HS-31'],
    'telling the user something is safe for them',
    /\bsafe[\s-]+to[\s-]+(?:fast|train|diet|exercise|drink|stop|lose|start|begin|keep|continue)\b|\b(?:fasting|exercise|exercising|training|this\s+plan|the\s+plan|keto|it|this|that)\s+is\s+(?:completely\s+|perfectly\s+|totally\s+|quite\s+)?safe\b|\bsafe\s+for\s+you\b|\bsafely\s+(?:fast|train|diet|exercise|drink|lose)\b|\bsafe\s+drinking\b|\byou(?:['’]re|\s+are)\s+(?:completely\s+|perfectly\s+|totally\s+)?safe\b/i,
  ),

  // HS-21 / HS-26: no "kilograms in N days" claims, no target-by-date.
  rule(
    'kg-in-time',
    ['HS-21', 'HS-26', 'NN-03'],
    'a weight amount tied to a time span',
    re(
      String.raw`${NUM_START}${NUM}\s*${WEIGHT_UNIT}\b[^.\n]{0,40}?\b(?:in|by|within|over|during|across)\s+${FEW_WORDS}${TIME_UNIT}\b`,
    ),
  ),
  rule(
    'lose-n-kg',
    ['HS-21', 'NN-03'],
    '"lose N kg" / "drop N kg" / "shed N kg"',
    re(
      String.raw`\b(?:los(?:e|es|ing|t)|drop(?:s|ped|ping)?|shed(?:s|ding)?)\s+(?:up\s+to\s+|around\s+|about\s+|another\s+|over\s+|roughly\s+|at\s+least\s+)?${NUM}\s*${KG}\b`,
    ),
  ),
  rule(
    'kg-by',
    ['HS-21', 'HS-26'],
    '"N kg by <date>"',
    re(String.raw`${NUM_START}${NUM}\s*${KG}\s+by\s+`),
  ),
  rule('guarantee', ['HS-21'], 'guarantees about results', /\bguarantee(?:s|d)?\b/i),

  // HEALTH_SAFETY.md section 2: no "ideal weight", no body-fat estimates.
  rule(
    'ideal-weight',
    ['HEALTH_SAFETY-2', 'HS-31'],
    '"ideal weight" and similar',
    /\b(?:ideal|healthy|perfect)\s+(?:body\s+)?weight\b/i,
  ),
  rule('body-fat', ['HEALTH_SAFETY-2', 'HS-31'], 'body-fat estimates', /\bbody[\s-]?fat\b/i),
  rule('fat-mass', ['HEALTH_SAFETY-2', 'HS-31'], '"fat mass"', /\bfat[\s-]+mass\b/i),

  // HEALTH_SAFETY.md section 4: no supplements, no ketosis-measurement claims, no fat burning.
  rule('fat-burning', ['HEALTH_SAFETY-4', 'HS-31'], '"fat-burning"', /\bfat[\s-]?burn\w*/i),
  rule(
    'burns-fat',
    ['HEALTH_SAFETY-4', 'HS-31'],
    '"burns fat"',
    /\bburn(?:s|ing|ed|t)?\s+(?:body\s+|more\s+|extra\s+)?fat\b/i,
  ),
  rule(
    'supplement',
    ['HEALTH_SAFETY-4', 'HS-31'],
    'supplement recommendations',
    /\bsupplement(?:s|ed|ing|ation)?\b/i,
  ),
  rule(
    'supplement-form',
    ['HEALTH_SAFETY-4', 'HS-31'],
    'mineral tablets, pills or powders',
    /\b(?:magnesium|potassium|electrolytes?|zinc|sodium|salt|calcium|iron|minerals?)\s+(?:tablets?|pills?|capsules?|powders?|sachets?)\b/i,
  ),
  rule('mct', ['HEALTH_SAFETY-4'], 'MCT oil', /\bMCT\b/i),
  rule('exogenous-ketones', ['HEALTH_SAFETY-4'], 'exogenous ketones', /\bexogenous\s+ketones?\b/i),
  rule(
    'ketone-measure',
    ['HEALTH_SAFETY-4', 'HS-31'],
    'ketosis measurement claims',
    /\bketones?\s+(?:strips?|meters?|levels?|readings?|test\w*)\b|\b(?:blood|urine|breath)\s+ketones?\b/i,
  ),
  rule('ketosis-claim', ['HEALTH_SAFETY-4', 'HS-31'], '"in ketosis"', /\bin\s+ketosis\b/i),

  // HEALTH_SAFETY.md section 3: no extended or compensatory fasting.
  rule(
    'extended-fast',
    ['HEALTH_SAFETY-3', 'HS-31'],
    'extended or dry fasting',
    /\b(?:extended|dry|water)\s+fast(?:s|ing)?\b/i,
  ),
  rule(
    'compensate',
    ['HEALTH_SAFETY-3', 'HS-31'],
    'fasting to compensate',
    /\bcompensat(?:e|es|ed|ing|ion)\b/i,
  ),
  // HEALTH_SAFETY.md section 3, HS-18, C63: rest and food are never framed as breaking a streak.
  rule(
    'streak-loss',
    ['HS-18', 'C63', 'HS-31'],
    'streak-loss wording ("lost your streak", "streak reset")',
    /\b(?:los(?:e|es|t|ing)|break(?:s|ing)?|broke|broken|reset(?:s|ting)?|end(?:s|ed|ing)?|ruin\w*|kill\w*)\s+(?:your\s+|the\s+|a\s+|this\s+)?streak\b|\bstreak\s+(?:is\s+|was\s+|has\s+been\s+)?(?:lost|broken|reset|ended|over|gone)\b/i,
  ),
];

/**
 * Currency wording (HS-16, NN-05). Prices may only ever come from the owner (timestamped) through
 * one formatting function, listed in PRICE_FORMATTER_FILES, so no literal currency appears in
 * source. `{}` is an interpolated value, so `$${price}` and `'$' + price` are caught.
 */
export const currencyRules: readonly ContentRule[] = [
  rule('currency-literal', ['HS-16', 'NN-05'], 'a literal "$" amount', /\$\s?\d|\$\$\{/),
  rule('currency-placeholder', ['HS-16', 'NN-05'], 'a "$" before a value', /\$\s?\{\}/),
  rule(
    'currency-code',
    ['HS-16', 'NN-05'],
    'a literal NZ$ / NZD amount',
    /\bNZ\$|\bNZD\s?(?:\d|\{\})/,
  ),
  rule(
    'currency-words',
    ['HS-16'],
    'an amount in dollars or cents',
    /(?:\b\d+(?:\.\d{1,2})?|\{\})\s?(?:dollars?|cents?)\b/i,
  ),
];

/** Stock, cart-status and promotion wording (HS-16, NN-05, CX-08). */
export const stockAndCartRules: readonly ContentRule[] = [
  rule(
    'stock-status',
    ['HS-16', 'CX-08'],
    '"in stock" / "out-of-stock" / "low stock"',
    /\b(?:in|out[\s_-]*of|low|no)[\s_-]*stock\b/i,
  ),
  rule('sold-out', ['HS-16', 'CX-08'], '"sold out"', /\bsold[\s-]+out\b/i),
  rule(
    'stock-level',
    ['HS-16'],
    '"stock level", "limited stock", "only N left"',
    /\bstock\s+(?:levels?|status)\b|\blimited\s+stock\b|\bstock\s*:\s*\d|\bonly\s+(?:\d+|\{\})\s+left\b/i,
  ),
  rule(
    'cart-status',
    ['HS-16', 'CX-08'],
    '"added to cart", "cart updated" and similar',
    /\b(?:added|adding)\s+to\s+(?:[\w’'-]+\s+){0,3}?(?:cart|trolley|basket)\b|\b(?:cart|trolley|basket)\s+(?:updated|has|contains|total)\b/i,
  ),
  rule(
    'in-cart',
    ['HS-16', 'CX-08'],
    '"in your cart" and similar',
    /\bin\s+(?:your\s+|the\s+)?(?:[\w’'-]+\s+)?(?:cart|trolley|basket)\b/i,
  ),
  rule(
    'specials',
    ['HS-16'],
    'promotions and price comparisons',
    /\b(?:on\s+special|on\s+sale|price\s+drop|cheapest|cheaper|lowest\s+price|best\s+price|club\s+deals?)\b|(?:\b\d+|\{\})\s?%\s+off\b/i,
  ),
];

/** Every price, stock and cart wording rule. */
export const commerceRules: readonly ContentRule[] = [...currencyRules, ...stockAndCartRules];

/** Currency formatting in code, which never shows a "$" in source (HS-16, NN-05). */
export const priceFormatRules: readonly ContentRule[] = [
  rule(
    'intl-currency-style',
    ['HS-16', 'NN-05'],
    "currency formatting (style: 'currency') outside the price formatter",
    /\bstyle\s*:\s*['"`]currency['"`]/,
  ),
  rule(
    'intl-currency-code',
    ['HS-16', 'NN-05'],
    "currency formatting (currency: 'NZD') outside the price formatter",
    /\bcurrency\s*:\s*['"`]NZD['"`]/,
  ),
];

/**
 * The one file that formats owner-entered, timestamped prices. It is exempt from the currency
 * rules and has its own test that refuses a price with no entered-at time (NN-05).
 */
export const PRICE_FORMATTER_FILES: readonly string[] = [
  // Item 24: owner-entered, timestamped prices only (price.test.ts).
  'packages/grocery/src/list/price.ts',
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
    'lab-result',
    ['privacy'],
    'a labelled lab result or blood pressure (the app never stores these)',
    /\b(?:cholesterol|LDL|HDL|non-HDL|triglycerides?|HbA1c|blood[\s-]+pressure)\W{0,4}\d/i,
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
    /(?<![0-9])(?:dob|date[\s_-]*of[\s_-]*birth|birth[\s_-]*date|birthday)\W{0,4}\d/i,
  ),
  rule('nhi', ['privacy'], 'an NHI (National Health Index) reference', /\bNHI\b/),
  rule(
    'nz-mobile',
    ['privacy'],
    'a personal NZ mobile number',
    /(?:\+64|\b0)\s?2\d(?:[\s-]?\d){6,8}\b/,
  ),
  rule(
    'email',
    ['privacy'],
    'an email address (only no-reply and example addresses are allowed)',
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  ),
  rule(
    'backup-marker',
    ['privacy', 'HS-15'],
    'an app backup file (they live only on your phone)',
    /"format"\s*:\s*"diet-backup/,
  ),
  rule('private-key', ['secrets'], 'a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/),
  rule(
    'github-token',
    ['secrets'],
    'a GitHub token',
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}/,
  ),
  rule('aws-key', ['secrets'], 'an AWS access key', /\bAKIA[0-9A-Z]{16}\b/),
  rule('npm-token', ['secrets'], 'an npm token', /\bnpm_[A-Za-z0-9]{36}\b|_authToken\s*=/),
  rule(
    'assigned-secret',
    ['secrets'],
    'a hard-coded secret',
    /(?:api[_-]?key|secret|token|password|passwd)\w*["']?\s*[:=]\s*(?:["'`][^"'`\s]{12,}["'`]|(?=[^\s"'`]*\d)[A-Za-z0-9_\-./+]{16,})/i,
  ),
  rule(
    'env-secret',
    ['secrets'],
    'an unquoted KEY=VALUE secret',
    /^[A-Z0-9_]*(?:TOKEN|SECRET|API_KEY|APIKEY|PASSWORD|PASSWD)\s*=\s*\S{12,}$/m,
  ),
];

/** Addresses that may appear: commit attribution and reserved example domains. */
export const ALLOWED_EMAILS: readonly string[] = ['noreply@anthropic.com'];
export const ALLOWED_EMAIL_PATTERNS: readonly RegExp[] = [
  /@users\.noreply\.github\.com$/,
  /@example\.(?:com|org|net)$/,
];
/** SSH remotes such as git@github.com:owner/repo.git look like addresses but are not. */
export const SSH_REMOTE_USERS: readonly string[] = ['git@github.com'];

const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const extension = (p: string) => {
  const b = basename(p);
  const dot = b.lastIndexOf('.');
  return dot > 0 ? b.slice(dot + 1).toLowerCase() : '';
};

const MEDIA =
  /\.(?:jpe?g|heic|heif|png|gif|webp|bmp|tiff?|avif|ico|mp4|mov|m4v|webm|m4a|mp3|wav|aac)$/i;
const IMAGE = /\.(?:jpe?g|heic|heif|png|gif|webp|bmp|tiff?|avif|ico|svg)$/i;
const ICON_DIRS = /^(?:apps\/[^/]+\/public\/|packages\/ui\/src\/assets\/)/;
const ICON_FILE = /^(?:icon|maskable|apple-touch-icon|favicon|logo|badge)/i;
const ICON_MAX_BYTES = 64 * 1024;
const DATA_DIRS = /^(?:packages\/test-fixtures\/|packages\/core\/data\/)/;
const DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'odt',
  'rtf',
  'xls',
  'xlsx',
  'ods',
  'numbers',
  'pages',
  'zip',
  '7z',
  'gz',
  'tar',
  'eml',
  'msg',
  'bak',
  'enc',
  'log',
  'txt',
  'csv',
  'tsv',
]);
const JSON_ALLOWED: readonly RegExp[] = [
  /(?:^|\/)package\.json$/,
  /(?:^|\/)tsconfig[^/]*\.json$/,
  /^\.prettierrc\.json$/,
  /(?:^|\/)manifest[^/]*\.json$/,
  DATA_DIRS,
  /^tools\/scans\/required-copy\.json$/,
  /^\.vscode\/[^/]+\.json$/,
];

function indexOfBytes(haystack: Uint8Array, needle: readonly number[]): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
const ascii = (s: string) => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const startsWith = (bytes: Uint8Array, prefix: readonly number[]) =>
  prefix.every((b, i) => bytes[i] === b);

/** True for a JPEG or PNG (by content or name) that carries an EXIF block (camera, GPS, time). */
export function hasExifMetadata(path: string, bytes: Uint8Array): boolean {
  const png = startsWith(bytes, PNG_SIGNATURE) || /\.png$/i.test(path);
  const jpeg = startsWith(bytes, [0xff, 0xd8, 0xff]) || /\.jpe?g$/i.test(path);
  if (!png && !jpeg) return false;
  return (
    indexOfBytes(bytes, ascii('Exif\0\0')) >= 0 || (png && indexOfBytes(bytes, ascii('eXIf')) >= 0)
  );
}

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
    test: (p) => /handoff/i.test(basename(p)),
  },
  {
    id: 'backup-file',
    enforces: ['privacy', 'HS-15'],
    description: 'app backup files live only on the phone',
    test: (p) => /backup[^/]*\.json$/i.test(basename(p)) || /\.backup(?:\.|$)/i.test(basename(p)),
  },
  {
    id: 'data-dump',
    enforces: ['privacy'],
    description: 'database files, exports or browser network logs',
    test: (p) => /\.(?:sqlite3?|db|idb|leveldb|har)$/i.test(p),
  },
  {
    id: 'document-or-data-file',
    enforces: ['privacy'],
    description:
      'documents, spreadsheets, archives, logs and CSV/text exports (allowed only as generic data in packages/test-fixtures/ or packages/core/data/)',
    test: (p) =>
      DOCUMENT_EXTENSIONS.has(extension(p)) &&
      !DATA_DIRS.test(p) &&
      !/^apps\/[^/]+\/public\/robots\.txt$/.test(p),
  },
  {
    id: 'json-file',
    enforces: ['privacy', 'HS-15'],
    description:
      'a JSON file outside the allowlist (package, tsconfig and manifest files, fixtures, core data)',
    test: (p) => extension(p) === 'json' && !JSON_ALLOWED.some((r) => r.test(p)),
  },
  {
    id: 'photo-format',
    enforces: ['privacy'],
    description: 'JPEG and HEIC files are camera photos; icons are PNG, SVG, WebP or ICO',
    test: (p) => /\.(?:jpe?g|heic|heif)$/i.test(p),
  },
  {
    id: 'media-outside-icons',
    enforces: ['privacy'],
    description:
      'photos, video or audio (only small app icons are allowed, in public/ or ui assets)',
    test: (p) => MEDIA.test(p) && !ICON_DIRS.test(p),
  },
  {
    id: 'icon-folder-image',
    enforces: ['privacy'],
    description:
      'images in public/ and ui assets must be PNG, SVG, WebP or ICO icons named icon*, maskable*, apple-touch-icon*, favicon*, logo* or badge*, at most 64 KB',
    test: (p, size) =>
      ICON_DIRS.test(p) &&
      IMAGE.test(p) &&
      !(
        /\.(?:png|svg|webp|ico)$/i.test(p) &&
        ICON_FILE.test(basename(p)) &&
        size <= ICON_MAX_BYTES
      ),
  },
  {
    id: 'large-media',
    enforces: ['privacy'],
    description: 'an image over 300 KB is probably a photo, not an icon',
    test: (p, size) => MEDIA.test(p) && size > 300 * 1024,
  },
  {
    id: 'image-metadata',
    enforces: ['privacy'],
    description: 'an image with EXIF metadata (camera, location, time) is a photo, not an icon',
    test: (p, _size, bytes) => bytes !== undefined && hasExifMetadata(p, bytes),
  },
  {
    id: 'camera-file-name',
    enforces: ['privacy'],
    description: 'a camera, screenshot or messaging-app file name',
    test: (p) => /^(?:IMG_|PXL_|DSC|Screenshot|signal-)/.test(basename(p)),
  },
  {
    id: 'secret-file',
    enforces: ['secrets'],
    description: 'secrets files (.dev.vars, .env other than .env.example, keys and certificates)',
    test: (p) => {
      const b = basename(p);
      return (
        b.startsWith('.dev.vars') ||
        (b.startsWith('.env') && b !== '.env.example') ||
        /\.(?:pem|key)$/i.test(b) ||
        /^id_(?:rsa|ed25519)/.test(b)
      );
    },
  },
  {
    id: 'javascript-source',
    enforces: ['conventions'],
    description: 'workspace source is TypeScript (.js/.jsx files skip lint and type checks)',
    test: (p) => /^(?:apps|packages|services)\/[^/]+\/src\/.*\.(?:js|jsx|mjs|cjs)$/i.test(p),
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

/**
 * The service worker's build settings (HS-14, TR-11). The page's Content Security Policy does not
 * cover the service worker, and GitHub Pages cannot send it one, so its settings in
 * apps/<app>/vite.config.ts must not make it load code or fetch files from anywhere else: no
 * extra scripts, no absolute URLs in the offline copy, and no caching of requests at run time.
 * e2e/build-output.spec.ts checks the built sw.js as well.
 */
export const serviceWorkerConfigRules: readonly ContentRule[] = [
  rule(
    'sw-import-scripts',
    ['HS-14', 'TR-11'],
    'importScripts in the service worker settings (it loads code the page policy cannot see)',
    /\bimportScripts\b/,
  ),
  rule(
    'sw-absolute-manifest-entry',
    ['HS-14', 'TR-11'],
    'an absolute or protocol-relative URL in additionalManifestEntries (the offline copy would fetch it)',
    /\badditionalManifestEntries\s*:\s*\[[^\]]*?(?:[a-z][a-z\d+.-]*:)?\/\//i,
  ),
  rule(
    'sw-runtime-caching',
    ['HS-14', 'TR-11'],
    'runtimeCaching other than [] (the service worker would fetch and cache requests at run time)',
    /\bruntimeCaching\s*:(?!\s*\[\s*\])/,
  ),
];

/**
 * Health text lives only in packages/core/src/copy/health.ts (checklist conventions), where it is
 * scanned and reviewed in one place. Screens and the design system import it from there, so their
 * own visible text (string literals and JSX text, not comments) never writes a help number, names
 * a help line or names a health professional.
 */
export const healthTextHomeRules: readonly ContentRule[] = [
  rule(
    'health-text-help-number',
    ['conventions', 'HS-13'],
    'a help-line number written outside health.ts (111, 0800 611 116, 0800 787 797, 8681, 1737)',
    /(?<![\d.,])(?:111|1737|8681|0800[\s-]?611[\s-]?116|0800[\s-]?787[\s-]?797)(?![\d]|[.,]\d)/,
  ),
  rule(
    'health-text-service',
    ['conventions', 'HS-13'],
    'a help line or health professional named outside health.ts',
    /\b(?:help[\s-]?lines?|healthline|clinicians?|dieti[ct]ians?|midwi(?:fe|ves)|pharmacists?)\b/i,
  ),
  rule(
    'health-text-gp',
    ['conventions', 'HS-13'],
    '"GP" written outside health.ts (case-sensitive)',
    /\bGPs?\b/,
  ),
];

/**
 * AI SDKs: banned in the dependency tree and in imports (no AI calls at runtime). Entries ending
 * in "/" or "-" are prefixes (a whole npm scope, or a family of packages); anything else must
 * match the package name exactly.
 */
export const AI_PACKAGES: readonly string[] = [
  'openai',
  'ai',
  'cohere-ai',
  'ollama',
  'langchain',
  'llamaindex',
  'groq-sdk',
  'replicate',
  '@anthropic-ai/',
  '@ai-sdk/',
  '@google/genai',
  '@google/generative-ai',
  '@google-cloud/vertexai',
  '@mistralai/',
  '@huggingface/',
  '@langchain/',
  '@mlc-ai/',
  '@xenova/',
  '@azure/openai',
  '@aws-sdk/client-bedrock',
  '@aws-sdk/client-bedrock-',
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const AI_SPECIFIER = AI_PACKAGES.map((p) =>
  p.endsWith('/') || p.endsWith('-')
    ? `${escapeRegExp(p)}[^'"\`\\s]*`
    : `${escapeRegExp(p)}(?:\\/[^'"\`\\s]*)?`,
).join('|');

/** AI services and telemetry: banned in source and in the dependency tree. */
export const aiAndTelemetryRules: readonly ContentRule[] = [
  rule(
    'ai-endpoint',
    ['no-ai-runtime'],
    'an AI service endpoint or SDK',
    /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|@anthropic-ai\/sdk|['"]openai['"]|@google\/generative-ai|@google\/genai|\blangchain\b|api\.mistral\.ai|api\.cohere\.ai/i,
  ),
  rule(
    'ai-import',
    ['no-ai-runtime'],
    'an import or require of an AI SDK',
    new RegExp(`(?:\\bfrom|\\bimport|\\brequire)\\s*\\(?\\s*['"\`](?:${AI_SPECIFIER})['"\`]`),
  ),
  rule(
    'remote-asset',
    ['HEALTH_SAFETY-7'],
    'fonts, icons or scripts fetched from a CDN (they must be bundled)',
    /https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|use\.typekit\.net|kit\.fontawesome\.com|www\.googletagmanager\.com|www\.google-analytics\.com|storage\.googleapis\.com\/workbox-cdn)/i,
  ),
];

/** Package names (or prefixes, ending in "/" or "-") that collect telemetry or analytics. */
export const TELEMETRY_PACKAGES: readonly string[] = [
  '@sentry/',
  '@sentry-internal/',
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
  '@storybook/telemetry',
  'update-notifier',
  'checkpoint-client',
  '@rudderstack/',
  'rudder-sdk-js',
  'statsig-',
  'launchdarkly-',
];

/**
 * Tools that send telemetry unless configured off. If the package is in the lockfile, one of the
 * listed config files must exist and contain the setting (the CI env also sets DO_NOT_TRACK).
 */
export const MUST_CONFIGURE_OFF: readonly {
  package: string;
  files: readonly string[];
  setting: RegExp;
  description: string;
}[] = [
  {
    package: 'wrangler',
    files: [
      'services/relay/wrangler.toml',
      'services/relay/wrangler.jsonc',
      'services/relay/wrangler.json',
    ],
    setting: /^\s*send_metrics\s*=\s*false\b|"send_metrics"\s*:\s*false\b/m,
    description: 'Wrangler usage metrics must be off: send_metrics = false',
  },
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
  // The SIL Open Font Licence, for fonts bundled with the app (never fetched from a font service).
  'OFL-1.1',
];

/** Disabled tests hide failing safety checks (a skipped HS-xx test still "passes"). */
export const disabledTestRules: readonly ContentRule[] = [
  rule(
    'disabled-test',
    ['TEST_PLAN-5'],
    'a skipped, todo or conditional test',
    /\b(?:it|test|describe|suite|bench)(?:\.\w+)*\.(?:skip|todo|skipIf|runIf|fixme)\b|\.(?:todo|skipIf|runIf)\s*\(|\bx(?:it|describe|test)\s*\(/,
  ),
];

/** The only test files allowed to contain those patterns: they prove the rule fires. */
export const DISABLED_TEST_EXEMPT_FILES: readonly string[] = [
  'tools/scans/rules.test.ts',
  'tools/scans/seeded.test.ts',
];

/**
 * Extension guard (IMPLEMENTATION_CHECKLIST conventions; CX-00, CX-01). Nothing may read or change
 * paknsave.co.nz pages, cookies, storage or network unless INTEGRATION_FEASIBILITY.md 9.3 records
 * mode A as approved. `document.cookie` is never allowed.
 */
export const extensionAlwaysRules: readonly ContentRule[] = [
  rule(
    'document-cookie',
    ['CX-01', 'conventions'],
    'document.cookie (never read or write site cookies)',
    /\bdocument\s*\.\s*cookie\b/,
  ),
];

export const extensionModeARules: readonly ContentRule[] = [
  rule(
    'extension-content-scripts',
    ['CX-00', 'CX-01'],
    'content scripts (only in an approved mode A)',
    /\bcontent_scripts\b/,
  ),
  rule(
    'extension-page-api',
    ['CX-00', 'CX-01'],
    'chrome.cookies, chrome.scripting or chrome.webRequest (only in an approved mode A)',
    /\b(?:chrome|browser)\s*\.\s*(?:cookies|scripting|webRequest\w*)\b/,
  ),
  rule(
    'extension-permission',
    ['CX-00', 'CX-01'],
    'a cookies, scripting or webRequest permission (only in an approved mode A)',
    /permissions['"]?\s*:\s*\[[^\]]*?['"](?:cookies|scripting|webRequest\w*)['"]/,
  ),
  rule(
    'extension-store-host',
    ['CX-00', 'CX-01'],
    'paknsave.co.nz in host_permissions or matches (only in an approved mode A)',
    /\b(?:host_permissions|matches)['"]?\s*:\s*\[[^\]]*?paknsave\.co\.nz/,
  ),
];

/** Fails every extension file except its README while the Phase 0 decision is pending. */
export const extensionPendingPathRule: PathRule = {
  id: 'extension-before-decision',
  enforces: ['CX-00', 'checklist-11'],
  description: 'no extension code until INTEGRATION_FEASIBILITY.md 9.3 records the owner decision',
  test: (p) => p.startsWith('apps/cart-extension/') && p !== 'apps/cart-extension/README.md',
};

/**
 * The relay is blind (checklist item 29; TR-02, HS-14). Its code and the shared relay protocol hold
 * no encryption or key handling (crypto.subtle only as crypto.subtle.digest, for the room-id hash),
 * never log and never use the Cache API. Read as raw text, comments included; the network rules
 * already cover outbound requests from services/.
 */
export const relayBlindRules: readonly ContentRule[] = [
  rule(
    'relay-crypto',
    ['TR-02'],
    'encryption, decryption or key handling in the relay',
    /\b(?:encrypt|decrypt|wrapKey|unwrapKey|importKey|exportKey|generateKey|deriveKey|deriveBits)\b|AES-GCM/,
  ),
  rule(
    'relay-subtle',
    ['TR-02'],
    'crypto.subtle in the relay, other than crypto.subtle.digest(',
    /\bsubtle\b(?!\.digest\()/,
  ),
  rule('relay-console', ['TR-02', 'HS-14'], 'console in the relay (it never logs)', /\bconsole\b/),
  rule('relay-cache-api', ['TR-02'], 'the Cache API in the relay', /\bcaches\b/),
];

/**
 * Device-only stores (checklist item 19; HEALTH_SAFETY section 7; HS-15, C49, GD-02, G8). Garden
 * photos never leave the phone: every export reads BACKUP_TABLES, which leaves them out. Only the
 * files in DEVICE_ONLY_ALLOWED_FILES may name the photo store or reach every store generically.
 * This raw rule reads the whole text, comments included; the compiler-based scan (deviceOnly.ts,
 * described by DEVICE_ONLY_CODE_RULES below) reads the code with its types, so an alias, an
 * escape, a template, a `+`, a cast or Dexie's own internals cannot pass it. Both check
 * references, not behaviour: the exporters among the allowed files are proven at run time
 * (apps/mobile-web/src/db/backup.test.ts B3, e2e/garden.spec.ts E1).
 */
export const deviceOnlyRules: readonly ContentRule[] = [
  rule(
    'device-only-store-name',
    ['HS-15', 'GD-02'],
    'the garden photo store named outside the files allowed to (DEVICE_ONLY_ALLOWED_FILES)',
    /\bgarden_photos\b|\bgardenPhotos\b|\bGardenPhotoRecord\b/,
  ),
];

/** What each rule of the compiler-based scan (deviceOnly.ts) enforces, for the report. */
export const DEVICE_ONLY_CODE_RULES: Readonly<
  Record<string, { readonly enforces: readonly string[]; readonly description: string }>
> = {
  'device-only-store-name': {
    enforces: ['HS-15', 'GD-02'],
    description:
      'the garden photo store named (an identifier, or a string folded from literals and constants) outside the files allowed to',
  },
  'generic-store-access': {
    enforces: ['HS-15', 'GD-02'],
    description:
      'every store reached generically (.table() or .objectStore() without one literal name, db.tables, core, idbdb, a computed member, a database object cast or passed where its type is lost, a list of every store)',
  },
  'database-opened': {
    enforces: ['HS-15', 'GD-02'],
    description: 'a database opened (IDBFactory.open, a new Dexie) outside the files allowed to',
  },
  'test-only-import': {
    enforces: ['GD-02', 'conventions'],
    description:
      'test data or a test helper imported by a file that is not a test (TEST_SUPPORT_FILES)',
  },
};

/**
 * Files that are not tests but serve only tests (synthetic records written through the
 * repositories, raw writers). Only tests, these files and packages/test-fixtures may import them
 * or @diet/test-fixtures (test-only-import), so test data never reaches the app.
 */
export const TEST_SUPPORT_FILES: readonly string[] = [
  'apps/mobile-web/src/db/testKit.ts',
  // Item 24: the health-sentinel phone (GL-10; item 31's N8 uses it too).
  'apps/mobile-web/src/db/testSentinels.ts',
  'apps/mobile-web/src/onboarding/flowTestKit.ts',
  'apps/mobile-web/src/screens/drinks/drinksTestKit.ts',
  'apps/mobile-web/src/screens/move/moveTestKit.ts',
  'apps/mobile-web/src/screens/pairing/pairingTestKit.ts',
  'apps/mobile-web/src/screens/targets/targetsTestKit.ts',
  'apps/mobile-web/src/screens/today/todayTestKit.ts',
  'packages/grocery/src/transfer/testKit.ts',
  'services/relay/src/testKit.ts',
];

/**
 * The only workspace files that may name the photo store or reach stores generically, each named
 * on its own (no directory prefix) with its reason. Nothing under storage/backup/ is here.
 */
export const DEVICE_ONLY_ALLOWED_FILES: readonly string[] = [
  // The record types, the store lists and their specs: where the photo store is defined.
  'packages/core/src/storage/records.ts',
  'packages/core/src/storage/tables.ts',
  'packages/core/src/storage/migrations.ts',
  'packages/core/src/storage/specs/v1.ts',
  // The garden-photo invariant (a photo needs its garden row).
  'packages/core/src/storage/invariants.ts',
  // The plain names of the device-only stores, for refusing a file that wrongly holds one.
  'packages/core/src/copy/health.ts',
  // The database, its validation middleware (the photo check), upgrade, import and rescue reads.
  'apps/mobile-web/src/db/db.ts',
  'apps/mobile-web/src/db/middleware.ts',
  'apps/mobile-web/src/db/upgrade.ts',
  'apps/mobile-web/src/db/snapshot.ts',
  'apps/mobile-web/src/db/rescue.ts',
  // Test helpers (synthetic photo rows, raw writers); only tests import it (test-only-import).
  'apps/mobile-web/src/db/testKit.ts',
  // The repositories: the photo repository, its registration, removal with a garden row.
  'apps/mobile-web/src/db/repos/index.ts',
  'apps/mobile-web/src/db/repos/crud.ts',
  'apps/mobile-web/src/db/repos/gardenPhotos.ts',
  // Item 14: the clock high-water mark reads every BACKUP_TABLES store (backed-up stores only).
  'apps/mobile-web/src/db/repos/kickstart.ts',
  // Item 19: the garden screen's only way to the photos.
  'apps/mobile-web/src/garden/photoStore.ts',
  // Test data, which no app file may import (test-only-import): the released version-1 snapshot
  // of every store (its hash is pinned, so it cannot change), the test migration chains built from
  // the version-1 specs, and the backup mutations that put a device-only store into a file to prove
  // that import refuses it.
  'packages/test-fixtures/src/storage/snapshotV1.ts',
  'packages/test-fixtures/src/storage/testChains.ts',
  'packages/test-fixtures/src/storage/fuzzMutations.ts',
];

/**
 * Pairing and the transfer code (checklist item 30; TR-01, TR-02, HS-15, HS-38, C83). Each
 * rule has its own scope (scan.ts TRANSFER_GUARD): only sealForRelay makes a sealed body; the
 * pairing code never touches web storage or the console; the QR decoder loads only on demand, from
 * one file; the QR generator stays in the test fixtures. Read as raw text, comments included.
 */
export const sealedBodyCastRule = rule(
  'sealed-body-cast',
  ['TR-01', 'TR-02'],
  'a cast to SealedRelayBody (only sealForRelay in envelope.ts makes one)',
  /\bas\s+SealedRelayBody\b|<SealedRelayBody>/,
);
export const pairingWebStorageRule = rule(
  'pairing-web-storage',
  ['HS-15', 'HS-38', 'TR-10'],
  'web storage or the console in the pairing and transfer code (the key is never kept there or logged)',
  /\b(?:localStorage|sessionStorage|console)\b/,
);
export const qrDecoderImportRule = rule(
  'qr-decoder-import',
  ['C83'],
  'a static import of jsqr (the bundled QR decoder loads only on demand, from qrDecoders.ts)',
  /^\s*(?:import|export)\s+(?!type\s)[^;\n]*\bfrom\s+['"]jsqr['"]|\brequire\s*\(\s*['"]jsqr['"]/m,
);
export const qrDecoderLoadRule = rule(
  'qr-decoder-import',
  ['C83'],
  'import("jsqr") outside qrDecoders.ts (it exports loadBundledJsQr for every other use)',
  /\bimport\s*\(\s*['"]jsqr['"]\s*\)/,
);
export const qrGeneratorTestOnlyRule = rule(
  'qr-generator-test-only',
  ['conventions'],
  'qrcode-generator outside packages/test-fixtures (it draws test images only)',
  /['"]qrcode-generator['"]/,
);
export const transferGuardRules: readonly ContentRule[] = [
  sealedBodyCastRule,
  pairingWebStorageRule,
  qrDecoderImportRule,
  qrDecoderLoadRule,
  qrGeneratorTestOnlyRule,
];

/**
 * Files that intentionally contain violations (rule definitions and their test inputs). They are
 * exempt from every content rule set, never from the path rules. Add a file only with a reason.
 */
export const CONTENT_EXEMPT_FILES: readonly string[] = [
  // The rules themselves and the strings that prove each rule fires.
  'tools/scans/rules.ts',
  'tools/scans/rules.test.ts',
  'tools/scans/extract.test.ts',
  // Seeds violations into throwaway repositories.
  'tools/scans/seeded.test.ts',
  // Fake lockfiles that list telemetry and AI packages.
  'tools/scans/deps.test.ts',
  // The docs' required sentences, including "Review in cart", which stays blocked until mode A.
  'tools/scans/required-copy.json',
];
