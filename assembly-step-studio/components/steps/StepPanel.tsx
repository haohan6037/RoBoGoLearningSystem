'use client';

import { useState } from 'react';
import { useAssemblyStore } from '@/store/useAssemblyStore';
import StepList from './StepList';

export default function StepPanel() {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const saveCurrentStep = useAssemblyStore((s) => s.saveCurrentStep);
  const generateAssemblySteps = useAssemblyStore((s) => s.generateAssemblySteps);
  const [tab, setTab] = useState<'disassembly' | 'assembly'>('disassembly');

  const handleSave = () => {
    if (!title.trim()) return;
    saveCurrentStep(title.trim(), desc.trim());
    setTitle('');
    setDesc('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Save Step</h3>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Step title"
          className="w-full px-2 py-1 text-xs bg-gray-800 rounded border border-gray-700 mb-1"
        />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description (optional)"
          className="w-full px-2 py-1 text-xs bg-gray-800 rounded border border-gray-700 mb-2"
        />
        <button
          onClick={handleSave}
          className="w-full px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded transition-colors"
        >
          Save Current State as Step
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
