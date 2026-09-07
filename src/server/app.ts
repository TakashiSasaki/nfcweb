import express, { type Express } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { schemaRouter } from './schemaRouter';

export interface ProductionAppOptions {
  clientDistPath?: string;
}

export interface ServerListenOptions {
  port?: number;
  clientDistPath?: string;
}

export interface DevelopmentAppOptions {
  root?: string;
}

/**
 * Derives current directory safely across both CommonJS (bundled dist/server.cjs)
 * and ES Module environments (tsx server.ts).
 */
export function getDirname(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

/**
 * Resolves the client dist directory containing public browser assets.
 * Evaluates candidate paths deterministically:
 * 1. Explicitly supplied path
 * 2. Relative to compiled bundle location (__dirname/../client)
 * 3. Relative to process current working directory (process.cwd()/dist/client)
 */
export function resolveClientDistPath(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }
  const dirname = getDirname();
  // Candidate 1: relative to compiled file location in dist/server/ -> dist/client/
  const candidateFromDirname = path.resolve(dirname, '../client');
  if (fs.existsSync(path.join(candidateFromDirname, 'index.html'))) {
    return candidateFromDirname;
  }
  // Candidate 2: relative to process current working directory (dist/client)
  const candidateFromCwd = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(path.join(candidateFromCwd, 'index.html'))) {
    return candidateFromCwd;
  }
  // Candidate 3: direct client subdirectory
  const candidateDirect = path.resolve(dirname, 'client');
  if (fs.existsSync(path.join(candidateDirect, 'index.html'))) {
    return candidateDirect;
  }
  return candidateFromCwd;
}

/**
 * Creates the base Express application with core middleware.
 * Schema routing (/schemas) is registered FIRST to guarantee precedence
 * over static asset serving and SPA fallback.
 */
export function createBaseApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  // Schema routes FIRST: intercepts /schemas requests before any static or SPA fallback middleware
  app.use('/schemas', schemaRouter);

  return app;
}

/**
 * Creates the production Express application.
 * Mounts:
 * 1. /schemas router (from createBaseApp - guaranteed route precedence)
 * 2. Static file middleware for browser-only assets in dist/client
 * 3. SPA fallback serving dist/client/index.html for navigation routes
 *
 * Does NOT import or configure Vite development middleware.
 */
export function createProductionApp(options: ProductionAppOptions = {}): Express {
  const app = createBaseApp();
  const clientDistPath = resolveClientDistPath(options.clientDistPath);

  // Serve browser-public assets from dist/client ONLY
  app.use(express.static(clientDistPath));

  // SPA fallback for all remaining non-schema routes
  app.get('*', (_req, res) => {
    const indexPath = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Not Found: Application client bundle not found. Please run npm run build.');
    }
  });

  return app;
}

/**
 * Creates the development Express application with Vite middleware.
 * Should only be called when explicitly running in development mode.
 */
export async function createDevelopmentApp(options: DevelopmentAppOptions = {}): Promise<Express> {
  const app = createBaseApp();

  // Development-only: attach error logger middleware
  app.use('/__log_error', (req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        fs.appendFileSync('browser_errors.log', body + '\n\n');
      } catch {
        // Ignore in environments where write is restricted
      }
      res.statusCode = 200;
      res.end('ok');
    });
  });

  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
    root: options.root,
  });
  app.use(vite.middlewares);

  return app;
}

/**
 * Starts the production HTTP server.
 * Honors process.env.PORT (Cloud Run standard) with 3000 as fallback.
 * Always binds to 0.0.0.0.
 */
export async function startProductionServer(options: ServerListenOptions = {}) {
  const clientDistPath = resolveClientDistPath(options.clientDistPath);
  const app = createProductionApp({ clientDistPath });
  const port = options.port ?? (Number(process.env.PORT) || 3000);

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`NFCWeb production server listening on port ${port} (static client: ${clientDistPath})`);
  });

  return { app, server, port, clientDistPath };
}

/**
 * Starts the development HTTP server with Vite middleware.
 * Honors process.env.PORT with 3000 as fallback.
 * Always binds to 0.0.0.0.
 */
export async function startDevelopmentServer(options: ServerListenOptions = {}) {
  const app = await createDevelopmentApp();
  const port = options.port ?? (Number(process.env.PORT) || 3000);

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`NFCWeb development server listening on port ${port}`);
  });

  return { app, server, port };
}
