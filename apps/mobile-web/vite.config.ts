import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { parseColourTokens, requireToken } from '../../packages/ui/src/tokens';
import pkg from './package.json';

/**
 * The phone app build (checklist item 5). GitHub Pages serves the app at
 * https://thezombierobot.github.io/Diet/, so every URL, the manifest and the service worker scope
 * sit under /Diet/. Set DIET_BASE=/ to build for a server root instead (local preview).
 */
const base = (process.env['DIET_BASE'] ?? '/Diet/').replace(/\/?$/, '/');
/** Optional build label shown on About next to the version (the deploy passes the commit). */
const buildId = process.env['DIET_BUILD_ID'] ?? '';

// Theme colours come from the design tokens, the only place a colour is written.
const tokens = parseColourTokens(
  readFileSync(new URL('../../packages/ui/src/styles/tokens.css', import.meta.url), 'utf8'),
);
const ground = requireToken(tokens, '--color-ground');

const DESCRIPTION =
  'A private logbook and planner for meals, fasting, movement, drinks and the grocery list. It works offline and keeps records on this device.';

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
  },
  build: {
    // Never inline assets as data: URLs; the Content Security Policy allows fonts only from the
    // app's own origin, and separate files are precached for offline use.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  plugins: [
    react(),
    headMeta(),
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
        theme_color: ground.light,
        background_color: ground.light,
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
        // Nothing from any other origin is cached or fetched, and no Google Analytics.
        runtimeCaching: [],
        offlineGoogleAnalytics: false,
        sourcemap: false,
      },
    }),
  ],
});
