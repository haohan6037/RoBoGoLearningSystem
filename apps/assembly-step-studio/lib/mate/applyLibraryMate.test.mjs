import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context);
    return nextResolve(pathToFileURL(path.join(process.cwd(), `${specifier.slice(2)}.ts`)).href, context);
  },
});

const {
  applyOrderedLibraryMates,
  applySingleLibraryMate,
  inferUnifiedLibraryMate,
} = await import('./applyLibraryMate.ts');

const hole = (id, position = [0, 0, 0]) => ({
  id,
  label: id,
  kind: 'hole',
  position,
  markerPosition: position,
  normal: [-1, 0, 0],
  radius: 2,
  axis: 'x',
});

const leg = (id, position = [0, 0, 0]) => ({
  id,
  label: id,
  kind: 'pin-ring',
  position,
  markerPosition: position,
  normal: [1, 0, 0],
  radius: 3,
  axis: 'x',
});

const pick = (instanceId, connector) => ({ instanceId, connector });

test('unified connect recognizes each two-point connection type in either selection direction', () => {
  const squareHole = { ...hole('square'), kind: 'square-hole' };
  const shaftEnd = { ...leg('shaft'), kind: 'shaft-end' };

  assert.deepEqual(
    inferUnifiedLibraryMate([pick('beam', hole('h')), pick('pin', leg('p'))]),
    { status: 'ready', mode: 'pin', autoConnect: true },
  );
  assert.deepEqual(
    inferUnifiedLibraryMate([pick('pin', leg('p')), pick('beam', hole('h'))]),
    { status: 'ready', mode: 'pin', autoConnect: true },
  );
  assert.deepEqual(
    inferUnifiedLibraryMate([pick('beam-a', hole('a')), pick('beam-b', hole('b'))]),
    { status: 'ready', mode: 'beam', autoConnect: false },
  );
  assert.deepEqual(
    inferUnifiedLibraryMate([pick('plate', squareHole), pick('beam', hole('h'))]),
    { status: 'ready', mode: 'hole-align', autoConnect: true },
  );
  assert.deepEqual(
    inferUnifiedLibraryMate([pick('shaft', shaftEnd), pick('beam', hole('h'))]),
    { status: 'ready', mode: 'shaft', autoConnect: true },
  );
});

test('unified connect keeps ordered holes open until the same number of legs is selected', () => {
  assert.equal(
    inferUnifiedLibraryMate([
      pick('beam-a', hole('h1')),
      pick('beam-b', hole('h2')),
      pick('beam-c', hole('h3')),
    ]).status,
    'selecting',
  );
  assert.equal(
    inferUnifiedLibraryMate([
      pick('beam-a', hole('h1')),
      pick('beam-b', hole('h2')),
      pick('connector', leg('c1')),
    ]).status,
    'selecting',
  );
  assert.deepEqual(
    inferUnifiedLibraryMate([
      pick('beam-a', hole('h1')),
      pick('beam-b', hole('h2')),
      pick('connector', leg('c1')),
      pick('connector', leg('c2')),
    ]),
    { status: 'ready', mode: 'multi-leg', autoConnect: false },
  );
});

test('unified connect rejects incompatible and same-part pairs', () => {
  assert.equal(
    inferUnifiedLibraryMate([pick('part', hole('h')), pick('part', leg('p'))]).status,
    'invalid',
  );
  assert.equal(
    inferUnifiedLibraryMate([
      pick('beam-a', hole('h1')),
      pick('connector', leg('c1')),
      pick('beam-b', hole('h2')),
    ]).status,
    'invalid',
  );
});

test('two selected hole faces stack a spacer flush against a beam', () => {
  const beamHoleFace = {
    ...hole('beam-hole', [0, 0, 5]),
    normal: [0, 0, 1],
    axis: 'z',
  };
  const spacerHoleFace = {
    ...hole('spacer-hole', [0, 0, -2]),
    normal: [0, 0, -1],
    axis: 'z',
  };

  const result = applySingleLibraryMate(
    { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    { position: [40, 20, 50], quaternion: [0, 0, 0, 1] },
    beamHoleFace,
    spacerHoleFace,
  );

  assert.deepEqual(result.position, [0, 0, 7]);
  assert.deepEqual(result.quaternion, [0, 0, 0, 1]);
});

test('ordered pairs can connect one multi-connector part to holes on different parts', () => {
  const result = applyOrderedLibraryMates({
    instances: [
      { instanceId: 'hub', position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
      { instanceId: 'beam-a', position: [100, 0, 0], quaternion: [0, 0, 0, 1] },
      { instanceId: 'beam-b', position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    ],
    groups: [],
    holePicks: [
      { instanceId: 'beam-a', connector: hole('hole-a') },
      { instanceId: 'beam-b', connector: hole('hole-b') },
    ],
    connectorPicks: [
      { instanceId: 'hub', connector: leg('leg-1') },
      { instanceId: 'hub', connector: leg('leg-2', [10, 0, 0]) },
    ],
    instanceVolumes: { hub: 1, 'beam-a': 100, 'beam-b': 100 },
  });

  assert.deepEqual(
    result.instances.map((instance) => [instance.instanceId, instance.position]),
    [
      ['hub', [100, 0, 0]],
      ['beam-a', [100, 0, 0]],
      ['beam-b', [110, 0, 0]],
    ],
  );
  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0].instanceIds, ['beam-a', 'beam-b', 'hub']);
  assert.deepEqual(
    result.connections.map((connection) => [
      connection.hole.instanceId,
      connection.connector.instanceId,
    ]),
    [
      ['beam-a', 'hub'],
      ['beam-b', 'hub'],
    ],
  );
});

test('two ordered pairs align together when their holes belong to different parts of one rigid group', () => {
  const result = applyOrderedLibraryMates({
    instances: [
      { instanceId: 'hub', position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
      { instanceId: 'plate-a', position: [100, 0, 0], quaternion: [0, 0, 0, 1] },
      { instanceId: 'plate-b', position: [100, 10, 0], quaternion: [0, 0, 0, 1] },
    ],
    groups: [{
      id: 'plate-group',
      name: 'Plate Group',
      instanceIds: ['plate-a', 'plate-b'],
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
    holePicks: [
      { instanceId: 'plate-a', connector: { ...hole('hole-1'), normal: [0, 0, -1], axis: 'z' } },
      { instanceId: 'plate-b', connector: { ...hole('hole-2'), normal: [0, 0, -1], axis: 'z' } },
    ],
    connectorPicks: [
      { instanceId: 'hub', connector: { ...leg('leg-1'), normal: [0, 0, 1], axis: 'z' } },
      { instanceId: 'hub', connector: { ...leg('leg-2', [10, 0, 0]), normal: [0, 0, 1], axis: 'z' } },
    ],
    instanceVolumes: { hub: 1, 'plate-a': 100, 'plate-b': 100 },
  });

  const hub = result.instances.find((instance) => instance.instanceId === 'hub');
  assert.deepEqual(hub.position, [100, 0, 0]);
  assert.ok(Math.abs(Math.abs(hub.quaternion[2]) - Math.SQRT1_2) < 1e-9);
  assert.equal(result.connections.length, 2);
  assert.deepEqual(result.groups[0].instanceIds, ['hub', 'plate-a', 'plate-b']);
});

test('an impossible later pair rejects the whole ordered connection without changing the input', () => {
  const instances = [
    { instanceId: 'hub', position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    { instanceId: 'beam', position: [100, 0, 0], quaternion: [0, 0, 0, 1] },
  ];
  const original = structuredClone(instances);

  assert.throws(() => applyOrderedLibraryMates({
    instances,
    groups: [],
    holePicks: [
      { instanceId: 'beam', connector: hole('hole-1') },
      { instanceId: 'beam', connector: hole('hole-2', [30, 0, 0]) },
    ],
    connectorPicks: [
      { instanceId: 'hub', connector: leg('leg-1') },
      { instanceId: 'hub', connector: leg('leg-2', [10, 0, 0]) },
    ],
    instanceVolumes: { hub: 1, beam: 100 },
  }), /matching spacing/);

  assert.deepEqual(instances, original);
});
