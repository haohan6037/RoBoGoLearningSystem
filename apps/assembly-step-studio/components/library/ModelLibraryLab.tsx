'use client';

import Image from 'next/image';
import { useCallback, useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import LibraryAssemblyCanvas, {
  type HoleMarkingShape,
  type LibraryConnectorPick,
  type LibraryMateMode,
  type LibraryPartInstance,
  type ShaftAdjustment,
} from '@/components/library/LibraryAssemblyCanvas';
import {
  applyOrderedLibraryMates,
  applySingleLibraryMate,
  applyTwoHoleLibraryMate,
} from '@/lib/mate/applyLibraryMate';
import {
  applyRigidGroupTransform,
  expandCustomGroupMemberIds,
  findNextPartSpawnPosition,
  measureAssemblyInstanceVolumes,
  mergeConnectedRigidGroups,
  removeSelectedMembersFromGroups,
  resolveAutomaticMateDirection,
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
import { refreshBuildInstructionsFromAssemblyRecord } from '@/lib/projects/projectRecords';
import type { AssemblyMateRecord, AssemblyRigidGroup, CoverCapture } from '@/types/assembly';
import type { PartLibraryCatalog, PartLibraryItem } from '@/types/partLibrary';

const PART_COLORS = ['#356fe3', '#f47a32', '#7c3aed', '#0f9f76', '#db2777', '#d69e2e'];

function mateGuide(mode: LibraryMateMode, picks: LibraryConnectorPick[]): string {
  const pickCount = picks.length;
  if (mode === 'hole-align') {
    if (pickCount === 0) return '1. Select a square or round hole on the first part.';
    return picks[0].connector.kind === 'square-hole'
      ? '2. Select a round hole on the other part.'
      : '2. Select a square hole on the other part.';
  }
  if (mode === 'pin') {
    return pickCount === 0 ? '1. Select a blue hole face.' : '2. Select an orange Pin stop-ring face.';
  }
  if (mode === 'multi-leg') {
    const holes = picks.filter((pick) => pick.connector.kind === 'hole').length;
    const legs = picks.filter((pick) => pick.connector.kind === 'pin-ring').length;
    if (holes < 2) return `1. Select at least two holes in connection order (${holes} selected).`;
    if (legs === 0) return `2. Select ${holes} connector legs in matching order, or add more holes first.`;
    if (legs < holes) return `2. Select connector C${legs + 1} for hole H${legs + 1}.`;
    return `${holes} ordered pairs selected: H1↔C1 through H${holes}↔C${holes}.`;
  }
  if (mode === 'shaft') {
    return pickCount === 0
      ? '1. Select a blue hole face.'
      : '2. Select a yellow Shaft end. It will center automatically.';
  }
  if (pickCount === 0) return '1. Select the hole face on the fixed part.';
  return '2. Select the hole face on the Spacer or other part.';
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
  const [assemblyReady, setAssemblyReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [coverCaptureRequest, setCoverCaptureRequest] = useState(0);
  const [coverStatus, setCoverStatus] = useState<'idle' | 'capturing' | 'saved'>('idle');

  useEffect(() => {
    void loadStudioProject(projectId).then((record) => {
      if (!record || record.projectType !== 'assembly') return;
      setAssemblyName(record.name);
      setInstances(record.assemblyData?.instances ?? []);
      setMateRecords(record.assemblyData?.mateRecords ?? []);
      setGroups(record.assemblyData?.groups ?? []);
    });
  }, [projectId]);

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
      position: findNextPartSpawnPosition(assemblyRoot),
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
  ) => {
    const rigidGroup = groups.find((group) => group.instanceIds.includes(instanceId));
    const isShaftFineAdjustment = shaftAdjustment?.instanceId === instanceId;
    setInstances((current) => applyRigidGroupTransform(
      current,
      instanceId,
      position,
      quaternion,
      isShaftFineAdjustment ? [instanceId] : rigidGroup?.instanceIds ?? [instanceId],
    ));
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

  const startMateMode = (nextMode: LibraryMateMode) => {
    setMateMode(nextMode);
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

  const connectPickedParts = (nextMode: LibraryMateMode, picks: LibraryConnectorPick[]) => {
    const multiLegFixedCount = nextMode === 'multi-leg'
      ? picks.findIndex((pick) => pick.connector.kind === 'pin-ring')
      : 0;
    const secondSideIndex = nextMode === 'multi-leg' ? multiLegFixedCount : 1;
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
      const transform = nextMode === 'multi-leg'
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

      if (nextMode === 'multi-leg') {
        for (let index = 0; index < fixedPicks.length; index += 1) {
          const fixedPosition = connectorWorldPosition(fixedInstance, fixedPicks[index]);
          const movingPosition = connectorWorldPosition(transform, movingPicks[index]);
          if (fixedPosition.distanceTo(movingPosition) > 0.15) {
            throw new Error('The selected hole and leg order does not match. Select each leg in the same order as its hole.');
          }
        }
      }

      updateInstanceTransform(movingInstance.instanceId, transform.position, transform.quaternion);
      setGroups((current) => mergeConnectedRigidGroups(
        current,
        fixedInstance.instanceId,
        movingInstance.instanceId,
      ));
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
    if (!mateMode) return;
    setMateError(null);

    const selectedIndex = connectorPicks.findIndex(
      (selected) => selected.instanceId === pick.instanceId
        && selected.connector.id === pick.connector.id,
    );
    if (selectedIndex >= 0) {
      setConnectorPicks(connectorPicks.slice(0, selectedIndex));
      return;
    }

    if (mateMode === 'hole-align') {
      const apertureKinds = ['hole', 'square-hole'];
      if (!apertureKinds.includes(pick.connector.kind)) {
        setMateError('Select a square or round hole.');
        return;
      }
      if (connectorPicks.length === 0) {
        setConnectorPicks([pick]);
        return;
      }
      const fixedPick = connectorPicks[0];
      if (pick.instanceId === fixedPick.instanceId || pick.connector.kind === fixedPick.connector.kind) {
        setMateError('Select the other hole shape on a different part. One hole must be square and one round.');
        return;
      }
      connectPickedParts('hole-align', [fixedPick, pick]);
      return;
    }

    if (mateMode === 'pin') {
      if (connectorPicks.length === 0) {
        if (pick.connector.kind !== 'hole') {
          setMateError('Select a blue hole face first.');
          return;
        }
        setConnectorPicks([pick]);
        return;
      }
      if (pick.connector.kind !== 'pin-ring' || pick.instanceId === connectorPicks[0].instanceId) {
        setMateError('Now select an orange stop-ring face on a different Pin.');
        return;
      }
      setConnectorPicks([...connectorPicks, pick]);
      return;
    }

    if (mateMode === 'shaft') {
      if (connectorPicks.length === 0) {
        if (!['hole', 'square-hole'].includes(pick.connector.kind)) {
          setMateError('Select a blue round hole or purple square hole first.');
          return;
        }
        setConnectorPicks([pick]);
        return;
      }
      if (pick.connector.kind !== 'shaft-end' || pick.instanceId === connectorPicks[0].instanceId) {
        setMateError('Now select a yellow end on a different Shaft or Idler Pin.');
        return;
      }
      connectPickedParts('shaft', [...connectorPicks, pick]);
      return;
    }

    if (mateMode === 'multi-leg') {
      const firstLegIndex = connectorPicks.findIndex(
        (selected) => selected.connector.kind === 'pin-ring',
      );
      const selectingLegs = firstLegIndex >= 0;
      const holeCount = selectingLegs ? firstLegIndex : connectorPicks.length;
      const legCount = selectingLegs ? connectorPicks.length - firstLegIndex : 0;

      if (!selectingLegs && pick.connector.kind === 'hole') {
        setConnectorPicks([...connectorPicks, pick]);
        return;
      }

      if (!selectingLegs) {
        if (pick.connector.kind !== 'pin-ring' || holeCount < 2) {
          setMateError('Select at least two blue holes before selecting connector legs.');
          return;
        }
        if (pick.instanceId === connectorPicks[0].instanceId) {
          setMateError('C1 cannot connect H1 to the same part.');
          return;
        }
        setConnectorPicks([...connectorPicks, pick]);
        return;
      }

      if (
        pick.connector.kind !== 'pin-ring'
      ) {
        setMateError('Continue selecting orange connector legs.');
        return;
      }
      if (legCount >= holeCount) {
        setMateError('The number of selected legs already matches the selected holes.');
        return;
      }
      if (pick.instanceId === connectorPicks[legCount].instanceId) {
        setMateError(`C${legCount + 1} cannot connect H${legCount + 1} to the same part.`);
        return;
      }
      setConnectorPicks([...connectorPicks, pick]);
      return;
    }

    if (pick.connector.kind !== 'hole') {
      setMateError('Beam stacking only uses hole faces.');
      return;
    }
    if (connectorPicks.length === 0) {
      setConnectorPicks([pick]);
      return;
    }
    if (pick.instanceId === connectorPicks[0].instanceId) {
      setMateError('Select a hole face on a different part.');
      return;
    }
    setConnectorPicks([...connectorPicks, pick]);
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

  const canConnect = mateMode === 'pin'
    ? connectorPicks.length === 2
    : mateMode === 'multi-leg'
      ? (() => {
          const firstLegIndex = connectorPicks.findIndex((pick) => pick.connector.kind === 'pin-ring');
          return firstLegIndex >= 2 && connectorPicks.length === firstLegIndex * 2;
        })()
    : mateMode === 'beam' && connectorPicks.length === 2;

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
        <button onClick={() => startMateMode('pin')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${mateMode === 'pin' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white hover:bg-blue-50'}`}>Pin to Hole</button>
        <button onClick={() => startMateMode('multi-leg')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${mateMode === 'multi-leg' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white hover:bg-blue-50'}`}>Multi-leg Connect</button>
        <button onClick={() => startMateMode('beam')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${mateMode === 'beam' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white hover:bg-blue-50'}`}>Stack by 2 Holes</button>
        <button onClick={() => startMateMode('hole-align')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${mateMode === 'hole-align' ? 'bg-purple-600 text-white' : 'border border-purple-200 bg-white text-purple-700 hover:bg-purple-50'}`}>Align Square + Round</button>
        <button onClick={() => startMateMode('shaft')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${mateMode === 'shaft' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white hover:bg-blue-50'}`}>Shaft / Idler Through Hole</button>
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
            <div className="absolute right-4 top-4 z-20 w-64 rounded-2xl border border-emerald-200 bg-white/95 p-4 shadow-xl backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Custom Group</p>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {selectedInstanceIds.length} {selectedInstanceIds.length === 1 ? 'part' : 'parts'} selected
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {selectedGroup
                  ? `${selectedGroup.name} currently has ${selectedGroup.instanceIds.length} parts.`
                  : 'Select at least two parts to make a rigid group.'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  disabled={selectedInstanceIds.length < 2 || groupCandidateIds.length < 2}
                  onClick={makeOrUpdateGroup}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >Make Group</button>
                <button
                  disabled={selectedGroupedMemberCount === 0}
                  onClick={removeSelectionFromGroups}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                >Remove Members</button>
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
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-600">{mateMode === 'pin' ? 'Pin to Hole' : mateMode === 'multi-leg' ? 'Multi-leg Connect' : mateMode === 'beam' ? 'Two-hole Stack' : mateMode === 'hole-align' ? 'Align Square + Round' : 'Shaft / Idler Through Hole'}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{mateGuide(mateMode, connectorPicks)}</p>
                </div>
                <button onClick={() => { setMateMode(null); setConnectorPicks([]); setMateError(null); }} className="text-xs font-bold text-slate-400 hover:text-slate-700">Cancel</button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Blue = round hole · Purple = square hole · Orange = Pin ring · Yellow = Shaft/Idler end</p>
              {mateError && <p className="mt-3 rounded-xl bg-red-50 p-2 text-xs font-semibold text-red-600">{mateError}</p>}
              {!['shaft', 'hole-align'].includes(mateMode) && (
                <button
                  disabled={!canConnect}
                  onClick={() => connectPickedParts(mateMode, connectorPicks)}
                  className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {mateMode === 'beam' ? 'Align and Stack' : mateMode === 'multi-leg' ? 'Connect Legs' : 'Connect Pin'}
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
            onTransformChange={updateInstanceTransform}
            onConnectorPick={handleConnectorPick}
            onHoleMarkingResult={handleHoleMarkingResult}
            onAssemblyRootChange={setAssemblyRoot}
            onReadyChange={setAssemblyReady}
            coverCaptureRequest={coverCaptureRequest}
            onCoverCaptured={handleCoverCaptured}
            onCoverCaptureError={handleCoverCaptureError}
          />
        </section>
      </div>
    </main>
  );
}
