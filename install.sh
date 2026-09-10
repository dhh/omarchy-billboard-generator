#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null; then
  printf '%s\n' 'Node.js is required. On Omarchy: omarchy pkg add nodejs npm'
  exit 1
fi
case "${1:-}" in
  --uninstall) shift; exec node scripts/install.mjs --uninstall "$@" ;;
  --help|-h)
    printf '%s\n' 'Usage: ./install.sh [--uninstall]' 'Installs production dependencies, user CLI commands and an app launcher.' 'Run as your normal user, not with sudo. System packages are not installed automatically.'
    exit 0 ;;
  '') ;;
  *) printf '%s\n' "Unknown option: $1" >&2; exit 1 ;;
esac
if (( $# > 0 )); then printf '%s\n' 'Unexpected arguments.' >&2; exit 1; fi
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node.js 22 or newer is required."); process.exit(1); }'
for dependency in npm chromium ffmpeg ffprobe; do
  if ! command -v "$dependency" >/dev/null; then
    printf '%s\n' "Missing $dependency. On Omarchy: omarchy pkg add nodejs npm chromium ffmpeg" >&2
    exit 1
  fi
done
if [[ "$EUID" == 0 ]]; then printf '%s\n' 'Run the installer as your normal user, not root.' >&2; exit 1; fi
npm ci --omit=dev --ignore-scripts
exec node scripts/install.mjs
