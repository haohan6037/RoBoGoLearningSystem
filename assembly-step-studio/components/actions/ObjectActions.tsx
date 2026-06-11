'use client';

import { useAssemblyStore } from '@/store/useAssemblyStore';

export default function ObjectActions() {
  const selectedUuids = useAssemblyStore((s) => s.selectedObjectUuids);
  const hideSelected = useAssemblyStore((s) => s.hideSelected);
  const showSelected = useAssemblyStore((s) => s.showSelected);
  const showAll = useAssemblyStore((s) => s.showAll);
  const moveSelected = useAssemblyStore((s) => s.moveSelected);
  const resetSelectedTransform = useAssemblyStore((s) => s.resetSelectedTransform);

  const hasSelection = selectedUuids.length > 0;

  return (
    <div className="p-3 border-b border-gray-800">
      <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Object Actions</h3>
      <div className="flex flex-wrap gap-1">
        <button onClick={hideSelected} disabled={!hasSelection} className="px-2 py-1 text-[11px] bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-40 transition-colors">Hide</button>
        <button onClick={showSelected} disabled={!hasSelection} className="px-2 py-1 text-[11px] bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-40 transition-colors">Show</button>
        <button onClick={showAll} className="px-2 py-1 text-[11px] bg-gray-800 hover:bg-gray-700 rounded transition-colors">Show All</button>
      </div>
      <div className="mt-2 space-y-1">
        <p className="text-[10px] text-gray-500">Move (step 0.5)</p>
        <div className="flex gap-1">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <span key={axis} className="flex items-center gap-0.5">
              <span className="text-[10px] text-gray-500 w-3">{axis.toUpperCase()}</span>
              <button onClick={() => moveSelected(axis, -0.5)} disabled={!hasSelection} className="px-1.5 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-40">−</button>
              <button onClick={() => moveSelected(axis, 0.5)} disabled={!hasSelection} className="px-1.5 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-40">+</button>
            </span>
          ))}
        </div>
        <button onClick={resetSelectedTransform} disabled={!hasSelection} className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 rounded disabled:opacity-40 transition-colors w-full">Reset Position</button>
      </div>
    </div>
  );
}
