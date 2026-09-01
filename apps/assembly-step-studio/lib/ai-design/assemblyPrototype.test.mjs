import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGearDrivenClawPrototype,
  buildRectangularChassisPrototype,
  validateGearDrivenClawPrototype,
} from './assemblyPrototype.ts';

const part = (id, name) => ({
  id,
  name,
  partNumber: id,
  category: 'Beams',
  sourceFile: `${name}.step`,
  thumbnailUrl: null,
});

test('a rectangular chassis prototype uses real catalog beams in one editable rigid group', () => {
  const prototype = buildRectangularChassisPrototype({
    parts: [
      part('228-2500-010', '1x11 Beam'),
      part('228-2500-004', '1x5 Beam'),
      part('228-2500-126', 'Large Chassis Corner Connector'),
    ],
  });

  assert.equal(prototype.instances.length, 8);
  assert.deepEqual(
    prototype.instances.map((instance) => instance.part.id),
    [
      '228-2500-010',
      '228-2500-010',
      '228-2500-004',
      '228-2500-004',
      '228-2500-126',
      '228-2500-126',
      '228-2500-126',
      '228-2500-126',
    ],
  );
  assert.deepEqual(
    prototype.instances.slice(0, 4).map((instance) => instance.position),
    [
      [0, 0, -34.925],
      [0, 0, 34.925],
      [-73.025, 0, 0],
      [73.025, 0, 0],
    ],
  );
  assert.deepEqual(prototype.groups.map((group) => group.instanceIds), [[
    'chassis-left',
    'chassis-right',
    'chassis-front',
    'chassis-rear',
    'connector-front-left',
    'connector-front-right',
    'connector-rear-left',
    'connector-rear-right',
  ]]);
  assert.equal(prototype.mateRecords.length, 8);
  const usedConnectionPoints = prototype.mateRecords.flatMap((mate) => [
    `${mate.fixedInstanceId}:${mate.fixedConnectorIds[0]}`,
    `${mate.movingInstanceId}:${mate.movingConnectorIds[0]}`,
  ]);
  assert.equal(new Set(usedConnectionPoints).size, usedConnectionPoints.length);
});

test('prototype generation rejects a part that is not present in the catalog', () => {
  assert.throws(
    () => buildRectangularChassisPrototype({ parts: [] }),
    (error) => error?.code === 'PART_NOT_FOUND'
      && error?.partId === '228-2500-010',
  );
});

test('a gear-driven claw uses real catalog parts and stays independently editable', () => {
  const prototype = buildGearDrivenClawPrototype({
    parts: [
      part('228-2500-023', '2x8 Beam'),
      part('228-2500-246', '1x4 Crank Arm with 23 Tooth Gear'),
      part('228-2500-400', '2x1 Left Corner Beam'),
      part('228-2500-401', '2x1 Right Corner Beam'),
      part('228-2500-120', '4x Pitch Shaft'),
    ],
  });

  assert.deepEqual(
    prototype.instances.map((instance) => instance.part.id),
    [
      '228-2500-023',
      '228-2500-023',
      '228-2500-246',
      '228-2500-246',
      '228-2500-400',
      '228-2500-401',
      '228-2500-120',
      '228-2500-120',
    ],
  );
  assert.equal(prototype.instances.length, 8);
  assert.deepEqual(prototype.groups, []);

  const validation = validateGearDrivenClawPrototype(prototype);
  assert.equal(validation.valid, true, validation.issues.join('\n'));
  assert.equal(validation.measurements.gearCenterDistance, 25.4);
  assert.equal(validation.measurements.shaftAlignmentError, 0);
  assert.equal(validation.measurements.jawMirrorError, 0);
  assert.equal(validation.measurements.jawCrankOverlapDepth, 0);

  const gearSquareHoleCenter = (instance) => {
    const angle = 2 * Math.atan2(instance.quaternion[2], instance.quaternion[3]);
    const [localX, localY] = [0.048, -15.272];
    return [
      instance.position[0] + localX * Math.cos(angle) - localY * Math.sin(angle),
      instance.position[1] + localX * Math.sin(angle) + localY * Math.cos(angle),
    ];
  };
  for (const [gearId, shaftId] of [
    ['claw-left-crank-gear', 'claw-drive-shaft'],
    ['claw-right-crank-gear', 'claw-follower-shaft'],
  ]) {
    const gear = prototype.instances.find((instance) => instance.instanceId === gearId);
    const shaft = prototype.instances.find((instance) => instance.instanceId === shaftId);
    const center = gearSquareHoleCenter(gear);
    assert.ok(Math.hypot(
      center[0] - shaft.position[0],
      center[1] - shaft.position[1],
    ) < 0.001);
  }
});
