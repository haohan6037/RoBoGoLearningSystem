import * as THREE from 'three';
import type { ModelNode } from '@/types/assembly';

let nodeIdCounter = 0;

export function parseModelTree(root: THREE.Object3D): ModelNode[] {
  nodeIdCounter = 0;
  const tree = buildNode(root, undefined, 'root', 0);
  return tree.children;
}

function buildNode(
  obj: THREE.Object3D,
  parentId?: string,
  parentStableKey = 'root',
  siblingIndex = 0
): ModelNode {
  const id = `node-${nodeIdCounter++}`;
  const isMesh = obj instanceof THREE.Mesh;
  const isGroup = obj instanceof THREE.Group || obj.type === 'Object3D' || obj.type === 'Scene';

  let type: ModelNode['type'] = 'Object3D';
  if (isMesh) type = 'Mesh';
  else if (isGroup) type = 'Group';

  const name = obj.name || `${type}_${obj.uuid.slice(0, 6)}`;
  const stableKey = `${parentStableKey}/${type}:${name}:${siblingIndex}`;
  obj.userData.assemblyStableKey = stableKey;

  const children: ModelNode[] = [];
  obj.children.forEach((child, index) => {
    const childNode = buildNode(child, id, stableKey, index);
    children.push(childNode);
  });

  return {
    id,
    name,
    uuid: obj.uuid,
    stableKey,
    parentId,
    children,
    type,
  };
}
