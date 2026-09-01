import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { calculateAssemblyFocus } from './assemblyCamera.ts';

test('initial focus targets an assembled model that is far from the world origin', () => {
  const focus = calculateAssemblyFocus([
    new THREE.Box3(new THREE.Vector3(480, 180, 90), new THREE.Vector3(500, 220, 110)),
    new THREE.Box3(new THREE.Vector3(500, 180, 90), new THREE.Vector3(520, 220, 110)),
  ], {
    cameraPosition: new THREE.Vector3(115, 95, 145),
    currentTarget: new THREE.Vector3(0, 0, 0),
    verticalFovDegrees: 40,
    aspect: 16 / 9,
  });

  assert.deepEqual(focus.target.toArray(), [500, 200, 100]);
  assert.ok(focus.position.distanceTo(focus.target) > 40);
  assert.ok(focus.near > 0);
  assert.ok(focus.far > focus.near);
});

test('initial focus ignores a lone part far away from the main assembly', () => {
  const mainAssembly = Array.from({ length: 10 }, (_, index) => new THREE.Box3(
    new THREE.Vector3(index * 10, -5, -5),
    new THREE.Vector3(index * 10 + 8, 5, 5),
  ));
  const focus = calculateAssemblyFocus([
    ...mainAssembly,
    new THREE.Box3(new THREE.Vector3(10_000, 0, 0), new THREE.Vector3(10_010, 10, 10)),
  ], {
    cameraPosition: new THREE.Vector3(115, 95, 145),
    currentTarget: new THREE.Vector3(0, 0, 0),
    verticalFovDegrees: 40,
    aspect: 16 / 9,
  });

  assert.ok(focus.target.x < 100, `expected the main assembly, received x=${focus.target.x}`);
});
