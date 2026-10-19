import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { expect, test } from '@playwright/test';
import ts from 'typescript';
import { DIST_DIR } from './support/app';

// The service worker is outside the page's Content Security Policy (GitHub Pages cannot send it
// one), so HS-14 and TR-11 are enforced for it here, on the build the other browser tests run
// against (the Playwright web server makes it): the built sw.js may load scripts and precache
// files only by relative URL, and route nothing but navigations; and every absolute URL in the
// built files must be one of the inert strings below, which nothing ever fetches.

/** Every absolute URL the built app may contain, and why it is harmless. */
const ALLOWED_ABSOLUTE_URLS: Readonly<Record<string, string>> = {
  'http://www.w3.org/2000/svg': 'the SVG namespace (React DOM, and favicon.svg)',
  'http://www.w3.org/1999/xlink': 'the XLink namespace (React DOM)',
  'http://www.w3.org/1998/Math/MathML': 'the MathML namespace (React DOM)',
  'http://www.w3.org/XML/1998/namespace': 'the XML namespace (React DOM)',
  'https://react.dev/errors/': "React's production error messages link to its error decoder",
  'https://bit.ly/wb-precache': 'a Workbox error message links to its precaching guide',
  'https://tinyurl.com/y2uuvskb':
    "Dexie's MissingAPI error message (no IndexedDB in this browser) links to its help page",
  'http://bit.ly/2kdckMn':
    "Dexie's PrematureCommit error message links to its explanation of early transaction commits",
};

const TEXT_FILES = new Set(['.js', '.mjs', '.css', '.html', '.webmanifest', '.json', '.svg']);
const ABSOLUTE_URL = /\b(?:https?|wss?):\/\/[^\s"'`<>()\\]+/gi;

/** A URL that stays at the app's own address: no scheme, no host, not from the site root. */
const isRelative = (url: string): boolean =>
  !/^[a-z][a-z\d+.-]*:/i.test(url) && !url.startsWith('/') && !url.startsWith('\\');

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** Every absolute URL in some text. */
export const absoluteUrls = (text: string): string[] =>
  [...text.matchAll(ABSOLUTE_URL)].map((m) => m[0]);

export interface ServiceWorkerFacts {
  precacheUrls: string[];
  /** What is wrong; empty for a service worker that only uses the app's own files. */
  problems: string[];
}

const literal = (node: ts.Node | undefined): string | undefined =>
  node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;

const calleeName = (call: ts.CallExpression): string | undefined => {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
};

/** Inside Workbox's module loader (`if (!self.define) { ... }`), which loads ./workbox-*.js. */
function insideModuleLoader(node: ts.Node, source: ts.SourceFile): boolean {
  const loader = ts.findAncestor(
    node.parent,
    (n) =>
      ts.isIfStatement(n) && n.expression.getText(source).replace(/\s/g, '') === '!self.define',
  );
  return loader !== undefined;
}

/** Reads a generated sw.js and reports anything that could reach beyond the app's own files. */
export function inspectServiceWorker(code: string): ServiceWorkerFacts {
  const source = ts.createSourceFile('sw.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const precacheUrls: string[] = [];
  const problems: string[] = [];
  let precacheCalls = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (name === 'importScripts') {
        for (const argument of node.arguments) {
          const url = literal(argument);
          if (url === undefined) {
            if (!insideModuleLoader(node, source))
              problems.push(`importScripts(${argument.getText(source)})`);
          } else if (!isRelative(url)) {
            problems.push(`importScripts("${url}")`);
          }
        }
      }
      if (name === 'define' && node.arguments[0] !== undefined) {
        const dependencies = node.arguments[0];
        if (!ts.isArrayLiteralExpression(dependencies)) {
          problems.push(`define(${dependencies.getText(source)}, ...)`);
        } else {
          for (const dependency of dependencies.elements) {
            const url = literal(dependency);
            if (url === undefined || !url.startsWith('./')) {
              problems.push(`define([${dependency.getText(source)}])`);
            }
          }
        }
      }
      if (name === 'precacheAndRoute') {
        precacheCalls += 1;
        const entries = node.arguments[0];
        if (entries === undefined || !ts.isArrayLiteralExpression(entries)) {
          problems.push('precacheAndRoute without a literal list of files');
        } else {
          for (const entry of entries.elements) {
            const url = ts.isObjectLiteralExpression(entry)
              ? entry.properties
                  .filter(ts.isPropertyAssignment)
                  .find((p) => p.name.getText(source) === 'url')?.initializer
              : undefined;
            const value = literal(url);
            if (value === undefined) problems.push(`precache entry ${entry.getText(source)}`);
            else if (!isRelative(value)) problems.push(`precache entry "${value}"`);
            else precacheUrls.push(value);
          }
        }
      }
      if (name === 'registerRoute') {
        const [route, ...rest] = node.arguments;
        const navigationOnly =
          route !== undefined &&
          rest.length === 0 &&
          ts.isNewExpression(route) &&
          route.expression.getText(source).endsWith('NavigationRoute');
        if (!navigationOnly)
          problems.push(`a run-time route: ${node.getText(source).slice(0, 80)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (precacheCalls !== 1) problems.push(`${precacheCalls} precacheAndRoute calls, expected 1`);
  return { precacheUrls, problems };
}

test('the built service worker loads and caches only the app’s own files, by relative URL', () => {
  const swPath = join(DIST_DIR, 'sw.js');
  expect(existsSync(swPath), 'the web server builds the app first').toBe(true);
  const { precacheUrls, problems } = inspectServiceWorker(readFileSync(swPath, 'utf8'));
  expect(problems).toEqual([]);
  // The whole shell is in the offline copy, and every file it lists exists in the build.
  expect(precacheUrls).toEqual(expect.arrayContaining(['index.html', 'manifest.webmanifest']));
  expect(precacheUrls.some((u) => /^assets\/index-[\w-]+\.js$/.test(u))).toBe(true);
  for (const url of precacheUrls) expect(existsSync(join(DIST_DIR, url)), url).toBe(true);
});

test('every absolute URL in the built files is an inert string on the allowlist', () => {
  const found = new Map<string, Set<string>>();
  for (const file of filesUnder(DIST_DIR)) {
    if (!TEXT_FILES.has(extname(file))) continue;
    for (const url of absoluteUrls(readFileSync(file, 'utf8'))) {
      const files = found.get(url) ?? new Set<string>();
      files.add(relative(DIST_DIR, file));
      found.set(url, files);
    }
  }
  const unexpected = [...found].filter(([url]) => !(url in ALLOWED_ABSOLUTE_URLS));
  expect(unexpected.map(([url, files]) => `${url} in ${[...files].join(', ')}`)).toEqual([]);
  // The allowlist stays exact: an entry the build no longer contains is removed.
  expect([...found.keys()].sort()).toEqual(Object.keys(ALLOWED_ABSOLUTE_URLS).sort());
});

/**
 * Browser APIs that reach the network outside the audit's request log, so no built script may
 * name them: a WebSocket and a server-sent event stream appear only as page events, and WebRTC
 * (STUN or TURN over UDP) never appears at all (privacy review).
 */
const UNSEEN_NETWORK_APIS =
  /\b(?:webkitRTCPeerConnection|RTCPeerConnection|WebSocket|EventSource)\b/g;

/** Every such name in some text. */
export const unseenNetworkApis = (text: string): string[] =>
  [...text.matchAll(UNSEEN_NETWORK_APIS)].map((m) => m[0]);

test('no built script names a WebSocket, an event stream or WebRTC, which the network audit cannot see', () => {
  const found: string[] = [];
  for (const file of filesUnder(DIST_DIR)) {
    if (!['.js', '.mjs', '.html'].includes(extname(file))) continue;
    for (const name of unseenNetworkApis(readFileSync(file, 'utf8'))) {
      found.push(`${name} in ${relative(DIST_DIR, file)}`);
    }
  }
  expect(found).toEqual([]);
  // The check itself catches each of them, however it is written.
  expect(
    unseenNetworkApis(
      'new WebSocket(u);new window.RTCPeerConnection(c);webkitRTCPeerConnection;new EventSource(s)',
    ),
  ).toEqual(['WebSocket', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'EventSource']);
});

test('the build-output check catches a service worker that reaches another origin', () => {
  const generated = (body: string) =>
    `if(!self.define){let e;const s=(s,i)=>(s=new URL(s+".js",i).href,importScripts(s));self.define=(i,r)=>{}}define(["./workbox-1234"],function(e){"use strict";${body}});`;
  const clean = generated(
    'e.precacheAndRoute([{url:"index.html",revision:"1"}],{}),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html")))',
  );
  expect(inspectServiceWorker(clean)).toEqual({ precacheUrls: ['index.html'], problems: [] });

  const leaks = {
    'a CDN script': `importScripts("https://cdn.example.org/workbox-sw.js");${clean}`,
    'a computed script': `importScripts(self.location.origin.replace("x","y"));${clean}`,
    'a module from elsewhere': clean.replace('"./workbox-1234"', '"https://cdn.example/workbox"'),
    'an absolute precache entry': clean.replace(
      '{url:"index.html",revision:"1"}',
      '{url:"index.html",revision:"1"},{url:"https://example.org/beacon.gif",revision:"1"}',
    ),
    'a protocol-relative precache entry': clean.replace(
      'url:"index.html"',
      'url:"//example.org/x"',
    ),
    'a run-time cache': clean.replace(
      'e.registerRoute(new e.NavigationRoute',
      'e.registerRoute(/^https:\\/\\/api\\./,new e.NetworkFirst,"GET"),e.registerRoute(new e.NavigationRoute',
    ),
    'no offline copy': generated(
      'e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html")))',
    ),
  };
  for (const [name, code] of Object.entries(leaks)) {
    expect(inspectServiceWorker(code).problems.length, name).toBeGreaterThan(0);
  }
  expect(
    absoluteUrls('fetch("https://example.org/ping?x=1");const n="http://www.w3.org/2000/svg"'),
  ).toEqual(['https://example.org/ping?x=1', 'http://www.w3.org/2000/svg']);
});
