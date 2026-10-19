import { describe, expect, it } from 'vitest';
import {
  aiAndTelemetryRules,
  commerceRules,
  healthPhraseRules,
  networkRules,
  personalDataRules,
  personalPathRules,
  type ContentRule,
} from './rules';
import { scanPath, scanText } from './scan';

const hits = (text: string, rules: readonly ContentRule[]) =>
  scanText('apps/mobile-web/src/x.tsx', text, rules).map((v) => v.ruleId);

describe('health wording (HS-07, HS-08, HS-19, HS-21, AL-11)', () => {
  it.each([
    ['Cut down by one drink a day', 'taper-cut-down-by'],
    ['Simmer to reduce by half', 'taper-reduce-by'],
    ['A gentle taper plan', 'taper-taper'],
    ['Tapering helps', 'taper-taper'],
    ['Pick a quit date', 'taper-quit-date'],
    ['Time to stop drinking', 'taper-stop-drinking'],
    ['Wean yourself off', 'taper-wean'],
    ['Your reduction schedule', 'taper-schedule'],
    ['A weekend detox', 'detox'],
    ['Estimated BAC 0.05', 'bac'],
    ['Your blood alcohol is', 'blood-alcohol'],
    ['blood-alcohol level', 'blood-alcohol'],
    ['You are safe to drive', 'safe-to-drive'],
    ['Under the legal limit', 'legal-limit'],
    ['Do not drive after this', 'driving'],
    ['Sober up first', 'sober-up'],
    ['400 calories left', 'energy-left'],
    ['kcal remaining today', 'energy-left'],
    ['Remaining calories', 'remaining-energy'],
    ["You've earned a drink", 'earned'],
    ['Your weekly allowance', 'allowance'],
    ['Drinks left this week', 'drinks-budget'],
    ['Reward yourself', 'reward'],
    ['Treat yourself tonight', 'treat-yourself'],
    ['A safe amount of alcohol', 'safe-amount'],
    ['You are safe to fast', 'safe-to'],
    ['Lose 5 kg in 2 weeks', 'kg-in-time'],
    ['Drop 3 kilos within a fortnight', 'kg-in-time'],
    ['lose 10 kg', 'lose-n-kg'],
    ['70 kg by Christmas', 'kg-by'],
    ['Results guaranteed', 'guarantee'],
    ['Your ideal weight', 'ideal-weight'],
    ['Body fat estimate', 'body-fat'],
    ['A fat-burning meal', 'fat-burning'],
    ['Take a magnesium supplement', 'supplement'],
    ['Check your ketone strips', 'ketone-measure'],
    ['Try an extended fast', 'extended-fast'],
    ['Fast tomorrow to compensate', 'compensate'],
  ])('flags %j', (text, ruleId) => {
    expect(hits(text, healthPhraseRules)).toContain(ruleId);
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
    'About 0.5–1 kg a week is the pace that holds.',
    'faster than 1 kg per week for three consecutive weeks',
    'Fixture profile 90 kg start, 70 kg long-term goal',
    'Typical first weeks on a carb ceiling see several kilograms go.',
    'No alcohol use is risk-free.',
    'Simmer until thickened',
    'Stop if you feel unwell',
  ])('does not flag %j', (text) => {
    expect(hits(text, healthPhraseRules)).toEqual([]);
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
    ['Stock level: high', 'stock-level'],
    ['Added to cart', 'cart-status'],
    ['Already in your cart', 'in-cart'],
    ['On special this week', 'specials'],
  ])('flags %j', (text, ruleId) => {
    expect(hits(text, commerceRules)).toContain(ruleId);
  });

  it.each([
    'const s = `${name} x ${count}`',
    'Prices: unknown unless you add them',
    'Prices and stock are whatever the site shows. You add items and check out yourself.',
    'This panel does not read PAK’nSAVE pages.',
    'not stocked',
  ])('does not flag %j', (text) => {
    expect(hits(text, commerceRules)).toEqual([]);
  });
});

describe('personal data and secrets', () => {
  it.each([
    ['LDL 4.2 mmol/L', 'lipid-result'],
    ['total cholesterol was 6.1 mmol/L', 'mmol'],
    ['I weigh 104 kg', 'first-person-health'],
    ['my BMI is 31', 'first-person-health'],
    ['DOB: 1980-01-01', 'date-of-birth'],
    ['NHI ABC1234', 'nhi'],
    ['Call me on 021 555 1234', 'nz-mobile'],
    ['+64 21 555 1234', 'nz-mobile'],
    ['someone@gmail.com', 'email'],
    ['"format": "diet-backup-v1"', 'backup-marker'],
    ['-----BEGIN PRIVATE KEY-----', 'private-key'],
    ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'github-token'],
    ['AKIAABCDEFGHIJKLMNOP', 'aws-key'],
    ['api_key = "sk_live_abcdefghijklmnop"', 'assigned-secret'],
  ])('flags %j', (text, ruleId) => {
    expect(hits(text, personalDataRules)).toContain(ruleId);
  });

  it.each([
    'Co-Authored-By: Claude <noreply@anthropic.com>',
    'test@example.com',
    'Alcohol Drug Helpline 0800 787 797, text 8681',
    'Healthline 0800 611 116; Need to Talk 1737; emergency 111',
    'LDL cholesterol can rise on a ketogenic diet',
  ])('does not flag %j', (text) => {
    expect(hits(text, personalDataRules)).toEqual([]);
  });

  it.each([
    ['docs/handoff/notes.md', 'private-folder'],
    ['docs/private/x.txt', 'private-folder'],
    ['Handoff.md', 'handoff-file'],
    ['docs/Owner-HANDOFF-v2.md', 'handoff-file'],
    ['diet-2026-10-19.backup.json', 'backup-file'],
    ['exports/diet.backup.enc.json', 'backup-file'],
    ['dump.sqlite', 'data-dump'],
    ['session.har', 'data-dump'],
    ['photos/garden.jpg', 'media-outside-icons'],
    ['apps/mobile-web/src/me.png', 'media-outside-icons'],
  ])('flags path %j', (path, ruleId) => {
    expect(scanPath(path, 1000, personalPathRules).map((v) => v.ruleId)).toContain(ruleId);
  });

  it('allows small icons in public/ but not large images there', () => {
    expect(scanPath('apps/mobile-web/public/icon-192.png', 5_000, personalPathRules)).toEqual([]);
    expect(
      scanPath('apps/mobile-web/public/photo.jpg', 2_000_000, personalPathRules).map(
        (v) => v.ruleId,
      ),
    ).toEqual(['large-media']);
  });

  it('allows the handover prompt and ordinary docs', () => {
    expect(scanPath('docs/OPUS_HANDOVER_PROMPT.md', 4000, personalPathRules)).toEqual([]);
    expect(scanPath('docs/HEALTH_SAFETY.md', 28000, personalPathRules)).toEqual([]);
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
  });
});
