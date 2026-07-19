import * as THREE from 'three';
import type {
  AssemblyPartInstance,
  AssemblyRigidGroup,
} from '../../types/assembly.ts';

type RigidGroupMembers = Pick<AssemblyRigidGroup, 'instanceIds'>;

export function expandCustomGroupMemberIds(
  selectedInstanceIds: string[],
  groups: RigidGroupMembers[],
): string[] {
  const members = new Set(selectedInstanceIds);
  let changed = true;
  while (changed) {
    changed = false;
    groups.forEach((group) => {
      if (!group.instanceIds.some((instanceId) => members.has(instanceId))) return;
      group.instanceIds.forEach((instanceId) => {
        if (members.has(instanceId)) return;
        members.add(instanceId);
        changed = true;
      });
    });
  }
  return [...members].sort();
}

export function removeSelectedMembersFromGroups<T extends RigidGroupMembers>(
  groups: T[],
  selectedInstanceIds: string[],
): T[] {
  const removedIds = new Set(selectedInstanceIds);
  return groups
    .map((group) => ({
      ...group,
      instanceIds: group.instanceIds.filter((instanceId) => !removedIds.has(instanceId)),
    }))
    .filter((group) => group.instanceIds.length >= 2);
}

type TransformableInstance = Pick<AssemblyPartInstance, 'instanceId' | 'position' | 'quaternion'>;

function instanceMatrix(instance: TransformableInstance): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...instance.position),
    new THREE.Quaternion(...instance.quaternion).normalize(),
    new THREE.Vector3(1, 1, 1),
  );
}

function clean(value: number): number {
  const normalized = Math.abs(value) < 1e-10 ? 0 : value;
  return Number(normalized.toFixed(10));
}

export function applyRigidGroupTransform<T extends TransformableInstance>(
  instances: T[],
  selectedInstanceId: string,
  nextPosition: [number, number, number],
  nextQuaternion: [number, number, number, number],
  groupMemberIds: string[],
): T[] {
  const selected = instances.find((instance) => instance.instanceId === selectedInstanceId);
  if (!selected) return instances;

  const nextSelectedMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...nextPosition),
    new THREE.Quaternion(...nextQuaternion).normalize(),
    new THREE.Vector3(1, 1, 1),
  );
  const delta = nextSelectedMatrix.multiply(instanceMatrix(selected).invert());
  const memberIds = new Set(groupMemberIds);

  return instances.map((instance) => {
    if (!memberIds.has(instance.instanceId)) return instance;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    delta.clone().multiply(instanceMatrix(instance)).decompose(position, quaternion, scale);
    return {
      ...instance,
      position: [clean(position.x), clean(position.y), clean(position.z)],
      quaternion: [clean(quaternion.x), clean(quaternion.y), clean(quaternion.z), clean(quaternion.w)],
    };
  });
}
