'use client';

import { useEffect, useRef, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import BuildStepsPresentation from '@/components/build/BuildStepsPresentation';
import { downloadProjectJSON, readProjectJSON } from '@/lib/steps/exportProject';
import { loadStudioProject, saveStudioProject } from '@/lib/projects/projectStorage';
import { useAssemblyStore } from '@/store/useAssemblyStore';
import type { AssemblyProject, CoverCapture, StudioProjectRecord } from '@/types/assembly';

interface Props {
  projectId: string;
  presentationMode: boolean;
  onBackToProjects: () => void;
  onProjectSaved: () => Promise<void> | void;
}

export default function StudioWorkspace({ projectId, presentationMode, onBackToProjects, onProjectSaved }: Props) {
  const resetEditor = useAssemblyStore((s) => s.resetEditor);
  const setModelUrl = useAssemblyStore((s) => s.setModelUrl);
  const setProjectName = useAssemblyStore((s) => s.setProjectName);
  const importProject = useAssemblyStore((s) => s.importProject);
  const exportProject = useAssemblyStore((s) => s.exportProject);
  const objectTree = useAssemblyStore((s) => s.objectTree);
  const disassemblySteps = useAssemblyStore((s) => s.disassemblySteps);
  const assemblySteps = useAssemblyStore((s) => s.assemblySteps);
  const currentStepId = useAssemblyStore((s) => s.currentStepId);
  const modelFileName = useAssemblyStore((s) => s.modelFileName);
  const projectName = useAssemblyStore((s) => s.projectName);

  const [record, setRecord] = useState<StudioProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);

  const recordRef = useRef<StudioProjectRecord | null>(null);
  const queuedImportRef = useRef<AssemblyProject | null>(null);
  const hydratedRef = useRef(false);
  const objectUrlRef = useRef<string | null>(null);
  const coverUrlRef = useRef<string | null>(null);
  const modelAssetRef = useRef<StudioProjectRecord['modelAsset']>(null);
  const coverAssetRef = useRef<StudioProjectRecord['coverAsset']>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      if (coverUrlRef.current) {
        URL.revokeObjectURL(coverUrlRef.current);
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadProjectRecord = async () => {
      setLoading(true);
      setNotFound(false);
      hydratedRef.current = false;
      queuedImportRef.current = null;
      resetEditor('Untitled Project');

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      if (coverUrlRef.current) {
        URL.revokeObjectURL(coverUrlRef.current);
        coverUrlRef.current = null;
      }
      setCoverImageUrl(null);

      const loaded = await loadStudioProject(projectId);
      if (cancelled) return;

      if (!loaded) {
        recordRef.current = null;
        setRecord(null);
        setNotFound(true);
        setLoading(false);
        return;
      }

      recordRef.current = loaded;
      setRecord(loaded);
      setProjectName(loaded.name);
      modelAssetRef.current = loaded.modelAsset ?? null;
      coverAssetRef.current = loaded.coverAsset ?? null;
      queuedImportRef.current = { ...loaded.data, projectName: loaded.name };

      if (loaded.coverAsset?.blob) {
        const nextCoverUrl = URL.createObjectURL(loaded.coverAsset.blob);
        coverUrlRef.current = nextCoverUrl;
        setCoverImageUrl(nextCoverUrl);
      }

      if (loaded.modelAsset?.blob) {
        const nextUrl = URL.createObjectURL(loaded.modelAsset.blob);
        objectUrlRef.current = nextUrl;
        setModelUrl(nextUrl, loaded.modelAsset.name);
      } else {
        importProject({ ...loaded.data, projectName: loaded.name });
        queuedImportRef.current = null;
        hydratedRef.current = true;
      }

      setLoading(false);
    };

    loadProjectRecord();

    return () => {
      cancelled = true;
    };
  }, [projectId, resetEditor, setModelUrl, setProjectName, importProject]);

  useEffect(() => {
    if (!record || !modelAssetRef.current || objectTree.length === 0) return;

    const queuedImport = queuedImportRef.current;
    if (queuedImport) {
      importProject({ ...queuedImport, projectName: record.name });
      queuedImportRef.current = null;
    }

    hydratedRef.current = true;
  }, [record, objectTree.length, importProject]);

  useEffect(() => {
    if (presentationMode || !recordRef.current || !hydratedRef.current) return;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      const exported = exportProject();
      const baseRecord = recordRef.current;
      if (!baseRecord) return;
      const nextRecord: StudioProjectRecord = {
        ...baseRecord,
        name: projectName,
        updatedAt: new Date().toISOString(),
        data: {
          ...exported,
          projectName,
        },
        modelAsset: modelAssetRef.current ?? null,
        coverAsset: coverAssetRef.current ?? null,
      };
      const saved = await saveStudioProject(nextRecord);
      recordRef.current = saved;
      setRecord(saved);
      await onProjectSaved();
    }, 280);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    projectName,
    modelFileName,
    objectTree.length,
    disassemblySteps,
    assemblySteps,
    currentStepId,
    exportProject,
    onProjectSaved,
    presentationMode,
  ]);

  const handleModelUpload = (file: File) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;
    modelAssetRef.current = {
      name: file.name,
      type: file.type || 'model/gltf-binary',
      blob: file,
    };
    coverAssetRef.current = null;
    if (coverUrlRef.current) {
      URL.revokeObjectURL(coverUrlRef.current);
      coverUrlRef.current = null;
    }
    setCoverImageUrl(null);
    setModelUrl(nextUrl, file.name);
    hydratedRef.current = false;
  };

  const handleImportJson = async (file: File) => {
    const imported = await readProjectJSON(file);
    const normalizedImport = { ...imported, projectName };
    queuedImportRef.current = normalizedImport;
    if (objectTree.length > 0 || !modelAssetRef.current) {
      importProject(normalizedImport);
      if (objectTree.length > 0) {
        queuedImportRef.current = null;
      }
      hydratedRef.current = true;
    }
  };

  const handleExportJson = () => {
    const exported = exportProject();
    downloadProjectJSON({ ...exported, projectName });
  };

  const handleCoverCaptured = async ({ blob, camera }: CoverCapture) => {
    const baseRecord = recordRef.current;
    if (!baseRecord) throw new Error('Project is not loaded.');

    const coverAsset: NonNullable<StudioProjectRecord['coverAsset']> = {
      blob,
      camera,
      type: blob.type || 'image/webp',
      updatedAt: new Date().toISOString(),
    };
    const exported = exportProject();
    const nextRecord: StudioProjectRecord = {
      ...baseRecord,
      name: projectName,
      updatedAt: coverAsset.updatedAt,
      data: { ...exported, projectName },
      modelAsset: modelAssetRef.current ?? null,
      coverAsset,
    };
    const saved = await saveStudioProject(nextRecord);
    recordRef.current = saved;
    coverAssetRef.current = coverAsset;
    setRecord(saved);

    if (coverUrlRef.current) URL.revokeObjectURL(coverUrlRef.current);
    const nextCoverUrl = URL.createObjectURL(blob);
    coverUrlRef.current = nextCoverUrl;
    setCoverImageUrl(nextCoverUrl);
    await onProjectSaved();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">
        Loading project...
      </div>
    );
  }

  if (notFound || !record) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center text-slate-200">
        <div>
          <h1 className="text-2xl font-semibold">Project not found</h1>
          <p className="mt-2 text-sm text-slate-400">This designer link does not point to a local project on this machine.</p>
        </div>
        <button
          onClick={onBackToProjects}
          className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  if (presentationMode) {
    return (
      <BuildStepsPresentation
        projectName={projectName}
        stepCount={record.data.assemblySteps.length}
        coverImageUrl={coverImageUrl}
        coverCamera={record.coverAsset?.camera}
        onBackToProjects={onBackToProjects}
      />
    );
  }

  return (
    <AppShell
        projectId={record.id}
        projectName={projectName}
        onBackToProjects={onBackToProjects}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
      onUploadModel={handleModelUpload}
      onCoverCaptured={handleCoverCaptured}
    />
  );
}
