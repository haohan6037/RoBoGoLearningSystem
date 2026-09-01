import * as THREE from 'three';
import type { LibraryConnector } from '@/lib/mate/libraryConnectors';
import {
  connectorWorldFrame,
  snapObjectByTwoMates,
  snapObjectToMate,
  type MateConnector,
} from '@/lib/mate/mateMath';
import {
  applyRigidGroupTransform,
  mergeConnectedRigidGroups,
  resolveAutomaticMateDirection,
} from '@/lib/mate/assemblyGroups';
import type {
  AssemblyPartInstance,
  AssemblyRigidGroup,
} from '../../types/assembly.ts';

export type InstanceTransform = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
};

function transformObject(transform: InstanceTransform): THREE.Object3D {
  const object = new THREE.Object3D();
  object.position.fromArray(transform.position);
  object.quaternion.fromArray(transform.quaternion);
  object.updateWorldMatrix(true, false);
  return object;
}

function mateConnector(connector: LibraryConnector, useCenter = false): MateConnector {
  return {
    position: new THREE.Vector3(...(useCenter && connector.centerPosition
      ? connector.centerPosition
      : connector.position)),
    normal: new THREE.Vector3(...connector.normal),
  };
}

function readTransform(object: THREE.Object3D): InstanceTransform {
  return {
    position: object.position.toArray(),
    quaternion: object.quaternion.toArray(),
  };
}

export function applySingleLibraryMate(
  fixed: InstanceTransform,
  moving: InstanceTransform,
  fixedConnector: LibraryConnector,
  movingConnector: LibraryConnector,
  options: { centerFixedConnector?: boolean; centerMovingConnector?: boolean } = {},
): InstanceTransform {
  const fixedObject = transformObject(fixed);
  const movingObject = transformObject(moving);
  const target = connectorWorldFrame(
    fixedObject,
    mateConnector(fixedConnector, options.centerFixedConnector),
  );
  snapObjectToMate(
    movingObject,
    mateConnector(movingConnector, options.centerMovingConnector),
    target,
  );
  return readTransform(movingObject);
}

export function applyTwoHoleLibraryMate(
  fixed: InstanceTransform,
  moving: InstanceTransform,
  fixedFirst: LibraryConnector,
  fixedSecond: LibraryConnector,
  movingFirst: LibraryConnector,
  movingSecond: LibraryConnector,
): InstanceTransform {
  const fixedObject = transformObject(fixed);
  const movingObject = transformObject(moving);
  snapObjectByTwoMates(
    movingObject,
    mateConnector(movingFirst),
    mateConnector(movingSecond),
    connectorWorldFrame(fixedObject, mateConnector(fixedFirst)),
    connectorWorldFrame(fixedObject, mateConnector(fixedSecond)),
  );
  return readTransform(movingObject);
}

export type OrderedLibraryMatePick = {
  instanceId: string;
  connector: LibraryConnector;
};

export type UnifiedLibraryMateMode = 'pin' | 'multi-leg' | 'beam' | 'shaft' | 'hole-align';
export type UnifiedLibraryMateResult =
  | { status: 'selecting' }
  | { status: 'ready'; mode: UnifiedLibraryMateMode; autoConnect: boolean }
  | { status: 'invalid'; message: string };

const APERTURE_KINDS: LibraryConnector['kind'][] = ['hole', 'square-hole'];

export function inferUnifiedLibraryMate(
  picks: OrderedLibraryMatePick[],
): UnifiedLibraryMateResult {
  if (picks.length < 2) return { status: 'selecting' };

  const [first, second] = picks;
  const samePart = first.instanceId === second.instanceId;
  const kinds = picks.map((pick) => pick.connector.kind);

  if (picks.length === 2) {
    const has = (kind: LibraryConnector['kind']) => kinds.includes(kind);
    if (samePart) {
      if (kinds.every((kind) => kind === 'hole')) return { status: 'selecting' };
      return { status: 'invalid', message: 'Select connection points on different parts.' };
    }
    if (has('pin-ring') && has('hole')) {
      return { status: 'ready', mode: 'pin', autoConnect: true };
    }
    if (has('shaft-end') && kinds.some((kind) => APERTURE_KINDS.includes(kind))) {
      return { status: 'ready', mode: 'shaft', autoConnect: true };
    }
    if (has('square-hole') && has('hole')) {
      return { status: 'ready', mode: 'hole-align', autoConnect: true };
    }
    if (kinds.every((kind) => kind === 'hole')) {
      return { status: 'ready', mode: 'beam', autoConnect: false };
    }
    return { status: 'invalid', message: 'These two connection points are not compatible.' };
  }

  const firstLegIndex = kinds.findIndex((kind) => kind === 'pin-ring');
  if (kinds.every((kind) => kind === 'hole')) {
    if (picks.length === 4) {
      const firstPartId = picks[0].instanceId;
      const secondPartId = picks[2].instanceId;
      const hasTwoHolesPerPart = picks[1].instanceId === firstPartId
        && picks[3].instanceId === secondPartId
        && firstPartId !== secondPartId;
      return hasTwoHolesPerPart
        ? { status: 'ready', mode: 'hole-align', autoConnect: false }
        : {
            status: 'invalid',
            message: 'Select holes 1 and 2 on the first part, then holes 3 and 4 on the second part.',
          };
    }
    return { status: 'selecting' };
  }
  if (firstLegIndex < 2) {
    return {
      status: 'invalid',
      message: 'For multiple connectors, select at least two holes first, then the matching legs.',
    };
  }
  if (
    !kinds.slice(0, firstLegIndex).every((kind) => kind === 'hole')
    || !kinds.slice(firstLegIndex).every((kind) => kind === 'pin-ring')
  ) {
    return {
      status: 'invalid',
      message: 'Finish selecting holes before selecting connector legs.',
    };
  }

  const holes = picks.slice(0, firstLegIndex);
  const legs = picks.slice(firstLegIndex);
  const invalidPair = legs.findIndex((legPick, index) => (
    holes[index]?.instanceId === legPick.instanceId
  ));
  if (invalidPair >= 0) {
    return {
      status: 'invalid',
      message: `C${invalidPair + 1} cannot connect H${invalidPair + 1} on the same part.`,
    };
  }
  if (legs.length > holes.length) {
    return { status: 'invalid', message: 'The selected connector legs outnumber the holes.' };
  }
  if (legs.length === holes.length) {
    return { status: 'ready', mode: 'multi-leg', autoConnect: false };
  }
  return { status: 'selecting' };
}

type OrderedMateInstance = Pick<AssemblyPartInstance, 'instanceId' | 'position' | 'quaternion'>;

export function applyLibraryMateTransform<T extends OrderedMateInstance>({
  instances,
  groups,
  fixedInstanceId,
  movingInstanceId,
  transform,
}: {
  instances: T[];
  groups: AssemblyRigidGroup[];
  fixedInstanceId: string;
  movingInstanceId: string;
  transform: InstanceTransform;
}): { instances: T[]; groups: AssemblyRigidGroup[] } {
  const movingGroup = groups.find((group) => group.instanceIds.includes(movingInstanceId));
  return {
    instances: applyRigidGroupTransform(
      instances,
      movingInstanceId,
      transform.position,
      transform.quaternion,
      movingGroup?.instanceIds ?? [movingInstanceId],
    ),
    groups: mergeConnectedRigidGroups(groups, fixedInstanceId, movingInstanceId),
  };
}

export type OrderedLibraryMateConnection = {
  hole: OrderedLibraryMatePick;
  connector: OrderedLibraryMatePick;
  fixedInstanceId: string;
  movingInstanceId: string;
};

function rigidSideMembers(
  instanceId: string,
  groups: AssemblyRigidGroup[],
): string[] {
  return groups.find((group) => group.instanceIds.includes(instanceId))?.instanceIds
    ?? [instanceId];
}

function pickWorldFrame<T extends OrderedMateInstance>(
  instances: T[],
  pick: OrderedLibraryMatePick,
): MateConnector {
  const instance = instances.find((candidate) => candidate.instanceId === pick.instanceId);
  if (!instance) throw new Error('A selected part is no longer available.');
  return connectorWorldFrame(transformObject(instance), mateConnector(pick.connector));
}

function pickFrameRelativeToAnchor<T extends OrderedMateInstance>(
  instances: T[],
  pick: OrderedLibraryMatePick,
  anchor: T,
): MateConnector {
  const worldFrame = pickWorldFrame(instances, pick);
  const anchorObject = transformObject(anchor);
  const inverseMatrix = anchorObject.matrixWorld.clone().invert();
  const inverseQuaternion = anchorObject.quaternion.clone().invert();
  return {
    position: worldFrame.position.applyMatrix4(inverseMatrix),
    normal: worldFrame.normal.applyQuaternion(inverseQuaternion).normalize(),
  };
}

function orderedPairIsAligned<T extends OrderedMateInstance>(
  instances: T[],
  hole: OrderedLibraryMatePick,
  connector: OrderedLibraryMatePick,
): boolean {
  const holeFrame = pickWorldFrame(instances, hole);
  const connectorFrame = pickWorldFrame(instances, connector);
  return holeFrame.position.distanceTo(connectorFrame.position) <= 0.15
    && holeFrame.normal.dot(connectorFrame.normal) <= -0.99;
}

export function applyOrderedLibraryMates<T extends OrderedMateInstance>({
  instances,
  groups,
  holePicks,
  connectorPicks,
  instanceVolumes,
}: {
  instances: T[];
  groups: AssemblyRigidGroup[];
  holePicks: OrderedLibraryMatePick[];
  connectorPicks: OrderedLibraryMatePick[];
  instanceVolumes: Record<string, number>;
}): {
  instances: T[];
  groups: AssemblyRigidGroup[];
  connections: OrderedLibraryMateConnection[];
} {
  if (holePicks.length < 2 || holePicks.length !== connectorPicks.length) {
    throw new Error('Select at least two holes and the same number of connector legs.');
  }

  let nextInstances = instances;
  let nextGroups = groups;
  const connections: Array<OrderedLibraryMateConnection | undefined> = new Array(holePicks.length);
  const processed = new Set<number>();

  holePicks.forEach((hole, index) => {
    const connector = connectorPicks[index];
    if (hole.connector.kind !== 'hole' || connector.connector.kind !== 'pin-ring') {
      throw new Error(`Pair ${index + 1} must contain one hole and one connector leg.`);
    }
    if (hole.instanceId === connector.instanceId) {
      throw new Error(`Pair ${index + 1} cannot connect a part to itself.`);
    }
  });

  for (let index = 0; index < holePicks.length; index += 1) {
    if (processed.has(index)) continue;
    const hole = holePicks[index];
    const connector = connectorPicks[index];

    const holeInstance = nextInstances.find((instance) => instance.instanceId === hole.instanceId);
    const connectorInstance = nextInstances.find((instance) => instance.instanceId === connector.instanceId);
    if (!holeInstance || !connectorInstance) {
      throw new Error(`Pair ${index + 1} contains a part that is no longer available.`);
    }

    const sharedGroup = nextGroups.find((group) => (
      group.instanceIds.includes(hole.instanceId)
      && group.instanceIds.includes(connector.instanceId)
    ));
    if (sharedGroup) {
      if (!orderedPairIsAligned(nextInstances, hole, connector)) {
        throw new Error(`Pair ${index + 1} cannot align without breaking an earlier connection.`);
      }
      connections[index] = {
        hole,
        connector,
        fixedInstanceId: hole.instanceId,
        movingInstanceId: connector.instanceId,
      };
      processed.add(index);
      continue;
    }

    const holeSide = new Set(rigidSideMembers(hole.instanceId, nextGroups));
    const connectorSide = new Set(rigidSideMembers(connector.instanceId, nextGroups));
    const sidePairIndices = holePicks.flatMap((candidateHole, candidateIndex) => {
      if (processed.has(candidateIndex)) return [];
      const candidateConnector = connectorPicks[candidateIndex];
      const followsSameSides = (
        holeSide.has(candidateHole.instanceId)
        && connectorSide.has(candidateConnector.instanceId)
      ) || (
        connectorSide.has(candidateHole.instanceId)
        && holeSide.has(candidateConnector.instanceId)
      );
      return followsSameSides ? [candidateIndex] : [];
    });

    const direction = resolveAutomaticMateDirection(
      hole.instanceId,
      connector.instanceId,
      nextGroups,
      instanceVolumes,
    );
    if (sidePairIndices.length >= 2) {
      const fixedSide = holeSide.has(direction.fixedInstanceId) ? holeSide : connectorSide;
      const movingSide = holeSide.has(direction.movingInstanceId) ? holeSide : connectorSide;
      const movingAnchor = nextInstances.find(
        (instance) => instance.instanceId === direction.movingInstanceId,
      );
      if (!movingAnchor) throw new Error(`Pair ${index + 1} contains a part that is no longer available.`);

      const orderedFrames = sidePairIndices.map((pairIndex) => {
        const pairHole = holePicks[pairIndex];
        const pairConnector = connectorPicks[pairIndex];
        const holeIsFixed = fixedSide.has(pairHole.instanceId);
        const fixedPick = holeIsFixed ? pairHole : pairConnector;
        const movingPick = holeIsFixed ? pairConnector : pairHole;
        return {
          pairIndex,
          pairHole,
          pairConnector,
          fixedPick,
          movingPick,
          target: pickWorldFrame(nextInstances, fixedPick),
          source: pickFrameRelativeToAnchor(nextInstances, movingPick, movingAnchor),
        };
      });
      const movingObject = transformObject(movingAnchor);
      snapObjectByTwoMates(
        movingObject,
        orderedFrames[0].source,
        orderedFrames[1].source,
        orderedFrames[0].target,
        orderedFrames[1].target,
      );
      const transform = readTransform(movingObject);
      nextInstances = applyRigidGroupTransform(
        nextInstances,
        movingAnchor.instanceId,
        transform.position,
        transform.quaternion,
        [...movingSide],
      );
      orderedFrames.forEach(({ pairIndex, pairHole, pairConnector }) => {
        if (!orderedPairIsAligned(nextInstances, pairHole, pairConnector)) {
          throw new Error(`Pair ${pairIndex + 1} cannot align with the other selected pairs.`);
        }
        const holeIsFixed = fixedSide.has(pairHole.instanceId);
        connections[pairIndex] = {
          hole: pairHole,
          connector: pairConnector,
          fixedInstanceId: holeIsFixed ? pairHole.instanceId : pairConnector.instanceId,
          movingInstanceId: holeIsFixed ? pairConnector.instanceId : pairHole.instanceId,
        };
        processed.add(pairIndex);
      });
      nextGroups = mergeConnectedRigidGroups(
        nextGroups,
        direction.fixedInstanceId,
        direction.movingInstanceId,
      );
      continue;
    }

    const holeIsFixed = direction.fixedInstanceId === hole.instanceId;
    const fixedInstance = holeIsFixed ? holeInstance : connectorInstance;
    const movingInstance = holeIsFixed ? connectorInstance : holeInstance;
    const fixedPick = holeIsFixed ? hole : connector;
    const movingPick = holeIsFixed ? connector : hole;
    const movingGroup = nextGroups.find((group) => (
      group.instanceIds.includes(movingInstance.instanceId)
    ));
    const transform = applySingleLibraryMate(
      fixedInstance,
      movingInstance,
      fixedPick.connector,
      movingPick.connector,
    );

    nextInstances = applyRigidGroupTransform(
      nextInstances,
      movingInstance.instanceId,
      transform.position,
      transform.quaternion,
      movingGroup?.instanceIds ?? [movingInstance.instanceId],
    );
    nextGroups = mergeConnectedRigidGroups(
      nextGroups,
      fixedInstance.instanceId,
      movingInstance.instanceId,
    );
    connections[index] = {
      hole,
      connector,
      fixedInstanceId: fixedInstance.instanceId,
      movingInstanceId: movingInstance.instanceId,
    };
    processed.add(index);
  }

  return {
    instances: nextInstances,
    groups: nextGroups,
    connections: connections.filter(
      (connection): connection is OrderedLibraryMateConnection => Boolean(connection),
    ),
  };
}
