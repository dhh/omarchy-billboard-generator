import test from 'node:test';
import assert from 'node:assert/strict';
import { Linter } from 'eslint';

const linter = new Linter();
const config = { linterOptions: { noInlineConfig: true }, rules: { complexity: ['error', { max: 6, variant: 'classic' }] } };
const decision = index => `if (value === ${index}) return ${index};`;
const source = count => `function sample(value) { ${Array.from({ length: count }, (_, i) => decision(i)).join(' ')} return -1; }`;

test('complexity guard accepts six paths and rejects seven, including inline suppression attempts', () => {
  assert.deepEqual(linter.verify(source(5), config), []);
  const violations = linter.verify(source(6), config);
  assert.equal(violations.length, 1); assert.equal(violations[0].ruleId, 'complexity');
  assert.match(violations[0].message, /complexity of 7/);
  assert.ok(linter.verify(`/* eslint-disable complexity */\n${source(6)}`, config).some(message => message.ruleId === 'complexity'));
});
