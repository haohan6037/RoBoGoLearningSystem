import fs from 'node:fs';
import path from 'node:path';
import createOcct from 'occt-import-js';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const PROJECT_ID = 'b19673f4-5873-47ac-b168-c5ba27eae869';
const PIN_PART_ID = '228-2500-086';
const PIN_RING_POSITION = new THREE.Vector3(0, 0, -5.399);
const PIN_RING_NORMAL = new THREE.Vector3(0, 0, 1);
const PLACEMENT_MODE = process.env.PIN_PLACEMENT_MODE ?? 'inner';
const WHEEL_INSET_MM = Number(process.env.WHEEL_INSET_MM ?? 0);
const pairs = [
  ['rear-low', '54114847-b612-4901-b512-25f23abd306e', '193b70e8-b3ff-47ca-8310-e06ee9d8ec96'],
  ['rear-high', '54114847-b612-4901-b512-25f23abd306e', 'cf1adc3e-88df-420a-aab2-c440ed937cdc'],
  ['front-low', 'drivertrain-front-cross-reinforcement', '67378bb2-7922-4e23-8bcb-fcd187c586e0'],
  ['front-high', 'drivertrain-front-cross-reinforcement', '9661c6a7-7fef-4eb0-a104-860473c7e571'],
];

function matrixFor(position, quaternion) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion(...quaternion),
    new THREE.Vector3(1, 1, 1),
  );
}

function worldFrame(instance, connector) {
  const matrix = matrixFor(instance.position, instance.quaternion);
  return {
    position: new THREE.Vector3(...connector.position).applyMatrix4(matrix),
    normal: new THREE.Vector3(...connector.normal)
      .applyQuaternion(new THREE.Quaternion(...instance.quaternion)).normalize(),
  };
}

function pinAtInnerFace(connectorInstance, connector) {
  const target = worldFrame(connectorInstance, connector);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    PIN_RING_NORMAL,
    target.normal.clone().negate(),
  );
  const position = target.position.clone().sub(PIN_RING_POSITION.clone().applyQuaternion(quaternion));
  return { position: position.toArray(), quaternion: quaternion.toArray() };
}

function pinAtBeamOuterFace(beam, row, column) {
  const target = worldFrame(beam, {
    position: [-120.65 + (column - 1) * 12.7, row === 1 ? -6.35 : 6.35, -2.286],
    normal: [0, 0, -1],
  });
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    PIN_RING_NORMAL,
    target.normal.clone().negate(),
  );
  const position = target.position.clone().sub(PIN_RING_POSITION.clone().applyQuaternion(quaternion));
  return { position: position.toArray(), quaternion: quaternion.toArray() };
}

const record = await (await fetch(`http://127.0.0.1:3000/api/studio?projectId=${PROJECT_ID}`)).json();
const instances = record.assemblyData.instances;
const byId = (id) => instances.find((instance) => instance.instanceId === id);
const connectorDefs = JSON.parse(
  fs.readFileSync('data/part-library-connectors/228-2500-277.json', 'utf8'),
).connectors.filter((connector) => /manual-hole-[2367]-b$/.test(connector.id));

const occt = await createOcct({
  locateFile: (fileName) => path.resolve('node_modules/occt-import-js/dist', fileName),
});
const parts = new Map();
for (const instance of instances) {
  if (parts.has(instance.part.id)) continue;
  const result = occt.ReadStepFile(
    new Uint8Array(fs.readFileSync(path.resolve('CAD Files', instance.part.sourceFile))),
    null,
  );
  const geometries = result.meshes.map((source) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.attributes.position.array, 3));
    geometry.setIndex(source.index.array);
    geometry.computeBoundingBox();
    return geometry;
  });
  const rawBounds = new THREE.Box3();
  geometries.forEach((geometry) => rawBounds.union(geometry.boundingBox));
  const center = rawBounds.getCenter(new THREE.Vector3());
  geometries.forEach((geometry) => {
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeBoundingBox();
    geometry.boundsTree = new MeshBVH(geometry, { maxLeafTris: 12 });
  });
  parts.set(instance.part.id, { geometries });
}

const pinPart = parts.get(PIN_PART_ID);
const results = [];
for (const [label, beamId, connectorId] of pairs) {
  const beam = byId(beamId);
  const connector = byId(connectorId);
  const beamMatrix = matrixFor(beam.position, beam.quaternion);
  const beamHoles = [];
  for (const row of [1, 2]) for (let column = 1; column <= 20; column += 1) {
    const position = new THREE.Vector3(
      -120.65 + (column - 1) * 12.7,
      row === 1 ? -6.35 : 6.35,
      0,
    ).applyMatrix4(beamMatrix);
    beamHoles.push({ row, column, position });
  }

  for (const connectorDef of connectorDefs) {
    const connectorCenterDef = { ...connectorDef, position: connectorDef.centerPosition };
    const connectorCenter = worldFrame(connector, connectorCenterDef).position;
    const hole = beamHoles
      .map((candidate) => ({ ...candidate, transverseDistance: Math.hypot(
        candidate.position.y - connectorCenter.y,
        candidate.position.z - connectorCenter.z,
      ) }))
      .sort((left, right) => left.transverseDistance - right.transverseDistance)[0];
    if (hole.transverseDistance > 0.01) continue;

    const transform = PLACEMENT_MODE === 'outer'
      ? pinAtBeamOuterFace(beam, hole.row, hole.column)
      : pinAtInnerFace(connector, connectorDef);
    const pinMatrix = matrixFor(transform.position, transform.quaternion);
    const pinBounds = new THREE.Box3();
    pinPart.geometries.forEach((geometry) => pinBounds.union(
      geometry.boundingBox.clone().applyMatrix4(pinMatrix),
    ));
    const collisions = [];
    for (const candidate of instances) {
      if (
        candidate.instanceId === beamId
        || candidate.instanceId === connectorId
        || /^drivertrain-(rear|front)-(?:low|high)-cross-pin-/.test(candidate.instanceId)
      ) continue;
      const candidatePosition = [...candidate.position];
      if (PLACEMENT_MODE === 'outer' && candidate.part.name === '200mm Travel Omni-Directional Wheel') {
        candidatePosition[0] += label.startsWith('rear') ? -WHEEL_INSET_MM : WHEEL_INSET_MM;
      }
      const candidateMatrix = matrixFor(candidatePosition, candidate.quaternion);
      const candidatePart = parts.get(candidate.part.id);
      const candidateBounds = new THREE.Box3();
      candidatePart.geometries.forEach((geometry) => candidateBounds.union(
        geometry.boundingBox.clone().applyMatrix4(candidateMatrix),
      ));
      if (!pinBounds.intersectsBox(candidateBounds)) continue;
      const relative = pinMatrix.clone().invert().multiply(candidateMatrix);
      const intersects = pinPart.geometries.some((pinGeometry) => (
        candidatePart.geometries.some((candidateGeometry) => (
          pinGeometry.boundsTree.intersectsGeometry(candidateGeometry, relative)
        ))
      ));
      if (intersects) collisions.push({ instanceId: candidate.instanceId, part: candidate.part.name });
    }
    results.push({
      label,
      connectorHole: connectorDef.id,
      beamHole: `hole-${hole.row}-${hole.column}`,
      pinPosition: transform.position,
      pinQuaternion: transform.quaternion,
      collisions,
    });
  }
}

console.log(JSON.stringify({
  updatedAt: record.updatedAt,
  placementMode: PLACEMENT_MODE,
  wheelInsetMm: WHEEL_INSET_MM,
  results,
}, null, 2));
