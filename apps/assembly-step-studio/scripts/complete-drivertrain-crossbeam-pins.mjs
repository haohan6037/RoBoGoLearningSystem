import * as THREE from 'three';

if (!process.argv.includes('--allow-obsolete-linear-layout')) {
  throw new Error(
    'This linear pin layout is obsolete. Use rebuild-drivertrain-crossbeam-pins-2x2.mjs.',
  );
}

const ORIGIN = 'http://127.0.0.1:3000';
const PROJECT_ID = 'b19673f4-5873-47ac-b168-c5ba27eae869';
const EXPECTED_UPDATED_AT = '2026-08-29T11:52:06.614Z';
const SOURCE_BEAM_ID = '54114847-b612-4901-b512-25f23abd306e';
const SOURCE_PIN_ID = '4823585a-a2f0-4486-9a4c-5e87dda7902c';
const MIRRORED_BEAM_ID = 'drivertrain-front-cross-reinforcement';
const HIGH_CORNER_ID = '9661c6a7-7fef-4eb0-a104-860473c7e571';
const LOW_CORNER_ID = '67378bb2-7922-4e23-8bcb-fcd187c586e0';
const HOLES = [1, 2, 3, 4, 16, 17, 18, 19];
const EXISTING_SOURCE_HOLES = new Set([1, 19]);
const PIN_SEAT = new THREE.Vector3(0, 0, -5.399);
const PIN_NORMAL = new THREE.Vector3(0, 0, 1);
const BEAM_FACE_OFFSET = -2.286;
const MIRROR_PLANE_X = 75.6201440556;

function instance(record, instanceId) {
  const match = record.assemblyData.instances.find((candidate) => candidate.instanceId === instanceId);
  if (!match) throw new Error(`Missing instance ${instanceId}.`);
  return match;
}

function objectFromInstance(partInstance) {
  const object = new THREE.Object3D();
  object.position.fromArray(partInstance.position);
  object.quaternion.fromArray(partInstance.quaternion);
  object.updateMatrixWorld(true);
  return object;
}

function beamHoleConnector(holeNumber, side = 'a') {
  return {
    position: new THREE.Vector3(
      -114.3 + (holeNumber - 1) * 12.7,
      0,
      side === 'a' ? BEAM_FACE_OFFSET : -BEAM_FACE_OFFSET,
    ),
    normal: new THREE.Vector3(0, 0, side === 'a' ? -1 : 1),
  };
}

function pinTransformForBeamHole(beam, holeNumber) {
  const beamObject = objectFromInstance(beam);
  const connector = beamHoleConnector(holeNumber);
  const targetPosition = connector.position.clone().applyMatrix4(beamObject.matrixWorld);
  const targetNormal = connector.normal.clone().applyQuaternion(beamObject.quaternion).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(PIN_NORMAL, targetNormal.clone().negate());
  const position = targetPosition.clone().sub(PIN_SEAT.clone().applyQuaternion(quaternion));
  return { position: position.toArray(), quaternion: quaternion.toArray() };
}

function connectorWorldFrame(partInstance, connector) {
  const object = objectFromInstance(partInstance);
  return {
    position: connector.position.clone().applyMatrix4(object.matrixWorld),
    normal: connector.normal.clone().applyQuaternion(object.quaternion).normalize(),
  };
}

function assertPinAligned(beam, pin, holeNumber) {
  const beamFrame = connectorWorldFrame(beam, beamHoleConnector(holeNumber));
  const pinFrame = connectorWorldFrame(pin, { position: PIN_SEAT, normal: PIN_NORMAL });
  const distance = beamFrame.position.distanceTo(pinFrame.position);
  const normalDot = beamFrame.normal.dot(pinFrame.normal);
  if (distance > 1e-5 || normalDot > -0.999999) {
    throw new Error(`Pin ${pin.instanceId} is misaligned at hole ${holeNumber}: ${distance} mm, dot ${normalDot}.`);
  }
}

function addPin(record, template, beam, prefix, holeNumber, createdAt) {
  const instanceId = `${prefix}-${holeNumber}`;
  if (record.assemblyData.instances.some((candidate) => candidate.instanceId === instanceId)) {
    throw new Error(`Refusing to overwrite existing instance ${instanceId}.`);
  }
  const transform = pinTransformForBeamHole(beam, holeNumber);
  const pin = {
    ...structuredClone(template),
    instanceId,
    position: transform.position,
    quaternion: transform.quaternion,
  };
  record.assemblyData.instances.push(pin);
  record.assemblyData.mateRecords.push({
    id: `mate-${instanceId}`,
    type: 'pin',
    fixedInstanceId: beam.instanceId,
    movingInstanceId: instanceId,
    fixedConnectorIds: [`manual-hole-${holeNumber}-a`],
    movingConnectorIds: ['pin-ring-1'],
    createdAt,
  });
  assertPinAligned(beam, pin, holeNumber);
  return pin;
}

function cornerHoleWorldPosition(corner) {
  return connectorWorldFrame(corner, {
    position: new THREE.Vector3(0, -5.448, 12.7),
    normal: new THREE.Vector3(0, -1, 0),
  }).position;
}

const response = await fetch(`${ORIGIN}/api/studio?projectId=${PROJECT_ID}`);
if (!response.ok) throw new Error(`Unable to load DriverTrain: HTTP ${response.status}.`);
const record = await response.json();
if (record.updatedAt !== EXPECTED_UPDATED_AT) {
  throw new Error(`DriverTrain changed since backup (${record.updatedAt}); no changes were written.`);
}

const sourceBeam = instance(record, SOURCE_BEAM_ID);
const pinTemplate = instance(record, SOURCE_PIN_ID);
const createdAt = new Date().toISOString();
const addedInstances = [];

for (const holeNumber of HOLES) {
  if (EXISTING_SOURCE_HOLES.has(holeNumber)) continue;
  addedInstances.push(addPin(
    record,
    pinTemplate,
    sourceBeam,
    'drivertrain-rear-cross-pin',
    holeNumber,
    createdAt,
  ));
}

const mirroredBeam = {
  ...structuredClone(sourceBeam),
  instanceId: MIRRORED_BEAM_ID,
  position: [
    2 * MIRROR_PLANE_X - sourceBeam.position[0],
    sourceBeam.position[1],
    sourceBeam.position[2],
  ],
  quaternion: [0, 0.7071067812, 0, 0.7071067812],
};
if (record.assemblyData.instances.some((candidate) => candidate.instanceId === MIRRORED_BEAM_ID)) {
  throw new Error(`Refusing to overwrite existing instance ${MIRRORED_BEAM_ID}.`);
}
record.assemblyData.instances.push(mirroredBeam);
addedInstances.push(mirroredBeam);

for (const holeNumber of HOLES) {
  addedInstances.push(addPin(
    record,
    pinTemplate,
    mirroredBeam,
    'drivertrain-front-cross-pin',
    holeNumber,
    createdAt,
  ));
}

const highCorner = instance(record, HIGH_CORNER_ID);
const lowCorner = instance(record, LOW_CORNER_ID);
const highBeamPosition = connectorWorldFrame(mirroredBeam, beamHoleConnector(1, 'b')).position;
const lowBeamPosition = connectorWorldFrame(mirroredBeam, beamHoleConnector(19, 'b')).position;
const highError = highBeamPosition.distanceTo(cornerHoleWorldPosition(highCorner));
const lowError = lowBeamPosition.distanceTo(cornerHoleWorldPosition(lowCorner));
if (highError > 1e-5 || lowError > 1e-5) {
  throw new Error(`Mirrored beam misses its corner holes: high ${highError} mm, low ${lowError} mm.`);
}

record.assemblyData.mateRecords.push(
  {
    id: 'mate-drivertrain-front-cross-high-corner',
    type: 'beam',
    fixedInstanceId: HIGH_CORNER_ID,
    movingInstanceId: MIRRORED_BEAM_ID,
    fixedConnectorIds: ['manual-hole-1-a'],
    movingConnectorIds: ['manual-hole-1-b'],
    createdAt,
  },
  {
    id: 'mate-drivertrain-front-cross-low-corner',
    type: 'beam',
    fixedInstanceId: MIRRORED_BEAM_ID,
    movingInstanceId: LOW_CORNER_ID,
    fixedConnectorIds: ['manual-hole-19-b'],
    movingConnectorIds: ['manual-hole-1-a'],
    createdAt,
  },
);

const chassisGroup = record.assemblyData.groups.find((group) => group.instanceIds.includes(SOURCE_BEAM_ID));
if (!chassisGroup) throw new Error('The connected DriverTrain chassis group is missing.');
chassisGroup.instanceIds = [...new Set([
  ...chassisGroup.instanceIds,
  ...addedInstances.map((candidate) => candidate.instanceId),
])].sort();

record.updatedAt = createdAt;
const saveResponse = await fetch(`${ORIGIN}/api/studio`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(record),
});
if (!saveResponse.ok) throw new Error(`Unable to save DriverTrain: HTTP ${saveResponse.status}.`);

console.log(JSON.stringify({
  saved: true,
  updatedAt: createdAt,
  addedInstances: addedInstances.length,
  addedPins: addedInstances.filter((candidate) => candidate.part.id === pinTemplate.part.id).length,
  addedBeams: addedInstances.filter((candidate) => candidate.part.id === sourceBeam.part.id).length,
  totalInstances: record.assemblyData.instances.length,
  totalMates: record.assemblyData.mateRecords.length,
  groupMembers: chassisGroup.instanceIds.length,
  mirroredBeamCornerErrorsMm: [highError, lowError],
}, null, 2));
