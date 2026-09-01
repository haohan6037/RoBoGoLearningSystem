import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_ID = 'ai-heavy-dual-beam-lift-2x30-001';
const TARGET_ID = 'ai-heavy-dual-beam-lift-2x30-central-gears-001';
const TARGET_NAME = '2x30 Dual Lift · 3P Frame · Direct Motor Pins · Corrected Directions';
const STORAGE_ROOT = path.resolve('data/studio-storage');
const PROJECTS_DIR = path.join(STORAGE_ROOT, 'projects');
const SUMMARIES_DIR = path.join(STORAGE_ROOT, 'project-summaries');
const BACKUPS_DIR = path.join(STORAGE_ROOT, 'backups');
const CATALOG_PATH = path.resolve('public/part-library/catalog.json');
const SOURCE_PATH = path.join(PROJECTS_DIR, `${SOURCE_ID}.json`);
const TARGET_PATH = path.join(PROJECTS_DIR, `${TARGET_ID}.json`);
const SUMMARY_PATH = path.join(SUMMARIES_DIR, `${TARGET_ID}.json`);
const BACKUP_PATH = path.join(BACKUPS_DIR, `${SOURCE_ID}.before-central-gear-v2.json`);
const force = process.argv.includes('--force');

const PITCH = 12.7;
const OUTPUT_Y = -0.5 * PITCH;
const FRONT_DRIVER_Y = 2 * PITCH;
const REAR_DRIVER_Y = 4 * PITCH;
const GEAR_PLANE = 0.25 * PITCH;
const ARM_PLANE = 0.75 * PITCH;
const OUTER_BEAM_PLANE = 1.25 * PITCH;
const INNER_SPACER_PLANES = [0.625 * PITCH, 0.875 * PITCH];
const MOTOR_PLANE = 49.748 - 0.43 * PITCH;
const MOTOR_HOLE_PLANE = MOTOR_PLANE - 22.405;
const MOTOR_PIN_PLANE = (OUTER_BEAM_PLANE + MOTOR_HOLE_PLANE) / 2;
const OUTPUT_COLLAR_PLANE = 1.75 * PITCH;
const COLLAR_QUATERNION = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];
const NOW = new Date().toISOString();

const source = JSON.parse(await readFile(SOURCE_PATH, 'utf8'));
const catalog = JSON.parse(await readFile(CATALOG_PATH, 'utf8'));
const parts = new Map(catalog.parts.map((part) => [part.partNumber, part]));

function requiredPart(partNumber) {
  const part = parts.get(partNumber);
  if (!part) throw new Error(`Missing catalog part ${partNumber}`);
  return part;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function instance(instanceId) {
  const found = project.assemblyData.instances.find((candidate) => candidate.instanceId === instanceId);
  if (!found) throw new Error(`Missing instance ${instanceId}`);
  return found;
}

function addInstance({ instanceId, partNumber, color, position, quaternion = [0, 0, 0, 1] }) {
  if (project.assemblyData.instances.some((candidate) => candidate.instanceId === instanceId)) {
    throw new Error(`Duplicate instance ${instanceId}`);
  }
  project.assemblyData.instances.push({
    instanceId,
    part: requiredPart(partNumber),
    color,
    position,
    quaternion,
  });
}

function addMate({ id, type, fixedInstanceId, movingInstanceId, fixedConnectorIds, movingConnectorIds }) {
  project.assemblyData.mateRecords.push({
    id,
    type,
    fixedInstanceId,
    movingInstanceId,
    fixedConnectorIds,
    movingConnectorIds,
    createdAt: NOW,
  });
}

function addShaftMate(id, shaftId, hardwareId, connectorId = 'manual-hole-1-a') {
  addMate({
    id,
    type: 'shaft',
    fixedInstanceId: shaftId,
    movingInstanceId: hardwareId,
    fixedConnectorIds: ['shaft-end-1'],
    movingConnectorIds: [connectorId],
  });
}

const project = clone(source);
project.id = TARGET_ID;
project.name = TARGET_NAME;
project.createdAt = NOW;
project.updatedAt = NOW;
project.status = 'In Progress';
project.tags = [
  'ai-assisted',
  'central-gears',
  '2x30-dual-lift',
  'dual-motor-diagonal',
  '24t-24t-36t',
  'four-opposed-motors',
  'compact-3p-frame',
  '4p-dual-motor-shafts',
  'direct-motor-pins',
  'motor-direction-lf-plus-rf-minus',
  'motor-direction-lr-minus-rr-plus',
  'direct-gear-to-arm',
  '150-degree-reverse-sweep',
  '271-cross-connectors',
];
project.data.projectName = TARGET_NAME;

const removedIds = new Set([
  'b1807037-40fd-4b4d-9754-ba1e4d384d86',
  'left-gearbox-outer-2x12',
  'right-gearbox-outer-2x12',
  'left-arm-torque-36t',
  'right-arm-torque-36t',
  'left-36t-washer-inner-1',
  'left-36t-washer-outer-1',
  'right-36t-washer-inner-1',
  'right-36t-washer-outer-1',
  'left-arm-friction-washer',
  'right-arm-friction-washer',
  'left-front-gear-washer-inner',
  'left-front-gear-washer-outer',
  'left-rear-gear-washer-inner',
  'left-rear-gear-washer-outer',
  'right-front-gear-washer-inner',
  'right-front-gear-washer-outer',
  'right-rear-gear-washer-inner',
  'right-rear-gear-washer-outer',
  'left-front-mount-0p5-a',
  'left-front-mount-0p5-b',
  'left-rear-mount-0p5-a',
  'left-rear-mount-0p5-b',
  'right-front-mount-0p5-a',
  'right-front-mount-0p5-b',
  'right-rear-mount-0p5-a',
  'right-rear-mount-0p5-b',
  'cross-277-pre-seam',
  'cross-277-post-seam',
  'left-lower-last-row-0p5-standoff',
  'right-lower-last-row-0p5-standoff',
  'left-upper-0p5-standoff-row1',
  'left-upper-0p5-standoff-row2',
  'right-upper-0p5-standoff-row1',
  'e80175ba-b423-4fca-b598-44f67ad0e62c',
]);

project.assemblyData.instances = project.assemblyData.instances.filter(
  (candidate) => !removedIds.has(candidate.instanceId),
);

const liftedSourceGroup = project.assemblyData.groups.find((group) => group.id === 'heavy-dual-beam-frame');
const stationaryOutputIds = new Set([
  'left-reduction-48t',
  'right-reduction-48t',
  'left-torque-pin-rear',
  'left-torque-pin-front',
  'right-torque-pin-rear',
  'right-torque-pin-front',
  'output-shaft-8p',
]);
for (const id of liftedSourceGroup.instanceIds) {
  if (removedIds.has(id) || stationaryOutputIds.has(id)) continue;
  instance(id).position[0] += 2 * PITCH;
  instance(id).position[1] -= 2.5 * PITCH;
  if (instance(id).position[2] < 0) instance(id).position[2] += 15.875 - ARM_PLANE;
  if (instance(id).position[2] > 0) instance(id).position[2] += ARM_PLANE - 15.875;
}

for (const [id, z] of [
  ['left-gearbox-inner-2x12', -OUTER_BEAM_PLANE],
  ['right-gearbox-inner-2x12', OUTER_BEAM_PLANE],
]) {
  instance(id).position[2] = z;
}

for (const shaftId of ['front-common-drive-shaft-8p', 'rear-common-drive-shaft-8p']) {
  instance(shaftId).part = requiredPart('228-2500-120');
}
instance('output-shaft-8p').part = requiredPart('228-2500-121');
instance('front-common-drive-shaft-8p').position[1] = FRONT_DRIVER_Y;
instance('rear-common-drive-shaft-8p').position[1] = REAR_DRIVER_Y;
instance('output-shaft-8p').position[1] = OUTPUT_Y;

for (const [id, z] of [
  ['left-left-driver-24t', -GEAR_PLANE],
  ['left-right-driver-24t', -GEAR_PLANE],
  ['left-reduction-48t', -GEAR_PLANE],
  ['right-left-driver-24t', GEAR_PLANE],
  ['right-right-driver-24t', GEAR_PLANE],
  ['right-reduction-48t', GEAR_PLANE],
]) {
  instance(id).position[2] = z;
}

for (const gearId of ['left-reduction-48t', 'right-reduction-48t']) {
  const gear = instance(gearId);
  gear.part = requiredPart('228-2500-214');
  gear.position[1] = OUTPUT_Y;
  const halfPhase = (5 * Math.PI / 180) / 2;
  gear.quaternion = [0, 0, Math.sin(halfPhase), Math.cos(halfPhase)];
}

for (const gearId of ['left-left-driver-24t', 'right-left-driver-24t']) {
  instance(gearId).position[1] = FRONT_DRIVER_Y;
}
for (const gearId of ['left-right-driver-24t', 'right-right-driver-24t']) {
  instance(gearId).position[1] = REAR_DRIVER_Y;
}

for (const [id, z] of [
  ['left-torque-pin-rear', -0.5 * PITCH],
  ['left-torque-pin-front', -0.5 * PITCH],
  ['right-torque-pin-rear', 0.5 * PITCH],
  ['right-torque-pin-front', 0.5 * PITCH],
]) {
  instance(id).position[2] = z;
  instance(id).position[1] = OUTPUT_Y;
}

for (const candidate of project.assemblyData.instances) {
  if (/^(left|right)-front-(motor|mount-0p5-[ab])$/.test(candidate.instanceId)) {
    candidate.position[1] += 3 * PITCH;
  }
  if (/^(left|right)-rear-(motor|mount-0p5-[ab])$/.test(candidate.instanceId)) {
    candidate.position[1] += 7 * PITCH;
  }
}

for (const motorId of ['left-front-motor', 'left-rear-motor']) {
  instance(motorId).position[2] = -MOTOR_PLANE;
}
for (const motorId of ['right-front-motor', 'right-rear-motor']) {
  instance(motorId).position[2] = MOTOR_PLANE;
}
instance('left-rear-motor').position[0] = instance('left-front-motor').position[0];
instance('left-rear-motor').quaternion = [...instance('left-front-motor').quaternion];
instance('right-rear-motor').position[0] = instance('right-front-motor').position[0];
instance('right-rear-motor').quaternion = [...instance('right-front-motor').quaternion];
const motorPins = [
  ['left-front-pin-a', -101.6, 31.75, -1],
  ['left-front-pin-b', -88.9, 31.75, -1],
  ['right-front-pin-a', -101.6, 31.75, 1],
  ['right-front-pin-b', -88.9, 31.75, 1],
  ['left-rear-pin-a', -101.6, 57.15, -1],
  ['left-rear-pin-b', -88.9, 57.15, -1],
  ['right-rear-pin-a', -101.6, 57.15, 1],
  ['right-rear-pin-b', -88.9, 57.15, 1],
];
for (const [id, x, y, side] of motorPins) {
  addInstance({
    instanceId: id,
    partNumber: '228-2500-060',
    color: '#f97316',
    position: [x, y, side * MOTOR_PIN_PLANE],
  });
}

const frameStandoffs = [
  ['lower-frame-standoff-row1-4p', -88.9, 69.85],
  ['lower-frame-standoff-row2-4p', -101.6, 69.85],
];
for (const [id, x, y] of frameStandoffs) {
  addInstance({
    instanceId: id,
    partNumber: '228-2500-067',
    color: '#111827',
    position: [x, y, 0],
  });
}

for (const connectorId of ['cross-277-root', 'cross-277-rear-mid', 'cross-277-front-mid', 'cross-277-front']) {
  instance(connectorId).part = requiredPart('228-2500-271');
}
instance('cross-277-root').position[0] = -57.15;

const gearHardware = [
  ['left-left-driver-24t', 'front-common-drive-shaft-8p', -1],
  ['left-right-driver-24t', 'rear-common-drive-shaft-8p', -1],
  ['left-reduction-48t', 'output-shaft-8p', -1],
  ['right-left-driver-24t', 'front-common-drive-shaft-8p', 1],
  ['right-right-driver-24t', 'rear-common-drive-shaft-8p', 1],
  ['right-reduction-48t', 'output-shaft-8p', 1],
];
for (const [gearId, shaftId, side] of gearHardware.filter(([gearId]) => !gearId.includes('reduction'))) {
  const gear = instance(gearId);
  for (let index = 0; index < INNER_SPACER_PLANES.length; index += 1) {
    const spacerId = `${gearId}-arm-side-spacer-${index + 1}`;
    addInstance({
      instanceId: spacerId,
      partNumber: '228-2500-114',
      color: '#9ca3af',
      position: [gear.position[0], gear.position[1], side * INNER_SPACER_PLANES[index]],
    });
    addShaftMate(`mate-${spacerId}`, shaftId, spacerId);
  }
}

for (const side of [-1, 1]) {
  const prefix = side < 0 ? 'left' : 'right';
  const collarId = `${prefix}-output-shaft-collar`;
  addInstance({
    instanceId: collarId,
    partNumber: '228-2500-143',
    color: '#111827',
    position: [-95.25, OUTPUT_Y, side * OUTPUT_COLLAR_PLANE],
    quaternion: COLLAR_QUATERNION,
  });
  addShaftMate(`mate-${collarId}`, 'output-shaft-8p', collarId);
}

const standoffIds = new Set([
  ...frameStandoffs.map(([id]) => id),
  'left-upper-0p5-standoff-row1',
  'left-upper-0p5-standoff-row2',
  'right-upper-0p5-standoff-row1',
  'e80175ba-b423-4fca-b598-44f67ad0e62c',
]);
const shaftIds = new Set(['front-common-drive-shaft-8p', 'rear-common-drive-shaft-8p', 'output-shaft-8p']);
const supportBeamIds = new Set([
  'left-gearbox-inner-2x12',
  'right-gearbox-inner-2x12',
  'left-gearbox-outer-2x12',
  'right-gearbox-outer-2x12',
]);

project.assemblyData.mateRecords = project.assemblyData.mateRecords
  .filter((mate) => !removedIds.has(mate.fixedInstanceId) && !removedIds.has(mate.movingInstanceId))
  .filter((mate) => !standoffIds.has(mate.fixedInstanceId) && !standoffIds.has(mate.movingInstanceId))
  .filter((mate) => !(supportBeamIds.has(mate.fixedInstanceId) && shaftIds.has(mate.movingInstanceId)))
  .filter((mate) => !(supportBeamIds.has(mate.movingInstanceId) && shaftIds.has(mate.fixedInstanceId)))
  .map((mate) => {
    if (mate.fixedInstanceId === 'left-gearbox-outer-2x12') mate.fixedInstanceId = 'left-gearbox-inner-2x12';
    if (mate.fixedInstanceId === 'right-gearbox-outer-2x12') mate.fixedInstanceId = 'right-gearbox-inner-2x12';
    if (mate.movingInstanceId === 'left-gearbox-outer-2x12') mate.movingInstanceId = 'left-gearbox-inner-2x12';
    if (mate.movingInstanceId === 'right-gearbox-outer-2x12') mate.movingInstanceId = 'right-gearbox-inner-2x12';
    return mate;
  });

for (const [mateId, connectorIds] of [
  ['mate-cross-277-root-left', ['hole-1-5-top', 'hole-2-5-top']],
  ['mate-cross-277-root-right', ['hole-1-5-bottom', 'hole-2-5-bottom']],
]) {
  const mate = project.assemblyData.mateRecords.find((candidate) => candidate.id === mateId);
  if (!mate) throw new Error(`Missing rear closure mate ${mateId}`);
  mate.fixedConnectorIds = connectorIds;
}

const frameConnections = [
  {
    id: 'lower-frame-standoff-row1-4p',
    leftHole: 'hole-1-12-top',
    rightHole: 'hole-1-12-bottom',
  },
  {
    id: 'lower-frame-standoff-row2-4p',
    leftHole: 'hole-2-12-top',
    rightHole: 'hole-2-12-bottom',
  },
];
for (const connection of frameConnections) {
  addMate({
    id: `mate-${connection.id}-left`,
    type: 'pin',
    fixedInstanceId: 'left-gearbox-inner-2x12',
    movingInstanceId: connection.id,
    fixedConnectorIds: [connection.leftHole],
    movingConnectorIds: ['built-in-leg-1'],
  });
  addMate({
    id: `mate-${connection.id}-right`,
    type: 'pin',
    fixedInstanceId: 'right-gearbox-inner-2x12',
    movingInstanceId: connection.id,
    fixedConnectorIds: [connection.rightHole],
    movingConnectorIds: ['built-in-leg-2'],
  });
}

for (const support of [
  ['mate-output-left-outer-support', 'left-gearbox-inner-2x12', 'hole-1-6-top', 'output-shaft-8p', 'shaft-end-1'],
  ['mate-output-right-outer-support', 'right-gearbox-inner-2x12', 'hole-1-6-bottom', 'output-shaft-8p', 'shaft-end-2'],
  ['mate-front-left-outer-support', 'left-gearbox-inner-2x12', 'manual-hole-4-a', 'front-common-drive-shaft-8p', 'shaft-end-1'],
  ['mate-front-right-outer-support', 'right-gearbox-inner-2x12', 'manual-hole-4-b', 'front-common-drive-shaft-8p', 'shaft-end-2'],
  ['mate-rear-left-outer-support', 'left-gearbox-inner-2x12', 'manual-hole-1-a', 'rear-common-drive-shaft-8p', 'shaft-end-1'],
  ['mate-rear-right-outer-support', 'right-gearbox-inner-2x12', 'manual-hole-1-b', 'rear-common-drive-shaft-8p', 'shaft-end-2'],
]) {
  addMate({
    id: support[0],
    type: 'shaft',
    fixedInstanceId: support[1],
    movingInstanceId: support[3],
    fixedConnectorIds: [support[2]],
    movingConnectorIds: [support[4]],
  });
}

for (const [fixedId, movingId] of [
  ['left-left-driver-24t', 'left-reduction-48t'],
  ['left-right-driver-24t', 'left-left-driver-24t'],
  ['right-left-driver-24t', 'right-reduction-48t'],
  ['right-right-driver-24t', 'right-left-driver-24t'],
]) {
  addMate({
    id: `mate-${fixedId}-${movingId}-mesh`,
    type: 'gear-mesh',
    fixedInstanceId: fixedId,
    movingInstanceId: movingId,
    fixedConnectorIds: ['pitch-circle'],
    movingConnectorIds: ['pitch-circle'],
  });
}

addMate({
  id: 'mate-left-arm-output-axis',
  type: 'shaft',
  fixedInstanceId: 'left-arm-2x20',
  movingInstanceId: 'output-shaft-8p',
  fixedConnectorIds: ['hole-2-2-top'],
  movingConnectorIds: ['shaft-end-1'],
});
addMate({
  id: 'mate-right-arm-output-axis',
  type: 'shaft',
  fixedInstanceId: 'right-arm-2x20',
  movingInstanceId: 'output-shaft-8p',
  fixedConnectorIds: ['hole-2-2-bottom'],
  movingConnectorIds: ['shaft-end-2'],
});

for (const side of ['left', 'right']) {
  const gearId = `${side}-reduction-48t`;
  const gearSide = side === 'left' ? 'a' : 'b';
  for (const [position, connectorNumber] of [['rear', 1], ['front', 5]]) {
    addMate({
      id: `mate-${side}-torque-pin-${position}-direct-36t`,
      type: 'pin',
      fixedInstanceId: gearId,
      movingInstanceId: `${side}-torque-pin-${position}`,
      fixedConnectorIds: [`manual-hole-${connectorNumber}-${gearSide}`],
      movingConnectorIds: ['pin-ring-2'],
    });
  }
}

for (const [mateId, connectorId] of [
  ['mate-left-torque-pin-rear-arm', 'hole-2-1-top'],
  ['mate-left-torque-pin-front-arm', 'hole-2-3-top'],
  ['mate-right-torque-pin-rear-arm', 'hole-2-1-bottom'],
  ['mate-right-torque-pin-front-arm', 'hole-2-3-bottom'],
]) {
  const mate = project.assemblyData.mateRecords.find((candidate) => candidate.id === mateId);
  if (!mate) throw new Error(`Missing arm torque mate ${mateId}`);
  mate.fixedConnectorIds = [connectorId];
}

for (const [pinId, beamId, beamHole, beamRing, motorId, motorHole, motorRing] of [
  ['left-front-pin-a', 'left-gearbox-inner-2x12', 'hole-1-9-bottom', 'pin-ring-2', 'left-front-motor', 'manual-hole-2-a', 'pin-ring-1'],
  ['left-front-pin-b', 'left-gearbox-inner-2x12', 'hole-2-9-bottom', 'pin-ring-2', 'left-front-motor', 'manual-hole-3-a', 'pin-ring-1'],
  ['right-front-pin-a', 'right-gearbox-inner-2x12', 'hole-1-9-top', 'pin-ring-1', 'right-front-motor', 'manual-hole-1-a', 'pin-ring-2'],
  ['right-front-pin-b', 'right-gearbox-inner-2x12', 'hole-2-9-top', 'pin-ring-1', 'right-front-motor', 'manual-hole-4-a', 'pin-ring-2'],
  ['left-rear-pin-a', 'left-gearbox-inner-2x12', 'hole-1-11-bottom', 'pin-ring-2', 'left-rear-motor', 'manual-hole-2-a', 'pin-ring-1'],
  ['left-rear-pin-b', 'left-gearbox-inner-2x12', 'hole-2-11-bottom', 'pin-ring-2', 'left-rear-motor', 'manual-hole-3-a', 'pin-ring-1'],
  ['right-rear-pin-a', 'right-gearbox-inner-2x12', 'hole-1-11-top', 'pin-ring-1', 'right-rear-motor', 'manual-hole-1-a', 'pin-ring-2'],
  ['right-rear-pin-b', 'right-gearbox-inner-2x12', 'hole-2-11-top', 'pin-ring-1', 'right-rear-motor', 'manual-hole-4-a', 'pin-ring-2'],
]) {
  addMate({
    id: `mate-${pinId}-beam`,
    type: 'pin',
    fixedInstanceId: beamId,
    movingInstanceId: pinId,
    fixedConnectorIds: [beamHole],
    movingConnectorIds: [beamRing],
  });
  addMate({
    id: `mate-${pinId}-motor`,
    type: 'pin',
    fixedInstanceId: pinId,
    movingInstanceId: motorId,
    fixedConnectorIds: [motorRing],
    movingConnectorIds: [motorHole],
  });
}

const groupById = new Map(project.assemblyData.groups.map((group) => [group.id, group]));
for (const group of project.assemblyData.groups) {
  group.instanceIds = group.instanceIds.filter((id) => !removedIds.has(id));
}

const fixedGroup = groupById.get('redesign-fixed-base');
fixedGroup.name = 'Fixed Base · Compact 3P Outside Width · Correct 2P Cross-Standoffs';
fixedGroup.instanceIds.push(...frameStandoffs.map(([id]) => id));

const liftedGroup = groupById.get('heavy-dual-beam-frame');
liftedGroup.name = 'Lifted Carrier · 2x30 Arms · Four 271 Cross-Connectors · Root and Tip Closed';
liftedGroup.instanceIds.push(
  ...project.assemblyData.instances
    .filter((candidate) => /^(left|right)-output-(outer-washer|shaft-collar)/.test(candidate.instanceId))
    .map((candidate) => candidate.instanceId),
);

for (const [groupId, shaftName] of [
  ['driver-common-front', 'front-common-drive-shaft-8p'],
  ['driver-common-rear', 'rear-common-drive-shaft-8p'],
]) {
  const group = groupById.get(groupId);
  group.name = groupId === 'driver-common-front'
    ? 'Common Drive · Front 4P Shaft · LF + / RF −'
    : 'Common Drive · Rear 4P Shaft · LR − / RR +';
  group.instanceIds.push(
    ...motorPins
      .filter(([id]) => id.includes(groupId.endsWith('front') ? '-front-' : '-rear-'))
      .map(([id]) => id),
  );
  group.instanceIds.push(
    ...project.assemblyData.instances
      .filter((candidate) => (
        candidate.instanceId.includes(groupId.endsWith('front') ? 'left-driver-24t' : 'right-driver-24t')
        || false
      ))
      .map((candidate) => candidate.instanceId),
  );
  const relevantGearIds = groupId.endsWith('front')
    ? ['left-left-driver-24t', 'right-left-driver-24t']
    : ['left-right-driver-24t', 'right-right-driver-24t'];
  group.instanceIds.push(
    ...project.assemblyData.instances
      .filter((candidate) => relevantGearIds.some((gearId) => candidate.instanceId.startsWith(`${gearId}-`)))
      .map((candidate) => candidate.instanceId),
  );
  if (!group.instanceIds.includes(shaftName)) group.instanceIds.push(shaftName);
}

for (const group of project.assemblyData.groups) {
  group.instanceIds = [...new Set(group.instanceIds)];
}

const instanceIds = new Set(project.assemblyData.instances.map((candidate) => candidate.instanceId));
if (instanceIds.size !== project.assemblyData.instances.length) throw new Error('Duplicate instance IDs in output.');
for (const mate of project.assemblyData.mateRecords) {
  if (!instanceIds.has(mate.fixedInstanceId) || !instanceIds.has(mate.movingInstanceId)) {
    throw new Error(`Dangling mate ${mate.id}`);
  }
}
for (const group of project.assemblyData.groups) {
  for (const id of group.instanceIds) {
    if (!instanceIds.has(id)) throw new Error(`Dangling group member ${group.id}: ${id}`);
  }
}

const grouped = new Set(project.assemblyData.groups.flatMap((group) => group.instanceIds));
const ungrouped = [...instanceIds].filter((id) => !grouped.has(id));
if (ungrouped.length) throw new Error(`Ungrouped instances: ${ungrouped.join(', ')}`);

if (!force) {
  try {
    await readFile(TARGET_PATH, 'utf8');
    throw new Error(`Target already exists: ${TARGET_PATH}. Re-run with --force after review.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

await mkdir(BACKUPS_DIR, { recursive: true });
await mkdir(SUMMARIES_DIR, { recursive: true });
try {
  await readFile(BACKUP_PATH, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await copyFile(SOURCE_PATH, BACKUP_PATH);
}

async function atomicJson(destination, value) {
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, JSON.stringify(value), 'utf8');
  await rename(temporary, destination);
}

const summary = {
  ...project,
  data: {
    ...project.data,
    modelObjectTree: [],
    disassemblySteps: [],
    assemblySteps: [],
    partsList: [],
  },
  assemblyData: null,
  modelAsset: null,
  coverAsset: null,
};

await atomicJson(TARGET_PATH, project);
await atomicJson(SUMMARY_PATH, summary);

console.log(JSON.stringify({
  id: project.id,
  name: project.name,
  instances: project.assemblyData.instances.length,
  mates: project.assemblyData.mateRecords.length,
  groups: project.assemblyData.groups.length,
  armPlanesP: [-0.75, 0.75],
  gearPlanesP: [-0.25, 0.25],
  outerBeamPlanesP: [-1.25, 1.25],
  fixedFrameOutsideWidthP: 3,
  structuralWidth: '3P outside / 2.5P beam-center spacing',
  frameCrossStandoffs: '2x Pitch Standoff (228-2500-067)',
  motorAttachment: '2 x 1x1 Connector Pin per motor (228-2500-060)',
  motorDirections: {
    leftFront: 1,
    rightFront: -1,
    leftRear: -1,
    rightRear: 1,
  },
  frontDriveShaft: '4x Pitch Shaft (228-2500-120)',
  rearDriveShaft: '4x Pitch Shaft (228-2500-120)',
  outputShaft: '5x Pitch Shaft (228-2500-121)',
  backup: BACKUP_PATH,
}, null, 2));
