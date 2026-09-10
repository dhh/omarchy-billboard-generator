import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.env.TMPDIR = process.env.BILLBOARD_TEST_TMPDIR || fileURLToPath(new URL('../.cache/tmp', import.meta.url));
mkdirSync(process.env.TMPDIR, { recursive: true });
process.env.BILLBOARD_DATA_DIR = fileURLToPath(new URL('../.cache/user-data', import.meta.url));
process.env.BILLBOARD_CACHE_DIR = fileURLToPath(new URL('../.cache', import.meta.url));
