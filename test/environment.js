import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.env.TMPDIR = process.env.BILLBOARD_TEST_TMPDIR || fileURLToPath(new URL('../.cache/tmp', import.meta.url));
mkdirSync(process.env.TMPDIR, { recursive: true });
