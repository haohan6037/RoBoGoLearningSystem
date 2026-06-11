'use client';

import type { AssemblyStep } from '@/types/assembly';

interface Props {
  step: AssemblyStep;
  isActive: boolean;
  onApply: () => void;
  onDelete: () => void;
}

export default function StepItem({ step, isActive, onApply, onDelete }: Props) {
  return (
    <div className={`p-2 rounded text-xs cursor-pointer transition-colors ${isActive ? 'bg-blue-900 border border-blue-700' : 'bg-gray-800 hover:bg-gray-700 border border-gray-700'}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-200 truncate flex-1" onClick={onApply}>
          #{step.index} {step.title}
        </span>
        <button onClick={onDelete} className="text-gray-500 hover:text-red-400 ml-1">✕</button>
      </div>
      {step.description && (
        <p className="text-gray-500 mt-0.5 truncate">{step.description}</p>
      )}
    </div>
  );
}
