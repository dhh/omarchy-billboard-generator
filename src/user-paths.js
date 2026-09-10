import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

export function userDataDirectory() {
  return resolve(process.env.BILLBOARD_DATA_DIR || join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'omarchy-billboard-generator'));
}
export function userCacheDirectory() {
  return resolve(process.env.BILLBOARD_CACHE_DIR || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'omarchy-billboard-generator'));
}
