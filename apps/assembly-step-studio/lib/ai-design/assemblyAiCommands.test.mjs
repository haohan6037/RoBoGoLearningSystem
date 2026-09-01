import assert from 'node:assert/strict';
import test from 'node:test';

import { interpretLocalAssemblyRequest } from './assemblyAiCommands.ts';

test('recognizes the first supported rectangular chassis request', () => {
  const result = interpretLocalAssemblyRequest('Create a narrow rectangular chassis');

  assert.equal(result.status, 'ready');
  assert.equal(result.command.type, 'replace-with-rectangular-chassis');
  assert.match(result.command.summary, /4.*connector/i);
  assert.equal(result.command.replacesCurrentAssembly, true);
  assert.match(result.command.details.join(' '), /independently editable/i);
});

test('rejects requests outside the current experiment boundary', () => {
  const result = interpretLocalAssemblyRequest('加一个机械臂');

  assert.equal(result.status, 'unsupported');
  assert.match(result.message, /narrow rectangular chassis/i);
});

test('recognizes a gear-driven claw request and describes the counter-rotating mechanism', () => {
  const result = interpretLocalAssemblyRequest('Create a gear-driven claw that opens and closes');

  assert.equal(result.status, 'ready');
  assert.equal(result.command.type, 'replace-with-gear-driven-claw');
  assert.match(result.command.summary, /23.*gear/i);
  assert.match(result.command.details.join(' '), /反向|counter/i);
  assert.match(result.command.details.join(' '), /Corner Beam/);
  assert.match(result.command.details.join(' '), /square hole/i);
  assert.equal(result.command.replacesCurrentAssembly, true);
});

test('continues to accept supported Chinese commands', () => {
  const result = interpretLocalAssemblyRequest('做一个用齿轮带动开合的 claw');

  assert.equal(result.status, 'ready');
  assert.equal(result.command.type, 'replace-with-gear-driven-claw');
});
