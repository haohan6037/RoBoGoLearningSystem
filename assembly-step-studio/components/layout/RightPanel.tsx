'use client';

import ObjectActions from '@/components/actions/ObjectActions';
import StepPanel from '@/components/steps/StepPanel';

export default function RightPanel() {
  return (
    <aside className="w-72 bg-gray-950 border-l border-gray-800 flex flex-col shrink-0">
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-800">
        Steps
      </div>
      <ObjectActions />
      <div className="flex-1 overflow-hidden">
        <StepPanel />
      </div>
    </aside>
  );
}
