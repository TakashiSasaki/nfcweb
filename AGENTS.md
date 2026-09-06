# Project Persistent Guidelines

- **Version Tracking**:
  - Every time code changes are made to the application, the patch version of the application must be bumped (e.g. `1.0.1` -> `1.0.2` -> `1.0.X`).
  - The single source of truth for version is `/src/version.ts`.
  - Minor and major versions are bumped only when explicitly requested by the user.
