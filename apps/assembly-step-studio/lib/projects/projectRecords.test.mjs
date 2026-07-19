import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInstructionsFromAssemblyRecord,
  buildStudioProjectRecord,
  normalizeStudioProjectRecord,
} from './projectRecords.ts';

test('legacy projects are preserved as build instructions projects', () => {
  const legacy = {
    id: 'legacy-project',
    name: 'Robot Lesson',
    status: 'Published',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    owner: 'Admin',
    tags: [],
    data: {
      version: '0.1.0',
      projectName: 'Robot Lesson',
      modelObjectTree: [],
      disassemblySteps: [{ id: 'step-1' }],
      assemblySteps: [],
    },
    modelAsset: { name: 'robot.glb', type: 'model/gltf-binary', blob: new Blob() },
  };

  const normalized = normalizeStudioProjectRecord(legacy);

  assert.equal(normalized.projectType, 'build-instructions');
  assert.equal(normalized.data.disassemblySteps[0].id, 'step-1');
  assert.equal(normalized.modelAsset?.name, 'robot.glb');
});

test('starting build instructions creates a separate linked project with the GLB model', () => {
  const source = buildStudioProjectRecord('My Robot', 'assembly', 'assembly-id');
  const modelBlob = new Blob(['glb'], { type: 'model/gltf-binary' });

  const instructions = buildInstructionsFromAssemblyRecord(source, modelBlob, 'instructions-id');

  assert.equal(instructions.id, 'instructions-id');
  assert.equal(instructions.projectType, 'build-instructions');
  assert.equal(instructions.sourceAssemblyProjectId, 'assembly-id');
  assert.equal(instructions.modelAsset?.blob, modelBlob);
  assert.equal(source.projectType, 'assembly');
});

test('new projects keep their explicit project type', () => {
  const assembly = buildStudioProjectRecord('My Robot', 'assembly', 'assembly-id');
  const instructions = buildStudioProjectRecord('My Robot Instructions', 'build-instructions', 'instructions-id');

  assert.equal(assembly.projectType, 'assembly');
  assert.deepEqual(assembly.assemblyData, { instances: [], mateRecords: [], groups: [] });
  assert.equal(instructions.projectType, 'build-instructions');
  assert.equal(instructions.assemblyData, null);
});

test('older assembly projects reopen with an empty rigid-group list', () => {
  const assembly = buildStudioProjectRecord('Old Robot', 'assembly', 'old-assembly');
  delete assembly.assemblyData.groups;

  const normalized = normalizeStudioProjectRecord(assembly);

  assert.deepEqual(normalized.assemblyData.groups, []);
});
