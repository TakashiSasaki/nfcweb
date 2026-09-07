# Project Persistent Guidelines

- **Version Tracking**:
  - Every time code changes are made to the application, the patch version of the application must be bumped (e.g. `1.0.1` -> `1.0.2` -> `1.0.X`).
  - The single source of truth for version is `/src/version.ts`.
  - Minor and major versions are bumped only when explicitly requested by the user.

- **PWA (Service Worker) in Development / Preview Environments**:
  - **DANGER:** Never enable the PWA Service Worker in development (`devOptions.enabled: true` in `vite.config.ts`) or implement aggressive update/reload logic (like automatically calling `window.location.reload()` on `controllerchange`) within the AI Studio preview iframe.
  - **Reason:** Doing so can trigger a catastrophic infinite reload loop. The frequent auto-rebuilds in the preview environment cause the Service Worker to constantly detect updates, fire the reload logic, and immediately trigger another update. This will bombard the server with requests, resulting in a `429 Too Many Requests (Rate exceeded)` error, which manifests as a completely blank white screen for the user.
  - **Avoid `Clear-Site-Data: "executionContexts"`:** If you need to clear a rogue Service Worker, do NOT use the HTTP header `Clear-Site-Data: "executionContexts"`. In an iframe environment like AI Studio's preview, this forces the iframe to continuously reload itself, causing the preview pane to permanently stall on "Loading your app".
  - **Correct Mitigation:** If a rogue Service Worker is causing loops, clear it via client-side JavaScript in the entry point (e.g., `src/main.tsx`) by calling `navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()))`. Ensure `devOptions.enabled: false` remains set in the Vite PWA config during development.
