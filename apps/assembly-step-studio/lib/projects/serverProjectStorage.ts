import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PublishedBuildRecord } from '@/types/assembly';
import type { TransportStudioProject } from '@/lib/projects/projectTransport';

const STORAGE_ROOT = process.env.ASSEMBLY_STUDIO_STORAGE_DIR
  ? path.resolve(process.env.ASSEMBLY_STUDIO_STORAGE_DIR)
  : path.join(process.cwd(), 'data', 'studio-storage');
const PROJECTS_DIR = path.join(STORAGE_ROOT, 'projects');
const PUBLICATIONS_DIR = path.join(STORAGE_ROOT, 'publications');
const PROJECT_SUMMARIES_DIR = path.join(STORAGE_ROOT, 'project-summaries');

type ProjectSummary = Omit<TransportStudioProject, 'modelAsset' | 'coverAsset'> & {
  modelAsset: null;
  coverAsset: null;
};

function projectSummary(record: TransportStudioProject): ProjectSummary {
  return {
    ...record,
    data: {
      ...record.data,
      modelObjectTree: [],
      disassemblySteps: [],
      assemblySteps: [],
      partsList: [],
    },
    assemblyData: null,
    modelAsset: null,
    coverAsset: null,
  };
}

function safeId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(value)) throw new Error('Invalid record id.');
  return value;
}

async function ensureStorage(): Promise<void> {
  await Promise.all([
    mkdir(PROJECTS_DIR, { recursive: true }),
    mkdir(PUBLICATIONS_DIR, { recursive: true }),
    mkdir(PROJECT_SUMMARIES_DIR, { recursive: true }),
  ]);
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await ensureStorage();
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value), 'utf8');
  await rename(temporaryPath, filePath);
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function removeFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function listServerProjects(): Promise<TransportStudioProject[]> {
  await ensureStorage();
  const names = await readdir(PROJECTS_DIR);
  const records = await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
    const summaryPath = path.join(PROJECT_SUMMARIES_DIR, name);
    const summary = await readJson<ProjectSummary>(summaryPath);
    if (summary) return summary;
    const record = await readJson<TransportStudioProject>(path.join(PROJECTS_DIR, name));
    if (record) await writeJsonAtomic(summaryPath, projectSummary(record));
    return record ? projectSummary(record) : null;
  }));
  return records.filter((record): record is ProjectSummary => Boolean(record)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadServerProject(id: string): Promise<TransportStudioProject | null> {
  return readJson<TransportStudioProject>(path.join(PROJECTS_DIR, `${safeId(id)}.json`));
}

export async function saveServerProject(record: TransportStudioProject): Promise<TransportStudioProject> {
  const existing = await loadServerProject(record.id);
  const merged: TransportStudioProject = {
    ...existing,
    ...record,
    modelAsset: Object.prototype.hasOwnProperty.call(record, 'modelAsset') ? record.modelAsset : existing?.modelAsset,
    coverAsset: Object.prototype.hasOwnProperty.call(record, 'coverAsset') ? record.coverAsset : existing?.coverAsset,
  };
  await writeJsonAtomic(path.join(PROJECTS_DIR, `${safeId(record.id)}.json`), merged);
  await writeJsonAtomic(path.join(PROJECT_SUMMARIES_DIR, `${safeId(record.id)}.json`), projectSummary(merged));
  return merged;
}

export async function deleteServerProject(id: string): Promise<void> {
  const safeProjectId = safeId(id);
  await Promise.all([
    removeFile(path.join(PROJECTS_DIR, `${safeProjectId}.json`)),
    removeFile(path.join(PROJECT_SUMMARIES_DIR, `${safeProjectId}.json`)),
  ]);
}

type TransportPublication = Omit<PublishedBuildRecord, 'project'> & { project: TransportStudioProject };

export async function publishServerProject(projectId: string): Promise<TransportPublication> {
  const project = await loadServerProject(projectId);
  if (!project || project.projectType !== 'build-instructions') throw new Error('Build Instructions project not found.');
  const now = new Date().toISOString();
  if (project.publishedBuildId) await revokeServerPublication(project.publishedBuildId);
  const publication: TransportPublication = {
    id: randomUUID(),
    projectId,
    publishedAt: now,
    project: {
      ...project,
      status: 'Published',
      publishedAt: now,
    },
  };
  publication.project.publishedBuildId = publication.id;
  await writeJsonAtomic(path.join(PUBLICATIONS_DIR, `${publication.id}.json`), publication);
  await saveServerProject(publication.project);
  return publication;
}

export function loadServerPublication(id: string): Promise<TransportPublication | null> {
  return readJson<TransportPublication>(path.join(PUBLICATIONS_DIR, `${safeId(id)}.json`));
}

export async function revokeServerPublication(id: string): Promise<TransportPublication | null> {
  const publication = await loadServerPublication(id);
  if (!publication || publication.revokedAt) return publication;
  const revoked = { ...publication, revokedAt: new Date().toISOString() };
  await writeJsonAtomic(path.join(PUBLICATIONS_DIR, `${safeId(id)}.json`), revoked);
  const project = await loadServerProject(publication.projectId);
  if (project?.publishedBuildId === id) {
    await saveServerProject({
      ...project,
      status: 'In Progress',
      publishedBuildId: undefined,
      publishedAt: undefined,
      updatedAt: new Date().toISOString(),
    });
  }
  return revoked;
}
