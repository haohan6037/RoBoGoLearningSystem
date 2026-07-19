import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  buildLibraryConnectors,
  buildManualHoleConnectors,
  buildManualSquareHoleConnectors,
} from './libraryConnectors.ts';

function addHoleRings(model, centers, axis = 'z') {
  const positions = [];
  const radialAxes = ['x', 'y', 'z'].filter((candidate) => candidate !== axis);
  centers.forEach((center) => {
    for (const faceOffset of [-2.286, 2.286]) {
      for (let index = 0; index < 24; index += 1) {
        const angle = (index / 24) * Math.PI * 2;
        const point = { x: center.x, y: center.y, z: center.z };
        point[axis] += faceOffset;
        point[radialAxes[0]] += Math.cos(angle) * 2.1;
        point[radialAxes[1]] += Math.sin(angle) * 2.1;
        positions.push(point.x, point.y, point.z);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  model.add(new THREE.Mesh(geometry));
}

function addSquareHoleRings(model, centers, axis = 'z') {
  const positions = [];
  const radialAxes = ['x', 'y', 'z'].filter((candidate) => candidate !== axis);
  centers.forEach((center) => {
    for (const faceOffset of [-2.286, 2.286]) {
      for (const edgePosition of [-2.1, -1.05, 0, 1.05, 2.1]) {
        for (const [first, second] of [
          [-2.1, edgePosition],
          [2.1, edgePosition],
          [edgePosition, -2.1],
          [edgePosition, 2.1],
        ]) {
          const point = { x: center.x, y: center.y, z: center.z };
          point[axis] += faceOffset;
          point[radialAxes[0]] += first;
          point[radialAxes[1]] += second;
          positions.push(point.x, point.y, point.z);
        }
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  model.add(new THREE.Mesh(geometry));
}

function squareTunnelMesh(halfWidth = 2.1, halfDepth = 3) {
  const quads = [
    [[-halfWidth, -halfWidth, -halfDepth], [-halfWidth, halfWidth, -halfDepth], [-halfWidth, halfWidth, halfDepth], [-halfWidth, -halfWidth, halfDepth]],
    [[halfWidth, -halfWidth, -halfDepth], [halfWidth, -halfWidth, halfDepth], [halfWidth, halfWidth, halfDepth], [halfWidth, halfWidth, -halfDepth]],
    [[-halfWidth, -halfWidth, -halfDepth], [-halfWidth, -halfWidth, halfDepth], [halfWidth, -halfWidth, halfDepth], [halfWidth, -halfWidth, -halfDepth]],
    [[-halfWidth, halfWidth, -halfDepth], [halfWidth, halfWidth, -halfDepth], [halfWidth, halfWidth, halfDepth], [-halfWidth, halfWidth, halfDepth]],
  ];
  const positions = [];
  const indices = [];
  quads.forEach((quad) => {
    const offset = positions.length / 3;
    quad.forEach((point) => positions.push(...point));
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.userData.brepFaces = quads.map((_, index) => ({ first: index * 2, last: index * 2 + 1 }));
  return new THREE.Mesh(geometry);
}

function builtInLegModel() {
  const segments = 24;
  const positions = [];
  const indices = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    for (const [radius, z] of [[2.5, 0], [3.175, 0], [2.5, 5.25], [0, 5.25]]) {
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
    }
  }
  const vertex = (segment, ring) => ((segment + segments) % segments) * 4 + ring;
  for (let index = 0; index < segments; index += 1) {
    const next = index + 1;
    indices.push(vertex(index, 0), vertex(index, 1), vertex(next, 0));
    indices.push(vertex(next, 0), vertex(index, 1), vertex(next, 1));
  }
  const shoulderLastTriangle = indices.length / 3 - 1;
  for (let index = 0; index < segments; index += 1) {
    const next = index + 1;
    indices.push(vertex(index, 0), vertex(index, 2), vertex(next, 0));
    indices.push(vertex(next, 0), vertex(index, 2), vertex(next, 2));
    indices.push(vertex(index, 2), vertex(index, 3), vertex(next, 2));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.userData.brepFaces = [{ first: 0, last: shoulderLastTriangle }];
  const model = new THREE.Group();
  model.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
  return model;
}

test('a regular 2x4 beam exposes both faces of all eight holes', () => {
  const model = new THREE.Group();
  const geometry = new THREE.BoxGeometry(50.5, 25.1, 6.1);
  model.add(new THREE.Mesh(geometry));
  addHoleRings(model, [-6.35, 6.35].flatMap((y) =>
    [-19.05, -6.35, 6.35, 19.05].map((x) => ({ x, y, z: 0 })),
  ));

  const connectors = buildLibraryConnectors(
    { name: '2x4 Beam', category: 'Beams' },
    model,
  );

  assert.equal(connectors.filter((connector) => connector.kind === 'hole').length, 16);
  assert.deepEqual(
    connectors.find((connector) => connector.id === 'hole-1-1-top')?.position,
    [-19.05, -6.35, 2.286],
  );
});

test('an irregular plate only exposes connector points for real circular holes', () => {
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(25.4, 25.4, 6.1)));
  addHoleRings(model, [
    { x: -6.35, y: -6.35, z: 0 },
    { x: 6.35, y: -6.35, z: 0 },
    { x: -6.35, y: 6.35, z: 0 },
  ]);

  const connectors = buildLibraryConnectors(
    { name: '2x2 Truss Plate', category: 'Plates' },
    model,
  ).filter((connector) => connector.kind === 'hole');

  assert.equal(connectors.length, 6);
  assert.equal(connectors.some((connector) => connector.id.startsWith('hole-2-2-')), false);
});

test('a shaft exposes two ends but mates from its center', () => {
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(3.175, 3.175, 61.722)));

  const connectors = buildLibraryConnectors(
    { name: '5x Pitch Shaft', category: 'Shafts' },
    model,
  ).filter((connector) => connector.kind === 'shaft-end');

  assert.equal(connectors.length, 2);
  assert.deepEqual(connectors[0].position, [0, 0, 0]);
  assert.deepEqual(connectors.map((connector) => connector.markerPosition[2]), [-30.861, 30.861]);
});

test('a square beam opening exposes square-hole connectors on both faces', () => {
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(12.7, 12.7, 6.1)));
  addSquareHoleRings(model, [{ x: 0, y: 0, z: 0 }]);

  const connectors = buildLibraryConnectors(
    { name: '1x1 Beam', category: 'Beams' },
    model,
  );

  assert.deepEqual(connectors.map((connector) => connector.kind), ['square-hole', 'square-hole']);
  assert.deepEqual(connectors.map((connector) => connector.centerPosition), [[0, 0, 0], [0, 0, 0]]);
});

test('a gear exposes its central square opening without beam-style naming', () => {
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(50, 50, 6.1)));
  addSquareHoleRings(model, [{ x: 0, y: 0, z: 0 }]);

  const connectors = buildLibraryConnectors(
    { name: '36 Tooth Gear', category: 'Gears' },
    model,
  ).filter((connector) => connector.kind === 'square-hole');

  assert.equal(connectors.length, 2);
  assert.deepEqual(connectors.map((connector) => connector.centerPosition), [[0, 0, 0], [0, 0, 0]]);
});

test('an Idler Pin exposes center-axis ends for through-hole insertion', () => {
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(3.175, 3.175, 25.4)));

  const connectors = buildLibraryConnectors(
    { name: '1x2 Idler Pin', category: 'Pins' },
    model,
  );

  assert.equal(connectors.filter((connector) => connector.kind === 'shaft-end').length, 2);
  assert.deepEqual(
    connectors.filter((connector) => connector.kind === 'shaft-end').map((connector) => connector.position),
    [[0, 0, 0], [0, 0, 0]],
  );
});

test('a pin exposes both sides of its widest stop ring', () => {
  const positions = [];
  for (const z of [-6, -1, 1, 6]) {
    const radius = Math.abs(z) === 1 ? 3.2 : 1.6;
    for (let index = 0; index < 48; index += 1) {
      const angle = (index / 48) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const model = new THREE.Group();
  model.add(new THREE.Mesh(geometry));

  const connectors = buildLibraryConnectors(
    { name: 'Connector Pin', category: 'Pins' },
    model,
  ).filter((connector) => connector.kind === 'pin-ring');

  assert.deepEqual(connectors.map((connector) => connector.position[2]), [-1, 1]);
});

test('a non-Pin library part exposes a detected built-in connection leg', () => {
  const connectors = buildLibraryConnectors(
    { name: 'Corner Connector', category: 'Connectors' },
    builtInLegModel(),
  );

  assert.equal(connectors.length, 1);
  assert.equal(connectors[0].kind, 'pin-ring');
  assert.deepEqual(connectors[0].position, [0, 0, 0]);
  assert.deepEqual(connectors[0].normal, [0, 0, 1]);
});

test('selecting a cylindrical hole wall creates reusable connectors on both faces', () => {
  const geometry = new THREE.CylinderGeometry(2.1, 2.1, 6, 24, 1, true);
  geometry.userData.brepFaces = [{
    first: 0,
    last: (geometry.index?.count ?? 0) / 3 - 1,
  }];
  const mesh = new THREE.Mesh(geometry);
  const root = new THREE.Group();
  root.add(mesh);
  root.updateMatrixWorld(true);

  const connectors = buildManualHoleConnectors(mesh, 0, root, 1);

  assert.equal(connectors.length, 2);
  assert.deepEqual(connectors.map((connector) => connector.kind), ['hole', 'hole']);
  assert.deepEqual(connectors.map((connector) => connector.centerPosition), [[0, 0, 0], [0, 0, 0]]);
  assert.deepEqual(connectors.map((connector) => connector.position[1]).sort((a, b) => a - b), [-3, 3]);
});

test('selecting one half of a split cylindrical hole wall still finds the whole hole', () => {
  const geometry = new THREE.CylinderGeometry(2.1, 2.1, 4.572, 24, 1, true, 0, Math.PI);
  geometry.userData.brepFaces = [{
    first: 0,
    last: (geometry.index?.count ?? 0) / 3 - 1,
  }];
  const mesh = new THREE.Mesh(geometry);
  const root = new THREE.Group();
  root.add(mesh);
  root.updateMatrixWorld(true);

  const connectors = buildManualHoleConnectors(mesh, 0, root, 1);

  assert.equal(connectors.length, 2);
  assert.deepEqual(connectors[0].centerPosition, [0, 0, 0]);
  assert.equal(connectors[0].radius, 3.15);
});

test('selecting one flat wall marks the complete square hole on both faces', () => {
  const mesh = squareTunnelMesh();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 6)));
  root.add(mesh);
  root.updateMatrixWorld(true);

  const connectors = buildManualSquareHoleConnectors(mesh, 0, root, 1);

  assert.equal(connectors.length, 2);
  assert.deepEqual(connectors.map((connector) => connector.kind), ['square-hole', 'square-hole']);
  assert.deepEqual(connectors.map((connector) => connector.centerPosition), [[0, 0, 0], [0, 0, 0]]);
  assert.deepEqual(connectors.map((connector) => connector.position[2]).sort((a, b) => a - b), [-3, 3]);
});
