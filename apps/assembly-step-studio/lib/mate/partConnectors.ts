import * as THREE from 'three';
import type { MateConnector } from '@/lib/mate/mateMath';

export type ConnectorChoice = MateConnector & { id: string; label: string };

export const BEAM_HOLE_FACES: ConnectorChoice[] = [-19.05, -6.35, 6.35, 19.05].flatMap(
  (x, index) => [
    {
      id: `hole-${index + 1}-top`,
      label: `Hole ${index + 1} · top face`,
      position: new THREE.Vector3(x, 0, 3.05),
      normal: new THREE.Vector3(0, 0, 1),
    },
    {
      id: `hole-${index + 1}-bottom`,
      label: `Hole ${index + 1} · bottom face`,
      position: new THREE.Vector3(x, 0, -3.05),
      normal: new THREE.Vector3(0, 0, -1),
    },
  ],
);

// The widest collar spans approximately Z=-7.2..-5.5 mm in the source STEP.
// Its center is the physical stop plane that should sit against the receiving part.
export const PIN_RING_FACES: ConnectorChoice[] = [
  {
    id: 'pin-stop-ring-short-side',
    label: 'Stop ring · short-pin face',
    position: new THREE.Vector3(0, 0, -7.2),
    normal: new THREE.Vector3(0, 0, -1),
  },
  {
    id: 'pin-stop-ring-long-side',
    label: 'Stop ring · long-pin face',
    position: new THREE.Vector3(0, 0, -5.5),
    normal: new THREE.Vector3(0, 0, 1),
  },
];

export const SHAFT_END_FACES: ConnectorChoice[] = [
  {
    id: 'shaft-negative-end',
    label: 'Shaft end A',
    position: new THREE.Vector3(0, 0, -30.861),
    normal: new THREE.Vector3(0, 0, -1),
  },
  {
    id: 'shaft-positive-end',
    label: 'Shaft end B',
    position: new THREE.Vector3(0, 0, 30.861),
    normal: new THREE.Vector3(0, 0, 1),
  },
];

export function beamHoleCenterFromFace(face: ConnectorChoice): MateConnector {
  return {
    position: face.position.clone().addScaledVector(face.normal, -3.05),
    normal: face.normal.clone(),
  };
}

export function shaftCenterFromEnd(endFace: ConnectorChoice): MateConnector {
  return {
    position: new THREE.Vector3(0, 0, 0),
    normal: endFace.normal.clone(),
  };
}
