import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  applyRigidGroupTransform,
  duplicateAssemblyGroup,
  expandCustomGroupMemberIds,
  findNextPartSpawnPosition,
  removeSelectedMembersFromGroups,
  rotateInstanceAroundLocalAxis,
  resolveAutomaticMateDirection,
  mergeConnectedRigidGroups,
  measureAssemblyInstanceVolumes,
} from './assemblyGroups.ts';

test('copying a group creates an independent grouped assembly with preserved relative positions', () => {
  const ids = ['beam-copy', 'pin-copy', 'group-copy', 'mate-copy'];
  const result = duplicateAssemblyGroup({
    instances: [
      { instanceId: 'beam', position: [10, 20, 30], quaternion: [0, 0, 0, 1], part: { id: 'beam' }, color: 'blue' },
      { instanceId: 'pin', position: [20, 20, 30], quaternion: [0, 0, 0, 1], part: { id: 'pin' }, color: 'orange' },
      { instanceId: 'outside', position: [0, 0, 0], quaternion: [0, 0, 0, 1], part: { id: 'outside' }, color: 'green' },
    ],
    mateRecords: [{
      id: 'mate',
      type: 'pin',
      fixedInstanceId: 'beam',
      movingInstanceId: 'pin',
      fixedConnectorIds: ['h1'],
      movingConnectorIds: ['p1'],
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
    group: {
      id: 'group',
      name: 'Wheel module',
      instanceIds: ['beam', 'pin'],
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    anchorPosition: [100, 50, 30],
    createId: () => ids.shift(),
    createdAt: '2026-07-29T00:00:00.000Z',
  });

  assert.deepEqual(result.instances.map((item) => [item.instanceId, item.position]), [
    ['beam-copy', [100, 50, 30]],
    ['pin-copy', [110, 50, 30]],
  ]);
  assert.deepEqual(result.group, {
    id: 'group-copy',
    name: 'Wheel module Copy',
    instanceIds: ['beam-copy', 'pin-copy'],
    createdAt: '2026-07-29T00:00:00.000Z',
  });
  assert.deepEqual(result.mateRecords[0], {
    id: 'mate-copy',
    type: 'pin',
    fixedInstanceId: 'beam-copy',
    movingInstanceId: 'pin-copy',
    fixedConnectorIds: ['h1'],
    movingConnectorIds: ['p1'],
    createdAt: '2026-07-29T00:00:00.000Z',
  });
});

test('a new part spawns beside the current assembly instead of on a world-origin grid', () => {
  const root = new THREE.Group();
  const assembly = new THREE.Mesh(new THREE.BoxGeometry(100, 40, 20));
  assembly.position.set(500, 100, 20);
  root.add(assembly);

  assert.deepEqual(findNextPartSpawnPosition(root), [590, 100, 20]);
});

test('a single part always moves toward an existing rigid group', () => {
  const groups = [{ id: 'chassis', instanceIds: ['beam-a', 'beam-b'] }];

  assert.deepEqual(
    resolveAutomaticMateDirection('beam-a', 'pin', groups, {
      'beam-a': 10,
      'beam-b': 10,
      pin: 100,
    }),
    { fixedInstanceId: 'beam-a', movingInstanceId: 'pin' },
  );
  assert.deepEqual(
    resolveAutomaticMateDirection('pin', 'beam-b', groups, {
      'beam-a': 10,
      'beam-b': 10,
      pin: 100,
    }),
    { fixedInstanceId: 'beam-b', movingInstanceId: 'pin' },
  );
});

test('part size is measured from the actual 3D instance geometry', () => {
  const root = new THREE.Group();
  const small = new THREE.Group();
  small.userData.robogoInstanceId = 'small-part';
  small.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3)));
  const large = new THREE.Group();
  large.userData.robogoInstanceId = 'large-part';
  large.add(new THREE.Mesh(new THREE.BoxGeometry(4, 5, 6)));
  root.add(small, large);
  root.updateWorldMatrix(true, true);

  assert.deepEqual(measureAssemblyInstanceVolumes(root), {
    'small-part': 6,
    'large-part': 120,
  });
});

test('every successful connection leaves both complete sides in one rigid group', () => {
  const firstConnection = mergeConnectedRigidGroups([], 'beam', 'pin');
  assert.equal(firstConnection.length, 1);
  assert.deepEqual(firstConnection[0].instanceIds, ['beam', 'pin']);

  const withSingleAdded = mergeConnectedRigidGroups(firstConnection, 'beam', 'gear');
  assert.equal(withSingleAdded.length, 1);
  assert.deepEqual(withSingleAdded[0].instanceIds, ['beam', 'gear', 'pin']);

  const twoGroups = [
    withSingleAdded[0],
    { id: 'wheel-module', name: 'Group 2', instanceIds: ['shaft', 'wheel'], createdAt: '2026-01-01T00:00:00.000Z' },
  ];
  const merged = mergeConnectedRigidGroups(twoGroups, 'beam', 'wheel');
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].instanceIds, ['beam', 'gear', 'pin', 'shaft', 'wheel']);
});

test('the smaller side moves when connecting two single parts or two groups', () => {
  assert.deepEqual(
    resolveAutomaticMateDirection('pin', 'beam', [], { pin: 2, beam: 40 }),
    { fixedInstanceId: 'beam', movingInstanceId: 'pin' },
  );

  const groups = [
    { id: 'small-module', instanceIds: ['pin', 'gear'] },
    { id: 'large-module', instanceIds: ['beam-a', 'beam-b', 'motor'] },
  ];
  assert.deepEqual(
    resolveAutomaticMateDirection('gear', 'motor', groups, {
      pin: 2,
      gear: 8,
      'beam-a': 20,
      'beam-b': 20,
      motor: 30,
    }),
    { fixedInstanceId: 'motor', movingInstanceId: 'gear' },
  );
});

test('making a custom group merges whole existing groups with newly selected parts', () => {
  const groups = [
    { id: 'old-group', instanceIds: ['beam', 'pin'] },
    { id: 'unrelated-group', instanceIds: ['wheel', 'shaft'] },
  ];

  assert.deepEqual(
    expandCustomGroupMemberIds(['beam', 'gear'], groups),
    ['beam', 'gear', 'pin'],
  );
});

test('removing selected members preserves valid groups and dissolves groups smaller than two', () => {
  const groups = [{ id: 'group-1', name: 'Group 1', instanceIds: ['beam', 'pin', 'gear'] }];

  assert.deepEqual(
    removeSelectedMembersFromGroups(groups, ['pin']),
    [{ id: 'group-1', name: 'Group 1', instanceIds: ['beam', 'gear'] }],
  );
  assert.deepEqual(removeSelectedMembersFromGroups(groups, ['beam', 'pin']), []);
});

test('moving and rotating one group member preserves every relative position', () => {
  const instances = [
    { instanceId: 'beam', position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    { instanceId: 'gear', position: [10, 0, 0], quaternion: [0, 0, 0, 1] },
    { instanceId: 'outside', position: [50, 0, 0], quaternion: [0, 0, 0, 1] },
  ];
  const halfTurn = Math.sqrt(0.5);

  const transformed = applyRigidGroupTransform(
    instances,
    'beam',
    [5, 0, 0],
    [0, 0, halfTurn, halfTurn],
    ['beam', 'gear'],
  );

  assert.deepEqual(transformed.find((item) => item.instanceId === 'beam').position, [5, 0, 0]);
  assert.deepEqual(transformed.find((item) => item.instanceId === 'gear').position, [5, 10, 0]);
  assert.deepEqual(transformed.find((item) => item.instanceId === 'outside').position, [50, 0, 0]);
});

test('a selected part can rotate by an exact angle around its local axis', () => {
  const quarterTurn = rotateInstanceAroundLocalAxis(
    { instanceId: 'beam', position: [10, 20, 30], quaternion: [0, 0, 0, 1] },
    'z',
    90,
  );

  assert.deepEqual(quarterTurn.position, [10, 20, 30]);
  assert.ok(Math.abs(quarterTurn.quaternion[2] - Math.SQRT1_2) < 1e-10);
  assert.ok(Math.abs(quarterTurn.quaternion[3] - Math.SQRT1_2) < 1e-10);
});
