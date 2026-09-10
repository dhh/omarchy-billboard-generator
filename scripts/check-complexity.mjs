import { ESLint } from 'eslint';
import { relative } from 'node:path';
import { sourceFiles, complexityExceptions } from '../eslint.config.js';

// A zero threshold reports every function. Apply the real limit below, with
// exceptions scoped to named functions, not blanket exemptions for their files.
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [{
  files: sourceFiles, linterOptions: { noInlineConfig: true }, rules: { complexity: ['error', { max: 0, variant: 'classic' }] },
}] });
const results = await eslint.lintFiles(['src', 'app', 'web', 'scripts', 'bin/omarchy-billboard', 'bin/omarchy-billboard-app']);
const functions = []; let failures = 0;
for (const result of results) for (const message of result.messages) {
  const file = relative(process.cwd(), result.filePath);
  if (message.ruleId !== 'complexity') {
    console.error(`${file}:${message.line}: ${message.message}`); failures++; continue;
  }
  const name = message.message.match(/'([^']+)'/)?.[1] ?? 'anonymous';
  const score = Number(message.message.match(/complexity of (\d+)/)[1]);
  const exception = complexityExceptions.find(entry => entry.file === file && entry.name === name);
  const limit = exception?.max ?? 6;
  const item = { file, line: message.line, name, score, limit, exception: !!exception };
  functions.push(item);
  if (score > limit) { console.error(`${file}:${message.line}: ${name} = ${score}, limit ${limit}`); failures++; }
}
const authored = functions.filter(item => !item.exception);
if (process.argv.includes('--report')) {
  console.log(JSON.stringify({ metric: 'ESLint classic cyclomatic complexity', functions: functions.sort((a, b) => b.score - a.score) }, null, 2));
} else {
  console.log(`${authored.length} functions checked against the default limit; maximum complexity ${Math.max(...authored.map(item => item.score))}, limit 6.`);
  for (const entry of functions.filter(item => item.exception)) console.log(`Preserved extraction: ${entry.file}:${entry.line} ${entry.name} = ${entry.score} (cap ${entry.limit}).`);
}
process.exitCode = failures ? 1 : 0;
