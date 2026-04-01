/**
 * Local test server with COOP/COEP headers for SharedArrayBuffer support.
 * Serves the test HTML page and the built SDK dist files.
 */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 9876;
const SDK_ROOT = join(__dirname, '..', '..');
const E2E_DIR = __dirname;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
};

function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = req.url || '/';

  let filePath: string;
  if (url.startsWith('/dist/')) {
    filePath = join(SDK_ROOT, url);
  } else if (url === '/' || url === '/index.html') {
    filePath = join(E2E_DIR, 'test-page.html');
  } else {
    filePath = join(E2E_DIR, url);
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(readFileSync(filePath));
}

const server = createServer(handler);

export function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`Test server running at http://localhost:${PORT}`);
      resolve();
    });
  });
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

export const TEST_URL = `http://localhost:${PORT}`;
