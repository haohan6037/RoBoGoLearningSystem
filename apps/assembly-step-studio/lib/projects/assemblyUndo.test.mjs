import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendAssemblySnapshot,
  undoAssemblySnapshot,
} from './assemblyUndo.ts';

const snapshot = (instanceIds) => ({
  instances: instanceIds.map((instanceId) => ({ instanceId })),
  mateRecords: [],
  groups: [],
});

test('undo restores both settled and not-yet-settled assembly changes', () => {
  const empty = snapshot([]);
  const onePart = snapshot(['beam']);
  const twoParts = snapshot(['beam', 'pin']);
  let history = appendAssemblySnapshot([], empty);
  history = appendAssemblySnapshot(history, onePart);

  const pendingUndo = undoAssemblySnapshot(history, twoParts);
  assert.deepEqual(pendingUndo.snapshot, onePart);
  assert.equal(pendingUndo.history.length, 2);

  const settledUndo = undoAssemblySnapshot(history, onePart);
  assert.deepEqual(settledUndo.snapshot, empty);
  assert.equal(settledUndo.history.length, 1);
});
