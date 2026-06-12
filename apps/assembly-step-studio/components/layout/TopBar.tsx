'use client';

import { useRef } from 'react';
import { useAssemblyStore } from '@/store/useAssemblyStore';

interface Props {
  projectId: string;
  projectName: string;
  onBackToProjects: () => void;
  onUploadModel: (file: File) => void;
  onImportJson: (file: File) => Promise<void> | void;
  onExportJson: () => void;
}

export default function TopBar({
  projectId,
  projectName,
  onBackToProjects,
  onUploadModel,
  onImportJson,
  onExportJson,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const modelFileName = useAssemblyStore((s) => s.modelFileName);

  const handleUploadClick = () => fileInputRef.current?.click();
  const handleImportClick = () => importRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUploadModel(file);
    e.target.value = '';
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await onImportJson(file);
    } catch {
      alert('Failed to import project file.');
    }
    e.target.value = '';
  };

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 h-14 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onBackToProjects}
          className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 transition hover:bg-gray-700"
        >
          Projects
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-gray-100">{projectName}</h1>
          <p className="truncate text-[11px] text-gray-500">Project ID: {projectId}</p>
        </div>
        {modelFileName && (
          <span className="hidden rounded-full border border-gray-700 bg-gray-800 px-2.5 py-1 text-[11px] text-gray-400 lg:inline-flex">
            {modelFileName}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <input ref={fileInputRef} type="file" accept=".glb,.gltf" className="hidden" onChange={handleFileChange} />
        <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        <button onClick={handleUploadClick} className="px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded border border-blue-600 transition-colors">
          Upload GLB
        </button>
        <button onClick={handleImportClick} className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 transition-colors">
          Import JSON
        </button>
        <button onClick={onExportJson} className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 transition-colors">
          Export JSON
        </button>
      </div>
    </header>
  );
}
