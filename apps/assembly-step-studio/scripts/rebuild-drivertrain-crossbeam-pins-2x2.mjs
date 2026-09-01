import fs from 'node:fs';
import * as THREE from 'three';

const ORIGIN = 'http://127.0.0.1:3000';
const PROJECT_ID = 'b19673f4-5873-47ac-b168-c5ba27eae869';
const EXPECTED_UPDATED_AT = '2026-08-29T12:43:03.586Z';
const PIN_PART_ID = '228-2500-086';
const PIN_RING_POSITION = new THREE.Vector3(0, 0, -5.399);
const PIN_RING_NORMAL = new THREE.Vector3(0, 0, 1);
const BEAM_FACE_Z = -2.286;

const CONNECTIONS = [
  {
    label: 'rear-low',
    beamId: '54114847-b612-4901-b512-25f23abd306e',
    connectorId: '193b70e8-b3ff-47ca-8310-e06ee9d8ec96',
    holes: [['manual-hole-2-b', 1, 2], ['manual-hole-3-b', 1, 3], ['manual-hole-6-b', 2, 2], ['manual-hole-7-b', 2, 3]],
  },
  {
    label: 'rear-high',
    beamId: '54114847-b612-4901-b512-25f23abd306e',
    connectorId: 'cf1adc3e-88df-420a-aab2-c440ed937cdc',
    holes: [['manual-hole-2-b', 2, 19], ['manual-hole-3-b', 2, 18], ['manual-hole-6-b', 1, 19], ['manual-hole-7-b', 1, 18]],
  },
  {
    label: 'front-low',
    beamId: 'drivertrain-front-cross-reinforcement',
    connectorId: '67378bb2-7922-4e23-8bcb-fcd187c586e0',
    holes: [['manual-hole-2-b', 2, 19], ['manual-hole-3-b', 2, 18], ['manual-hole-6-b', 1, 19], ['manual-hole-7-b', 1, 18]],
  },
  {
    label: 'front-high',
    beamId: 'drivertrain-front-cross-reinforcement',
    connectorId: '9661c6a7-7fef-4eb0-a104-860473c7e571',
    holes: [['manual-hole-2-b', 1, 2], ['manual-hole-3-b', 1, 3], ['manual-hole-6-b', 2, 2], ['manual-hole-7-b', 2, 3]],
  },
];

const connectorDefinitions = new Map(JSON.parse(
  fs.readFileSync('data/part-library-connectors/228-2500-277.json', 'utf8'),
).connectors.map((connector) => [connector.id, connector]));

function findInstance(record, instanceId) {
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

function worldFrame(partInstance, connector) {
  const object = objectFromInstance(partInstance);
  return {
    position: new THREE.Vector3(...connector.position).applyMatrix4(object.matrixWorld),
    normal: new THREE.Vector3(...connector.normal).applyQuaternion(object.quaternion).normalize(),
  };
}

function beamHole(row, column) {
  return {
    position: [-120.65 + (column - 1) * 12.7, row === 1 ? -6.35 : 6.35, BEAM_FACE_Z],
    normal: [0, 0, -1],
  };
}

function pinTransform(beam, row, column) {
  const target = worldFrame(beam, beamHole(row, column));
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    PIN_RING_NORMAL,
    target.normal.clone().negate(),
  );
  const position = target.position.clone().sub(PIN_RING_POSITION.clone().applyQuaternion(quaternion));
  return { position: position.toArray(), quaternion: quaternion.toArray() };
}

function assertCoaxial(beam, row, column, connectorInstance, connector) {
  const beamFrame = worldFrame(beam, beamHole(row, column));
  const connectorFrame = worldFrame(connectorInstance, {
    ...connector,
    position: connector.centerPosition,
  });
  const separation = beamFrame.position.clone().sub(connectorFrame.position);
  const transverse = separation.clone().addScaledVector(
    connectorFrame.normal,
    -separation.dot(connectorFrame.normal),
  ).length();
  if (transverse > 1e-5 || Math.abs(Math.abs(beamFrame.normal.dot(connectorFrame.normal)) - 1) > 1e-6) {
    throw new Error(`${connectorInstance.instanceId}/${connector.id} is not coaxial with beam hole ${row}-${column}.`);
  }
}

function assertPinSeated(pin, beam, row, column) {
  const target = worldFrame(beam, beamHole(row, column));
  const actual = worldFrame(pin, {
    position: PIN_RING_POSITION.toArray(),
    normal: PIN_RING_NORMAL.toArray(),
  });
  if (target.position.distanceTo(actual.position) > 1e-5 || target.normal.dot(actual.normal) > -0.999999) {
    throw new Error(`${pin.instanceId} is not seated on the outer face of ${beam.instanceId}/${row}-${column}.`);
  }
}

const response = await fetch(`${ORIGIN}/api/studio?projectId=${PROJECT_ID}`);
if (!response.ok) throw new Error(`Unable to load DriverTrain: HTTP ${response.status}.`);
const record = await response.json();
if (record.updatedAt !== EXPECTED_UPDATED_AT) {
  throw new Error(`DriverTrain changed since backup (${record.updatedAt}); no changes were written.`);
}

const oldPinMates = record.assemblyData.mateRecords.filter((mate) => (
  mate.type === 'pin'
  && /^drivertrain-(rear|front)-(?:low|high)-cross-pin-/.test(mate.movingInstanceId)
));
const oldPinIds = new Set(oldPinMates.map((mate) => mate.movingInstanceId));
if (oldPinIds.size !== 16) throw new Error(`Expected 16 existing cross pins, found ${oldPinIds.size}.`);
const pinTemplate = record.assemblyData.instances.find((candidate) => oldPinIds.has(candidate.instanceId));
if (!pinTemplate || pinTemplate.part.id !== PIN_PART_ID) throw new Error('0x2 Connector Pin template is missing.');

record.assemblyData.instances = record.assemblyData.instances.filter(
  (candidate) => !oldPinIds.has(candidate.instanceId),
);
record.assemblyData.mateRecords = record.assemblyData.mateRecords.filter(
  (mate) => !oldPinIds.has(mate.movingInstanceId),
);
record.assemblyData.groups.forEach((group) => {
  group.instanceIds = group.instanceIds.filter((instanceId) => !oldPinIds.has(instanceId));
});

const createdAt = new Date().toISOString();
const newPins = [];
const newMates = [];
for (const connection of CONNECTIONS) {
  const beam = findInstance(record, connection.beamId);
  const connectorInstance = findInstance(record, connection.connectorId);
  for (const [connectorId, row, column] of connection.holes) {
    const connector = connectorDefinitions.get(connectorId);
    if (!connector) throw new Error(`Missing connector definition ${connectorId}.`);
    assertCoaxial(beam, row, column, connectorInstance, connector);
    const transform = pinTransform(beam, row, column);
    const instanceId = `drivertrain-${connection.label}-cross-pin-r${row}-c${column}`;
    const pin = { ...structuredClone(pinTemplate), instanceId, ...transform };
    assertPinSeated(pin, beam, row, column);
    newPins.push(pin);
    newMates.push({
      id: `mate-${instanceId}`,
      type: 'pin',
      fixedInstanceId: beam.instanceId,
      movingInstanceId: instanceId,
      fixedConnectorIds: [`hole-${row}-${column}-bottom`],
      movingConnectorIds: ['pin-ring-1'],
      createdAt,
    });
  }
}

record.assemblyData.instances.push(...newPins);
record.assemblyData.mateRecords.push(...newMates);
const chassisGroup = record.assemblyData.groups.find((group) => (
  CONNECTIONS.every(({ beamId, connectorId }) => (
    group.instanceIds.includes(beamId) && group.instanceIds.includes(connectorId)
  ))
));
if (!chassisGroup) throw new Error('Connected chassis group is missing the crossbeam connections.');
chassisGroup.instanceIds = [...new Set([...chassisGroup.instanceIds, ...newPins.map((pin) => pin.instanceId)])].sort();

const allIds = record.assemblyData.instances.map((candidate) => candidate.instanceId);
if (new Set(allIds).size !== allIds.length) throw new Error('Duplicate instance IDs detected.');
if (record.assemblyData.instances.length !== 130 || record.assemblyData.mateRecords.length !== 228) {
  throw new Error('Unexpected instance or mate count after rebuilding the pin arrays.');
}

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
  removedInvalidPins: oldPinIds.size,
  addedThroughHolePins: newPins.length,
  connections: CONNECTIONS.map(({ label, holes }) => ({
    label,
    beamHoles: holes.map(([, row, column]) => `hole-${row}-${column}`),
  })),
  instances: record.assemblyData.instances.length,
  mates: record.assemblyData.mateRecords.length,
  groupMembers: chassisGroup.instanceIds.length,
}, null, 2));
