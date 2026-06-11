'use client';

import dynamic from 'next/dynamic';
import TopBar from './TopBar';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';

const ViewerCanvas = dynamic(() => import('@/components/viewer/ViewerCanvas'), {
  ssr: false,
});

export default function AppShell() {
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel />
        <main className="flex-1">
          <ViewerCanvas />
        </main>
        <RightPanel />
      </div>
    </div>
  );
}
