import {
  createBaseApp,
  createProductionApp,
  createDevelopmentApp,
  startProductionServer,
  startDevelopmentServer,
  resolveClientDistPath
} from './src/server/app';

// Backward-compatible exports
export const createApp = createBaseApp;
export const startServer = startProductionServer;

export {
  createBaseApp,
  createProductionApp,
  createDevelopmentApp,
  startProductionServer,
  startDevelopmentServer,
  resolveClientDistPath
};

export default createProductionApp;

// Explicit mode detection:
// 1. If --dev flag is passed or SERVER_MODE === 'development': run development server with Vite middleware.
// 2. Otherwise (default for "npm start", Cloud Run container start, etc.): run production static server.
// Does not rely on implicit NODE_ENV.
const isDirectExecution = !process.env.VITEST && process.env.NODE_ENV !== 'test';

if (isDirectExecution) {
  const isDevMode = process.argv.includes('--dev') || process.env.SERVER_MODE === 'development';

  if (isDevMode) {
    startDevelopmentServer().catch((err) => {
      console.error('Failed to start development server:', err);
      process.exit(1);
    });
  } else {
    startProductionServer().catch((err) => {
      console.error('Failed to start production server:', err);
      process.exit(1);
    });
  }
}

