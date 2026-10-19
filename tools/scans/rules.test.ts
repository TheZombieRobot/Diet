import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aiAndTelemetryRules,
  commerceRules,
  disabledTestRules,
  extensionAlwaysRules,
  extensionModeARules,
  healthPhraseRules,
  networkRules,
  personalDataRules,
  personalPathRules,
  priceFormatRules,
  type ContentRule,
} from './rules';
import { formatViolations, scanPath, scanText, scanVisible, violationKeys } from './scan';

// Every string below is a synthetic probe. Most come from the item 2-3 reviews: each was shown to
// slip past the first version of the rules, so each is now a must-flag case.

const hits = (text: string, rules: readonly ContentRule[]) =>
  scanText('apps/mobile-web/src/x.tsx', text, rules).map((v) => v.ruleId);

/** What the scan sees in a screen file: literals and JSX text, not comments. */
const visibleHits = (code: string, rules: readonly ContentRule[], file = 'apps/x/src/X.tsx') =>
  scanVisible(file, code, rules).map((v) => v.ruleId);

const pathHits = (path: string, size = 1000, bytes?: Uint8Array) =>
  scanPath(path, size, personalPathRules, bytes).map((v) => v.ruleId);

describe('health wording (HS-07, HS-08, HS-19, HS-21, AL-11)', () => {
  it.each([
    // HS-07: taper, reduction and quit wording.
    ['Cut down by one drink a day', 'taper-cut-down-by'],
    ['Cut back by one drink a day', 'taper-cut-down-by'],
    ['Cut it down by one drink a day', 'taper-cut-down-by'],
    ['Cut your drinking down by one a day', 'taper-cut-down-by'],
    ['Cut down to two a day this week', 'taper-cut-down-by'],
    ['Cut back by one drink each week', 'taper-cut-down-by'],
    ['Simmer to reduce by half', 'taper-reduce-by'],
    ['Reduce it by one drink each day', 'taper-reduce-by'],
    ['Reduce your drinking by one can a day', 'taper-reduce-by'],
    ['Ease off by one can a week', 'taper-ease-off'],
    ['A gentle taper plan', 'taper-taper'],
    ['Tapering helps', 'taper-taper'],
    ['Pick a quit date', 'taper-quit-date'],
    ['Set a quit day', 'taper-quit-date'],
    ['Choose your quit-date', 'taper-quit-date'],
    ['Set a date to quit', 'taper-quit-date'],
    ['Choose your stop date', 'taper-quit-date'],
    ['Time to stop drinking', 'taper-stop-drinking'],
    ['Time to quit drinking', 'taper-stop-drinking'],
    ['Quit drinking on Monday', 'taper-stop-drinking'],
    ['Consider giving up alcohol', 'taper-stop-drinking'],
    ['Give up alcohol this week', 'taper-stop-drinking'],
    ['Stop your drinking gradually', 'taper-stop-drinking'],
    ['Stop alcohol for a month', 'taper-stop-drinking'],
    ['Cut out alcohol entirely', 'taper-stop-drinking'],
    ['Wean yourself off', 'taper-wean'],
    ['Your reduction schedule', 'taper-schedule'],
    ['Your cut-down plan', 'taper-schedule'],
    ['Step-down plan for drinks', 'taper-schedule'],
    ['Weekly reduction: one can', 'taper-schedule'],
    ['Have one fewer drink each day', 'taper-fewer-drinks'],
    ['Halve your drinking this month', 'taper-fewer-drinks'],
    ['Drop to 2 drinks a day next week', 'taper-fewer-drinks'],
    ['A weekend detox', 'detox'],
    // HS-08: blood alcohol and driving.
    ['Estimated BAC 0.05', 'bac'],
    ['Your blood alcohol is', 'blood-alcohol'],
    ['blood-alcohol level', 'blood-alcohol'],
    ['Alcohol level in your blood', 'blood-alcohol'],
    ['Breath alcohol estimate', 'breath-alcohol'],
    ['Use a breathalyser', 'breath-alcohol'],
    ['Use a breathalyser before leaving', 'breath-alcohol'],
    ['Your BrAC is', 'breath-alcohol'],
    ['You are safe to drive', 'safe-to-drive'],
    ['safe-to-drive', 'safe-to-drive'],
    ['Under the legal limit', 'legal-limit'],
    ['Stay under the legal-limit', 'legal-limit'],
    ['You may be over the limit', 'the-limit'],
    ['Under the limit to get home', 'the-limit'],
    ['behind the wheel', 'behind-the-wheel'],
    ['Wait 3 hours before getting behind the wheel', 'behind-the-wheel'],
    ['Okay to get behind the wheel', 'behind-the-wheel'],
    ['Do not operate a vehicle', 'operate-vehicle'],
    ['Do not drive after this', 'driving'],
    ['Drink-driving is dangerous', 'driving'],
    ['Drive through the heel', 'driving'],
    ['Sober up first', 'sober-up'],
    ['Sobered up by morning', 'sober-up'],
    ['Sobers up in about 3 hours', 'sober-up'],
    ['Your body clears about one standard drink an hour', 'clearance-rate'],
    ['Out of your system by 7 am', 'out-of-system'],
    // HS-19: energy as permission to drink, rewards.
    ['400 calories left', 'energy-left'],
    ['kcal remaining today', 'energy-left'],
    ['400 cals left', 'energy-left'],
    ['400 kcals left', 'energy-left'],
    ['1 calorie left', 'energy-left'],
    ['cals left for drinks', 'energy-left'],
    ['kcal to go', 'energy-left'],
    ['{left} {unit} left today', 'energy-left'],
    ['Remaining calories', 'remaining-energy'],
    ["You've earned a drink", 'earned'],
    ['You have earnt a drink', 'earned'],
    ['Your weekly allowance', 'allowance'],
    ['Drinks left this week', 'drinks-left'],
    ['6.8 std left this week', 'drinks-left'],
    ['3 cans left this week', 'drinks-left'],
    ['2 cans left this week', 'drinks-left'],
    ['3 beers left', 'drinks-left'],
    ['3 units left', 'drinks-left'],
    ['Standard drinks to go: 6', 'drinks-left'],
    ['2 more drinks allowed', 'drinks-left'],
    ['Budget for drinks tonight', 'drink-budget'],
    ['Calorie budget for drinks', 'drink-budget'],
    ['Your alcohol budget', 'drink-budget'],
    ['You have room for two more', 'drink-budget'],
    ['Room for a drink tonight', 'drink-budget'],
    ['Room for 2 drinks tonight', 'drink-budget'],
    ['Spare calories for a beer', 'drink-budget'],
    ['Leftover kcal', 'drink-budget'],
    ['Bank calories for the weekend', 'drink-budget'],
    ['You can still have 2 drinks', 'drink-budget'],
    ['Allowed drinks: 3', 'drink-budget'],
    ['Drink credits', 'drink-budget'],
    ['You unlocked a bonus drink', 'drink-budget'],
    ['Reward yourself', 'reward'],
    ['Treat yourself tonight', 'treat-yourself'],
    ['Well deserved', 'treat-yourself'],
    ['A safe amount of alcohol', 'safe-amount'],
    ['A healthy amount of alcohol', 'safe-amount'],
    ['Low-risk drinking: up to 15 a week', 'safe-amount'],
    // HEALTH_SAFETY.md section 5: no alcohol streaks, badges, limits or targets.
    ['3 alcohol-free days in a row', 'alcohol-reward-label'],
    ['Alcohol-free streak: 4', 'alcohol-reward-label'],
    ['Weekly limit', 'alcohol-reward-label'],
    ['Your drinks target', 'alcohol-reward-label'],
    // HEALTH_SAFETY.md sections 1 and 6, NN-09: never "you are safe".
    ['You are safe to fast', 'safe-to'],
    ['Fasting is safe for you', 'safe-to'],
    ['It is safe for you to fast', 'safe-to'],
    ['You can safely fast for 23 hours', 'safe-to'],
    ['Safe to start fasting', 'safe-to'],
    ['Safe to keep going', 'safe-to'],
    ['This plan is safe', 'safe-to'],
    ['Exercise is safe on this plan', 'safe-to'],
    ['Safe drinking', 'safe-to'],
    ['You’re safe now', 'safe-to'],
    ["You're safe now", 'safe-to'],
    // HS-21 / HS-26 / NN-03: no kilograms tied to time, no kg by date.
    ['Lose 5 kg in 2 weeks', 'kg-in-time'],
    ['Drop 3 kilos within a fortnight', 'kg-in-time'],
    ['Kickstart: expect around 3–5 kg over the first three weeks', 'kg-in-time'],
    ['Expect 5 kg in the first 3 weeks', 'kg-in-time'],
    ['Most people drop 4 kg during Kickstart', 'kg-in-time'],
    ['Around 3 kg in your first fortnight', 'kg-in-time'],
    ['5 kg over the next 21 days', 'kg-in-time'],
    ['Lose 2–3 kg a week in Kickstart', 'kg-in-time'],
    ['Lose five kilos in two weeks', 'kg-in-time'],
    ['You lost 4 kg in 9 days', 'kg-in-time'],
    ['Lose {kg} kg in {weeks} weeks', 'kg-in-time'],
    ['Typical: 3–5 kg in the first three weeks', 'kg-in-time'],
    ['Lose 2–4 kg during Kickstart', 'kg-in-time'],
    ['Expect 4 kg down by week 3', 'kg-in-time'],
    ['about 5 kg in just 3 weeks', 'kg-in-time'],
    ['five kilograms in three weeks', 'kg-in-time'],
    ['lose 10 kg', 'lose-n-kg'],
    ['Lose 2–3 kg', 'lose-n-kg'],
    ['Lose 2-3 kg', 'lose-n-kg'],
    ['Loses 3 kg', 'lose-n-kg'],
    ['Shed 5 kg', 'lose-n-kg'],
    ['Lose ten kilograms this month', 'lose-n-kg'],
    ['70 kg by Christmas', 'kg-by'],
    ['${goalKg} kg by ${d}', 'kg-by'],
    ['Results guaranteed', 'guarantee'],
    // HEALTH_SAFETY.md section 2.
    ['Your ideal weight', 'ideal-weight'],
    ['Your healthy weight is 75 kg', 'ideal-weight'],
    ['Body fat estimate', 'body-fat'],
    ['Body-fat percentage: 28%', 'body-fat'],
    ['Estimated fat mass', 'fat-mass'],
    // HEALTH_SAFETY.md section 4.
    ['A fat-burning meal', 'fat-burning'],
    ['Fat burner', 'fat-burning'],
    ['Fasting burns fat', 'burns-fat'],
    ['After 16 hours you start burning fat', 'burns-fat'],
    ['Burn fat faster', 'burns-fat'],
    ['Take a magnesium supplement', 'supplement'],
    ['Take a magnesium tablet', 'supplement-form'],
    ['Try electrolyte tablets or powder', 'supplement-form'],
    ['Add MCT oil to your coffee', 'mct'],
    ['Exogenous ketones help', 'exogenous-ketones'],
    ['Check your ketone strips', 'ketone-measure'],
    ['Check blood ketones', 'ketone-measure'],
    ['Ketone testing at home', 'ketone-measure'],
    ['You are in ketosis now', 'ketosis-claim'],
    // HEALTH_SAFETY.md section 3.
    ['Try an extended fast', 'extended-fast'],
    ['Fast tomorrow to compensate', 'compensate'],
  ])('flags %j', (text, ruleId) => {
    expect(hits(text, healthPhraseRules)).toContain(ruleId);
  });

  it.each([
    // Split by markup, entities, JSX expressions or concatenation (extract.ts joins them up).
    ['<p>Your <b>quit</b> date</p>', 'taper-quit-date'],
    ['<p><strong>Please stop</strong> drinking</p>', 'taper-stop-drinking'],
    ["<p>Please stop{' '}drinking</p>", 'taper-stop-drinking'],
    ['<p>Please stop&nbsp;drinking</p>', 'taper-stop-drinking'],
    ['<p>Cut down&nbsp;by one a day</p>', 'taper-cut-down-by'],
    ['<p>You could cut <b>down</b> by one</p>', 'taper-cut-down-by'],
    ["export const t =\n  'You could cut down ' +\n  'by one drink a day';", 'taper-cut-down-by'],
    ['<p>Calories&nbsp;left</p>', 'energy-left'],
    ['<p>{left} {unit} left today</p>', 'energy-left'],
    ['const t = `${remaining} ${energyUnit} remaining`;', 'energy-left'],
    ['<p>{n} kcal <span className="muted">left</span></p>', 'energy-left'],
    ['<p>Calories{" "}\n  <em>left</em></p>', 'energy-left'],
    ['<p>Lose {kg} kg in {weeks} weeks</p>', 'kg-in-time'],
    ['<p>Lose&nbsp;5&nbsp;kg in 2 weeks</p>', 'kg-in-time'],
    ['const s = `Lose ${kg} kg in ${days} days`;', 'kg-in-time'],
    ['const s = `${goalKg} kg by ${formatDate(d)}`;', 'kg-by'],
    ['const s = `${kg} kg by ${date}`;', 'kg-by'],
    ['<p>{toLose} kg by {targetDate}</p>', 'kg-by'],
    ['<p>5&nbsp;kg by Christmas</p>', 'kg-by'],
    ['<p>You&apos;re safe</p>', 'safe-to'],
    ["const t = 'You&rsquo;re safe';", 'safe-to'],
    ['<Badge>3 alcohol-free days in a row!</Badge>', 'alcohol-reward-label'],
    ['<p>Alcohol-free streak: {n}</p>', 'alcohol-reward-label'],
    ["const label = 'Weekly limit';", 'alcohol-reward-label'],
    ["export const cue = { pushUp: 'Drive through your palms' };", 'driving'],
  ])('flags %j in a screen file', (code, ruleId) => {
    expect(visibleHits(code, healthPhraseRules)).toContain(ruleId);
  });

  it.each([
    ['<p>Blood&#32;alcohol</p>', 'blood-alcohol'],
    ['<p>Blood&#x20;alcohol</p>', 'blood-alcohol'],
    ['<p>Stop <em>drinking</em></p>', 'taper-stop-drinking'],
    ['<p>Cut do&shy;wn by one</p>', 'taper-cut-down-by'],
  ])('flags %j in an HTML file', (html, ruleId) => {
    expect(visibleHits(html, healthPhraseRules, 'apps/mobile-web/index.html')).toContain(ruleId);
  });

  it('flags text built at runtime once it is evaluated (healthCopy.test.ts checks health.ts)', () => {
    const built = ['Pick a quit', 'date'].join(' ');
    expect(hits(built, healthPhraseRules)).toContain('taper-quit-date');
  });

  it('catches a phrase wrapped across two lines, and reports where it starts', () => {
    const found = scanText(
      'apps/mobile-web/src/x.tsx',
      'line one\n  <p>You could cut down\n  by one a day</p>\n',
      healthPhraseRules,
    );
    expect(found.map((v) => [v.ruleId, v.line, v.column])).toEqual([['taper-cut-down-by', 2, 16]]);
  });

  it.each([
    'Bacon and eggs', // "BAC" is case-sensitive and whole-word
    'What you learned this week', // "earned" is whole-word
    'Back to the plan', // not BAC
    'If you drink most days or heavily at weekends, cutting down suddenly can be dangerous.',
    'the safest first step is a conversation, not a sudden stop.',
    'About 0.5–1 kg a week is the pace that holds.',
    'About 0.5–1 kg a week is the pace that holds. A kilogram back after Kickstart is water, not failure.',
    'faster than 1 kg per week for three consecutive weeks',
    'The card appears only after three straight weeks of losing more than 1 kg a week.',
    'A day-to-day swing of a kilogram or two is usually water.',
    'Fixture profile 90 kg start, 70 kg long-term goal',
    'Typical first weeks on a carb ceiling see several kilograms go.',
    'a litre of water is a kilogram',
    'No alcohol use is risk-free.',
    'At least 2 alcohol-free days every week.',
    'Simmer until thickened',
    'Stop if you feel unwell',
    'Never swim alone, never after drinking.',
    'Talk to a professional before changing your drinking.',
    'Safeswim',
    'Jogging unlocks after four tolerated walks.',
    'Push through your palms',
    'webdriver',
    'Electrolytes: sodium, potassium, magnesium. Garden sources: silverbeet, spinach, avocado.',
    'Heat and hydration: carry water; 500 mL per hour of activity in the heat is the in-app default.',
  ])('does not flag %j', (text) => {
    expect(hits(text, healthPhraseRules)).toEqual([]);
  });

  it('does not read comments in code, only the text a person would see', () => {
    const code = [
      '// The gate logic is driven by the readiness answers.',
      '/* Dexie guarantees the transaction is atomic; compensate for DST. */',
      "export const label = 'Rest day, that counts';",
    ].join('\n');
    expect(visibleHits(code, healthPhraseRules, 'packages/core/src/x.ts')).toEqual([]);
  });
});

describe('price, stock and cart wording (HS-16, NN-05, CX-08)', () => {
  it.each([
    ['Only $4.50', 'currency-literal'],
    ['Price: $ 3', 'currency-literal'],
    ['const label = `$${price}`', 'currency-literal'],
    ['NZ$12', 'currency-code'],
    ['NZD 12', 'currency-code'],
    ['5 dollars', 'currency-words'],
    ['In stock at Pāpāmoa', 'stock-status'],
    ['Out of stock', 'stock-status'],
    ['Out-of-stock', 'stock-status'],
    ['In-stock', 'stock-status'],
    ['Sold out', 'sold-out'],
    ['Stock level: high', 'stock-level'],
    ['Only 3 left', 'stock-level'],
    ['Limited stock', 'stock-level'],
    ['Stock: 12', 'stock-level'],
    ['Added to cart', 'cart-status'],
    ['Added to basket', 'cart-status'],
    ['Added to the cart', 'cart-status'],
    ["Added to your PAK'nSAVE cart", 'cart-status'],
    ['Cart updated', 'cart-status'],
    ['Your cart has 3 items', 'cart-status'],
    ['Already in your cart', 'in-cart'],
    ['In your basket', 'in-cart'],
    ["3 items in your PAK'nSAVE trolley", 'in-cart'],
    ['Review in cart', 'in-cart'],
    ['On special this week', 'specials'],
    ['Club Deal', 'specials'],
    ['20% off', 'specials'],
    ['Cheaper at Pāpāmoa', 'specials'],
    ['Lowest price', 'specials'],
  ])('flags %j', (text, ruleId) => {
    expect(hits(text, commerceRules)).toContain(ruleId);
  });

  it.each([
    ['<td>${item.price}</td>', 'currency-placeholder'],
    ["const s = '$' + price.toFixed(2);", 'currency-placeholder'],
    ['const label = `$ ${price}`;', 'currency-placeholder'],
    ['const s = "NZD " + price;', 'currency-code'],
    ['<span>On&nbsp;special</span>', 'specials'],
    ['<span>Out-of-stock</span>', 'stock-status'],
    ["const status = 'inStock';", 'stock-status'],
    ['<span>{n}% off</span>', 'specials'],
  ])('flags %j in a screen file', (code, ruleId) => {
    expect(visibleHits(code, commerceRules)).toContain(ruleId);
  });

  it('flags currency formatting outside the price formatter', () => {
    const code = "new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(p)";
    expect(hits(code, priceFormatRules)).toEqual(['intl-currency-style', 'intl-currency-code']);
  });

  it.each([
    'const s = `${name} x ${count}`',
    'Prices: unknown unless you add them',
    'Price: unknown',
    'Stock: unknown',
    'Prices and stock are whatever the site shows. You add items and check out yourself.',
    'This panel does not read PAK’nSAVE pages.',
    'not stocked',
    'Cook the rice in the stock.',
    'Add a stock cube',
    'stockpile',
    'Goals cannot be set below your current weight by more than 20% at a time.',
    'Estimated savings only when you have entered a price.',
  ])('does not flag %j', (text) => {
    expect(hits(text, commerceRules)).toEqual([]);
  });
});

describe('personal data and secrets', () => {
  it.each([
    ['LDL 4.2 mmol/L', 'lipid-result'],
    ['total cholesterol was 6.1 mmol/L', 'mmol'],
    ['LDL 4.2', 'lab-result'],
    ['Total cholesterol 6.2 (no breakdown)', 'lab-result'],
    ['HbA1c: 40', 'lab-result'],
    ['blood pressure 120/80', 'lab-result'],
    ['triglycerides = 1.1', 'lab-result'],
    ['I weigh 104 kg', 'first-person-health'],
    ['my BMI is 31', 'first-person-health'],
    ['DOB: 1980-01-01', 'date-of-birth'],
    ["dob: '2000-01-01'", 'date-of-birth'],
    ['"dateOfBirth": "2000-01-01"', 'date-of-birth'],
    ['"DOB": "01/01/2000"', 'date-of-birth'],
    ['ownerDob = "2000-01-01"', 'date-of-birth'],
    ['birth_date: 2000-01-01', 'date-of-birth'],
    ['NHI ABC1234', 'nhi'],
    ['Call me on 021 555 1234', 'nz-mobile'],
    ['+64 21 555 1234', 'nz-mobile'],
    ['0270 000 000', 'nz-mobile'],
    ['someone@gmail.com', 'email'],
    ['jane.citizen@anthropic.com', 'email'],
    ['jane@example.com.au', 'email'],
    ['x@example.org.nz', 'email'],
    ['"format": "diet-backup-v1"', 'backup-marker'],
    ['-----BEGIN PRIVATE KEY-----', 'private-key'],
    ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'github-token'],
    ['AKIAABCDEFGHIJKLMNOP', 'aws-key'],
    ['npm_abcdefghijklmnopqrstuvwxyz0123456789', 'npm-token'],
    ['//registry.npmjs.org/:_authToken=${NPM_TOKEN}', 'npm-token'],
    ['api_key = "sk_live_abcdefghijklmnop"', 'assigned-secret'],
    ['ADMIN_TOKEN = "abcdefghijklmnop1234567890"', 'assigned-secret'],
    ['relayApiKey: fake0123456789abcdef', 'assigned-secret'],
    ['CLOUDFLARE_API_TOKEN=Zx8kfake0123456789', 'env-secret'],
    ['RELAY_SIGNING_SECRET=fakefakefakefake', 'env-secret'],
  ])('flags %j', (text, ruleId) => {
    expect(hits(text, personalDataRules)).toContain(ruleId);
  });

  it.each([
    'Co-Authored-By: Claude <noreply@anthropic.com>',
    'test@example.com',
    '1234+someone@users.noreply.github.com',
    'git clone git@github.com:owner/repo.git',
    '"repository": "git@github.com:owner/repo.git"',
    'Alcohol Drug Helpline 0800 787 797, text 8681',
    'Healthline 0800 611 116; Need to Talk 1737; emergency 111',
    'LDL cholesterol can rise on a ketogenic diet',
    'Cholesterol check-in at weeks 8 and 12',
    'Date of birth is never stored.',
    'const tokens = ts.createScanner(ts.ScriptTarget.Latest, false);',
    'secrets: ${{ secrets.GITHUB_TOKEN }}',
    'vitest@4.1.11',
  ])('does not flag %j', (text) => {
    expect(hits(text, personalDataRules)).toEqual([]);
  });
});

describe('file paths (privacy, secrets, conventions)', () => {
  it.each([
    ['docs/handoff/notes.md', 'private-folder'],
    ['docs/private/x.md', 'private-folder'],
    ['Handoff.md', 'handoff-file'],
    ['docs/Owner-HANDOFF-v2.md', 'handoff-file'],
    ['tools/scans/Handoff.md', 'handoff-file'],
    ['diet-2026-10-19.backup.json', 'backup-file'],
    ['exports/diet.backup.enc.json', 'backup-file'],
    ['diet-backup-2026-10-19.json', 'backup-file'],
    ['diet-2026-10-19.backup.enc', 'backup-file'],
    ['dump.sqlite', 'data-dump'],
    ['session.har', 'data-dump'],
    ['docs/bloods.pdf', 'document-or-data-file'],
    ['docs/notes.docx', 'document-or-data-file'],
    ['docs/lipids.xlsx', 'document-or-data-file'],
    ['trial.csv', 'document-or-data-file'],
    ['exports/weights.csv', 'document-or-data-file'],
    ['logs/app.txt', 'document-or-data-file'],
    ['pnpm-debug.log', 'document-or-data-file'],
    ['e2e/trace.zip', 'document-or-data-file'],
    ['apps/mobile-web/src/notes.txt', 'document-or-data-file'],
    ['exports/diet-export-2026-10-19.json', 'json-file'],
    ['docs/data.json', 'json-file'],
    ['tools/scans/fixtures/real.json', 'json-file'],
    ['photos/garden.jpg', 'media-outside-icons'],
    ['photos/garden.jpg', 'photo-format'],
    ['apps/mobile-web/src/me.png', 'media-outside-icons'],
    ['apps/mobile-web/public/icon.jpg', 'photo-format'],
    ['apps/mobile-web/public/IMG_2001.heic', 'photo-format'],
    ['apps/mobile-web/public/screenshots/today.png', 'icon-folder-image'],
    ['apps/mobile-web/public/icon.gif', 'icon-folder-image'],
    ['packages/ui/src/assets/photo.webp', 'icon-folder-image'],
    ['apps/mobile-web/public/IMG_20261019_0815.png', 'camera-file-name'],
    ['apps/mobile-web/public/PXL_20261019.png', 'camera-file-name'],
    ['DSC0001.png', 'camera-file-name'],
    ['Screenshot_20261019.png', 'camera-file-name'],
    ['signal-2026-10-19-101010.png', 'camera-file-name'],
    ['.dev.vars', 'secret-file'],
    ['services/relay/.dev.vars.production', 'secret-file'],
    ['.env', 'secret-file'],
    ['apps/mobile-web/.env.local', 'secret-file'],
    ['cert.pem', 'secret-file'],
    ['server.key', 'secret-file'],
    ['id_rsa', 'secret-file'],
    ['id_ed25519.pub', 'secret-file'],
    ['apps/mobile-web/src/Bad.jsx', 'javascript-source'],
    ['packages/core/src/x.js', 'javascript-source'],
    ['services/relay/src/worker.mjs', 'javascript-source'],
  ])('flags path %j', (path, ruleId) => {
    expect(pathHits(path)).toContain(ruleId);
  });

  it.each([
    'docs/OPUS_HANDOVER_PROMPT.md',
    'docs/HEALTH_SAFETY.md',
    'package.json',
    'apps/mobile-web/package.json',
    'tsconfig.base.json',
    'e2e/tsconfig.json',
    '.prettierrc.json',
    'apps/cart-extension/manifest.json',
    'tools/scans/required-copy.json',
    '.vscode/settings.json',
    'packages/core/data/ingredients.json',
    'packages/core/data/ingredients.csv',
    'packages/test-fixtures/src/weights.csv',
    'apps/mobile-web/public/robots.txt',
    'apps/mobile-web/public/icon-192.png',
    'apps/mobile-web/public/icons/maskable-512.png',
    'apps/mobile-web/public/favicon.ico',
    'packages/ui/src/assets/logo.svg',
    '.env.example',
    'eslint.config.js',
    'packages/core/src/backup/backup.ts',
  ])('allows path %j', (path) => {
    expect(pathHits(path)).toEqual([]);
  });

  it('allows small icons in public/ but not large images there', () => {
    expect(pathHits('apps/mobile-web/public/icon-192.png', 5_000)).toEqual([]);
    expect(pathHits('apps/mobile-web/public/icon-512.png', 70_000)).toEqual(['icon-folder-image']);
    expect(pathHits('apps/mobile-web/public/photo.jpg', 2_000_000)).toEqual([
      'photo-format',
      'icon-folder-image',
      'large-media',
    ]);
  });

  it('rejects images that carry EXIF metadata', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const withChunk = new Uint8Array([...png, ...new TextEncoder().encode('....eXIf....')]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, ...new TextEncoder().encode('Exif\0\0')]);
    expect(pathHits('apps/mobile-web/public/icon-192.png', 5_000, png)).toEqual([]);
    expect(pathHits('apps/mobile-web/public/icon-192.png', 5_000, withChunk)).toEqual([
      'image-metadata',
    ]);
    expect(pathHits('apps/mobile-web/public/logo.png', 5_000, jpeg)).toEqual(['image-metadata']);
  });
});

describe('network, AI and remote assets (HS-14, TR-11)', () => {
  it.each([
    ['await fetch("https://x.example")', 'fetch'],
    ['new XMLHttpRequest()', 'xhr'],
    ['navigator.sendBeacon(url)', 'beacon'],
    ['new WebSocket(url)', 'websocket'],
    ['new EventSource(url)', 'eventsource'],
    ["importScripts('https://cdn.example/sw.js')", 'import-scripts'],
    ["await import('https://cdn.example/mod.js')", 'dynamic-import-url'],
  ])('flags %j', (text, ruleId) => {
    expect(hits(text, networkRules)).toContain(ruleId);
  });

  it.each([
    ["import Anthropic from '@anthropic-ai/sdk'", 'ai-endpoint'],
    ['https://api.openai.com/v1', 'ai-endpoint'],
    ['"openai": "^4.0.0"', 'ai-endpoint'],
    ["import { generateText } from 'ai';", 'ai-import'],
    ["import { openai } from '@ai-sdk/openai';", 'ai-import'],
    ["const client = require('openai');", 'ai-import'],
    ["const m = await import('@mistralai/mistralai');", 'ai-import'],
    ["import Groq from 'groq-sdk';", 'ai-import'],
    ["import { HfInference } from '@huggingface/inference';", 'ai-import'],
    ["import { CreateMLCEngine } from '@mlc-ai/web-llm';", 'ai-import'],
    ["export * from '@aws-sdk/client-bedrock-runtime';", 'ai-import'],
    ["import 'ollama';", 'ai-import'],
    ['<link href="https://fonts.googleapis.com/css2?family=Inter">', 'remote-asset'],
    ['https://www.googletagmanager.com/gtag/js', 'remote-asset'],
  ])('flags %j', (text, ruleId) => {
    expect(hits(text, aiAndTelemetryRules)).toContain(ruleId);
  });

  it('does not flag ordinary code', () => {
    expect(hits('const prefetched = items.map((i) => i.id);', networkRules)).toEqual([]);
    expect(hits('https://alcohol.org.nz/help-advice/standard-drinks', aiAndTelemetryRules)).toEqual(
      [],
    );
    expect(
      hits(
        "import { x } from './ai';\nimport { y } from 'airtable';\nimport { S3 } from '@aws-sdk/client-s3';",
        aiAndTelemetryRules,
      ),
    ).toEqual([]);
  });
});

describe('disabled tests', () => {
  it.each([
    "it.skip('x', () => {})",
    "test.skip('x', () => {})",
    "describe.skip('x', () => {})",
    "it.todo('x')",
    "test.todo('x')",
    "it.skipIf(process.env.CI)('x', () => {})",
    "it.runIf(false)('x', () => {})",
    "test.describe.skip('x', () => {})",
    "it.concurrent.skip('x', () => {})",
    "test.fixme('x', async () => {})",
    "xit('x', () => {})",
    "xdescribe('x', () => {})",
    "xtest('x', () => {})",
  ])('flags %j', (text) => {
    expect(hits(text, disabledTestRules)).toEqual(['disabled-test']);
  });

  it.each(["it.each([1])('x %s', () => {})", "it('skips nothing', () => {})", 'process.exit(1)'])(
    'does not flag %j',
    (text) => {
      expect(hits(text, disabledTestRules)).toEqual([]);
    },
  );
});

describe('extension guard (CX-00, CX-01)', () => {
  const manifest = JSON.stringify(
    {
      manifest_version: 3,
      permissions: ['sidePanel', 'storage', 'scripting', 'cookies'],
      host_permissions: ['https://www.paknsave.co.nz/*'],
      content_scripts: [{ matches: ['https://www.paknsave.co.nz/*'], js: ['content.js'] }],
    },
    null,
    2,
  );

  it('flags page access in a manifest unless mode A is approved', () => {
    expect(hits(manifest, extensionModeARules)).toEqual([
      'extension-content-scripts',
      'extension-permission',
      'extension-store-host', // host_permissions
      'extension-store-host', // content_scripts matches
    ]);
  });

  it('flags chrome page APIs and document.cookie in code', () => {
    const code = 'chrome.scripting.executeScript({ target, func: () => document.cookie });';
    expect(hits(code, extensionModeARules)).toEqual(['extension-page-api']);
    expect(hits('chrome.cookies.getAll({})', extensionModeARules)).toEqual(['extension-page-api']);
    expect(hits('chrome.webRequest.onBeforeRequest', extensionModeARules)).toEqual([
      'extension-page-api',
    ]);
    expect(hits(code, extensionAlwaysRules)).toEqual(['document-cookie']);
  });

  it('allows the mode B/C manifest', () => {
    const allowed = JSON.stringify({
      manifest_version: 3,
      permissions: ['sidePanel', 'storage'],
      host_permissions: ['https://relay.example.com/*'],
    });
    expect(hits(allowed, [...extensionModeARules, ...extensionAlwaysRules])).toEqual([]);
  });
});

describe('reports (CI logs are public)', () => {
  const found = scanText('docs/notes.md', 'intro\nI weigh 101 kg\n', personalDataRules);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('assertions compare only file, line and rule', () => {
    expect(violationKeys(found)).toEqual(['docs/notes.md:2 first-person-health']);
  });

  it('leaves the matched text out of the report in CI, and shows it locally', () => {
    vi.stubEnv('CI', 'true');
    expect(formatViolations(found)).not.toContain('101');
    expect(formatViolations(found)).toContain('docs/notes.md:2:1  [first-person-health; privacy]');
    vi.stubEnv('CI', '');
    expect(formatViolations(found)).toContain('I weigh 101 kg');
  });
});
