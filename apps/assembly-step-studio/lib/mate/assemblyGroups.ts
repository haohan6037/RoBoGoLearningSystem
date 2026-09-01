import * as THREE from 'three';
import type {
  AssemblyMateRecord,
  AssemblyPartInstance,
  AssemblyRigidGroup,
} from '../../types/assembly.ts';

type RigidGroupMembers = Pick<AssemblyRigidGroup, 'instanceIds'>;

export type AutomaticMateDirection = {
  fixedInstanceId: string;
  movingInstanceId: string;
};

export function findNextPartSpawnPosition(
  root: THREE.Object3D | null,
): [number, number, number] {
  if (!root) return [0, 0, 0];
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) return [0, 0, 0];
  const center = bounds.getCenter(new THREE.Vector3());
  return [bounds.max.x + 40, center.y, center.z];
}

export function resolveAutomaticMateDirection(
  firstInstanceId: string,
  secondInstanceId: string,
  groups: RigidGroupMembers[],
  instanceVolumes: Record<string, number>,
): AutomaticMateDirection {
  const firstGroup = groups.find((group) => group.instanceIds.includes(firstInstanceId));
  const secondGroup = groups.find((group) => group.instanceIds.includes(secondInstanceId));
  const firstIsGrouped = Boolean(firstGroup);
  const secondIsGrouped = Boolean(secondGroup);
  if (firstIsGrouped !== secondIsGrouped) {
    return firstIsGrouped
      ? { fixedInstanceId: firstInstanceId, movingInstanceId: secondInstanceId }
      : { fixedInstanceId: secondInstanceId, movingInstanceId: firstInstanceId };
  }
  const sideVolume = (instanceId: string, group?: RigidGroupMembers) => (
    (group?.instanceIds ?? [instanceId]).reduce(
      (total, memberId) => total + Math.max(0, instanceVolumes[memberId] ?? 0),
      0,
    )
  );
  const firstVolume = sideVolume(firstInstanceId, firstGroup);
  const secondVolume = sideVolume(secondInstanceId, secondGroup);
  return firstVolume >= secondVolume
    ? { fixedInstanceId: firstInstanceId, movingInstanceId: secondInstanceId }
    : { fixedInstanceId: secondInstanceId, movingInstanceId: firstInstanceId };
}

export function mergeConnectedRigidGroups(
  groups: AssemblyRigidGroup[],
  fixedInstanceId: string,
  movingInstanceId: string,
): AssemblyRigidGroup[] {
  const fixedGroup = groups.find((group) => group.instanceIds.includes(fixedInstanceId));
  const movingGroup = groups.find((group) => group.instanceIds.includes(movingInstanceId));
  if (fixedGroup && fixedGroup.id === movingGroup?.id) return groups;

  const mergedIds = new Set([
    ...(fixedGroup?.instanceIds ?? [fixedInstanceId]),
    ...(movingGroup?.instanceIds ?? [movingInstanceId]),
  ]);
  const retainedGroup = fixedGroup ?? movingGroup;
  const nextGroupNumber = groups.reduce((largest, group) => {
    const match = group.name.match(/^Group (\d+)$/);
    return Math.max(largest, Number(match?.[1] ?? 0));
  }, 0) + 1;
  const mergedGroup: AssemblyRigidGroup = {
    id: retainedGroup?.id ?? crypto.randomUUID(),
    name: retainedGroup?.name ?? `Group ${nextGroupNumber}`,
    instanceIds: [...mergedIds].sort(),
    createdAt: retainedGroup?.createdAt ?? new Date().toISOString(),
  };
  const replacedIds = new Set([fixedGroup?.id, movingGroup?.id].filter(Boolean));
  return [
    ...groups.filter((group) => !replacedIds.has(group.id)),
    mergedGroup,
  ];
}

export function measureAssemblyInstanceVolumes(root: THREE.Object3D): Record<string, number> {
  root.updateWorldMatrix(true, true);
  const volumes: Record<string, number> = {};
  root.traverse((instanceRoot) => {
    const instanceId = instanceRoot.userData.robogoInstanceId;
    if (typeof instanceId !== 'string') return;
    const instanceInverse = instanceRoot.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();
    instanceRoot.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.geometry) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (!object.geometry.boundingBox) return;
      const relativeMatrix = instanceInverse.clone().multiply(object.matrixWorld);
      bounds.union(object.geometry.boundingBox.clone().applyMatrix4(relativeMatrix));
    });
    if (bounds.isEmpty()) {
      volumes[instanceId] = 0;
      return;
    }
    const size = bounds.getSize(new THREE.Vector3());
    volumes[instanceId] = clean(size.x * size.y * size.z);
  });
  return volumes;
}

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

export function duplicateAssemblyGroup<T extends AssemblyPartInstance>({
  instances,
  mateRecords,
  group,
  anchorPosition,
  createId,
  createdAt,
}: {
  instances: T[];
  mateRecords: AssemblyMateRecord[];
  group: AssemblyRigidGroup;
  anchorPosition: [number, number, number];
  createId: () => string;
  createdAt: string;
}): {
  instances: T[];
  mateRecords: AssemblyMateRecord[];
  group: AssemblyRigidGroup;
} {
  const members = group.instanceIds
    .map((instanceId) => instances.find((instance) => instance.instanceId === instanceId))
    .filter((instance): instance is T => Boolean(instance));
  if (members.length < 2) throw new Error('This group no longer has enough parts to copy.');

  const sourceAnchor = members[0].position;
  const offset: [number, number, number] = [
    anchorPosition[0] - sourceAnchor[0],
    anchorPosition[1] - sourceAnchor[1],
    anchorPosition[2] - sourceAnchor[2],
  ];
  const idMap = new Map<string, string>();
  const copiedInstances = members.map((instance) => {
    const instanceId = createId();
    idMap.set(instance.instanceId, instanceId);
    return {
      ...instance,
      instanceId,
      position: [
        clean(instance.position[0] + offset[0]),
        clean(instance.position[1] + offset[1]),
        clean(instance.position[2] + offset[2]),
      ] as [number, number, number],
    };
  });
  const copiedGroupId = createId();
  const copiedMateRecords = mateRecords.flatMap((mate) => {
    const fixedInstanceId = idMap.get(mate.fixedInstanceId);
    const movingInstanceId = idMap.get(mate.movingInstanceId);
    if (!fixedInstanceId || !movingInstanceId) return [];
    return [{
      ...mate,
      id: createId(),
      fixedInstanceId,
      movingInstanceId,
      createdAt,
    }];
  });

  return {
    instances: copiedInstances,
    mateRecords: copiedMateRecords,
    group: {
      id: copiedGroupId,
      name: `${group.name} Copy`,
      instanceIds: copiedInstances.map((instance) => instance.instanceId),
      createdAt,
    },
  };
}

type TransformableInstance = Pick<AssemblyPartInstance, 'instanceId' | 'position' | 'quaternion'>;
export type RotationAxis = 'x' | 'y' | 'z';

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

export function rotateInstanceAroundLocalAxis<T extends TransformableInstance>(
  instance: T,
  axis: RotationAxis,
  degrees: number,
): T {
  return rotateInstanceAroundLocalPivot(instance, [0, 0, 0], axis, degrees);
}

export function rotateInstanceAroundLocalPivot<T extends TransformableInstance>(
  instance: T,
  localPivot: [number, number, number],
  axis: RotationAxis,
  degrees: number,
): T {
  const axisVector = axis === 'x'
    ? new THREE.Vector3(1, 0, 0)
    : axis === 'y'
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);
  const rotation = new THREE.Quaternion().setFromAxisAngle(
    axisVector,
    THREE.MathUtils.degToRad(degrees),
  );
  const originalQuaternion = new THREE.Quaternion(...instance.quaternion).normalize();
  const quaternion = originalQuaternion.clone().multiply(rotation).normalize();
  return setInstanceQuaternionAroundLocalPivot(
    instance,
    localPivot,
    [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
  );
}

export function setInstanceQuaternionAroundLocalPivot<T extends TransformableInstance>(
  instance: T,
  localPivot: [number, number, number],
  nextQuaternion: [number, number, number, number],
): T {
  const originalQuaternion = new THREE.Quaternion(...instance.quaternion).normalize();
  const pivotWorld = new THREE.Vector3(...localPivot)
    .applyQuaternion(originalQuaternion)
    .add(new THREE.Vector3(...instance.position));
  const quaternion = new THREE.Quaternion(...nextQuaternion).normalize();
  const position = pivotWorld.sub(
    new THREE.Vector3(...localPivot).applyQuaternion(quaternion),
  );
  return {
    ...instance,
    position: [clean(position.x), clean(position.y), clean(position.z)],
    quaternion: [
      clean(quaternion.x),
      clean(quaternion.y),
      clean(quaternion.z),
      clean(quaternion.w),
    ],
  };
}

type RotationMateRecord = Pick<
  AssemblyMateRecord,
  'type' | 'fixedInstanceId' | 'movingInstanceId' | 'fixedConnectorIds' | 'movingConnectorIds'
>;

export function resolvePivotRotationMemberIds(
  pivotInstanceId: string,
  pivotConnectorIds: string[],
  mateRecords: RotationMateRecord[],
): string[] {
  const pivotConnectors = new Set(pivotConnectorIds);
  const members = new Set([pivotInstanceId]);
  const queue = [pivotInstanceId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const mate of mateRecords) {
      const currentIsFixed = mate.fixedInstanceId === currentId;
      const currentIsMoving = mate.movingInstanceId === currentId;
      if (!currentIsFixed && !currentIsMoving) continue;

      const crossesPivotJoint = currentId === pivotInstanceId
        && (currentIsFixed ? mate.fixedConnectorIds : mate.movingConnectorIds)
          .some((connectorId) => pivotConnectors.has(connectorId));
      if (crossesPivotJoint) continue;

      const neighborId = currentIsFixed ? mate.movingInstanceId : mate.fixedInstanceId;
      if (members.has(neighborId)) continue;
      members.add(neighborId);
      queue.push(neighborId);
    }
  }

  return [...members];
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
