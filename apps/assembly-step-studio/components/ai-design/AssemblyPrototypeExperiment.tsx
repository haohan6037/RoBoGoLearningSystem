'use client';

import { useEffect, useState } from 'react';
import { buildRectangularChassisPrototype } from '@/lib/ai-design/assemblyPrototype';
import { buildStudioProjectRecord } from '@/lib/projects/projectRecords';
import { saveStudioProject } from '@/lib/projects/projectStorage';
import type { PartLibraryCatalog } from '@/types/partLibrary';

const EXPERIMENT_TASK = 'Use two 1x11 Beams, two 1x5 Beams, and four Large Chassis Corner Connectors to make a narrow rectangular chassis frame.';

export default function AssemblyPrototypeExperiment({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (projectId: string) => void;
}) {
  const [catalog, setCatalog] = useState<PartLibraryCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/part-library/catalog.json')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load the part catalog (${response.status}).`);
        return response.json() as Promise<PartLibraryCatalog>;
      })
      .then((loaded) => {
        if (!cancelled) setCatalog(loaded);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load the part catalog.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRunExperiment = async () => {
    if (!catalog || creating) return;
    setCreating(true);
    setError(null);
    try {
      const record = buildStudioProjectRecord(
        `AI Experiment · Rectangular Chassis · ${new Date().toLocaleString()}`,
        'assembly',
      );
      record.tags = ['ai-experiment', 'level-2', 'deterministic-baseline'];
      record.assemblyData = buildRectangularChassisPrototype(catalog, record.createdAt);
      const saved = await saveStudioProject(record);
      onCreated(saved.id);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'The prototype could not be created.');
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
        >
          ← Back to Projects
        </button>

        <section className="rounded-3xl bg-slate-950 p-8 text-white shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">Phase 1 · Level 2</p>
          <h1 className="mt-3 text-3xl font-bold">Assembly Prototype Experiment</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            First prove that a constrained structural plan can become a real, editable Assembly Project.
            This run is a deterministic baseline; it does not call an AI model yet.
          </p>
        </section>

        <section className="grid gap-5 md:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Experiment task</p>
            <p className="mt-3 text-lg font-semibold leading-7">{EXPERIMENT_TASK}</p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-blue-50 p-4"><b>2 ×</b><br />1x11 Beam</div>
              <div className="rounded-2xl bg-orange-50 p-4"><b>2 ×</b><br />1x5 Beam</div>
              <div className="col-span-2 rounded-2xl bg-fuchsia-50 p-4"><b>4 ×</b><br />Large Chassis Corner Connector</div>
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-600">
              Small fasteners are intentionally omitted. Structural Connectors remain explicit because they define
              the relationship between perpendicular beam planes. All eight parts form one editable prototype group.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Readiness</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt>Catalog</dt><dd className="font-semibold">{catalog ? `${catalog.total} parts` : 'Loading…'}</dd></div>
              <div className="flex justify-between gap-4"><dt>Expected output</dt><dd className="font-semibold">8 instances</dd></div>
              <div className="flex justify-between gap-4"><dt>Connections</dt><dd className="font-semibold">Manual detail</dd></div>
              <div className="flex justify-between gap-4"><dt>Model call</dt><dd className="font-semibold">Not yet</dd></div>
            </dl>
            <button
              type="button"
              onClick={() => void handleRunExperiment()}
              disabled={!catalog || creating}
              className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {creating ? 'Creating Assembly…' : 'Run Level 2 Experiment'}
            </button>
            {error && <p role="alert" className="mt-4 text-sm font-medium text-red-700">{error}</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
