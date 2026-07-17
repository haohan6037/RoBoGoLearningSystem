'use client';

import Image from 'next/image';
import { useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import LibraryAssemblyCanvas, {
  type LibraryConnectorPick,
  type LibraryMateMode,
  type LibraryPartInstance,
  type ShaftAdjustment,
} from '@/components/library/LibraryAssemblyCanvas';
import {
  applySingleLibraryMate,
  applyTwoHoleLibraryMate,
} from '@/lib/mate/applyLibraryMate';
import { downloadAssemblyGlb } from '@/lib/partLibrary/exportAssembly';
import {
  comparePartsByName,
  normalizePartSearchText,
} from '@/lib/partLibrary/search';
import type { PartLibraryCatalog, PartLibraryItem } from '@/types/partLibrary';

const PART_COLORS = ['#356fe3', '#f47a32', '#7c3aed', '#0f9f76', '#db2777', '#d69e2e'];

type MateRecord = {
  id: string;
  type: LibraryMateMode;
  fixedInstanceId: string;
  movingInstanceId: string;
  fixedConnectorIds: string[];
  movingConnectorIds: string[];
  createdAt: string;
};

function connectorNormalsMatch(first: LibraryConnectorPick, second: LibraryConnectorPick): boolean {
  return new THREE.Vector3(...first.connector.normal)
    .dot(new THREE.Vector3(...second.connector.normal)) > 0.99;
}

function mateGuide(mode: LibraryMateMode, picks: LibraryConnectorPick[]): string {
  const pickCount = picks.length;
  if (mode === 'pin') {
    return pickCount === 0 ? '1. Select a blue hole face.' : '2. Select an orange Pin stop-ring face.';
  }
  if (mode === 'multi-leg') {
    const holes = picks.filter((pick) => pick.connector.kind === 'hole').length;
    const legs = picks.filter((pick) => pick.connector.kind === 'pin-ring').length;
    if (holes < 2) return `1. Select at least two matching holes (${holes} selected).`;
    if (legs === 0) return `2. Select ${holes} orange leg rings in the same order, or add more holes first.`;
    if (legs < holes) return `2. Select matching leg ring ${legs + 1} of ${holes}.`;
    return `${holes} hole-and-leg pairs selected. Ready to connect.`;
  }
  if (mode === 'shaft') {
    return pickCount === 0
      ? '1. Select a blue hole face.'
      : '2. Select a yellow Shaft end. It will center automatically.';
  }
  if (pickCount === 0) return '1. Select hole 1 on the fixed Beam or Plate.';
  if (pickCount === 1) return '2. Select hole 2 on the same face.';
  if (pickCount === 2) return '3. Select matching hole 1 on the moving part.';
  return '4. Select matching hole 2 on the same face.';
}

function connectorWorldPosition(
  transform: { position: [number, number, number]; quaternion: [number, number, number, number] },
  pick: LibraryConnectorPick,
): THREE.Vector3 {
  return new THREE.Vector3(...pick.connector.position)
    .applyQuaternion(new THREE.Quaternion(...transform.quaternion))
    .add(new THREE.Vector3(...transform.position));
}

export default function ModelLibraryLab({ onBack }: { onBack: () => void }) {
  const [catalog, setCatalog] = useState<PartLibraryCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [assemblyName, setAssemblyName] = useState('New Assembly');
  const [instances, setInstances] = useState<LibraryPartInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate');
  const [mateMode, setMateMode] = useState<LibraryMateMode | null>(null);
  const [holeMarkingInstanceId, setHoleMarkingInstanceId] = useState<string | null>(null);
  const [holeMarkingStatus, setHoleMarkingStatus] = useState<{ message: string; error: boolean } | null>(null);
  const [connectorPicks, setConnectorPicks] = useState<LibraryConnectorPick[]>([]);
  const [mateError, setMateError] = useState<string | null>(null);
  const [mateRecords, setMateRecords] = useState<MateRecord[]>([]);
  const [shaftAdjustment, setShaftAdjustment] = useState<ShaftAdjustment | null>(null);
  const [assemblyRoot, setAssemblyRoot] = useState<THREE.Group | null>(null);
  const [assemblyReady, setAssemblyReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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

  const selectedInstance = instances.find((instance) => instance.instanceId === selectedInstanceId) ?? null;

  const addPart = (part: PartLibraryItem) => {
    const instanceId = crypto.randomUUID();
    const index = instances.length;
    const column = index % 4;
    const row = Math.floor(index / 4);
    const next: LibraryPartInstance = {
      instanceId,
      part,
      color: PART_COLORS[index % PART_COLORS.length],
      position: [(column - 1.5) * 38, (row - 0.5) * 34, 0],
      quaternion: [0, 0, 0, 1],
    };
    setAssemblyReady(false);
    setInstances((current) => [...current, next]);
    setSelectedInstanceId(instanceId);
  };

  const removeSelected = () => {
    if (!selectedInstanceId) return;
    setInstances((current) => current.filter((instance) => instance.instanceId !== selectedInstanceId));
    setMateRecords((current) => current.filter(
      (mate) => mate.fixedInstanceId !== selectedInstanceId && mate.movingInstanceId !== selectedInstanceId,
    ));
    setConnectorPicks([]);
    setMateMode(null);
    if (holeMarkingInstanceId === selectedInstanceId) setHoleMarkingInstanceId(null);
    if (shaftAdjustment?.instanceId === selectedInstanceId) setShaftAdjustment(null);
    setSelectedInstanceId(null);
  };

  const clearAssembly = () => {
    setInstances([]);
    setMateRecords([]);
    setConnectorPicks([]);
    setMateMode(null);
    setHoleMarkingInstanceId(null);
    setHoleMarkingStatus(null);
    setShaftAdjustment(null);
    setSelectedInstanceId(null);
    setAssemblyReady(false);
  };

  const updateInstanceTransform = (
    instanceId: string,
    position: [number, number, number],
    quaternion: [number, number, number, number],
  ) => {
    setInstances((current) => current.map((instance) => (
      instance.instanceId === instanceId ? { ...instance, position, quaternion } : instance
    )));
  };

  const startTransformMode = (nextMode: 'translate' | 'rotate') => {
    setMode(nextMode);
    setMateMode(null);
    setHoleMarkingInstanceId(null);
    setHoleMarkingStatus(null);
    setConnectorPicks([]);
    setMateError(null);
    setShaftAdjustment(null);
  };

  const startMateMode = (nextMode: LibraryMateMode) => {
    setMateMode(nextMode);
    setHoleMarkingInstanceId(null);
    setHoleMarkingStatus(null);
    setConnectorPicks([]);
    setMateError(null);
    setShaftAdjustment(null);
    setSelectedInstanceId(null);
  };

  const startHoleMarking = () => {
    if (!selectedInstance) return;
    setMateMode(null);
    setConnectorPicks([]);
    setMateError(null);
    setShaftAdjustment(null);
    setHoleMarkingInstanceId(selectedInstance.instanceId);
    setHoleMarkingStatus({
      message: 'Click the curved inside wall of a hole. Each click is saved automatically.',
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
    const fixedInstance = instances.find((instance) => instance.instanceId === picks[0]?.instanceId);
    const movingPickIndex = nextMode === 'beam' ? 2 : nextMode === 'multi-leg' ? multiLegFixedCount : 1;
    const movingInstance = instances.find(
      (instance) => instance.instanceId === picks[movingPickIndex]?.instanceId,
    );
    if (!fixedInstance || !movingInstance) {
      setMateError('The selected parts are no longer available.');
      return;
    }

    try {
      const transform = nextMode === 'beam'
        ? applyTwoHoleLibraryMate(
            fixedInstance,
            movingInstance,
            picks[0].connector,
            picks[1].connector,
            picks[2].connector,
            picks[3].connector,
          )
        : nextMode === 'multi-leg'
          ? applyTwoHoleLibraryMate(
              fixedInstance,
              movingInstance,
              picks[0].connector,
              picks[1].connector,
              picks[multiLegFixedCount].connector,
              picks[multiLegFixedCount + 1].connector,
            )
        : applySingleLibraryMate(
            fixedInstance,
            movingInstance,
            picks[0].connector,
            picks[1].connector,
            { centerFixedConnector: nextMode === 'shaft' },
          );

      if (nextMode === 'multi-leg') {
        for (let index = 0; index < multiLegFixedCount; index += 1) {
          const fixedPosition = connectorWorldPosition(fixedInstance, picks[index]);
          const movingPosition = connectorWorldPosition(transform, picks[multiLegFixedCount + index]);
          if (fixedPosition.distanceTo(movingPosition) > 0.15) {
            throw new Error('The selected hole and leg order does not match. Select each leg in the same order as its hole.');
          }
        }
      }

      updateInstanceTransform(movingInstance.instanceId, transform.position, transform.quaternion);
      setMateRecords((current) => [...current, {
        id: crypto.randomUUID(),
        type: nextMode,
        fixedInstanceId: fixedInstance.instanceId,
        movingInstanceId: movingInstance.instanceId,
        fixedConnectorIds: nextMode === 'beam'
          ? [picks[0].connector.id, picks[1].connector.id]
          : nextMode === 'multi-leg'
            ? picks.slice(0, multiLegFixedCount).map((pick) => pick.connector.id)
          : [picks[0].connector.id],
        movingConnectorIds: nextMode === 'beam'
          ? [picks[2].connector.id, picks[3].connector.id]
          : nextMode === 'multi-leg'
            ? picks.slice(multiLegFixedCount).map((pick) => pick.connector.id)
          : [picks[1].connector.id],
        createdAt: new Date().toISOString(),
      }]);
      setSelectedInstanceId(movingInstance.instanceId);
      setConnectorPicks([]);
      setMateMode(null);
      setMateError(null);
      setShaftAdjustment(nextMode === 'shaft'
        ? { instanceId: movingInstance.instanceId, axis: picks[1].connector.axis }
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
        if (pick.connector.kind !== 'hole') {
          setMateError('Select a blue hole face first.');
          return;
        }
        setConnectorPicks([pick]);
        return;
      }
      if (pick.connector.kind !== 'shaft-end' || pick.instanceId === connectorPicks[0].instanceId) {
        setMateError('Now select a yellow end on a different Shaft.');
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
        if (connectorPicks.length > 0 && (
          pick.instanceId !== connectorPicks[0].instanceId
          || !connectorNormalsMatch(connectorPicks[0], pick)
        )) {
          setMateError('Select holes on the same face of the same fixed part.');
          return;
        }
        setConnectorPicks([...connectorPicks, pick]);
        return;
      }

      if (!selectingLegs) {
        if (pick.connector.kind !== 'pin-ring' || holeCount < 2) {
          setMateError('Select at least two blue holes before selecting connector legs.');
          return;
        }
        if (pick.instanceId === connectorPicks[0].instanceId) {
          setMateError('Select orange leg rings on a different moving part.');
          return;
        }
        setConnectorPicks([...connectorPicks, pick]);
        return;
      }

      if (
        pick.connector.kind !== 'pin-ring'
        || pick.instanceId !== connectorPicks[firstLegIndex].instanceId
      ) {
        setMateError('Continue selecting orange leg rings on the same moving part.');
        return;
      }
      if (legCount >= holeCount) {
        setMateError('The number of selected legs already matches the selected holes.');
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
    if (connectorPicks.length === 1) {
      if (
        pick.instanceId !== connectorPicks[0].instanceId
        || pick.connector.id === connectorPicks[0].connector.id
        || !connectorNormalsMatch(connectorPicks[0], pick)
      ) {
        setMateError('Select a different hole on the same face of the fixed part.');
        return;
      }
      setConnectorPicks([...connectorPicks, pick]);
      return;
    }
    if (connectorPicks.length === 2) {
      if (pick.instanceId === connectorPicks[0].instanceId) {
        setMateError('Select the matching hole on a different moving part.');
        return;
      }
      setConnectorPicks([...connectorPicks, pick]);
      return;
    }
    if (
      pick.instanceId !== connectorPicks[2].instanceId
      || pick.connector.id === connectorPicks[2].connector.id
      || !connectorNormalsMatch(connectorPicks[2], pick)
    ) {
      setMateError('Select a different hole on the same face of the moving part.');
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

  const canConnect = mateMode === 'pin'
    ? connectorPicks.length === 2
    : mateMode === 'multi-leg'
      ? (() => {
          const firstLegIndex = connectorPicks.findIndex((pick) => pick.connector.kind === 'pin-ring');
          return firstLegIndex >= 2 && connectorPicks.length === firstLegIndex * 2;
        })()
    : mateMode === 'beam' && connectorPicks.length === 4;

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
          <span className="text-sm font-semibold text-slate-500">{instances.length} parts · {mateRecords.length} connections</span>
          <button
            disabled={!assemblyReady || exporting}
            onClick={() => void exportAssembly()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {exporting ? 'Exporting...' : 'Export GLB'}
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
        <button onClick={() => startMateMode('shaft')} className={`rounded-xl px-4 py-2 text-sm font-semibold ${mateMode === 'shaft' ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white hover:bg-blue-50'}`}>Shaft Through Hole</button>
        <div className="mx-2 h-7 w-px bg-slate-200" />
        <button
          disabled={!selectedInstance}
          onClick={startHoleMarking}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${holeMarkingInstanceId ? 'bg-amber-500 text-white' : 'border border-amber-200 bg-white text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40'}`}
        >Mark Holes</button>
        <div className="ml-auto flex items-center gap-2">
          <span className="max-w-56 truncate text-xs font-semibold text-slate-500">{selectedInstance?.part.name ?? 'No part selected'}</span>
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
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-600">{mateMode === 'pin' ? 'Pin to Hole' : mateMode === 'multi-leg' ? 'Multi-leg Connect' : mateMode === 'beam' ? 'Two-hole Stack' : 'Shaft Through Hole'}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{mateGuide(mateMode, connectorPicks)}</p>
                </div>
                <button onClick={() => { setMateMode(null); setConnectorPicks([]); setMateError(null); }} className="text-xs font-bold text-slate-400 hover:text-slate-700">Cancel</button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Blue = hole · Orange = Pin ring · Yellow = Shaft end</p>
              {mateError && <p className="mt-3 rounded-xl bg-red-50 p-2 text-xs font-semibold text-red-600">{mateError}</p>}
              {mateMode !== 'shaft' && (
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
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-600">Mark Missing Holes</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{selectedInstance?.part.name}</p>
                </div>
                <button
                  onClick={() => { setHoleMarkingInstanceId(null); setHoleMarkingStatus(null); }}
                  className="text-xs font-bold text-slate-400 hover:text-slate-700"
                >Done</button>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">Click the curved inside wall of each hole. Blue rings confirm saved holes. Click the same hole again to remove its mark.</p>
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
            mode={mode}
            mateMode={mateMode}
            holeMarkingInstanceId={holeMarkingInstanceId}
            connectorPicks={connectorPicks}
            shaftAdjustment={shaftAdjustment}
            assemblyName={assemblyName}
            mateRecords={mateRecords}
            onSelect={setSelectedInstanceId}
            onTransformChange={updateInstanceTransform}
            onConnectorPick={handleConnectorPick}
            onHoleMarkingResult={handleHoleMarkingResult}
            onAssemblyRootChange={setAssemblyRoot}
            onReadyChange={setAssemblyReady}
          />
        </section>
      </div>
    </main>
  );
}
