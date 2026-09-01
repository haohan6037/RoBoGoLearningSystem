'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProjectsDashboard from '@/components/projects/ProjectsDashboard';
import AssemblyPrototypeExperiment from '@/components/ai-design/AssemblyPrototypeExperiment';
import StudioWorkspace from '@/components/studio/StudioWorkspace';
import MateLab from '@/components/mate/MateLab';
import ModelLibraryLab from '@/components/library/ModelLibraryLab';
import {
  createStudioProject,
  deleteStudioProject,
  duplicateStudioProject,
  getPublishedBuildLink,
  listStudioProjects,
  publishStudioProject,
  revokeStudioPublication,
} from '@/lib/projects/projectStorage';
import type { StudioProjectRecord, StudioProjectType } from '@/types/assembly';

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
  const isAssemblyProject = searchParams.get('view') === 'assembly';
  const isPartLibrary = searchParams.get('view') === 'part-library';
  const isAiExperiment = searchParams.get('view') === 'ai-experiment';
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

  const handleCreateProject = async (name: string, projectType: StudioProjectType) => {
    const record = await createStudioProject(name, projectType);
    await refreshProjects();
    router.push(projectType === 'assembly'
      ? `/?projectId=${record.id}&view=assembly`
      : `/?projectId=${record.id}`);
  };

  const handleOpenProject = (nextProjectId: string) => {
    const project = projects.find((candidate) => candidate.id === nextProjectId);
    router.push(project?.projectType === 'assembly'
      ? `/?projectId=${nextProjectId}&view=assembly`
      : `/?projectId=${nextProjectId}`);
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
    const project = projects.find((candidate) => candidate.id === nextProjectId);
    if (!project?.publishedBuildId) {
      setNotice('Publish this project before copying its student link');
      return;
    }
    const link = await getPublishedBuildLink(project.publishedBuildId);
    await copyTextToClipboard(link);
    setNotice('Student build link copied to clipboard');
  };

  const handlePreviewProject = (nextProjectId: string) => {
    const url = new URL('/', window.location.origin);
    url.searchParams.set('projectId', nextProjectId);
    url.searchParams.set('view', 'build');
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  const handlePublishProject = async (nextProjectId: string) => {
    const publication = await publishStudioProject(nextProjectId);
    await refreshProjects();
    await copyTextToClipboard(await getPublishedBuildLink(publication.id));
    setNotice('Published — student link copied to clipboard');
  };

  const handleRevokeProject = async (nextProjectId: string) => {
    const project = projects.find((candidate) => candidate.id === nextProjectId);
    if (!project?.publishedBuildId) return;
    await revokeStudioPublication(project.publishedBuildId);
    await refreshProjects();
    setNotice('Student link withdrawn');
  };

  return (
    <>
      {notice && (
        <div className="fixed right-4 top-4 z-50 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-2xl shadow-slate-900/20">
          {notice}
        </div>
      )}

      {isAiExperiment ? (
        <AssemblyPrototypeExperiment
          onBack={() => router.push('/')}
          onCreated={(createdProjectId) => {
            router.push(`/?projectId=${createdProjectId}&view=assembly`);
          }}
        />
      ) : isAssemblyProject && projectId ? (
        <ModelLibraryLab
          projectId={projectId}
          onBack={handleBackToProjects}
          onBuildInstructionsCreated={(instructionsProjectId) => {
            router.push(`/?projectId=${instructionsProjectId}`);
          }}
        />
      ) : isPartLibrary ? (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
          Open a saved Assembly Project to use the parts library.
        </div>
      ) : isMateLab ? (
        <MateLab onBack={() => router.push('/')} />
      ) : !projectId ? (
        loading ? (
          <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
            Loading projects...
          </div>
        ) : (
          <>
            <ProjectsDashboard
              projects={projects}
              onCreateProject={handleCreateProject}
              onOpenProject={handleOpenProject}
              onDuplicateProject={handleDuplicateProject}
              onDeleteProject={handleDeleteProject}
              onCopyProjectLink={handleCopyProjectLink}
              onPreviewProject={handlePreviewProject}
              onPublishProject={handlePublishProject}
              onRevokeProject={handleRevokeProject}
            />
            <button
              type="button"
              onClick={() => router.push('/?view=ai-experiment')}
              className="fixed bottom-6 right-6 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-blue-950/20 hover:bg-blue-700"
            >
              AI Prototype Experiment
            </button>
          </>
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
