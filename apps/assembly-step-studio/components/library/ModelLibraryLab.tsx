'use client';

import Image from 'next/image';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import AssemblyAiPanel from '@/components/ai-design/AssemblyAiPanel';
import LibraryAssemblyCanvas, {
  type HoleMarkingShape,
  type LibraryConnectorPick,
  type LibraryMateMode,
  type LibraryPartInstance,
  type RotationPivot,
  type ShaftAdjustment,
} from '@/components/library/LibraryAssemblyCanvas';
import {
  buildGearDrivenClawPrototype,
  buildRectangularChassisPrototype,
} from '@/lib/ai-design/assemblyPrototype';
import {
  applyLibraryMateTransform,
  applyOrderedLibraryMates,
  applySingleLibraryMate,
  applyTwoHoleLibraryMate,
  inferUnifiedLibraryMate,
  type UnifiedLibraryMateMode,
} from '@/lib/mate/applyLibraryMate';
import {
  applyRigidGroupTransform,
  duplicateAssemblyGroup,
  expandCustomGroupMemberIds,
  findNextPartSpawnPosition,
  measureAssemblyInstanceVolumes,
  removeSelectedMembersFromGroups,
  resolvePivotRotationMemberIds,
  resolveAutomaticMateDirection,
  rotateInstanceAroundLocalAxis,
  rotateInstanceAroundLocalPivot,
  type RotationAxis,
} from '@/lib/mate/assemblyGroups';
import { createAssemblyGlbBlob, downloadAssemblyGlb } from '@/lib/partLibrary/exportAssembly';
import {
  comparePartsByName,
  normalizePartSearchText,
} from '@/lib/partLibrary/search';
import {
  createBuildInstructionsProject,
  listStudioProjects,
  loadStudioProject,
  saveStudioProject,
} from '@/lib/projects/projectStorage';
import {
  appendAssemblySnapshot,
  assemblySnapshotsEqual,
  undoAssemblySnapshot,
  type AssemblyUndoSnapshot,
} from '@/lib/projects/assemblyUndo';
import { refreshBuildInstructionsFromAssemblyRecord } from '@/lib/projects/projectRecords';
import type {
  AssemblyMateRecord,
  AssemblyRigidGroup,
  AssemblyWorkspaceData,
  CoverCapture,
} from '@/types/assembly';
import type { PartLibraryCatalog, PartLibraryItem } from '@/types/partLibrary';

const PART_COLORS = ['#356fe3', '#f47a32', '#7c3aed', '#0f9f76', '#db2777', '#d69e2e'];

function mateGuide(picks: LibraryConnectorPick[]): string {
  const pickCount = picks.length;
  if (pickCount === 0) return 'Select a hole, Pin ring, or Shaft end on the first part.';
  const firstLegIndex = picks.findIndex((pick) => pick.connector.kind === 'pin-ring');
  if (firstLegIndex >= 2) {
    const legCount = pickCount - firstLegIndex;
    return legCount < firstLegIndex
      ? `Select connector C${legCount + 1} for hole H${legCount + 1}.`
      : `${firstLegIndex} ordered pairs selected: H1↔C1 through H${firstLegIndex}↔C${firstLegIndex}.`;
  }
  if (picks.every((pick) => pick.connector.kind === 'hole')) {
    if (pickCount === 1) return 'Select hole 2 on the same part.';
    if (pickCount === 2 && picks[0].instanceId === picks[1].instanceId) {
      return 'Select hole 3 on the second part. It will align with hole 1.';
    }
    if (pickCount === 3) return 'Select hole 4 on the second part. It will align with hole 2.';
    if (pickCount === 4) return 'Two pairs selected: hole 1↔3 and hole 2↔4.';
    return `${pickCount} holes selected. Connect these two now, or select the first matching Pin leg.`;
  }
  return 'Select a compatible point on a different part.';
}

function connectorWorldPosition(
  transform: { position: [number, number, number]; quaternion: [number, number, number, number] },
  pick: LibraryConnectorPick,
): THREE.Vector3 {
  return new THREE.Vector3(...pick.connector.position)
    .applyQuaternion(new THREE.Quaternion(...transform.quaternion))
    .add(new THREE.Vector3(...transform.position));
}

export default function ModelLibraryLab({
  projectId,
  onBack,
  onBuildInstructionsCreated,
}: {
  projectId: string;
  onBack: () => void;
  onBuildInstructionsCreated: (projectId: string) => void;
}) {
  const [catalog, setCatalog] = useState<PartLibraryCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [assemblyName, setAssemblyName] = useState('New Assembly');
  const [instances, setInstances] = useState<LibraryPartInstance[]>([]);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate');
  const [rotationAxis, setRotationAxis] = useState<RotationAxis>('z');
  const [rotationDegrees, setRotationDegrees] = useState('90');
  const [rotationPivots, setRotationPivots] = useState<Record<string, RotationPivot>>({});
  const [mateMode, setMateMode] = useState<LibraryMateMode | null>(null);
  const [holeMarkingInstanceId, setHoleMarkingInstanceId] = useState<string | null>(null);
  const [holeMarkingShape, setHoleMarkingShape] = useState<HoleMarkingShape | null>(null);
  const [holeMarkingStatus, setHoleMarkingStatus] = useState<{ message: string; error: boolean } | null>(null);
  const [connectorPicks, setConnectorPicks] = useState<LibraryConnectorPick[]>([]);
  const [mateError, setMateError] = useState<string | null>(null);
  const [mateRecords, setMateRecords] = useState<AssemblyMateRecord[]>([]);
  const [groups, setGroups] = useState<AssemblyRigidGroup[]>([]);
  const [shaftAdjustment, setShaftAdjustment] = useState<ShaftAdjustment | null>(null);
  const [assemblyRoot, setAssemblyRoot] = useState<THREE.Group | null>(null);
  const viewportCenterRef = useRef<[number, number, number]>([0, 0, 0]);
  const [assemblyReady, setAssemblyReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const handleRotationPivotChange = useCallback((instanceId: string, pivot: RotationPivot | null) => {
    setRotationPivots((current) => {
      if (pivot) return { ...current, [instanceId]: pivot };
      if (!current[instanceId]) return current;
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);
  const [coverCaptureRequest, setCoverCaptureRequest] = useState(0);
  const [coverStatus, setCoverStatus] = useState<'idle' | 'capturing' | 'saved'>('idle');
  const [undoAvailable, setUndoAvailable] = useState(false);
  const projectLoadedRef = useRef(false);
  const undoHistoryRef = useRef<AssemblyUndoSnapshot[]>([]);
  const undoTimerRef = useRef<number | null>(null);
  const suppressUndoRecordingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    projectLoadedRef.current = false;
    undoHistoryRef.current = [];
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    void loadStudioProject(projectId).then((record) => {
      if (cancelled) return;
      const loadedInstances = record?.projectType === 'assembly'
        ? record.assemblyData?.instances ?? []
        : [];
      const loadedMateRecords = record?.projectType === 'assembly'
        ? record.assemblyData?.mateRecords ?? []
        : [];
      const loadedGroups = record?.projectType === 'assembly'
        ? record.assemblyData?.groups ?? []
        : [];
      undoHistoryRef.current = appendAssemblySnapshot([], {
        instances: loadedInstances,
        mateRecords: loadedMateRecords,
        groups: loadedGroups,
      });
      suppressUndoRecordingRef.current = true;
      projectLoadedRef.current = true;
      if (record?.projectType === 'assembly') {
        setAssemblyName(record.name);
      }
      setInstances(loadedInstances);
      setMateRecords(loadedMateRecords);
      setGroups(loadedGroups);
      setUndoAvailable(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectLoadedRef.current) return;
    const snapshot = { instances, mateRecords, groups };
    if (suppressUndoRecordingRef.current) {
      suppressUndoRecordingRef.current = false;
      setUndoAvailable(undoHistoryRef.current.length > 1);
      return;
    }
    if (undoHistoryRef.current.length === 0) {
      undoHistoryRef.current = appendAssemblySnapshot([], snapshot);
      setUndoAvailable(false);
      return;
    }

    const latest = undoHistoryRef.current.at(-1)!;
    setUndoAvailable(
      undoHistoryRef.current.length > 1 || !assemblySnapshotsEqual(latest, snapshot),
    );
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => {
      undoHistoryRef.current = appendAssemblySnapshot(undoHistoryRef.current, snapshot);
      setUndoAvailable(undoHistoryRef.current.length > 1);
      undoTimerRef.current = null;
    }, 300);
    return () => {
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
  }, [groups, instances, mateRecords]);

  useEffect(() => {
    void fetch('/part-library/catalog.json')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load catalog: ${response.status}`);
        return response.json() as Promise<PartLibraryCatalog>;
      })
      .then(setCatalog)
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to load the model library.');
      });
  }, []);

  const filteredParts = useMemo(() => {
    if (!catalog) return [];
    const normalizedQuery = normalizePartSearchText(query);
    return catalog.parts.filter((part) => {
      const categoryMatches = category === 'All' || part.category === category;
      const queryMatches = !normalizedQuery
        || normalizePartSearchText(part.name).includes(normalizedQuery)
        || normalizePartSearchText(part.partNumber).includes(normalizedQuery);
      return categoryMatches && queryMatches;
    }).sort(comparePartsByName);
  }, [catalog, category, query]);

  const selectedInstanceId = selectedInstanceIds.at(-1) ?? null;
  const selectedInstance = instances.find((instance) => instance.instanceId === selectedInstanceId) ?? null;
  const selectedRotationPivot = selectedInstanceId ? rotationPivots[selectedInstanceId] ?? null : null;
  const selectedGroups = groups.filter((group) => (
    group.instanceIds.some((instanceId) => selectedInstanceIds.includes(instanceId))
  ));
  const selectedGroup = selectedGroups.find((group) => (
    selectedInstanceId ? group.instanceIds.includes(selectedInstanceId) : false
  )) ?? selectedGroups[0] ?? null;
  const groupCandidateIds = expandCustomGroupMemberIds(selectedInstanceIds, groups);
  const selectedGroupedMemberCount = selectedInstanceIds.filter((instanceId) => (
    groups.some((group) => group.instanceIds.includes(instanceId))
  )).length;

  const handleCanvasSelect = (instanceId: string, additive: boolean) => {
    setSelectedInstanceIds((current) => {
      if (!additive) return [instanceId];
      return current.includes(instanceId)
        ? current.filter((selectedId) => selectedId !== instanceId)
        : [...current, instanceId];
    });
  };

  const handleLassoSelect = (instanceIds: string[]) => {
    setSelectedInstanceIds((current) => [...new Set([...current, ...instanceIds])]);
  };

  const addPart = (part: PartLibraryItem) => {
    const instanceId = crypto.randomUUID();
    const index = instances.length;
    const next: LibraryPartInstance = {
      instanceId,
      part,
      color: PART_COLORS[index % PART_COLORS.length],
      position: viewportCenterRef.current,
      quaternion: [0, 0, 0, 1],
    };
    setAssemblyReady(false);
    setInstances((current) => [...current, next]);
    setSelectedInstanceIds([instanceId]);
  };

  const removeSelected = () => {
    if (!selectedInstanceId) return;
    setInstances((current) => current.filter((instance) => instance.instanceId !== selectedInstanceId));
    setMateRecords((current) => current.filter(
      (mate) => mate.fixedInstanceId !== selectedInstanceId && mate.movingInstanceId !== selectedInstanceId,
    ));
    setGroups((current) => current
      .map((group) => ({
        ...group,
        instanceIds: group.instanceIds.filter((instanceId) => instanceId !== selectedInstanceId),
      }))
      .filter((group) => group.instanceIds.length >= 2));
    setConnectorPicks([]);
    setMateMode(null);
    if (holeMarkingInstanceId === selectedInstanceId) {
      setHoleMarkingInstanceId(null);
      setHoleMarkingShape(null);
    }
    if (shaftAdjustment?.instanceId === selectedInstanceId) setShaftAdjustment(null);
    setSelectedInstanceIds((current) => current.filter((instanceId) => instanceId !== selectedInstanceId));
  };

  const clearAssembly = () => {
    setInstances([]);
    setMateRecords([]);
    setGroups([]);
    setConnectorPicks([]);
    setMateMode(null);
    setHoleMarkingInstanceId(null);
    setHoleMarkingShape(null);
    setHoleMarkingStatus(null);
    setShaftAdjustment(null);
    setSelectedInstanceIds([]);
    setAssemblyReady(false);
  };

  const updateInstanceTransform = (
    instanceId: string,
    position: [number, number, number],
    quaternion: [number, number, number, number],
    pivotRotation = false,
  ) => {
    const rigidGroup = groups.find((group) => group.instanceIds.includes(instanceId));
    const isShaftFineAdjustment = shaftAdjustment?.instanceId === instanceId;
    const rotationPivot = pivotRotation ? rotationPivots[instanceId] : null;
    const pivotMemberIds = rotationPivot
      ? resolvePivotRotationMemberIds(
        instanceId,
        rotationPivot.connectorIds,
        mateRecords,
      )
      : null;
    setInstances((current) => applyRigidGroupTransform(
      current,
      instanceId,
      position,
      quaternion,
      isShaftFineAdjustment
        ? [instanceId]
        : pivotMemberIds ?? rigidGroup?.instanceIds ?? [instanceId],
    ));
  };

  const rotateSelectionBy = (direction: 1 | -1) => {
    if (!selectedInstance) return;
    const degrees = Number(rotationDegrees);
    if (!Number.isFinite(degrees) || degrees <= 0) return;
    const rotated = selectedRotationPivot
      ? rotateInstanceAroundLocalPivot(
        selectedInstance,
        selectedRotationPivot.position,
        selectedRotationPivot.axis,
        degrees * direction,
      )
      : rotateInstanceAroundLocalAxis(
        selectedInstance,
        rotationAxis,
        degrees * direction,
      );
    updateInstanceTransform(
      selectedInstance.instanceId,
      rotated.position,
      rotated.quaternion,
      Boolean(selectedRotationPivot),
    );
  };

  const makeOrUpdateGroup = () => {
    if (selectedInstanceIds.length < 2 || groupCandidateIds.length < 2) return;
    const memberIds = new Set(groupCandidateIds);
    const overlappingGroups = groups.filter((group) => (
      group.instanceIds.some((instanceId) => memberIds.has(instanceId))
    ));
    const retainedGroup = selectedGroup ?? overlappingGroups[0] ?? null;
    const nextGroupNumber = groups.reduce((largest, group) => {
      const match = group.name.match(/^Group (\d+)$/);
      return Math.max(largest, Number(match?.[1] ?? 0));
    }, 0) + 1;
    const nextGroup: AssemblyRigidGroup = {
      id: retainedGroup?.id ?? crypto.randomUUID(),
      name: retainedGroup?.name ?? `Group ${nextGroupNumber}`,
      instanceIds: groupCandidateIds,
      createdAt: retainedGroup?.createdAt ?? new Date().toISOString(),
    };
    const replacedIds = new Set(overlappingGroups.map((group) => group.id));
    setGroups((current) => [
      ...current.filter((group) => !replacedIds.has(group.id)),
      nextGroup,
    ]);
    setSelectedInstanceIds(nextGroup.instanceIds);
  };

  const removeSelectionFromGroups = () => {
    if (selectedGroupedMemberCount === 0) return;
    setGroups((current) => removeSelectedMembersFromGroups(current, selectedInstanceIds));
  };

  const ungroupSelectedGroup = () => {
    if (!selectedGroup) return;
    setGroups((current) => removeSelectedMembersFromGroups(current, selectedGroup.instanceIds));
  };

  const copySelectedGroup = () => {
    if (!selectedGroup) return;
    try {
      const copied = duplicateAssemblyGroup({
        instances,
        mateRecords,
        group: selectedGroup,
        anchorPosition: findNextPartSpawnPosition(assemblyRoot),
        createId: () => crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
      setAssemblyReady(false);
      setInstances((current) => [...current, ...copied.instances]);
      setMateRecords((current) => [...current, ...copied.mateRecords]);
      setGroups((current) => [...current, copied.group]);
      setSelectedInstanceIds(copied.group.instanceIds);
      setConnectorPicks([]);
      setMateMode(null);
      setShaftAdjustment(null);
    } catch (error: unknown) {
      setMateError(error instanceof Error ? error.message : 'Unable to copy this group.');
    }
  };

  const startTransformMode = (nextMode: 'translate' | 'rotate') => {
    setMode(nextMode);
    setMateMode(null);
    setHoleMarkingInstanceId(null);
    setHoleMarkingShape(null);
    setHoleMarkingStatus(null);
    setConnectorPicks([]);
    setMateError(null);
    setShaftAdjustment(null);
  };

  const startConnectMode = () => {
    setMateMode('connect');
    setHoleMarkingInstanceId(null);
    setHoleMarkingShape(null);
    setHoleMarkingStatus(null);
    setConnectorPicks([]);
    setMateError(null);
    setShaftAdjustment(null);
  };

  const startHoleMarking = (shape: HoleMarkingShape) => {
    if (!selectedInstance) return;
    setMateMode(null);
    setConnectorPicks([]);
    setMateError(null);
    setShaftAdjustment(null);
    setHoleMarkingInstanceId(selectedInstance.instanceId);
    setHoleMarkingShape(shape);
    setHoleMarkingStatus({
      message: shape === 'square'
        ? 'Click one flat inside wall of a square hole. Each click is saved automatically.'
        : 'Click the curved inside wall of a round hole. Each click is saved automatically.',
      error: false,
    });
  };

  const handleHoleMarkingResult = (result: {
    partName: string;
    holeCount: number;
    removed: boolean;
    error?: string;
  }) => {
    setHoleMarkingStatus(result.error
      ? { message: result.error, error: true }
      : {
          message: result.removed
            ? `Hole removed. ${result.holeCount} manually marked holes remain.`
            : `Saved. ${result.holeCount} holes are now manually marked for ${result.partName}.`,
          error: false,
        });
  };

  const connectPickedParts = (nextMode: UnifiedLibraryMateMode, picks: LibraryConnectorPick[]) => {
    const multiLegFixedCount = nextMode === 'multi-leg'
      ? picks.findIndex((pick) => pick.connector.kind === 'pin-ring')
      : 0;
    const isTwoPairHoleAlignment = nextMode === 'hole-align' && picks.length === 4;
    const secondSideIndex = nextMode === 'multi-leg'
      ? multiLegFixedCount
      : isTwoPairHoleAlignment ? 2 : 1;
    const firstSidePicks = picks.slice(0, secondSideIndex);
    const secondSidePicks = picks.slice(secondSideIndex);
    if (nextMode === 'multi-leg') {
      const holePartIds = new Set(firstSidePicks.map((pick) => pick.instanceId));
      const connectorPartIds = new Set(secondSidePicks.map((pick) => pick.instanceId));
      const isOriginalTwoPartConnection = holePartIds.size === 1 && connectorPartIds.size === 1;
      if (!isOriginalTwoPartConnection) {
        try {
          const result = applyOrderedLibraryMates({
            instances,
            groups,
            holePicks: firstSidePicks,
            connectorPicks: secondSidePicks,
            instanceVolumes: assemblyRoot ? measureAssemblyInstanceVolumes(assemblyRoot) : {},
          });
          const createdAt = new Date().toISOString();
          setInstances(result.instances);
          setGroups(result.groups);
          setMateRecords((current) => [
            ...current,
            ...result.connections.map((connection) => {
              const holeIsFixed = connection.fixedInstanceId === connection.hole.instanceId;
              return {
                id: crypto.randomUUID(),
                type: 'multi-leg' as const,
                fixedInstanceId: connection.fixedInstanceId,
                movingInstanceId: connection.movingInstanceId,
                fixedConnectorIds: [
                  holeIsFixed ? connection.hole.connector.id : connection.connector.connector.id,
                ],
                movingConnectorIds: [
                  holeIsFixed ? connection.connector.connector.id : connection.hole.connector.id,
                ],
                createdAt,
              };
            }),
          ]);
          setSelectedInstanceIds([secondSidePicks.at(-1)?.instanceId ?? firstSidePicks.at(-1)!.instanceId]);
          setConnectorPicks([]);
          setMateMode(null);
          setMateError(null);
          setShaftAdjustment(null);
        } catch (error: unknown) {
          setMateError(error instanceof Error ? error.message : 'Unable to connect the ordered pairs.');
        }
        return;
      }
    }
    const firstInstance = instances.find((instance) => instance.instanceId === firstSidePicks[0]?.instanceId);
    const secondInstance = instances.find((instance) => instance.instanceId === secondSidePicks[0]?.instanceId);
    if (!firstInstance || !secondInstance) {
      setMateError('The selected parts are no longer available.');
      return;
    }

    try {
      const sharedGroup = groups.find((group) => (
        group.instanceIds.includes(firstInstance.instanceId)
        && group.instanceIds.includes(secondInstance.instanceId)
      ));
      if (sharedGroup) throw new Error('These parts are already in the same group.');

      const direction = resolveAutomaticMateDirection(
        firstInstance.instanceId,
        secondInstance.instanceId,
        groups,
        assemblyRoot ? measureAssemblyInstanceVolumes(assemblyRoot) : {},
      );
      const firstSideIsFixed = direction.fixedInstanceId === firstInstance.instanceId;
      const fixedInstance = firstSideIsFixed ? firstInstance : secondInstance;
      const movingInstance = firstSideIsFixed ? secondInstance : firstInstance;
      const fixedPicks = firstSideIsFixed ? firstSidePicks : secondSidePicks;
      const movingPicks = firstSideIsFixed ? secondSidePicks : firstSidePicks;
      const transform = nextMode === 'multi-leg' || isTwoPairHoleAlignment
          ? applyTwoHoleLibraryMate(
              fixedInstance,
              movingInstance,
              fixedPicks[0].connector,
              fixedPicks[1].connector,
              movingPicks[0].connector,
              movingPicks[1].connector,
            )
        : applySingleLibraryMate(
            fixedInstance,
            movingInstance,
            fixedPicks[0].connector,
            movingPicks[0].connector,
            {
              centerFixedConnector: nextMode === 'shaft',
              centerMovingConnector: nextMode === 'shaft',
            },
          );

      if (nextMode === 'multi-leg' || isTwoPairHoleAlignment) {
        for (let index = 0; index < fixedPicks.length; index += 1) {
          const fixedPosition = connectorWorldPosition(fixedInstance, fixedPicks[index]);
          const movingPosition = connectorWorldPosition(transform, movingPicks[index]);
          if (fixedPosition.distanceTo(movingPosition) > 0.15) {
            throw new Error(isTwoPairHoleAlignment
              ? 'The two hole pairs cannot align together. Check that holes 1↔3 and 2↔4 have the same spacing.'
              : 'The selected hole and leg order does not match. Select each leg in the same order as its hole.');
          }
        }
      }

      const connectedAssembly = applyLibraryMateTransform({
        instances,
        groups,
        fixedInstanceId: fixedInstance.instanceId,
        movingInstanceId: movingInstance.instanceId,
        transform,
      });
      setInstances(connectedAssembly.instances);
      setGroups(connectedAssembly.groups);
      setMateRecords((current) => [...current, {
        id: crypto.randomUUID(),
        type: nextMode,
        fixedInstanceId: fixedInstance.instanceId,
        movingInstanceId: movingInstance.instanceId,
        fixedConnectorIds: fixedPicks.map((pick) => pick.connector.id),
        movingConnectorIds: movingPicks.map((pick) => pick.connector.id),
        createdAt: new Date().toISOString(),
      }]);
      const shaftPick = nextMode === 'shaft'
        ? picks.find((pick) => pick.connector.kind === 'shaft-end')
        : undefined;
      setSelectedInstanceIds([shaftPick?.instanceId ?? movingInstance.instanceId]);
      setConnectorPicks([]);
      setMateMode(null);
      setMateError(null);
      setShaftAdjustment(nextMode === 'shaft' && shaftPick
        ? { instanceId: shaftPick.instanceId, axis: shaftPick.connector.axis }
        : null);
    } catch (error: unknown) {
      setMateError(error instanceof Error ? error.message : 'Unable to connect these parts.');
    }
  };

  const handleConnectorPick = (pick: LibraryConnectorPick) => {
    if (mateMode !== 'connect') return;
    setMateError(null);

    const selectedIndex = connectorPicks.findIndex(
      (selected) => selected.instanceId === pick.instanceId
        && selected.connector.id === pick.connector.id,
    );
    if (selectedIndex >= 0) {
      setConnectorPicks(connectorPicks.slice(0, selectedIndex));
      return;
    }

    const nextPicks = [...connectorPicks, pick];
    const inferred = inferUnifiedLibraryMate(nextPicks);
    if (inferred.status === 'invalid') {
      setMateError(inferred.message);
      return;
    }
    if (inferred.status === 'ready' && inferred.autoConnect) {
      connectPickedParts(inferred.mode, nextPicks);
      return;
    }
    setConnectorPicks(nextPicks);
  };

  const exportAssembly = async () => {
    if (!assemblyRoot || !assemblyReady) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadAssemblyGlb(assemblyRoot, assemblyName);
    } catch (error: unknown) {
      setExportError(error instanceof Error ? error.message : 'Unable to export this assembly.');
    } finally {
      setExporting(false);
    }
  };

  const syncLinkedBuildInstructions = async (source: NonNullable<Awaited<ReturnType<typeof loadStudioProject>>>) => {
    const linkedProjects = (await listStudioProjects()).filter((project) => (
      project.projectType === 'build-instructions'
      && project.sourceAssemblyProjectId === source.id
    ));
    await Promise.all(linkedProjects.map(async (summary) => {
      const project = await loadStudioProject(summary.id);
      if (project) {
        await saveStudioProject(refreshBuildInstructionsFromAssemblyRecord(project, source));
      }
    }));
  };

  const saveAssembly = async () => {
    const record = await loadStudioProject(projectId);
    if (!record || record.projectType !== 'assembly') return null;
    setSaving(true);
    try {
      const saved = await saveStudioProject({
        ...record,
        name: assemblyName.trim() || 'Untitled Assembly',
        updatedAt: new Date().toISOString(),
        assemblyData: { instances, mateRecords, groups },
      });
      await syncLinkedBuildInstructions(saved);
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 1800);
      return saved;
    } finally {
      setSaving(false);
    }
  };

  const captureCover = () => {
    if (!assemblyReady) return;
    setExportError(null);
    setCoverStatus('capturing');
    setCoverCaptureRequest((current) => current + 1);
  };

  const handleCoverCaptured = useCallback(async ({ blob, camera }: CoverCapture) => {
    try {
      const record = await loadStudioProject(projectId);
      if (!record || record.projectType !== 'assembly') {
        throw new Error('Unable to save a cover for this Assembly Project.');
      }
      const updatedAt = new Date().toISOString();
      const saved = await saveStudioProject({
        ...record,
        name: assemblyName.trim() || 'Untitled Assembly',
        updatedAt,
        assemblyData: { instances, mateRecords, groups },
        coverAsset: {
          blob,
          camera,
          type: blob.type || 'image/webp',
          updatedAt,
        },
      });
      await syncLinkedBuildInstructions(saved);
      setSaveStatus('saved');
      setCoverStatus('saved');
      window.setTimeout(() => {
        setSaveStatus('idle');
        setCoverStatus('idle');
      }, 1800);
    } catch (error: unknown) {
      setCoverStatus('idle');
      setExportError(error instanceof Error ? error.message : 'Unable to save the model cover.');
    }
  }, [assemblyName, groups, instances, mateRecords, projectId]);

  const handleCoverCaptureError = useCallback((message: string) => {
    setCoverStatus('idle');
    setExportError(message);
  }, []);

  const startBuildInstructions = async () => {
    if (!assemblyRoot || !assemblyReady) return;
    setExporting(true);
    setExportError(null);
    try {
      const source = await saveAssembly();
      if (!source) throw new Error('Unable to save this Assembly Project.');
      const modelBlob = await createAssemblyGlbBlob(assemblyRoot);
      const instructions = await createBuildInstructionsProject(source, modelBlob);
      onBuildInstructionsCreated(instructions.id);
    } catch (error: unknown) {
      setExportError(error instanceof Error ? error.message : 'Unable to start Build Instructions.');
    } finally {
      setExporting(false);
    }
  };

  const inferredConnection = inferUnifiedLibraryMate(connectorPicks);
  const canConnect = inferredConnection.status === 'ready';

  const undoLastAssemblyChange = () => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    const result = undoAssemblySnapshot(
      undoHistoryRef.current,
      { instances, mateRecords, groups },
    );
    if (!result) return;
    suppressUndoRecordingRef.current = true;
    undoHistoryRef.current = result.history;
    setInstances(result.snapshot.instances);
    setMateRecords(result.snapshot.mateRecords);
    setGroups(result.snapshot.groups);
    setSelectedInstanceIds([]);
    setConnectorPicks([]);
    setMateMode(null);
    setHoleMarkingInstanceId(null);
    setHoleMarkingShape(null);
    setShaftAdjustment(null);
    setUndoAvailable(result.history.length > 1);
  };

  const applyAiWorkspace = (workspace: AssemblyWorkspaceData) => {
    setAssemblyReady(false);
    setInstances(workspace.instances);
    setMateRecords(workspace.mateRecords);
    // AI output stays unlocked so every part can be manually fine-tuned.
    // Mate records preserve the intended connections; teachers can Make Group when needed.
    setGroups([]);
    setSelectedInstanceIds([]);
    setConnectorPicks([]);
    setMateMode(null);
    setHoleMarkingInstanceId(null);
    setHoleMarkingShape(null);
    setShaftAdjustment(null);
    setMateError(null);
    setExportError(null);
    setSaveStatus('idle');
  };

  const applyAiRectangularChassis = () => {
    if (!catalog) return;
    applyAiWorkspace(buildRectangularChassisPrototype(catalog));
  };

  const applyAiGearDrivenClaw = () => {
    if (!catalog) return;
    applyAiWorkspace(buildGearDrivenClawPrototype(catalog));
  };

  useEffect(() => {
    const handleUndoShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' || event.shiftKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) return;
      event.preventDefault();
      undoLastAssemblyChange();
    };
    window.addEventListener('keydown', handleUndoShortcut);
    return () => window.removeEventListener('keydown', handleUndoShortcut);
  });

  return (
    <main className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-white text-slate-900">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5">
        <div className="flex min-w-0 items-center gap-4">
          <button onClick={onBack} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Back</button>
          <div className="shrink-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">RoBoGo Assembly</p>
            <h1 className="text-lg font-bold">Build a Model</h1>
          </div>
          <input
            value={assemblyName}
            onChange={(event) => setAssemblyName(event.target.value)}
            aria-label="Assembly name"
            className="min-w-40 max-w-72 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-400 focus:bg-white"
          />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm font-semibold text-slate-500">{instances.length} parts · {mateRecords.length} connections · {groups.length} groups</span>
          <button
            disabled={!undoAvailable}
            onClick={undoLastAssemblyChange}
            title="Undo last assembly change (⌘Z / Ctrl+Z)"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >Undo</button>
          <button
            disabled={saving}
            onClick={() => void saveAssembly()}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save Project'}
          </button>
          <button
            disabled={!assemblyReady || exporting}
            onClick={() => void exportAssembly()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {exporting ? 'Exporting...' : 'Export GLB'}
          </button>
          <button
            disabled={!assemblyReady || coverStatus === 'capturing'}
            onClick={captureCover}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            {coverStatus === 'capturing' ? 'Capturing...' : coverStatus === 'saved' ? 'Cover Saved' : 'Set Cover'}
          </button>
          <button
            disabled={!assemblyReady || exporting}
            onClick={() => void startBuildInstructions()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Start Build Instructions
          </button>
        </div>
      </header>

      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-5">
        <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-400">Adjust</span>
        <button onClick={() => startTransformMode('translate')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${!mateMode && mode === 'translate' && !shaftAdjustment ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white hover:bg-slate-100'}`}>Move</button>
        <button onClick={() => startTransformMode('rotate')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${!mateMode && mode === 'rotate' && !shaftAdjustment ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white hover:bg-slate-100'}`}>Rotate</button>
        <div className="mx-2 h-7 w-px bg-slate-200" />
        <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-400">Connect</span>
        <button onClick={startConnectMode} className={`rounded-xl px-4 py-2 text-sm font-semibold ${mateMode === 'connect' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white hover:bg-blue-50'}`}>Connect Parts</button>
        <div className="mx-2 h-7 w-px bg-slate-200" />
        <button
          disabled={!selectedInstance}
          onClick={() => startHoleMarking('round')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${holeMarkingInstanceId && holeMarkingShape === 'round' ? 'bg-blue-600 text-white' : 'border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40'}`}
        >Mark Round</button>
        <button
          disabled={!selectedInstance}
          onClick={() => startHoleMarking('square')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${holeMarkingInstanceId && holeMarkingShape === 'square' ? 'bg-purple-600 text-white' : 'border border-purple-200 bg-white text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40'}`}
        >Mark Square</button>
        <div className="ml-auto flex items-center gap-2">
          <span className="max-w-56 truncate text-xs font-semibold text-slate-500">
            {selectedInstanceIds.length > 1
              ? `${selectedInstanceIds.length} parts selected`
              : selectedGroup
              ? `${selectedGroup.name} · ${selectedGroup.instanceIds.length} parts`
              : selectedInstance?.part.name ?? 'No part selected'}
          </span>
          <button disabled={!selectedInstance} onClick={removeSelected} className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">Remove</button>
          <button onClick={clearAssembly} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-100">Clear</button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[410px] shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or part number — use * for ×"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
            <div className="mt-3 flex max-h-28 min-h-24 flex-wrap content-start gap-2 overflow-y-auto py-1">
              {['All', ...(catalog?.categories ?? [])].map((item) => (
                <button
                  key={item}
                  onClick={() => setCategory(item)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${category === item ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >{item}</button>
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-400">
              {catalog ? `${filteredParts.length} of ${catalog.total} parts` : 'Loading catalog...'}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loadError && <div className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-600">{loadError}</div>}
            <div className="grid grid-cols-2 gap-3">
              {filteredParts.map((part) => (
                <article key={part.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
                  <div className="relative aspect-square bg-slate-50">
                    {part.thumbnailUrl ? (
                      <Image src={part.thumbnailUrl} alt={part.name} fill sizes="180px" className="object-contain" unoptimized />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-400">No preview</div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-2 min-h-10 text-sm font-bold leading-5">{part.name}</h3>
                    <p className="mt-1 truncate text-xs text-slate-400">{part.partNumber || 'No part number'}</p>
                    <button onClick={() => addPart(part)} className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Add to canvas</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </aside>

        <section className="relative min-w-0 flex-1">
          {!mateMode && !holeMarkingInstanceId && selectedInstanceIds.length > 0 && (
            <div className="absolute bottom-4 right-4 z-20 w-64 rounded-2xl border border-emerald-200 bg-white/95 p-4 shadow-xl backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Custom Group</p>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {selectedInstanceIds.length} {selectedInstanceIds.length === 1 ? 'part' : 'parts'} selected
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {selectedGroup
                  ? `${selectedGroup.name} currently has ${selectedGroup.instanceIds.length} parts.`
                  : selectedInstanceIds.length === 1
                    ? 'This part is not grouped. Use the arrows on the model to move it.'
                    : 'Select at least two parts to make a rigid group.'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  disabled={selectedInstanceIds.length < 2 || groupCandidateIds.length < 2}
                  onClick={makeOrUpdateGroup}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >Make Group</button>
                <button
                  disabled={!selectedGroup}
                  onClick={copySelectedGroup}
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                >Copy Group</button>
                <button
                  disabled={!selectedGroup}
                  onClick={ungroupSelectedGroup}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                >Ungroup</button>
                <button
                  disabled={selectedGroupedMemberCount === 0}
                  onClick={removeSelectionFromGroups}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                >Remove Members</button>
              </div>
            </div>
          )}
          {!mateMode && !holeMarkingInstanceId && !shaftAdjustment && mode === 'rotate' && selectedInstance && (
            <div className="absolute left-4 top-4 z-20 w-72 rounded-2xl border border-indigo-200 bg-white/95 p-4 shadow-xl backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Precise Rotation</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-900">
                {selectedGroup ? `${selectedGroup.name} · around selected part` : selectedInstance.part.name}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {selectedRotationPivot
                  ? `Gear pivot: square shaft hole · ${selectedRotationPivot.axis.toUpperCase()} axis`
                  : 'Choose a local axis and enter the rotation angle.'}
              </p>
              {!selectedRotationPivot && <div className="mt-3 grid grid-cols-3 gap-2">
                {(['x', 'y', 'z'] as RotationAxis[]).map((axis) => (
                  <button
                    key={axis}
                    onClick={() => setRotationAxis(axis)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold uppercase ${rotationAxis === axis ? 'bg-indigo-600 text-white' : 'border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'}`}
                  >{axis} Axis</button>
                ))}
              </div>}
              <label className="mt-3 block text-xs font-semibold text-slate-600">
                Angle in degrees
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={rotationDegrees}
                  onChange={(event) => setRotationDegrees(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold outline-none focus:border-indigo-400 focus:bg-white"
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  disabled={!Number.isFinite(Number(rotationDegrees)) || Number(rotationDegrees) <= 0}
                  onClick={() => rotateSelectionBy(-1)}
                  className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
                >−{rotationDegrees || '0'}°</button>
                <button
                  disabled={!Number.isFinite(Number(rotationDegrees)) || Number(rotationDegrees) <= 0}
                  onClick={() => rotateSelectionBy(1)}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >+{rotationDegrees || '0'}°</button>
              </div>
            </div>
          )}
          {!mateMode && !holeMarkingInstanceId && instances.length > 0 && (
            <div className="pointer-events-none absolute bottom-4 left-4 z-20 rounded-xl border border-emerald-200 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur">
              ⌘ Click to add or remove one part · ⌘ Drag to box-select · Green boxes show your selection
            </div>
          )}
          {instances.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="rounded-3xl border border-slate-200 bg-white/90 px-8 py-6 text-center shadow-xl backdrop-blur">
                <p className="text-lg font-bold">Choose parts from the library</p>
                <p className="mt-2 text-sm text-slate-500">Assemble them here, then export one GLB for the disassembly editor.</p>
              </div>
            </div>
          )}

          {mateMode && (
            <div className="absolute left-4 top-4 z-20 w-80 rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-xl backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Connect Parts</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{mateGuide(connectorPicks)}</p>
                </div>
                <button onClick={() => { setMateMode(null); setConnectorPicks([]); setMateError(null); }} className="text-xs font-bold text-slate-400 hover:text-slate-700">Cancel</button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Blue = round hole · Purple = square hole · Orange = Pin ring · Yellow = Shaft/Idler end</p>
              {mateError && <p className="mt-3 rounded-xl bg-red-50 p-2 text-xs font-semibold text-red-600">{mateError}</p>}
              {canConnect && (
                <button
                  onClick={() => {
                    if (inferredConnection.status === 'ready') {
                      connectPickedParts(inferredConnection.mode, connectorPicks);
                    }
                  }}
                  className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {inferredConnection.status === 'ready' && inferredConnection.mode === 'beam'
                    ? 'Align and Stack'
                    : inferredConnection.status === 'ready'
                      && inferredConnection.mode === 'hole-align'
                      && connectorPicks.length === 4
                      ? 'Align 2 Hole Pairs and Group'
                      : 'Connect Selected Points'}
                </button>
              )}
            </div>
          )}

          {holeMarkingInstanceId && (
            <div className="absolute left-4 top-4 z-20 w-80 rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-xl backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wider ${holeMarkingShape === 'square' ? 'text-purple-600' : 'text-blue-600'}`}>
                    {holeMarkingShape === 'square' ? 'Mark Square Holes' : 'Mark Round Holes'}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{selectedInstance?.part.name}</p>
                </div>
                <button
                  onClick={() => { setHoleMarkingInstanceId(null); setHoleMarkingShape(null); setHoleMarkingStatus(null); }}
                  className="text-xs font-bold text-slate-400 hover:text-slate-700"
                >Done</button>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                {holeMarkingShape === 'square'
                  ? 'Click one flat inside wall of each square hole. Purple squares confirm saved holes. Click the same hole again to remove its mark.'
                  : 'Click the curved inside wall of each round hole. Blue rings confirm saved holes. Click the same hole again to remove its mark.'}
              </p>
              {holeMarkingStatus && (
                <p className={`mt-3 rounded-xl p-2 text-xs font-semibold ${holeMarkingStatus.error ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                  {holeMarkingStatus.message}
                </p>
              )}
            </div>
          )}

          {shaftAdjustment && !mateMode && selectedInstanceId === shaftAdjustment.instanceId && (
            <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 text-sm shadow-lg">
              <p className="font-bold text-emerald-700">Shaft centered</p>
              <p className="mt-1 text-xs text-slate-500">Use the single arrow to push or pull it. Select another part to hide the arrow.</p>
            </div>
          )}

          {exportError && (
            <div className="absolute right-4 top-4 z-20 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 shadow-lg">{exportError}</div>
          )}

          <LibraryAssemblyCanvas
            instances={instances}
            selectedInstanceId={selectedInstanceId}
            selectedInstanceIds={selectedInstanceIds}
            mode={mode}
            mateMode={mateMode}
            holeMarkingInstanceId={holeMarkingInstanceId}
            holeMarkingShape={holeMarkingShape}
            connectorPicks={connectorPicks}
            shaftAdjustment={shaftAdjustment}
            assemblyName={assemblyName}
            mateRecords={mateRecords}
            onSelect={handleCanvasSelect}
            onLassoSelect={handleLassoSelect}
            onClearSelection={() => setSelectedInstanceIds([])}
            onTransformChange={(instanceId, position, quaternion) => updateInstanceTransform(
              instanceId,
              position,
              quaternion,
              mode === 'rotate' && Boolean(rotationPivots[instanceId]),
            )}
            onRotationPivotChange={handleRotationPivotChange}
            onConnectorPick={handleConnectorPick}
            onHoleMarkingResult={handleHoleMarkingResult}
            onAssemblyRootChange={setAssemblyRoot}
            onViewportCenterChange={(position) => { viewportCenterRef.current = position; }}
            onReadyChange={setAssemblyReady}
            coverCaptureRequest={coverCaptureRequest}
            onCoverCaptured={handleCoverCaptured}
            onCoverCaptureError={handleCoverCaptureError}
          />
        </section>
        <AssemblyAiPanel
          catalogReady={Boolean(catalog)}
          partCount={instances.length}
          onApplyRectangularChassis={applyAiRectangularChassis}
          onApplyGearDrivenClaw={applyAiGearDrivenClaw}
        />
      </div>
    </main>
  );
}
