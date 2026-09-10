import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
function candidatesFor(name) {
  if (name.includes('/')) return [resolve(name)];
  return (process.env.PATH ?? '').split(delimiter).map(dir => resolve(dir, name));
}
export async function executable(explicit, candidates, label) {
  for (const name of explicit ? [explicit] : candidates) {
    for (const path of candidatesFor(name)) {
      try { await access(path, constants.X_OK); return path; } catch { /* Try the next executable. */ }
    }
  }
  const variable = { Chromium: 'BILLBOARD_CHROMIUM', ffmpeg: 'BILLBOARD_FFMPEG' }[label] ?? 'BILLBOARD_FFPROBE';
  throw Error(`${label} was not found. Install it or set ${variable} to an executable path.`);
}
