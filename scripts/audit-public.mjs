import { execFileSync } from 'node:child_process';

const git = args => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const excluded = /(^|\/)(?:node_modules|\.cache|coverage|output|frames|\.env(?:\..*)?|AGENTS\.md|HANDOFF\.md|PROGRESS\.md|REVIEW\.md)(?:\/|$)|\.(?:mp4|mov|webm|tmp|log|pem|key|p12)$/i;
const patterns = [
  ['personal filesystem path', /\/(?:home|Users)\/[A-Za-z0-9._-]+\//],
  ['Windows personal filesystem path', /[A-Z]:\\Users\\[^\\\s]+\\/i],
  ['GitHub credential', /\b(?:gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];
function inspect(record) {
  const [header, path] = record.split('\t');
  const [mode, hash, stage] = header.split(' ');
  if (excluded.test(path)) throw Error(`Excluded publication path: ${path}`);
  if (['120000', '160000'].includes(mode) || stage !== '0') throw Error(`Unsupported staged entry: ${path}`);
  const content = git(['cat-file', 'blob', hash]).toString('latin1');
  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) throw Error(`Possible ${label} in ${path}. Review before publication.`);
  }
}
try {
  const records = git(['ls-files', '--stage', '-z']).toString('utf8').split('\0').filter(Boolean);
  if (!records.length) throw Error('No staged/tracked files to audit. Stage the intended public files first.');
  for (const record of records) inspect(record);
  console.log(`Public-file audit passed for ${records.length} staged files. Review the staged diff before pushing.`);
} catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 1; }
