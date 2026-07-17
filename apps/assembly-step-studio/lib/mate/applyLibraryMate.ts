import * as THREE from 'three';
import type { LibraryConnector } from '@/lib/mate/libraryConnectors';
import {
  connectorWorldFrame,
  snapObjectByTwoMates,
  snapObjectToMate,
  type MateConnector,
} from '@/lib/mate/mateMath';

export type InstanceTransform = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
};

function transformObject(transform: InstanceTransform): THREE.Object3D {
  const object = new THREE.Object3D();
  object.position.fromArray(transform.position);
  object.quaternion.fromArray(transform.quaternion);
  object.updateWorldMatrix(true, false);
  return object;
}

function mateConnector(connector: LibraryConnector, useCenter = false): MateConnector {
  return {
    position: new THREE.Vector3(...(useCenter && connector.centerPosition
      ? connector.centerPosition
      : connector.position)),
    normal: new THREE.Vector3(...connector.normal),
  };
}

function readTransform(object: THREE.Object3D): InstanceTransform {
  return {
    position: object.position.toArray(),
    quaternion: object.quaternion.toArray(),
  };
}

export function applySingleLibraryMate(
  fixed: InstanceTransform,
  moving: InstanceTransform,
  fixedConnector: LibraryConnector,
  movingConnector: LibraryConnector,
  options: { centerFixedConnector?: boolean } = {},
): InstanceTransform {
  const fixedObject = transformObject(fixed);
  const movingObject = transformObject(moving);
  const target = connectorWorldFrame(
    fixedObject,
    mateConnector(fixedConnector, options.centerFixedConnector),
  );
  snapObjectToMate(movingObject, mateConnector(movingConnector), target);
  return readTransform(movingObject);
}

export function applyTwoHoleLibraryMate(
  fixed: InstanceTransform,
  moving: InstanceTransform,
  fixedFirst: LibraryConnector,
  fixedSecond: LibraryConnector,
  movingFirst: LibraryConnector,
  movingSecond: LibraryConnector,
): InstanceTransform {
  const fixedObject = transformObject(fixed);
  const movingObject = transformObject(moving);
  snapObjectByTwoMates(
    movingObject,
    mateConnector(movingFirst),
    mateConnector(movingSecond),
    connectorWorldFrame(fixedObject, mateConnector(fixedFirst)),
    connectorWorldFrame(fixedObject, mateConnector(fixedSecond)),
  );
  return readTransform(movingObject);
}
