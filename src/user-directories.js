import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';

// Read the desktop directory setting as data, never as shell code.
function configuredVideos(config, home) {
  if (Buffer.byteLength(config) > 65536) return;
  const value = config.match(/^XDG_VIDEOS_DIR="((?:\\.|[^"\\])*)"\s*$/m)?.[1];
  if (!value) return;
  const path = value.replace(/^\$(?:HOME|\{HOME\})(?=\/|$)/, home).replace(/\\([\\"`$])/g, '$1');
  if (isAbsolute(path) && !/[\n\r\0$`]/.test(path)) return path;
}
async function directoryConfig(directory) {
  try { return await readFile(join(directory, 'user-dirs.dirs'), 'utf8'); }
  catch (error) {
    if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error;
    return '';
  }
}
export async function videosDirectory(env = process.env, home = homedir()) {
  const config = await directoryConfig(env.XDG_CONFIG_HOME || join(home, '.config'));
  return configuredVideos(config, home) ?? join(home, 'Videos');
}
