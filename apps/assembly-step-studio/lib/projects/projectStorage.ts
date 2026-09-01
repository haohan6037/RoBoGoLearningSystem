'use client';

import type { AssemblyProject, PublishedBuildRecord, StudioProjectRecord, StudioProjectType } from '@/types/assembly';
import {
  buildInstructionsFromAssemblyRecord,
  buildStudioProjectRecord,
  normalizeStudioProjectRecord,
} from '@/lib/projects/projectRecords';
import {
  projectFromTransport,
  projectToTransport,
  type TransportStudioProject,
} from '@/lib/projects/projectTransport';

const LEGACY_DB_NAME = 'assembly-step-studio-projects';
const LEGACY_DB_VERSION = 1;
const LEGACY_PROJECT_STORE = 'projects';
const MIGRATION_KEY = 'assembly-step-studio-server-migration-v1';

let legacyDbPromise: Promise<IDBDatabase> | null = null;
const assetReferences = new Map<string, { model?: Blob; cover?: Blob }>();

function openLegacyDatabase(): Promise<IDBDatabase> {
  if (legacyDbPromise) return legacyDbPromise;
  legacyDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open the previous project database.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_PROJECT_STORE)) db.createObjectStore(LEGACY_PROJECT_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
  });
  return legacyDbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('Legacy IndexedDB request failed.'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function listLegacyProjects(): Promise<StudioProjectRecord[]> {
  const db = await openLegacyDatabase();
  const records = await requestToPromise(db.transaction(LEGACY_PROJECT_STORE, 'readonly').objectStore(LEGACY_PROJECT_STORE).getAll());
  return (records as StudioProjectRecord[]).map(normalizeStudioProjectRecord);
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? `Studio storage request failed (${response.status}).`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

async function saveTransport(record: StudioProjectRecord): Promise<StudioProjectRecord> {
  const previousAssets = assetReferences.get(record.id);
  const includeModel = !previousAssets || previousAssets.model !== record.modelAsset?.blob;
  const includeCover = !previousAssets || previousAssets.cover !== record.coverAsset?.blob;
  const payload = await projectToTransport(record, includeModel, includeCover);
  await apiJson<{ saved: true }>('/api/studio', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assetReferences.set(record.id, { model: record.modelAsset?.blob, cover: record.coverAsset?.blob });
  return normalizeStudioProjectRecord(record);
}

async function migrateLegacyProjects(serverProjects: StudioProjectRecord[]): Promise<StudioProjectRecord[]> {
  if (window.localStorage.getItem(MIGRATION_KEY) === 'done') return serverProjects;
  const knownIds = new Set(serverProjects.map((project) => project.id));
  const legacyProjects = await listLegacyProjects();
  const migrated = [...serverProjects];
  for (const project of legacyProjects) {
    if (knownIds.has(project.id)) continue;
    const saved = await saveTransport(project);
    migrated.push(saved);
  }
  window.localStorage.setItem(MIGRATION_KEY, 'done');
  return migrated;
}

function cloneProjectData(project: AssemblyProject): AssemblyProject {
  return JSON.parse(JSON.stringify(project)) as AssemblyProject;
}

export function makePublishedBuildLink(publicationId: string): string {
  const path = `/build/${encodeURIComponent(publicationId)}`;
  return typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString();
}

export async function getPublishedBuildLink(publicationId: string): Promise<string> {
  try {
    const { origin } = await apiJson<{ origin: string }>('/api/studio?networkOrigin=1');
    return new URL(`/build/${encodeURIComponent(publicationId)}`, origin).toString();
  } catch {
    return makePublishedBuildLink(publicationId);
  }
}

export async function listStudioProjects(): Promise<StudioProjectRecord[]> {
  const payload = await apiJson<TransportStudioProject[]>('/api/studio');
  const serverProjects = payload.map((project) => normalizeStudioProjectRecord(projectFromTransport(project)));
  const projects = await migrateLegacyProjects(serverProjects);
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadStudioProject(projectId: string): Promise<StudioProjectRecord | null> {
  try {
    const payload = await apiJson<TransportStudioProject>(`/api/studio?projectId=${encodeURIComponent(projectId)}`);
    const project = normalizeStudioProjectRecord(projectFromTransport(payload));
    assetReferences.set(project.id, { model: project.modelAsset?.blob, cover: project.coverAsset?.blob });
    return project;
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Project not found.') return null;
    throw error;
  }
}

export async function loadPublishedBuild(publicationId: string): Promise<PublishedBuildRecord> {
  const payload = await apiJson<Omit<PublishedBuildRecord, 'project'> & { project: TransportStudioProject }>(
    `/api/studio?publicationId=${encodeURIComponent(publicationId)}`,
  );
  const project = normalizeStudioProjectRecord(projectFromTransport(payload.project));
  assetReferences.set(project.id, { model: project.modelAsset?.blob, cover: project.coverAsset?.blob });
  return { ...payload, project };
}

export async function saveStudioProject(record: StudioProjectRecord): Promise<StudioProjectRecord> {
  return saveTransport(normalizeStudioProjectRecord({ ...record, updatedAt: record.updatedAt || new Date().toISOString() }));
}

export async function createStudioProject(name: string, projectType: StudioProjectType): Promise<StudioProjectRecord> {
  return saveStudioProject(buildStudioProjectRecord(name, projectType));
}

export async function createBuildInstructionsProject(source: StudioProjectRecord, modelBlob: Blob): Promise<StudioProjectRecord> {
  return saveStudioProject(buildInstructionsFromAssemblyRecord(source, modelBlob));
}

export async function deleteStudioProject(projectId: string): Promise<void> {
  await apiJson(`/api/studio?projectId=${encodeURIComponent(projectId)}`, { method: 'DELETE' });
}

export async function duplicateStudioProject(projectId: string): Promise<StudioProjectRecord | null> {
  const source = await loadStudioProject(projectId);
  if (!source) return null;
  const now = new Date().toISOString();
  const name = `${source.name} Copy`;
  return saveStudioProject({
    ...source,
    id: crypto.randomUUID(),
    name,
    status: 'In Progress',
    publishedBuildId: undefined,
    publishedAt: undefined,
    createdAt: now,
    updatedAt: now,
    data: cloneProjectData({ ...source.data, projectName: name }),
  });
}

export async function publishStudioProject(projectId: string): Promise<PublishedBuildRecord> {
  const payload = await apiJson<Omit<PublishedBuildRecord, 'project'> & { project: TransportStudioProject }>('/api/studio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'publish', projectId }),
  });
  return { ...payload, project: normalizeStudioProjectRecord(projectFromTransport(payload.project)) };
}

export async function revokeStudioPublication(publicationId: string): Promise<void> {
  await apiJson('/api/studio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'revoke', publicationId }),
  });
}
