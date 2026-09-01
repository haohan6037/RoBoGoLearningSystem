import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  buildInstructionPartDisplayName,
  editorDragObjectUuids,
  findEditorPart,
  viewerMouseButtons,
} from './editorInteraction.ts';

test('Build Instructions uses the left mouse button to rotate the camera', () => {
  assert.equal(viewerMouseButtons('editor').LEFT, THREE.MOUSE.ROTATE);
});

test('Build Instructions hides duplicate instance suffixes from student-facing part names', () => {
  assert.equal(buildInstructionPartDisplayName('2x8_Beam_1'), '2x8 Beam');
  assert.equal(buildInstructionPartDisplayName('05x_Pitch_Standoff_3'), '05x Pitch Standoff');
  assert.equal(
    buildInstructionPartDisplayName('2x8_Beam_2 (228-2500-023)'),
    '2x8 Beam',
  );
});

test('Build Instructions drags only the active part, never an Assembly selection group', () => {
  assert.deepEqual(
    editorDragObjectUuids('gear', ['beam', 'gear', 'pin']),
    ['gear'],
  );
});

test('Build Instructions selects the exported Assembly instance instead of the whole model', () => {
  const scene = new THREE.Group();
  scene.name = 'AuxScene';
  const assembly = new THREE.Object3D();
  assembly.name = 'SimpleClaw';
  const part = new THREE.Object3D();
  part.name = '2x8 Beam';
  part.userData.robogoInstanceId = 'beam-instance';
  const geometry = new THREE.Object3D();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());

  geometry.add(mesh);
  part.add(geometry);
  assembly.add(part);
  scene.add(assembly);

  assert.equal(findEditorPart(mesh), part);
});

test('Build Instructions keeps selecting named groups in older GLB models', () => {
  const scene = new THREE.Group();
  scene.name = 'AuxScene';
  const part = new THREE.Group();
  part.name = 'Legacy Beam';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());

  part.add(mesh);
  scene.add(part);

  assert.equal(findEditorPart(mesh), part);
});
