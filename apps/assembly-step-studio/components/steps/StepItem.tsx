'use client';

import type { AssemblyStep } from '@/types/assembly';

interface Props {
  step: AssemblyStep;
  isActive: boolean;
  onApply: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export default function StepItem({
  step,
  isActive,
  onApply,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: Props) {
  return (
    <div className={`p-2 rounded text-xs cursor-pointer transition-all ${isActive ? 'bg-blue-900 border border-blue-700' : 'bg-gray-800 hover:bg-gray-700 border border-gray-700'}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-200 truncate flex-1" onClick={onApply}>
          #{step.index} {step.title}
        </span>
        <span className="flex items-center gap-0.5 ml-1">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="px-1 text-gray-500 hover:text-gray-200 disabled:opacity-30 disabled:hover:text-gray-500"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="px-1 text-gray-500 hover:text-gray-200 disabled:opacity-30 disabled:hover:text-gray-500"
          >
            ↓
          </button>
          <button onClick={onDelete} className="text-gray-500 hover:text-red-400 ml-0.5">✕</button>
        </span>
      </div>
      {step.description && (
        <p className="text-gray-500 mt-0.5 truncate">{step.description}</p>
      )}
    </div>
  );
}
