import express, { type Express } from 'express';
import path from 'node:path';
import { schemaRouter } from './src/server/schemaRouter';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  // Schema routes FIRST (must intercept /schemas requests before SPA or static middleware)
  app.use('/schemas', schemaRouter);

  return app;
}

export async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`NFCWeb server listening on port ${PORT}`);
  });

  return { app, server };
}

// Only launch standalone server if not in a testing environment
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
