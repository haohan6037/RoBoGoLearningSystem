import assert from 'node:assert/strict';
import test from 'node:test';

import { projectFromTransport, projectToTransport } from './projectTransport.ts';

function buildRecord() {
  return {
    id: 'transport-project',
    name: 'Transport Project',
    projectType: 'build-instructions',
    status: 'In Progress',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    owner: 'Admin',
    tags: [],
    data: {
      version: '0.1.0',
      projectName: 'Transport Project',
      modelObjectTree: [],
      disassemblySteps: [],
      assemblySteps: [],
    },
    modelAsset: {
      name: 'robot.glb',
      type: 'model/gltf-binary',
      blob: new Blob(['robot-model'], { type: 'model/gltf-binary' }),
    },
    coverAsset: null,
  };
}

test('project assets survive the JSON transport round trip', async () => {
  const transport = await projectToTransport(buildRecord());
  const restored = projectFromTransport(transport);

  assert.equal(restored.modelAsset?.name, 'robot.glb');
  assert.equal(await restored.modelAsset?.blob.text(), 'robot-model');
});

test('unchanged binary assets can be omitted from an autosave payload', async () => {
  const transport = await projectToTransport(buildRecord(), false, false);

  assert.equal(Object.hasOwn(transport, 'modelAsset'), false);
  assert.equal(Object.hasOwn(transport, 'coverAsset'), false);
});
