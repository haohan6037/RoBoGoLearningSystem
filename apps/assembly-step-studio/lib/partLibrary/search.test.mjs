import assert from 'node:assert/strict';
import test from 'node:test';

import {
  comparePartsByName,
  normalizePartSearchText,
} from './search.ts';

test('part search ignores case', () => {
  assert.equal(normalizePartSearchText('BEAM'), normalizePartSearchText('beam'));
});

test('part search treats x, multiplication sign, and star as equivalent between numbers', () => {
  assert.equal(normalizePartSearchText('1*4'), normalizePartSearchText('1x4'));
  assert.equal(normalizePartSearchText('1×4'), normalizePartSearchText('1x4'));
});

test('parts use natural name sorting', () => {
  const parts = [
    { name: '1x10 Beam', partNumber: '3' },
    { name: '1x4 Beam', partNumber: '2' },
    { name: '1x2 Beam', partNumber: '1' },
  ];

  assert.deepEqual(parts.sort(comparePartsByName).map((part) => part.name), [
    '1x2 Beam',
    '1x4 Beam',
    '1x10 Beam',
  ]);
});
