import assert from 'node:assert/strict';
import test from 'node:test';

import { isHoleConnector } from './[id]/route.ts';

test('square-hole connectors can be saved and loaded', () => {
  assert.equal(isHoleConnector({
    id: 'manual-square-hole-1-a',
    label: 'Marked square hole 1 · side A',
    kind: 'square-hole',
    position: [0, 0, -2.286],
    centerPosition: [0, 0, 0],
    markerPosition: [0, 0, -2.286],
    normal: [0, 0, -1],
    radius: 3.15,
    axis: 'z',
  }), true);
});
