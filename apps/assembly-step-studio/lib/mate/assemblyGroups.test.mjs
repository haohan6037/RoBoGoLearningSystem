import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyRigidGroupTransform,
  expandCustomGroupMemberIds,
  removeSelectedMembersFromGroups,
} from './assemblyGroups.ts';

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
