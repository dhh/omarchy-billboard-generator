#!/usr/bin/env bash
set -euo pipefail
# Install a release, not a checkout. Checksums are not independent signatures.
if [[ "$EUID" == 0 ]]; then echo 'Run this installer as your normal user, not root.' >&2; exit 1; fi
for tool in node curl; do
  if ! command -v "$tool" >/dev/null; then
    echo "Missing $tool. On Omarchy: omarchy pkg add nodejs npm curl tar chromium ffmpeg" >&2
    exit 1
  fi
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node.js 22 or newer is required."); process.exit(1); }'
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
fetch() {
  curl --fail --show-error --silent --location --proto '=https' --proto-redir '=https' --max-time 120 "$@"
}
repository=https://github.com/llstrk/omarchy-billboard-generator
url=$(fetch --head --output /dev/null --write-out '%{url_effective}' "$repository/releases/latest")
version=${url##*/}
if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$ ]]; then echo 'Unable to resolve the latest release.' >&2; exit 1; fi
fetch --max-filesize 200000 "$repository/releases/download/$version/installer.mjs" --output "$work/installer.mjs"
fetch --max-filesize 16384 "$repository/releases/download/$version/SHA256SUMS" --output "$work/SHA256SUMS"
node - "$work" <<'NODE'
const fs = require('node:fs'), crypto = require('node:crypto'), path = require('node:path');
const work = process.argv[2];
const line = fs.readFileSync(path.join(work, 'SHA256SUMS'), 'utf8').split('\n').find(line => line.endsWith('  installer.mjs'));
const expected = line?.split(' ')[0];
const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(work, 'installer.mjs'))).digest('hex');
if (expected !== actual) { console.error('Installer checksum mismatch. Nothing was installed.'); process.exit(1); }
NODE
export NODE_USE_ENV_PROXY="${NODE_USE_ENV_PROXY:-1}"
# The release is already resolved; handing it over spares the installer a second, rate-limited API lookup.
if [[ $# -eq 0 ]]; then set -- --version "$version"; fi
node "$work/installer.mjs" "$@"
