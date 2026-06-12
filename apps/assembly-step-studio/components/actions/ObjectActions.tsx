'use client';

import { useAssemblyStore } from '@/store/useAssemblyStore';

export default function ObjectActions() {
  const selectedUuids = useAssemblyStore((s) => s.selectedObjectUuids);
  const activeMoveAxis = useAssemblyStore((s) => s.activeMoveAxis);
  const setActiveMoveAxis = useAssemblyStore((s) => s.setActiveMoveAxis);
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
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-gray-500">Drag Axis</p>
          <div className="flex rounded bg-gray-900 p-0.5">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <button
                key={axis}
                onClick={() => setActiveMoveAxis(axis)}
                className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                  activeMoveAxis === axis ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {axis.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
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
