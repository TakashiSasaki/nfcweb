# Project Persistent Guidelines

- **Version Tracking**:
  - Every time code changes are made to the application, the patch version of the application must be bumped (e.g. `1.0.1` -> `1.0.2` -> `1.0.X`).
  - The single source of truth for version is `/src/version.ts`.
  - Minor and major versions are bumped only when explicitly requested by the user.

- **PWA (Service Worker) in Development / Preview Environments**:
  - **DANGER:** Never enable the PWA Service Worker in development (`devOptions.enabled: true` in `vite.config.ts`) or implement aggressive update/reload logic (such as automatically calling `window.location.reload()` on `controllerchange`) within the AI Studio preview iframe.
  - **Reason:** Frequent preview rebuilds can create a Service Worker update/reload loop, bombard the preview server with requests, and result in `429 Too Many Requests` or a blank preview.
  - **Avoid `Clear-Site-Data: "executionContexts"`:** Do not use this header as a preview recovery mechanism; in an iframe it can itself cause repeated reloads.
  - **Recovery must be preview-only and explicit:** Never unregister all Service Workers from normal production startup code. If a rogue preview Service Worker must be removed, use an explicit development-only recovery action or browser/site-data cleanup that cannot run in the production bundle/runtime.
  - Keep `devOptions.enabled: false` in the Vite PWA config for development/preview. Production PWA registration, caching, offline behavior, and update lifecycle must remain intact.

- **Storage Architecture (pre-production breaking-change policy)**:
  - `nfcweb_db` is the sole authority for persisted tag and local photo data.
  - Do not add compatibility writers or runtime fallbacks for the removed `nfc_tags_registry` localStorage registry or the removed legacy photo database.
  - Internal storage APIs do not require backward compatibility. Prefer a clean breaking change over introducing transitional bridges.
  - Tag/photo consistency-critical changes must use the transactional operations layer, and user-visible success must follow durable IndexedDB transaction completion.
