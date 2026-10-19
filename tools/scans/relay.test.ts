import { readFileSync } from 'node:fs';
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
const importsIn = (code: string) =>
  ts.preProcessFile(code, true, true).importedFiles.map((f) => f.fileName);
const importsOf = (path: string) => importsIn(read(path));
const PROTOCOL = 'packages/core/src/relay/protocol.ts';
const WRANGLER = 'pnpm dlx wrangler@4.147.0';
const CONFIG = '--config services/relay/wrangler.jsonc';

describe('S2. The relay imports only the relay protocol (TR-02)', () => {
  const RELAY_SRC = 'services/relay/src/';
  /** Every code file, whatever its extension, except tests. */
  const isRelaySource = (f: string) =>
    f.startsWith(RELAY_SRC) && /\.[cm]?[jt]sx?$/.test(f) && !isTestFile(f);
  const relaySource = files.filter(isRelaySource);
  /** Inside the relay's folder, once resolved, and not a test file (tests import anything). */
  const isOwnFile = (file: string, specifier: string) => {
    const target = posix.join(posix.dirname(file), specifier);
    return target.startsWith(RELAY_SRC) && !/\.(?:test|spec)(?:\.[cm]?[jt]sx?)?$/.test(target);
  };
  /** The specifiers other than the protocol and the relay's own files. */
  const outsideOf = (file: string, code: string) =>
    importsIn(code).filter(
      (s) => s !== '@diet/core/relay' && !(s.startsWith('.') && isOwnFile(file, s)),
    );

  it('finds the relay source, in every code file', () => {
    expect(relaySource).toContain('services/relay/src/handler.ts');
    expect(isRelaySource('services/relay/src/x.mts')).toBe(true);
    expect(isRelaySource('services/relay/src/x.test.ts')).toBe(false);
  });

  it.each(relaySource)('%s imports only its own files and @diet/core/relay', (file) => {
    expect(outsideOf(file, read(file))).toEqual([]);
  });

  it.each([
    "export { webCrypto } from './../../../packages/core/src/storage/backup/crypto';",
    "import { unlockBackup } from '../../../packages/core/src/storage/backup/decode.ts';",
    "import { x } from './../src/../../config';",
    "import { x } from '..';",
    "import { x } from '@diet/core';",
    "const m = await import('./../../../tools/relay/smoke.ts');",
    "import { exchanges } from './handler.test';",
  ])('refuses %s', (code) => {
    expect(outsideOf('services/relay/src/x.ts', code)).toHaveLength(1);
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
      expect(parsed.ok && [...parsed.allowedOrigins]).toEqual([APP_ORIGIN]);
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
    [
      'with another origin',
      changed((c) => (varsOf(c)['ALLOWED_ORIGINS'] = `${APP_ORIGIN},https://example.github.io`)),
    ],
    [
      'with another origin in test',
      changed((c) => (varsOf(testOf(c))['ALLOWED_ORIGINS'] = `https://example.com, ${APP_ORIGIN}`)),
    ],
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

  // Every file under .github/ (workflows in .yml or .yaml, and actions), so CI can neither deploy
  // the relay nor reach Cloudflare: C81's route b, a token in GitHub, is not used (R24).
  const isCiFile = (f: string) => f.startsWith('.github/');
  const CI_BANNED = [/wrangler/i, /cloudflare/i, /workers\.dev/i, /relay:/, /tools\/relay/];
  /** The one line CI may have: it switches wrangler's usage reports off, should it ever run. */
  const METRICS_OFF = "WRANGLER_SEND_METRICS: 'false'";
  const ciProblems = (text: string) =>
    text
      .split('\n')
      .filter((line) => line.trim() !== METRICS_OFF && CI_BANNED.some((re) => re.test(line)));

  it('nothing under .github runs wrangler or a relay tool, or names Cloudflare', () => {
    const ci = files.filter(isCiFile);
    expect(ci).toContain('.github/workflows/ci.yml');
    for (const file of ci) expect(ciProblems(read(file)), file).toEqual([]);
  });

  it.each([
    ['.github/workflows/relay.yaml', '      - run: pnpm relay:deploy'],
    ['.github/workflows/relay.yml', '      - uses: cloudflare/wrangler-action@v3'],
    ['.github/workflows/relay.yml', '          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}'],
    ['.github/workflows/ci.yml', '      - run: npx wrangler deploy'],
    ['.github/actions/check/action.yml', '      run: curl https://list-relay.example.workers.dev'],
    ['.github/actions/check/action.yml', '      run: node tools/relay/smoke.ts'],
  ])('refuses %s with %j', (file, line) => {
    expect(isCiFile(file)).toBe(true);
    expect(ciProblems(`name: Example\n  ${METRICS_OFF}\n${line}\n`)).toEqual([line]);
  });
});

describe('S5. The relay README says what the relay sees and what its limits cannot do', () => {
  const readme = read('services/relay/README.md');

  it('the Worker sees the room id and the addresses, and stores neither', () => {
    expect(readme).toContain(
      'The relay sees the sealed body, the room id (KV stores only a hash of it), timing, and the IP addresses.',
    );
  });

  it('the rate limits cannot stop a determined client, and IPv6 counts by its /64 network', () => {
    expect(readme).toContain('An IPv6 address counts by its /64 network');
    expect(readme).toContain('cannot stop a determined one');
  });
});
