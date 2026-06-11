import * as THREE from 'three';
import type { ModelNode } from '@/types/assembly';

let nodeIdCounter = 0;

export function parseModelTree(root: THREE.Object3D): ModelNode[] {
  nodeIdCounter = 0;
  const tree = buildNode(root);
  return tree.children;
}

function buildNode(obj: THREE.Object3D, parentId?: string): ModelNode {
  const id = `node-${nodeIdCounter++}`;
  const isMesh = obj instanceof THREE.Mesh;
  const isGroup = obj instanceof THREE.Group || obj.type === 'Object3D' || obj.type === 'Scene';

  let type: ModelNode['type'] = 'Object3D';
  if (isMesh) type = 'Mesh';
  else if (isGroup) type = 'Group';

  const name = obj.name || `${type}_${obj.uuid.slice(0, 6)}`;

  const children: ModelNode[] = [];
  obj.children.forEach((child) => {
    const childNode = buildNode(child, id);
    children.push(childNode);
  });

  return {
    id,
    name,
    uuid: obj.uuid,
    parentId,
    children,
    type,
  };
}
