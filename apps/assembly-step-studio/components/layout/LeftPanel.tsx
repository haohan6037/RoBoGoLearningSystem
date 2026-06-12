'use client';

import { useAssemblyStore } from '@/store/useAssemblyStore';
import ObjectTreePanel from '@/components/object-tree/ObjectTreePanel';

export default function LeftPanel() {
  const objectTree = useAssemblyStore((s) => s.objectTree);

  return (
    <aside className="w-56 bg-gray-950 border-r border-gray-800 flex flex-col shrink-0">
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-800">
        Object Tree
      </div>
      <div className="flex-1 overflow-auto p-2">
        {objectTree.length > 0 ? (
          <ObjectTreePanel />
        ) : (
          <p className="text-xs text-gray-600">Upload a GLB model to see its object tree.</p>
        )}
      </div>
    </aside>
  );
}
