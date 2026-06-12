'use client';

import dynamic from 'next/dynamic';
import TopBar from './TopBar';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';

const ViewerCanvas = dynamic(() => import('@/components/viewer/ViewerCanvas'), {
  ssr: false,
});

interface Props {
  projectId: string;
  projectName: string;
  onBackToProjects: () => void;
  onUploadModel: (file: File) => void;
  onImportJson: (file: File) => Promise<void> | void;
  onExportJson: () => void;
}

export default function AppShell({
  projectId,
  projectName,
  onBackToProjects,
  onUploadModel,
  onImportJson,
  onExportJson,
}: Props) {
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      <TopBar
        projectId={projectId}
        projectName={projectName}
        onBackToProjects={onBackToProjects}
        onUploadModel={onUploadModel}
        onImportJson={onImportJson}
        onExportJson={onExportJson}
      />
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
