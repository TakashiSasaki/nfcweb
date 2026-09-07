import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'error-logger',
        configureServer(server) {
          server.middlewares.use('/__log_error', (req, res) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              require('fs').appendFileSync('browser_errors.log', body + '\n\n');
              res.statusCode = 200;
              res.end('ok');
            });
          });
        }
      },
      VitePWA({
        registerType: 'prompt',
        devOptions: {
          enabled: false
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
        manifest: {
          name: 'NFC Reader & Writer',
          short_name: 'NFC App',
          description: 'A Web App to read and write NFC tags (NDEF).',
          theme_color: '#3b82f6',
          icons: [
            {
              src: '/icons/icon-192x192.svg',
              sizes: '192x192',
              type: 'image/svg+xml'
            },
            {
              src: '/icons/icon-512x512.svg',
              sizes: '512x512',
              type: 'image/svg+xml'
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
