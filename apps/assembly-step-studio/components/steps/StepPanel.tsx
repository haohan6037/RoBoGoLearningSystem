'use client';

import { useState } from 'react';
import { useAssemblyStore } from '@/store/useAssemblyStore';
import StepList from './StepList';

export default function StepPanel() {
  const saveCurrentStep = useAssemblyStore((s) => s.saveCurrentStep);
  const generateAssemblySteps = useAssemblyStore((s) => s.generateAssemblySteps);
  const [tab, setTab] = useState<'disassembly' | 'assembly'>('disassembly');

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Create Step</h3>
        <button
          onClick={saveCurrentStep}
          className="w-full px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded transition-colors"
        >
          Generate Step from Current State
        </button>
      </div>

      <div className="flex border-b border-gray-800">
        <button onClick={() => setTab('disassembly')} className={`flex-1 py-1.5 text-xs ${tab === 'disassembly' ? 'bg-gray-800 text-white' : 'text-gray-500'}`}>Disassembly</button>
        <button onClick={() => setTab('assembly')} className={`flex-1 py-1.5 text-xs ${tab === 'assembly' ? 'bg-gray-800 text-white' : 'text-gray-500'}`}>Build</button>
      </div>

      <div className="flex-1 overflow-auto">
        <StepList mode={tab} />
      </div>

      <div className="p-2 border-t border-gray-800">
        <button
          onClick={generateAssemblySteps}
          className="w-full px-2 py-1.5 text-xs bg-green-700 hover:bg-green-600 rounded transition-colors"
        >
          Generate Build Steps
        </button>
      </div>
    </div>
  );
}
