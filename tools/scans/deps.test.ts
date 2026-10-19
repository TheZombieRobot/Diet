import { describe, expect, it } from 'vitest';
import {
  findAiPackages,
  findTelemetryPackages,
  isAiPackage,
  isTelemetryPackage,
  licenseAllowed,
  lockfilePackageNames,
  telemetryConfigProblems,
} from './deps';

const lockfileWith = (...entries: string[]) => `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      vitest:
        specifier: 4.1.11

packages:

${entries.map((e) => `  ${e}:\n    resolution: {integrity: sha512-x}\n`).join('\n')}
snapshots:

  vitest@4.1.11: {}
`;

const LOCKFILE = lockfileWith("'@sentry/browser@8.0.0'", 'posthog-js@1.2.3', 'vitest@4.1.11');

describe('dependency guards', () => {
  it('reads package names from a pnpm lockfile', () => {
    expect(lockfilePackageNames(LOCKFILE)).toEqual(['@sentry/browser', 'posthog-js', 'vitest']);
  });

  it('finds telemetry packages by scope, prefix or exact name', () => {
    expect(findTelemetryPackages(LOCKFILE)).toEqual(['@sentry/browser', 'posthog-js']);
    expect(isTelemetryPackage('insight')).toBe(true);
    expect(isTelemetryPackage('insights-helper')).toBe(false);
    expect(isTelemetryPackage('firebase')).toBe(true);
    expect(isTelemetryPackage('react')).toBe(false);
  });

  it.each([
    '@sentry-internal/tracing',
    '@storybook/telemetry',
    'update-notifier',
    'checkpoint-client',
    '@rudderstack/analytics-js',
    'rudder-sdk-js',
    'statsig-js',
    'launchdarkly-js-client-sdk',
  ])('treats %s as telemetry', (name) => {
    expect(isTelemetryPackage(name)).toBe(true);
  });

  it('finds AI SDKs in the lockfile (no AI calls at runtime)', () => {
    const lockfile = lockfileWith(
      'openai@4.0.0',
      "'@anthropic-ai/sdk@0.30.0'",
      "'@google/genai@1.0.0'",
      'ai@4.0.0',
      "'@ai-sdk/openai@1.0.0'",
      "'@aws-sdk/client-bedrock-runtime@3.0.0'",
      'vitest@4.1.11',
    );
    expect(findAiPackages(lockfile)).toEqual([
      '@ai-sdk/openai',
      '@anthropic-ai/sdk',
      '@aws-sdk/client-bedrock-runtime',
      '@google/genai',
      'ai',
      'openai',
    ]);
  });

  it.each([
    ['openai', true],
    ['ai', true],
    ['cohere-ai', true],
    ['ollama', true],
    ['langchain', true],
    ['llamaindex', true],
    ['groq-sdk', true],
    ['replicate', true],
    ['@mistralai/mistralai', true],
    ['@huggingface/inference', true],
    ['@langchain/core', true],
    ['@mlc-ai/web-llm', true],
    ['@xenova/transformers', true],
    ['@azure/openai', true],
    ['@google/generative-ai', true],
    ['@google-cloud/vertexai', true],
    ['@aws-sdk/client-bedrock', true],
    ['airtable', false],
    ['@aws-sdk/client-s3', false],
    ['openai-like-name', false],
  ])('AI package %s: %s', (name, expected) => {
    expect(isAiPackage(name)).toBe(expected);
  });

  describe('telemetry that must be configured off', () => {
    const withWrangler = lockfileWith('wrangler@4.0.0', 'vitest@4.1.11');
    const files =
      (map: Record<string, string>) =>
      (path: string): string | undefined =>
        map[path];

    it('is not needed when the tool is not installed', () => {
      expect(telemetryConfigProblems(LOCKFILE, files({}))).toEqual([]);
    });

    it('fails when wrangler is installed without a config that turns metrics off', () => {
      expect(telemetryConfigProblems(withWrangler, files({}))).toHaveLength(1);
      expect(
        telemetryConfigProblems(
          withWrangler,
          files({ 'services/relay/wrangler.toml': 'name = "relay"\n' }),
        ),
      ).toHaveLength(1);
      expect(
        telemetryConfigProblems(
          withWrangler,
          files({ 'services/relay/wrangler.toml': 'send_metrics = true\n' }),
        ),
      ).toHaveLength(1);
    });

    it('passes when wrangler.toml or wrangler.jsonc sets send_metrics = false', () => {
      expect(
        telemetryConfigProblems(
          withWrangler,
          files({ 'services/relay/wrangler.toml': 'name = "relay"\nsend_metrics = false\n' }),
        ),
      ).toEqual([]);
      expect(
        telemetryConfigProblems(
          withWrangler,
          files({ 'services/relay/wrangler.jsonc': '{ "name": "relay", "send_metrics": false }' }),
        ),
      ).toEqual([]);
    });
  });

  it.each([
    ['MIT', true],
    ['(MIT OR CC0-1.0)', true],
    ['MIT AND ISC', true],
    ['Apache 2.0', true],
    ['GPL-3.0', false],
    ['MIT AND GPL-2.0', false],
    ['(GPL-2.0 OR MIT)', true],
    ['UNLICENSED', false],
    ['Unknown', false],
    ['', false],
    // Two parenthesised groups: the first parser stripped "(" and ")" across them.
    ['(MIT OR GPL-3.0) AND (GPL-2.0 OR LGPL-3.0)', false],
    ['(MIT OR GPL-3.0) AND (ISC OR GPL-2.0)', true],
    // AND binds tighter than OR.
    ['GPL-3.0 OR MIT AND ISC', true],
    ['MIT AND GPL-3.0 OR GPL-2.0', false],
    ['((MIT))', true],
    ['(MIT', false],
    ['MIT OR', false],
    ['Apache-2.0 WITH LLVM-exception', false],
    ['SEE LICENSE IN LICENSE.md', false],
  ])('licence %j allowed: %s', (expression, allowed) => {
    expect(licenseAllowed(expression)).toBe(allowed);
  });
});
