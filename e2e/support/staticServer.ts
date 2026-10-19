import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

/**
 * A tiny static server for the update test (PWA-05). It serves one build of the app under /Diet/
 * and can switch to another build at the same origin, the way a new deploy replaces the old one.
 */
export interface SwitchableServer {
  origin: string;
  /** Serve this build directory from now on. */
  serve: (root: string) => void;
  /** The path of every request so far, in order (for counting the browser's sw.js checks). */
  requests: readonly string[];
  close: () => Promise<void>;
}

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

export async function startStaticServer(root: string, base = '/Diet/'): Promise<SwitchableServer> {
  let current = root;
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      requests.push(path);
      if (request.method !== 'GET' || !path.startsWith(base)) {
        response.writeHead(404).end();
        return;
      }
      const relative = normalize(decodeURIComponent(path.slice(base.length)) || 'index.html');
      const file = join(current, relative);
      if (relative.startsWith('..') || !file.startsWith(current + sep)) {
        response.writeHead(403).end();
        return;
      }
      try {
        const info = await stat(file);
        const target = info.isDirectory() ? join(file, 'index.html') : file;
        const body = await readFile(target);
        response.writeHead(200, {
          'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        response.end(body);
      } catch {
        response.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    serve: (next) => {
      current = next;
    },
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
