'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProjectsDashboard from '@/components/projects/ProjectsDashboard';
import StudioWorkspace from '@/components/studio/StudioWorkspace';
import MateLab from '@/components/mate/MateLab';
import ModelLibraryLab from '@/components/library/ModelLibraryLab';
import {
  createStudioProject,
  deleteStudioProject,
  duplicateStudioProject,
  listStudioProjects,
  makeStudioProjectLink,
} from '@/lib/projects/projectStorage';
import type { StudioProjectRecord } from '@/types/assembly';

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
}

export default function StudioHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const isBuildPresentation = searchParams.get('view') === 'build';
  const isMateLab = searchParams.get('view') === 'mate-lab';
  const isPartLibrary = searchParams.get('view') === 'part-library';
  const [projects, setProjects] = useState<StudioProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    setProjects(await listStudioProjects());
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshProjects();
    })();
  }, [refreshProjects]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleCreateProject = async (name: string) => {
    const record = await createStudioProject(name);
    await refreshProjects();
    router.push(`/?projectId=${record.id}`);
  };

  const handleOpenProject = (nextProjectId: string) => {
    router.push(`/?projectId=${nextProjectId}`);
  };

  const handleBackToProjects = async () => {
    router.push('/');
    await refreshProjects();
  };

  const handleDuplicateProject = async (nextProjectId: string) => {
    const duplicated = await duplicateStudioProject(nextProjectId);
    await refreshProjects();
    if (duplicated) setNotice(`Duplicated "${duplicated.name}"`);
  };

  const handleDeleteProject = async (nextProjectId: string) => {
    await deleteStudioProject(nextProjectId);
    await refreshProjects();
    setNotice('Project deleted');
    if (projectId === nextProjectId) {
      router.push('/');
    }
  };

  const handleCopyProjectLink = async (nextProjectId: string) => {
    const link = makeStudioProjectLink(nextProjectId);
    await copyTextToClipboard(link);
    setNotice('Student build link copied to clipboard');
  };

  const handlePreviewProject = (nextProjectId: string) => {
    window.open(makeStudioProjectLink(nextProjectId), '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {notice && (
        <div className="fixed right-4 top-4 z-50 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-2xl shadow-slate-900/20">
          {notice}
        </div>
      )}

      {isPartLibrary ? (
        <ModelLibraryLab onBack={() => router.push('/')} />
      ) : isMateLab ? (
        <MateLab onBack={() => router.push('/')} />
      ) : !projectId ? (
        loading ? (
          <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
            Loading projects...
          </div>
        ) : (
          <div className="relative min-h-screen">
            <ProjectsDashboard
              projects={projects}
              onCreateProject={handleCreateProject}
              onOpenProject={handleOpenProject}
              onDuplicateProject={handleDuplicateProject}
              onDeleteProject={handleDeleteProject}
              onCopyProjectLink={handleCopyProjectLink}
              onPreviewProject={handlePreviewProject}
            />
            <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3">
              <button
                onClick={() => router.push('/?view=part-library')}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Open Model Library
              </button>
              <button
                onClick={() => router.push('/?view=mate-lab')}
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700"
              >
                Open Mate Lab
              </button>
            </div>
          </div>
        )
      ) : (
        <StudioWorkspace
          projectId={projectId}
          presentationMode={isBuildPresentation}
          onBackToProjects={handleBackToProjects}
          onProjectSaved={refreshProjects}
        />
      )}
    </>
  );
}
