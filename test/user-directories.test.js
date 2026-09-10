import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { videosDirectory } from '../src/user-directories.js';

test('Videos defaults honor desktop directory configuration without executing shell content', async t => {
  const home = await mkdtemp(join(tmpdir(), 'videos-home-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const config = join(home, '.config'); await mkdir(config);
  assert.equal(await videosDirectory({}, home), join(home, 'Videos'));
  for (const value of ['$HOME/Movies', '${HOME}/Movies', join(home, 'Movies')]) {
    await writeFile(join(config, 'user-dirs.dirs'), `XDG_VIDEOS_DIR="${value}"\n`);
    assert.equal(await videosDirectory({}, home), join(home, 'Movies'));
  }
  await writeFile(join(config, 'user-dirs.dirs'), 'XDG_VIDEOS_DIR="$(touch unauthorized)"\n');
  assert.equal(await videosDirectory({}, home), join(home, 'Videos'));
  const alternate = join(home, 'settings'); await mkdir(alternate);
  await writeFile(join(alternate, 'user-dirs.dirs'), 'XDG_VIDEOS_DIR="$HOME/Clips"\n');
  assert.equal(await videosDirectory({ XDG_CONFIG_HOME: alternate }, home), join(home, 'Clips'));
});
