import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { userDataDirectory, userCacheDirectory } from '../src/user-paths.js';

test('runtime data and caches follow XDG independently of the installed release', () => {
  const keys = ['XDG_DATA_HOME', 'XDG_CACHE_HOME', 'BILLBOARD_DATA_DIR', 'BILLBOARD_CACHE_DIR'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.equal(userDataDirectory(), join(homedir(), '.local/share/omarchy-billboard-generator'));
    assert.equal(userCacheDirectory(), join(homedir(), '.cache/omarchy-billboard-generator'));
    process.env.XDG_DATA_HOME = '/fixture-data'; process.env.XDG_CACHE_HOME = '/fixture-cache';
    assert.equal(userDataDirectory(), '/fixture-data/omarchy-billboard-generator');
    assert.equal(userCacheDirectory(), '/fixture-cache/omarchy-billboard-generator');
    process.env.BILLBOARD_DATA_DIR = '/fixture-test-data'; process.env.BILLBOARD_CACHE_DIR = '/fixture-test-cache';
    assert.equal(userDataDirectory(), '/fixture-test-data'); assert.equal(userCacheDirectory(), '/fixture-test-cache');
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
