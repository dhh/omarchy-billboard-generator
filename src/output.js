import { writeFile, link, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Fail before encoding when atomic no-clobber publication is unavailable.
// An exclusive copy is not a fallback: readers could observe a partial video.
function publicationError(output, error) {
  return new Error(`Cannot use atomic no-clobber publication in ${dirname(output)} (${error.code ?? error.message}). Choose a filesystem supporting hard links, or use --force only if replacing the destination is acceptable.`, { cause: error });
}
export async function checkPublication(output, { createLink = link } = {}) {
  const source = join(dirname(output), `.billboard-link-${randomUUID()}.probe`), destination = `${source}.link`;
  let created = false, linked = false;
  try {
    await writeFile(source, '', { flag: 'wx', mode: 0o600 }); created = true;
    try { await createLink(source, destination); linked = true; }
    catch (error) {
      throw publicationError(output, error);
    }
  } finally {
    try { if (linked) await rm(destination); }
    finally { if (created) await rm(source); }
  }
}
