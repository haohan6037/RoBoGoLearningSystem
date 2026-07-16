import * as THREE from "three";

export type MateConnector = {
  position: THREE.Vector3;
  normal: THREE.Vector3;
};

export function connectorWorldFrame(
  object: THREE.Object3D,
  connector: MateConnector,
): MateConnector {
  object.updateWorldMatrix(true, false);

  const worldPosition = connector.position.clone().applyMatrix4(object.matrixWorld);
  const worldQuaternion = new THREE.Quaternion();
  object.getWorldQuaternion(worldQuaternion);

  return {
    position: worldPosition,
    normal: connector.normal.clone().applyQuaternion(worldQuaternion).normalize(),
  };
}

export function snapObjectToMate(
  movingObject: THREE.Object3D,
  sourceConnector: MateConnector,
  targetConnector: MateConnector,
): void {
  const sourceWorld = connectorWorldFrame(movingObject, sourceConnector);
  const desiredSourceNormal = targetConnector.normal.clone().normalize().negate();
  const rotationDelta = new THREE.Quaternion().setFromUnitVectors(
    sourceWorld.normal,
    desiredSourceNormal,
  );

  movingObject.quaternion.premultiply(rotationDelta).normalize();
  movingObject.updateWorldMatrix(true, false);

  const alignedSourceWorld = connectorWorldFrame(movingObject, sourceConnector);
  movingObject.position.add(
    targetConnector.position.clone().sub(alignedSourceWorld.position),
  );
  movingObject.updateWorldMatrix(true, false);
}

function makeMateFrame(
  first: MateConnector,
  second: MateConnector,
  desiredNormal?: THREE.Vector3,
): THREE.Quaternion {
  const xAxis = second.position.clone().sub(first.position);
  if (xAxis.lengthSq() < 1e-8) throw new Error("Select two different holes.");
  xAxis.normalize();

  const zAxis = (desiredNormal ?? first.normal).clone().normalize();
  zAxis.addScaledVector(xAxis, -zAxis.dot(xAxis));
  if (zAxis.lengthSq() < 1e-8) throw new Error("The selected face is not valid for these holes.");
  zAxis.normalize();

  const yAxis = zAxis.clone().cross(xAxis).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis),
  );
}

export function snapObjectByTwoMates(
  movingObject: THREE.Object3D,
  sourceFirst: MateConnector,
  sourceSecond: MateConnector,
  targetFirst: MateConnector,
  targetSecond: MateConnector,
): void {
  const sourceDistance = sourceFirst.position.distanceTo(sourceSecond.position);
  const targetDistance = targetFirst.position.distanceTo(targetSecond.position);
  if (Math.abs(sourceDistance - targetDistance) > 0.1) {
    throw new Error("Choose two holes with matching spacing on both beams.");
  }

  const sourceFirstWorld = connectorWorldFrame(movingObject, sourceFirst);
  const sourceSecondWorld = connectorWorldFrame(movingObject, sourceSecond);
  const sourceFrame = makeMateFrame(sourceFirstWorld, sourceSecondWorld);
  const targetFrame = makeMateFrame(
    targetFirst,
    targetSecond,
    targetFirst.normal.clone().negate(),
  );
  const rotationDelta = targetFrame.multiply(sourceFrame.invert());

  movingObject.quaternion.premultiply(rotationDelta).normalize();
  movingObject.updateWorldMatrix(true, false);

  const alignedFirstWorld = connectorWorldFrame(movingObject, sourceFirst);
  movingObject.position.add(targetFirst.position.clone().sub(alignedFirstWorld.position));
  movingObject.updateWorldMatrix(true, false);
}

export function measureInsertionDepth(
  currentPosition: THREE.Vector3,
  alignedPosition: THREE.Vector3,
  insertionDirection: THREE.Vector3,
): number {
  return currentPosition
    .clone()
    .sub(alignedPosition)
    .dot(insertionDirection.clone().normalize());
}
