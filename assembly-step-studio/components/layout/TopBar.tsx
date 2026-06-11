'use client';

import { useRef, useEffect } from 'react';
import { useAssemblyStore } from '@/store/useAssemblyStore';
import { downloadProjectJSON, readProjectJSON } from '@/lib/steps/exportProject';

const STORAGE_KEY = 'assembly-step-studio-project';

export default function TopBar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const setModelUrl = useAssemblyStore((s) => s.setModelUrl);
  const modelFileName = useAssemblyStore((s) => s.modelFileName);
  const exportProject = useAssemblyStore((s) => s.exportProject);
  const importProject = useAssemblyStore((s) => s.importProject);
  const disassemblySteps = useAssemblyStore((s) => s.disassemblySteps);

  useEffect(() => {
     
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const project = JSON.parse(saved);
        importProject(project);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
     
    if (disassemblySteps.length > 0) {
      try {
        const project = exportProject();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      } catch (e) {
        // localStorage quota exceeded — silently skip auto-save
        console.warn('AssemblyStepStudio: localStorage quota exceeded, use Export JSON to save manually.');
      }
    }
  }, [disassemblySteps, exportProject]);

  const handleUploadClick = () => fileInputRef.current?.click();
  const handleImportClick = () => importRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setModelUrl(url, file.name);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const project = await readProjectJSON(file);
      importProject(project);
    } catch {
      alert('Failed to import project file.');
    }
  };

  const handleExport = () => {
    const project = exportProject();
    downloadProjectJSON(project);
  };

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 h-12 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-gray-200">AssemblyStepStudio</h1>
        {modelFileName && (
          <span className="text-xs text-gray-500">— {modelFileName}</span>
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
        <button onClick={handleExport} className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 transition-colors">
          Export JSON
        </button>
      </div>
    </header>
  );
}
