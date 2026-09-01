import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInstructionsFromAssemblyRecord,
  buildStudioProjectRecord,
  normalizeStudioProjectRecord,
  refreshBuildInstructionsFromAssemblyRecord,
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
  const beam = {
    id: '228-2500-023',
    name: '2x8 Beam',
    partNumber: '228-2500-023',
    category: 'Beams',
    sourceFile: '2x8.step',
    thumbnailUrl: '/part-library/thumbnails/2x8.png',
  };
  source.assemblyData.instances = [
    { instanceId: 'beam-1', part: beam, color: '#fff', position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    { instanceId: 'beam-2', part: beam, color: '#fff', position: [1, 0, 0], quaternion: [0, 0, 0, 1] },
  ];
  const coverBlob = new Blob(['cover'], { type: 'image/webp' });
  source.coverAsset = {
    blob: coverBlob,
    type: 'image/webp',
    updatedAt: '2026-07-22T00:00:00.000Z',
    camera: {
      position: [100, 80, 140],
      target: [0, 0, 0],
      up: [0, 1, 0],
    },
  };
  const modelBlob = new Blob(['glb'], { type: 'model/gltf-binary' });

  const instructions = buildInstructionsFromAssemblyRecord(source, modelBlob, 'instructions-id');

  assert.equal(instructions.id, 'instructions-id');
  assert.equal(instructions.projectType, 'build-instructions');
  assert.equal(instructions.sourceAssemblyProjectId, 'assembly-id');
  assert.equal(instructions.modelAsset?.blob, modelBlob);
  assert.equal(instructions.coverAsset?.blob, coverBlob);
  assert.deepEqual(instructions.coverAsset?.camera, source.coverAsset.camera);
  assert.deepEqual(instructions.data.partsList, [{
    id: '228-2500-023',
    name: '2x8 Beam',
    partNumber: '228-2500-023',
    thumbnailUrl: '/part-library/thumbnails/2x8.png',
    quantity: 2,
  }]);
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

test('an existing linked build instructions project refreshes its cover and parts without losing steps', () => {
  const source = buildStudioProjectRecord('Updated Robot', 'assembly', 'assembly-id');
  source.assemblyData.instances = [{
    instanceId: 'beam-1',
    part: {
      id: 'beam',
      name: '2x8 Beam',
      partNumber: '228-2500-023',
      category: 'Beams',
      sourceFile: '2x8.step',
      thumbnailUrl: '/part-library/thumbnails/2x8.png',
    },
    color: '#fff',
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
  }];
  source.coverAsset = {
    blob: new Blob(['new-cover'], { type: 'image/webp' }),
    type: 'image/webp',
    updatedAt: '2026-07-22T01:00:00.000Z',
    camera: { position: [10, 10, 10], target: [0, 0, 0] },
  };
  const instructions = buildStudioProjectRecord('Teacher Notes', 'build-instructions', 'instructions-id');
  instructions.sourceAssemblyProjectId = source.id;
  instructions.data.disassemblySteps = [{ id: 'step-1', description: 'Keep this step.' }];

  const refreshed = refreshBuildInstructionsFromAssemblyRecord(instructions, source);

  assert.equal(refreshed.name, 'Teacher Notes');
  assert.equal(refreshed.data.disassemblySteps[0].description, 'Keep this step.');
  assert.equal(refreshed.coverAsset?.blob, source.coverAsset.blob);
  assert.deepEqual(refreshed.data.partsList, [{
    id: 'beam',
    name: '2x8 Beam',
    partNumber: '228-2500-023',
    thumbnailUrl: '/part-library/thumbnails/2x8.png',
    quantity: 1,
  }]);
});

test('older assembly projects reopen with an empty rigid-group list', () => {
  const assembly = buildStudioProjectRecord('Old Robot', 'assembly', 'old-assembly');
  delete assembly.assemblyData.groups;

  const normalized = normalizeStudioProjectRecord(assembly);

  assert.deepEqual(normalized.assemblyData.groups, []);
});
