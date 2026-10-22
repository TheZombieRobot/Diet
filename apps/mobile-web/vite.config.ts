import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { parseColourTokens, requireToken } from '../../packages/ui/src/tokens';
import pkg from './package.json';
import { buildRelayOrigin, TEST_RELAY_ENV, withRelayConnectSrc } from './src/transfer/buildOrigin';

/**
 * The phone app build (checklist item 5). GitHub Pages serves the app at
 * https://thezombierobot.github.io/Diet/, so every URL, the manifest and the service worker scope
 * sit under /Diet/. Set DIET_BASE=/ to build for a server root instead (local preview).
 */
const base = (process.env['DIET_BASE'] ?? '/Diet/').replace(/\/?$/, '/');
/** Optional build label shown on About next to the version (the deploy passes the commit). */
const buildId = process.env['DIET_BUILD_ID'] ?? '';
/**
 * The relay address this build sends to (item 31): RELAY_ORIGIN, null until the owner confirms it,
 * or the reserved test origin when a browser-test build asks for exactly it (buildOrigin.ts).
 */
const relayOrigin = buildRelayOrigin(process.env[TEST_RELAY_ENV]);

// Theme colours come from the design tokens, the only place a colour is written.
const tokens = parseColourTokens(
  readFileSync(new URL('../../packages/ui/src/styles/tokens.css', import.meta.url), 'utf8'),
);
const ground = requireToken(tokens, '--color-ground');
/**
 * The manifest has one colour for both themes (Android paints the launch screen and the task
 * switcher from it before the app runs), so it uses the brand teal of the icon, which suits light
 * and dark alike. The page's own theme-color tags still follow the phone's setting.
 */
const brandTeal = requireToken(tokens, '--color-teal').light;

const DESCRIPTION =
  'A private logbook and planner for meals, fasting, movement, drinks and the grocery list. It works offline and keeps records on this device.';

/**
 * Code that changes only when a dependency does, in chunks of its own, so an update re-downloads
 * the app's own chunk and not these (full review F44). React, its scheduler and Dexie go in
 * "vendor" with Rollup's CommonJS helper, which jsQR needs too: jsQR then imports only from
 * "vendor", so its file name stays the same while the app changes. Every chunk is still in the
 * offline copy (workbox.globPatterns below).
 */
const VENDOR = new Set(['react', 'react-dom', 'scheduler', 'dexie']);

function chunkFor(id: string): string | undefined {
  if (id.includes('commonjsHelpers')) return 'vendor';
  const parts = id.split(/[\\/]node_modules[\\/]/);
  if (parts.length < 2) return undefined;
  // The package a file belongs to: the folder after the last node_modules (pnpm nests them).
  const name = parts.at(-1)?.split(/[\\/]/)[0];
  if (name === 'jsqr') return 'jsQR';
  return name !== undefined && VENDOR.has(name) ? 'vendor' : undefined;
}

/** The page description, and the browser's theme colour (status bar) in light and dark. */
function headMeta(): Plugin {
  return {
    name: 'diet-head-meta',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { name: 'description', content: DESCRIPTION }, injectTo: 'head' },
      ...(['light', 'dark'] as const).map((scheme) => ({
        tag: 'meta',
        attrs: {
          name: 'theme-color',
          content: ground[scheme],
          media: `(prefers-color-scheme: ${scheme})`,
        },
        injectTo: 'head' as const,
      })),
    ],
  };
}

/** The relay origin, when there is one, joins connect-src in the page's policy (item 31). */
function relayConnectSrc(): Plugin {
  return {
    name: 'diet-relay-connect-src',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => withRelayConnectSrc(html, relayOrigin),
    },
  };
}

/**
 * `vite dev` only: the development server injects stylesheets as inline <style> tags, which the
 * Content Security Policy in index.html blocks. Allow inline styles there and nowhere else; the
 * production build keeps the strict policy (e2e/shell.spec.ts checks the built index.html).
 */
function devServerStyles(): Plugin {
  const strict = "style-src 'self';";
  return {
    name: 'diet-dev-server-styles',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => {
        if (!html.includes(strict)) throw new Error(`index.html has no "${strict}" to relax`);
        return html.replace(strict, "style-src 'self' 'unsafe-inline';");
      },
    },
  };
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(buildId),
    __RELAY_ORIGIN__: JSON.stringify(relayOrigin),
  },
  build: {
    // Never inline assets as data: URLs; the Content Security Policy allows fonts only from the
    // app's own origin, and separate files are precached for offline use.
    assetsInlineLimit: 0,
    sourcemap: false,
    // With the dependencies in their own chunks the app's chunk is under Vite's 500 kB warning
    // limit again, so a real jump in size still warns.
    rollupOptions: { output: { manualChunks: chunkFor } },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  plugins: [
    react(),
    headMeta(),
    relayConnectSrc(),
    devServerStyles(),
    VitePWA({
      strategies: 'generateSW',
      // A new version waits for the person to tap Reload on the "Update available" banner.
      registerType: 'prompt',
      // Registered from src/pwa/registerServiceWorker.ts; no inline script (CSP script-src 'self').
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'Diet logbook and planner',
        short_name: 'Diet',
        description: DESCRIPTION,
        lang: 'en-NZ',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        theme_color: brandTeal,
        background_color: brandTeal,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole shell, so every screen opens offline. The plugin adds the manifest,
        // its icons and includeAssets itself.
        globPatterns: ['**/*.{html,js,css,woff2}'],
        // Hash routing means every navigation is index.html.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Nothing from any other origin is cached or fetched, and no Google Analytics. The scans
        // (tools/scans/rules.ts, serviceWorkerConfigRules) keep this empty and allow no extra
        // scripts or absolute URLs here; e2e/build-output.spec.ts checks the built sw.js.
        runtimeCaching: [],
        offlineGoogleAnalytics: false,
        sourcemap: false,
      },
    }),
  ],
});
