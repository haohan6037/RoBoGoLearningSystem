'use client';

import { useAssemblyStore } from '@/store/useAssemblyStore';
import ObjectTreeItem from './ObjectTreeItem';

export default function ObjectTreePanel() {
  const objectTree = useAssemblyStore((s) => s.objectTree);

  return (
    <ul className="text-xs space-y-0.5">
      {objectTree.map((node) => (
        <ObjectTreeItem key={node.id} node={node} depth={0} />
      ))}
    </ul>
  );
}
