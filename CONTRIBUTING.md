# Contributing

Use Node 24+ (or Node 22.13+), Chromium, ffmpeg and ffprobe. Run `npm ci` to install development dependencies. `install.sh` installs production dependencies only, so rerun `npm ci` before development checks.

## Checks

```bash
npm test
npm run test:install
npm run test:cli
npm run test:app
npm run test:custom-themes
npm run test:animations
npm run test:canvas-effects
npm run test:visual
npm run test:integration
npm run test:experimental
```

Unit tests cover options, themes, assets, geometry, fonts, synchronization, request security, output safety and resource cleanup. Browser suites exercise deterministic frames, all website effects, theme imports, playback, real exports and cancellation. The installer suite uses isolated user directories, not your desktop configuration.

Inside a graphical Omarchy session, `npm run test:app-window` opens and closes a test app window. Add `-- --sighup` to test terminal-hangup cleanup. Other tests do not need an interactive desktop.

Visual baselines are Chromium/environment-specific. Use `npm run test:visual -- --update` only after inspecting the change. Never update baselines just to hide a failure. Generated reports, screenshots, videos and caches stay out of Git.

## Code quality

`npm run lint` enforces ESLint classic cyclomatic complexity of 6 per function across maintained application code, CLI entry points and scripts. `npm run complexity` prints the inventory. Tests and bundled third-party runtime code are excluded. Inline suppression cannot bypass the guard.

Three preserved campaign algorithms have exact named caps:

| File | Function | Cap |
| --- | --- | --- |
| `web/glyph-piles.js` | `createGlyphPiles` | 18 |
| `web/independent-sparks.js` | `createIndependentSparks` | 14 |
| `web/independent-sparks.js` | `drawGlyph` | 7 |

New functions in those files still have the default limit. Preserve official logo geometry, independent simulations, native effect colors, irregular ember appearance and the single-canvas output contract.

Use English for documentation, diagnostics and comments. Generated copy uses the selected locale. Do not introduce private paths, credentials, internal work notes or runtime dependencies on another checkout. Keep third-party credits and licenses intact.

## Release hygiene

Run `npm run audit:public` after staging changes. It checks every staged path and blob for private documents, generated artifacts, credentials and personal filesystem paths, including diagnostic strings in binary assets. Review the staged diff and dependency changes as well. Automated scans reduce risk but are not a guarantee that arbitrary secrets can be detected.

Publish only reviewed source files and required licensed/permitted assets. Syncing newer upstream data is separate from updating executable runtime assets; document source revisions, hashes and modifications in the provenance manifests.
