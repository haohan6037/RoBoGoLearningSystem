'use client';

import { useState } from 'react';
import type { ModelNode } from '@/types/assembly';
import { useAssemblyStore } from '@/store/useAssemblyStore';

const TYPE_ICONS: Record<string, string> = {
  Group: '📁',
  Mesh: '🔷',
  Object3D: '📦',
};

interface Props {
  node: ModelNode;
  depth: number;
}

export default function ObjectTreeItem({ node, depth }: Props) {
  const [expanded, setExpanded] = useState(depth < 2);
  const selectedUuids = useAssemblyStore((s) => s.selectedObjectUuids);
  const selectObject = useAssemblyStore((s) => s.selectObject);
  const setHoveredObject = useAssemblyStore((s) => s.setHoveredObject);
  const isInteractable = useAssemblyStore((s) => s.isObjectInteractable(node.uuid));
  const hasChildren = node.children.length > 0;
  const isSelected = selectedUuids.includes(node.uuid);

  return (
    <li>
      <div
        className={`flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer hover:bg-gray-800 transition-colors ${
          isSelected ? 'bg-blue-800 text-blue-200' : isInteractable ? 'text-gray-300' : 'text-gray-600 opacity-60'
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => { if (isInteractable) selectObject(node.uuid); }}
        onMouseEnter={() => { if (isInteractable) setHoveredObject(node.uuid); }}
        onMouseLeave={() => setHoveredObject(undefined)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="w-4 text-center text-gray-500 hover:text-gray-300"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="text-[10px]">{TYPE_ICONS[node.type] || '⬡'}</span>
        <span className="truncate flex-1">{node.name}</span>
        <span className="text-[10px] text-gray-600">{node.type}</span>
      </div>
      {expanded && hasChildren && (
        <ul>
          {node.children.map((child) => (
            <ObjectTreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
