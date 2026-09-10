# Omarchy Billboard Generator

Create animated OMARCHY domain videos with a local desktop app or CLI. Choose a theme, animation, domain suffix, language and canvas size. Each export is one 15-second MP4: 375 frames at 25 fps, H.264/yuv420p, square pixels and no audio.

**Defaults: Astral theme, laseretch - campaign animation, `.ORG`, English and 900×240.** The campaign effect includes native laser colors, two independent spark simulations and irregular ember piles. Another 37 website effects are available, including synthgrid, fireworks and matrix.

This is a community project, not an official Omarchy product or endorsement.

## Install on Omarchy

Install missing system dependencies through Omarchy's package manager:

```bash
omarchy pkg add nodejs npm curl tar chromium ffmpeg
```

Run the installer as your normal user, not with sudo. No Git or permanent checkout is required:

```bash
curl -fsSL https://raw.githubusercontent.com/llstrk/omarchy-billboard-generator/main/install.sh | bash
```

If you prefer to inspect scripts before executing them, review [`install.sh`](install.sh), then download `installer.mjs` and `SHA256SUMS` from the same [GitHub Release](https://github.com/llstrk/omarchy-billboard-generator/releases). Check with `sha256sum -c --ignore-missing SHA256SUMS`, review the installer, then run `node installer.mjs`. To select a version through the bootstrap, pipe it to `bash -s -- --version v0.1.0` instead of `bash`.

The installer downloads a versioned release, checks its SHA-256 digest, rejects unsafe archive entries, and installs locked production dependencies without npm lifecycle scripts. It adds:

- `omarchy-billboard`, `omarchy-billboard-app` and `omarchy-billboard-manage` in `~/.local/bin`.
- **Omarchy Billboard Generator** in your application launcher.
- Application versions in `~/.local/share/omarchy-billboard-generator/releases/`, with an atomic `current` link.

It respects `XDG_DATA_HOME` and `XDG_CACHE_HOME`, refuses to replace unrelated command/launcher files, and does not modify shell, Hyprland or Omarchy configuration. No root access is needed for the application installation. If your shell does not already include `~/.local/bin` in `PATH`, add it to your shell configuration or invoke the commands by their full paths.

The bootstrap and release installer are executable code fetched over HTTPS from this project's GitHub account. Release checksums detect corrupted or mismatched downloads, not a compromised publisher: they are not independent signatures. System dependencies and npm packages also require network access during installation.

Launch the app from the application launcher or run:

```bash
omarchy-billboard-app
```

### Update or uninstall

Close the app before updating:

```bash
omarchy-billboard-manage update
```

Plain `update` reports when the latest version is already installed, without downloading and installing it again. The new release and dependencies are prepared before switching the active version. Failed downloads, dependency installation and ordinary activation errors preserve the previous installation. Older releases are retained until uninstall so an existing process is not deprived of its files, including across several updates. This uses additional disk space for each installed version; explicit reinstalls also retain a copy. To reinstall or select a particular published version:

```bash
omarchy-billboard-manage update --version v0.1.0
```

To remove the application and its owned commands/launcher, without deleting videos, synced data, caches or modified launcher files:

```bash
omarchy-billboard-manage uninstall
```

The manager can also be invoked as `~/.local/bin/omarchy-billboard-manage`. A killed installer or power failure can leave its lock or staging files. Do not remove the lock while an installation is running; inspect the installation directory before retrying. This is not a crash-proof filesystem transaction.

**Older checkout-based installations:** run the original checkout's `./install.sh --uninstall` before replacing/updating that checkout or using the new installer. Your exported videos remain untouched. A previously synced `.cache/upstream.json` can be copied to the user data directory if you want to retain that snapshot.

### Other Linux distributions or development

Requirements: Node.js 22+, npm, Chromium (or Chrome), ffmpeg with `libx264`, and ffprobe. Install these using your distribution's package manager. No browser is downloaded automatically.

```bash
npm ci
./bin/omarchy-billboard-app
./bin/omarchy-billboard --help
```

Development tooling requires Node 22.13+ on the 22.x line, or Node 24+. The Omarchy installer uses Chromium; direct CLI/app execution also detects Chrome or supports `BILLBOARD_CHROMIUM`.

## Desktop app

The app opens in a standalone Chromium window with a live preview, playback controls and a scrubber. Exports use the same renderer as the CLI. Closing the app cancels any active export and stops its local backend.

The interface follows the active Omarchy desktop palette without changing desktop configuration. Billboard colors remain independent. Missing desktop theme data uses a fallback interface palette.

- Select a billboard theme, animation, language, suffix and resolution.
- Import custom JSON palettes with **Import theme**. See [THEMES.md](THEMES.md).
- Choose Theme, Black or White for the background.
- Inspect layout, contrast and encoding notes in the preview.
- Export to your configured Videos folder. **Auto** names files `omarchy-<suffix>-<language>.mp4`.
- Enable **Overwrite** to replace an existing file. Replacement happens only after successful rendering and verification.
- Open completed exports in your external player or output folder. **Auto play** is checked by default; uncheck it to disable automatic external playback.

Changing Animation during playback restarts the new effect and keeps playing. Other edits preserve playback position. Paused edits preserve the selected frame. Editor selections and imported palettes last for the current session; videos and explicitly synced website data persist.

For a browser tab instead of an app window:

```bash
omarchy-billboard-app --no-window
```

Open the printed URL, including its session token. Stop the backend with Ctrl+C. The server binds only to loopback and checks authentication, Host and Origin. Do not expose it through a public proxy. It is not a security boundary against other software running as your user.

## CLI

```bash
omarchy-billboard --output omarchy.mp4
omarchy-billboard --tld .dk --language da --resolution 1920x1080 --output omarchy-dk.mp4
omarchy-billboard --animation synthgrid --theme astral --output synthgrid.mp4
omarchy-billboard --theme-file examples/aurora.json --animation fireworks --output aurora.mp4
omarchy-billboard --list-themes
omarchy-billboard --list-languages
omarchy-billboard --list-animations
```

| Option | Default | Description |
| --- | --- | --- |
| `--theme` | `astral` | 22 website themes and 2 campaign palettes |
| `--theme-file` | none | Custom JSON palette instead of `--theme` |
| `--animation` | `laseretch-campaign` | Campaign effect or one of 37 website effects |
| `--tld` | `.ORG` | Domain suffix, including multi-label and internationalized names |
| `--language` | `en` | One of 31 bundled website locales |
| `--resolution` | `900x240` | Positive integer WIDTHxHEIGHT |
| `--background` | `theme` | `theme`, `black` or `white` |
| `--output` | `omarchy.mp4` | Destination in an existing writable directory |
| `--force` | off | Explicitly replace an existing output |

Relative CLI output paths resolve from the current directory, not the app's Videos folder. Settings are independent: `.dk` does not select Danish or change the theme. Suffixes become uppercase; internationalized names use Punycode with a diagnostic.

Every resolution is one canvas, never duplicated screens or a street mockup. The layout preserves logo proportions and measures translated text. Odd dimensions are padded on the right/bottom by one background pixel to meet H.264 requirements, without stretching. Very small or extreme layouts can be unreadable or exceed browser/memory limits.

## Animation and colors

The campaign animation retains native laser/spark colors and independent simulations. Only settled artwork receives the selected gradient. Its ember floor follows the canvas bottom; pile packing is a visual support approximation, not a full particle collision simulation.

Website effects use canvas-sized simulation grids with overscan around the unchanged logo cell scale. Synthgrid can reach all four canvas edges. Text-focused effects may stay near the wordmark by design. Website `laseretch` is distinct from `laseretch-campaign` and does not receive additional campaign piles. Simulation grids above 200,000 cells fail before allocation.

The timeline is fixed:

- 0–5 seconds: selected effect draws OMARCHY.
- 5–7 seconds: localized tagline, including DHH attribution, is typed.
- 9.5–10.5 seconds: the suffix appears while the domain stays centered.
- 10.5–15 seconds: completed composition holds.

Bundled fonts support all current locales, including CJK and RTL scripts. Custom themes use the same validated rendering pipeline. Light backgrounds are supported; low tagline contrast produces a warning rather than silently recoloring the artwork.

## Offline data and explicit sync

Rendering works offline once dependencies are installed. Website palettes and translations are pinned in `data/upstream.json`; animation assets are independently pinned. Source revisions, hashes and rights notices are documented in [PROVENANCE.md](PROVENANCE.md).

```bash
omarchy-billboard sync
omarchy-billboard sync --revision 5f908e4a85b8a4594be73db725906cf656660823
```

Sync resolves one upstream commit, validates all data and atomically replaces `upstream.json` in the user data directory (normally `~/.local/share/omarchy-billboard-generator/`). Failed sync preserves the previous snapshot. Remove that cache file to restore bundled data. Sync does not update executable animation assets, fonts, campaign palettes or custom imports. Downloaded TypeScript is parsed as data, not executed.

MP4 metadata records settings, translations, upstream revisions and simulation information. Custom palette data is embedded without its input file path. No sidecar is created.

## Troubleshooting and safety

- Executables are detected on `PATH`. Override them using `BILLBOARD_CHROMIUM`, `BILLBOARD_FFMPEG` or `BILLBOARD_FFPROBE`, each containing a path/name, not shell arguments.
- Browser work uses temporary directories and respects `TMPDIR`. Linux Chromium sockets require a short temporary path. Long checkout paths are supported.
- Synced data lives in the user data directory, outside versioned application files. npm and generated desktop-entry caches use the user cache directory, normally `~/.cache/omarchy-billboard-generator/`. Development artifacts remain in the checkout's ignored `.cache/`.
- Encoding uses a temporary file beside the destination and publishes only after verification. No-clobber output requires hard-link support; use a supporting filesystem or explicit replacement when appropriate.
- SIGINT, SIGTERM and SIGHUP cancel work and clean owned temporary resources. A forced kill or power loss can leave temporary files; inspect them only when no render is running.
- Preview playback may drop frames on heavy canvases. Exported videos still contain all 375 frames.
- No exact video-byte reproducibility is promised across different Chromium or ffmpeg versions.

## Development and licenses

See [CONTRIBUTING.md](CONTRIBUTING.md) for tests and code-quality requirements, [SECURITY.md](SECURITY.md) for reporting security issues, and [PROVENANCE.md](PROVENANCE.md) for third-party credits.

[LICENSE](LICENSE) covers original project code only. Bundled fonts retain their OFL licenses. Third-party branding, runtime, font-art and adapted material are excluded from that license and retain their respective rights. No trademark permission or billboard-operator certification is implied.
