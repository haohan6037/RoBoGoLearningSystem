'use client';

import { useAssemblyStore } from '@/store/useAssemblyStore';
import StepItem from './StepItem';

interface Props {
  mode: 'disassembly' | 'assembly';
}

export default function StepList({ mode }: Props) {
  const steps = useAssemblyStore((s) =>
    mode === 'disassembly' ? s.disassemblySteps : s.assemblySteps
  );
  const currentStepId = useAssemblyStore((s) => s.currentStepId);
  const applyStep = useAssemblyStore((s) => s.applyStep);
  const deleteStep = useAssemblyStore((s) => s.deleteStep);

  return (
    <div className="p-2 space-y-1">
      {steps.length === 0 && (
        <p className="text-xs text-gray-600 text-center py-4">
          {mode === 'disassembly' ? 'No disassembly steps yet.' : 'Generate build steps first.'}
        </p>
      )}
      {steps.map((step) => (
        <StepItem
          key={step.id}
          step={step}
          isActive={step.id === currentStepId}
          onApply={() => applyStep(step.id)}
          onDelete={() => deleteStep(step.id)}
        />
      ))}
    </div>
  );
}
