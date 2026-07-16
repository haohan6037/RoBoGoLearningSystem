'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import LibraryAssemblyCanvas, {
  type LibraryPartInstance,
} from '@/components/library/LibraryAssemblyCanvas';
import {
  comparePartsByName,
  normalizePartSearchText,
} from '@/lib/partLibrary/search';
import type { PartLibraryCatalog, PartLibraryItem } from '@/types/partLibrary';

const PART_COLORS = ['#356fe3', '#f47a32', '#7c3aed', '#0f9f76', '#db2777', '#d69e2e'];

export default function ModelLibraryLab({ onBack }: { onBack: () => void }) {
  const [catalog, setCatalog] = useState<PartLibraryCatalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [instances, setInstances] = useState<LibraryPartInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate');

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
    const next: LibraryPartInstance = {
      instanceId,
      part,
      color: PART_COLORS[instances.length % PART_COLORS.length],
    };
    setInstances((current) => [...current, next]);
    setSelectedInstanceId(instanceId);
  };

  const removeSelected = () => {
    if (!selectedInstanceId) return;
    setInstances((current) => current.filter((instance) => instance.instanceId !== selectedInstanceId));
    setSelectedInstanceId(null);
  };

  return (
    <main className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-white text-slate-900">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Back</button>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">RoBoGo Parts</p>
            <h1 className="text-lg font-bold">Model Library & Assembly Canvas</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-2 text-sm font-semibold text-slate-500">{instances.length} part{instances.length === 1 ? '' : 's'} added</span>
          <button
            onClick={() => setMode('translate')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${mode === 'translate' ? 'bg-blue-600 text-white' : 'border border-slate-200 hover:bg-slate-50'}`}
          >Move</button>
          <button
            onClick={() => setMode('rotate')}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${mode === 'rotate' ? 'bg-blue-600 text-white' : 'border border-slate-200 hover:bg-slate-50'}`}
          >Rotate</button>
          <button disabled={!selectedInstance} onClick={removeSelected} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">Remove</button>
          <button onClick={() => { setInstances([]); setSelectedInstanceId(null); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Clear</button>
        </div>
      </header>

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
                <p className="text-lg font-bold">Choose a part from the library</p>
                <p className="mt-2 text-sm text-slate-500">Only selected STEP models are loaded into this canvas.</p>
              </div>
            </div>
          )}
          <LibraryAssemblyCanvas
            instances={instances}
            selectedInstanceId={selectedInstanceId}
            mode={mode}
            onSelect={setSelectedInstanceId}
          />
        </section>
      </div>
    </main>
  );
}
