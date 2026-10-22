import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type Rollup } from 'vite';
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

/**
 * The shipped datasets (packages/core/data), each in a chunk of its own: they change far less often
 * than the app's code, so an update does not fetch them again, and they load with the screens that
 * read them (code split).
 */
const DATA_CHUNKS: Readonly<Record<string, string>> = {
  'ingredients.json': 'foods-data',
  'ingredient-nutrients.json': 'foods-data',
  'recipes.json': 'recipes-data',
  'exercises.json': 'exercises-data',
};

type ModuleGraph = Pick<Rollup.ManualChunkMeta, 'getModuleIds' | 'getModuleInfo'>;

/** Every module reached from `starts` by static imports. */
function staticallyReached(starts: Iterable<string>, graph: ModuleGraph): Set<string> {
  const reached = new Set<string>();
  const next = [...starts];
  for (let id = next.pop(); id !== undefined; id = next.pop()) {
    if (reached.has(id)) continue;
    reached.add(id);
    next.push(...(graph.getModuleInfo(id)?.importedIds ?? []));
  }
  return reached;
}

type SharedLayer = 'copy' | 'core' | 'app';

const COPY = /[\\/]packages[\\/]core[\\/]src[\\/]copy[\\/]/;
const CORE = /[\\/]packages[\\/](core|grocery)[\\/]/;

/**
 * The modules the first paint loads that a lazily loaded screen imports too (code split). They are
 * not left in the entry chunk, so no lazy chunk imports the entry chunk: Rollup's file names
 * include the names of the files a chunk imports, so a lazy chunk that imported the entry would get
 * a new name, and be fetched again, with every change to the entry. The build label (src/version.ts)
 * is in the entry chunk alone (e2e/update.spec.ts), with the code only the first paint runs (Today,
 * setup, About and the help numbers). The shared modules go in three layers, each a chunk under
 * Vite's 500 kB warning that imports only the layers before it: "copy" (health.ts and what it
 * imports), "core" (the rest of packages/core, and packages/grocery) and "app" (this app's own
 * code and packages/ui).
 */
function sharedLayers(graph: ModuleGraph): ReadonlyMap<string, SharedLayer> {
  const modules = [...graph.getModuleIds()].flatMap((id) => graph.getModuleInfo(id) ?? []);
  const reached = (starts: readonly string[]) => staticallyReached(starts, graph);
  const firstPaint = reached(modules.filter((m) => m.isEntry).map((m) => m.id));
  const lazy = reached(modules.flatMap((m) => m.dynamicallyImportedIds));
  const copy = reached(modules.filter((m) => COPY.test(m.id)).map((m) => m.id));
  const layers = new Map<string, SharedLayer>();
  for (const id of firstPaint) {
    if (lazy.has(id)) layers.set(id, copy.has(id) ? 'copy' : CORE.test(id) ? 'core' : 'app');
  }
  return layers;
}

const layersByBuild = new WeakMap<ModuleGraph['getModuleInfo'], ReadonlyMap<string, SharedLayer>>();

function chunkFor(id: string, graph: ModuleGraph): string | undefined {
  if (id.includes('commonjsHelpers')) return 'vendor';
  const data = /[\\/]packages[\\/]core[\\/]data[\\/]([\w-]+\.json)$/.exec(id)?.[1];
  if (data !== undefined) return DATA_CHUNKS[data];
  const parts = id.split(/[\\/]node_modules[\\/]/);
  // The package a file belongs to: the folder after the last node_modules (pnpm nests them).
  const name = parts.length < 2 ? undefined : parts.at(-1)?.split(/[\\/]/)[0];
  if (name === 'jsqr') return 'jsQR';
  if (name !== undefined && VENDOR.has(name)) return 'vendor';
  let layers = layersByBuild.get(graph.getModuleInfo);
  if (layers === undefined) {
    layers = sharedLayers(graph);
    layersByBuild.set(graph.getModuleInfo, layers);
  }
  return layers.get(id);
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
    // With the dependencies, the datasets, the screens loaded on demand and the shared layers in
    // chunks of their own, every chunk is under Vite's 500 kB warning limit, so a real jump in size
    // still warns (e2e/build-output.spec.ts fails on one).
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
