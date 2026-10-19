import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { APP_ORIGIN, RELAY_TEST_TTL_SECONDS } from '../../packages/core/src/relay/protocol';
import { RELAY_TTL_MS } from '../../packages/core/src/storage/limits';
import { parseRelayConfig } from '../../services/relay/src/config';
import type { KvSubset } from '../../services/relay/src/kv';
import {
  deploymentOf,
  deployProblems,
  KV_ID_PLACEHOLDERS,
  WRANGLER_CONFIG_PATH,
  wranglerConfigProblems,
} from '../relay/wranglerConfig';
import { lockfilePackageNames } from './deps';
import { isTestFile, listRepoFiles } from './scan';

// The relay (checklist item 29): what its code may import, how it is deployed, and that nothing in
// CI or in the app can reach Cloudflare (design S2 to S4; TR-02, TR-06, C80, C81).
const root = resolve(import.meta.dirname, '../..');
const files = listRepoFiles(root);
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const importsOf = (path: string) =>
  ts.preProcessFile(read(path), true, true).importedFiles.map((f) => f.fileName);
const PROTOCOL = 'packages/core/src/relay/protocol.ts';
const WRANGLER = 'pnpm dlx wrangler@4.147.0';
const CONFIG = '--config services/relay/wrangler.jsonc';

describe('S2. The relay imports only the relay protocol (TR-02)', () => {
  const relaySource = files.filter(
    (f) => f.startsWith('services/relay/src/') && f.endsWith('.ts') && !isTestFile(f),
  );

  it('finds the relay source', () => {
    expect(relaySource).toContain('services/relay/src/handler.ts');
  });

  it.each(relaySource)('%s imports only its own files and @diet/core/relay', (file) => {
    const outside = importsOf(file).filter((s) => !s.startsWith('./') && s !== '@diet/core/relay');
    expect(outside).toEqual([]);
  });

  it('the protocol imports nothing, and @diet/core/relay is exactly that file', () => {
    expect(importsOf(PROTOCOL)).toEqual([]);
    expect(read(PROTOCOL)).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
    const core = JSON.parse(read('packages/core/package.json')) as {
      exports: Record<string, string>;
    };
    expect(core.exports['./relay']).toBe(`./src/relay/protocol.ts`);
  });

  it('the owner tools import only node: modules, the protocol and each other', () => {
    const tools = files.filter((f) => f.startsWith('tools/relay/'));
    expect(tools).toContain('tools/relay/smoke.ts');
    for (const file of tools) {
      const others = importsOf(file).filter(
        (s) =>
          !s.startsWith('node:') &&
          s !== `../../${PROTOCOL}` &&
          !(file !== 'tools/relay/smoke.ts' && /^\.\/[\w-]+\.ts$/.test(s)),
      );
      expect(others, file).toEqual([]);
    }
  });
});

describe('S3. Deployment config, telemetry and dependencies (TR-06, C80, C81)', () => {
  const configText = read(WRANGLER_CONFIG_PATH);
  const config = JSON.parse(configText) as Record<string, unknown>;
  const hexId = (n: number) => String(n).repeat(32);
  const KV: KvSubset = {
    getWithMetadata: () => Promise.resolve({ value: null, metadata: null }),
    put: () => Promise.resolve(),
    delete: () => Promise.resolve(),
  };

  it('services/relay/wrangler.jsonc passes every check', () => {
    expect(wranglerConfigProblems(configText)).toEqual([]);
  });

  it.each(['production', 'test'] as const)(
    'the %s settings pass the Worker’s own config check, with the expiry pinned',
    (deployment) => {
      const vars = deploymentOf(config, deployment)['vars'] as Record<string, string>;
      const parsed = parseRelayConfig({ ...vars, RELAY_KV: KV }, { allowLoopbackOrigins: false });
      expect(parsed.ok && parsed.allowedOrigins.has(APP_ORIGIN)).toBe(true);
      expect(vars['RELAY_TTL_SECONDS']).toBe(
        String(deployment === 'production' ? RELAY_TTL_MS / 1000 : RELAY_TEST_TTL_SECONDS),
      );
    },
  );

  /** The committed config with one change. */
  const changed = (edit: (c: Record<string, unknown>) => void) => {
    const copy = JSON.parse(configText) as Record<string, unknown>;
    edit(copy);
    return JSON.stringify(copy);
  };
  const testOf = (c: Record<string, unknown>) => deploymentOf(c, 'test');
  const varsOf = (c: Record<string, unknown>) => c['vars'] as Record<string, string>;
  const storage = (id: string) => [{ binding: 'RELAY_KV', id }];

  it.each<[string, string]>([
    ['with a comment', `// relay\n${configText}`],
    ['with metrics on', changed((c) => (c['send_metrics'] = true))],
    ['with logs on in test', changed((c) => (testOf(c)['observability'] = { enabled: true }))],
    ['with log push on', changed((c) => (c['logpush'] = true))],
    ['with a tail worker', changed((c) => (c['tail_consumers'] = [{ service: 'x' }]))],
    ['with another binding', changed((c) => (c['ai'] = { binding: 'AI' }))],
    ['with a route', changed((c) => (testOf(c)['routes'] = ['relay.example.com/*']))],
    ['with a secret variable', changed((c) => (varsOf(c)['API_TOKEN'] = 'y'))],
    ['with a longer expiry', changed((c) => (varsOf(c)['RELAY_TTL_SECONDS'] = '901'))],
    ['with no storage id', changed((c) => (c['kv_namespaces'] = [{ binding: 'RELAY_KV' }]))],
    [
      'with one storage for both',
      changed((c) => {
        c['kv_namespaces'] = storage(hexId(1));
        testOf(c)['kv_namespaces'] = storage(hexId(1));
      }),
    ],
    ['with rate limits in one deployment only', changed((c) => delete testOf(c)['ratelimits'])],
  ])('refuses the config %s', (_name, text) => {
    expect(wranglerConfigProblems(text)).not.toEqual([]);
  });

  it('refuses to deploy while a storage id is the placeholder, and allows real ids', () => {
    expect(KV_ID_PLACEHOLDERS).toEqual({
      production: 'OWNER-FILLS-IN-production-storage-id',
      test: 'OWNER-FILLS-IN-test-storage-id',
    });
    const filled = changed((c) => {
      c['kv_namespaces'] = storage(hexId(1));
      testOf(c)['kv_namespaces'] = storage(hexId(2));
    });
    for (const deployment of ['production', 'test'] as const) {
      expect(deployProblems(configText, deployment)).toEqual([
        `the ${deployment} storage id is not filled in yet (README, The relay, step 4)`,
      ]);
      expect(deployProblems(filled, deployment)).toEqual([]);
    }
  });

  it('the relay scripts are exactly the owner-run set, each with the config, at one wrangler version', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> })
      .scripts;
    const relay = Object.fromEntries(
      Object.entries(scripts).filter(([k]) => k.startsWith('relay:')),
    );
    expect(relay).toEqual({
      'relay:telemetry-off': `${WRANGLER} telemetry disable ${CONFIG}`,
      'relay:login': `${WRANGLER} login ${CONFIG}`,
      'relay:create-storage': `${WRANGLER} kv namespace create RELAY_KV ${CONFIG} --no-update-config`,
      'relay:create-test-storage': `${WRANGLER} kv namespace create RELAY_KV ${CONFIG} --env test --no-update-config`,
      'relay:list-storage': `${WRANGLER} kv namespace list ${CONFIG}`,
      'relay:deploy-test': `node tools/relay/deploy-check.ts test && ${WRANGLER} deploy ${CONFIG} --env test`,
      'relay:deploy': `node tools/relay/deploy-check.ts production && ${WRANGLER} deploy ${CONFIG} --env=`,
      'relay:logout': `${WRANGLER} logout ${CONFIG}`,
      'relay:dry-run': `${WRANGLER} deploy ${CONFIG} --env= --dry-run --outdir services/relay/.wrangler/dry-run`,
      'relay:smoke': 'node tools/relay/smoke.ts',
    });
    const mentions = files
      .filter((f) => f === 'README.md' || f.endsWith('package.json'))
      .flatMap((f) => [...read(f).matchAll(/wrangler@([^\s"'`]*)/g)].map((m) => m[1]));
    expect(new Set(mentions)).toEqual(new Set(['4.147.0']));
  });

  it('the README switches wrangler usage reports off before signing in', () => {
    const readme = read('README.md');
    expect(readme.indexOf('pnpm relay:telemetry-off')).toBeGreaterThan(0);
    expect(readme.indexOf('pnpm relay:telemetry-off')).toBeLessThan(
      readme.indexOf('pnpm relay:login'),
    );
  });

  it('no Cloudflare tooling is in the dependency tree', () => {
    const names = lockfilePackageNames(read('pnpm-lock.yaml'));
    const cloudflare = names.filter(
      (n) => ['wrangler', 'miniflare', 'workerd'].includes(n) || n.startsWith('@cloudflare/'),
    );
    expect(names.length).toBeGreaterThan(0);
    expect(cloudflare).toEqual([]);
  });
});

describe('S4. The owner tools stay out of CI and out of the app (C81)', () => {
  it('nothing imports tools/relay/smoke.ts', () => {
    const code = files.filter((f) => /\.(?:[cm]?[jt]sx?)$/.test(f));
    const importers = code.filter((file) =>
      importsOf(file).some((s) =>
        /^tools\/relay\/smoke(?:\.ts)?$/.test(
          s.startsWith('.') ? posix.join(posix.dirname(file), s) : s,
        ),
      ),
    );
    expect(importers).toEqual([]);
  });

  it('no workflow runs wrangler or a relay script', () => {
    const dir = join(root, '.github/workflows');
    const workflows = readdirSync(dir).filter((f) => f.endsWith('.yml'));
    expect(workflows.length).toBeGreaterThan(0);
    for (const workflow of workflows) {
      const text = readFileSync(join(dir, workflow), 'utf8');
      for (const banned of ['wrangler@', 'wrangler ', 'relay:', 'tools/relay']) {
        expect(text.includes(banned), `${workflow}: ${banned}`).toBe(false);
      }
    }
  });
});
