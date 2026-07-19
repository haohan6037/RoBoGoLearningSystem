'use client';

import type { AssemblyProject, StudioProjectRecord, StudioProjectType } from '@/types/assembly';
import {
  buildInstructionsFromAssemblyRecord,
  buildStudioProjectRecord,
  normalizeStudioProjectRecord,
} from '@/lib/projects/projectRecords';

const DB_NAME = 'assembly-step-studio-projects';
const DB_VERSION = 1;
const PROJECT_STORE = 'projects';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error('Failed to open project database.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.oncomplete = () => resolve();
  });
}

function cloneProjectData(project: AssemblyProject): AssemblyProject {
  return JSON.parse(JSON.stringify(project)) as AssemblyProject;
}

export function makeStudioProjectLink(projectId: string): string {
  if (typeof window === 'undefined') {
    return `/?projectId=${encodeURIComponent(projectId)}&view=build`;
  }
  const url = new URL('/', window.location.origin);
  url.searchParams.set('projectId', projectId);
  url.searchParams.set('view', 'build');
  return url.toString();
}

export async function listStudioProjects(): Promise<StudioProjectRecord[]> {
  const db = await openDatabase();
  const transaction = db.transaction(PROJECT_STORE, 'readonly');
  const store = transaction.objectStore(PROJECT_STORE);
  const records = await requestToPromise(store.getAll());
  await transactionDone(transaction);
  return (records as StudioProjectRecord[])
    .map(normalizeStudioProjectRecord)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadStudioProject(projectId: string): Promise<StudioProjectRecord | null> {
  const db = await openDatabase();
  const transaction = db.transaction(PROJECT_STORE, 'readonly');
  const store = transaction.objectStore(PROJECT_STORE);
  const record = await requestToPromise(store.get(projectId));
  await transactionDone(transaction);
  return record ? normalizeStudioProjectRecord(record as StudioProjectRecord) : null;
}

export async function saveStudioProject(record: StudioProjectRecord): Promise<StudioProjectRecord> {
  const nextRecord = normalizeStudioProjectRecord({
    ...record,
    updatedAt: record.updatedAt || new Date().toISOString(),
  });
  const db = await openDatabase();
  const transaction = db.transaction(PROJECT_STORE, 'readwrite');
  const store = transaction.objectStore(PROJECT_STORE);
  store.put(nextRecord);
  await transactionDone(transaction);
  return nextRecord;
}

export async function createStudioProject(
  name: string,
  projectType: StudioProjectType,
): Promise<StudioProjectRecord> {
  return saveStudioProject(buildStudioProjectRecord(name, projectType));
}

export async function createBuildInstructionsProject(
  source: StudioProjectRecord,
  modelBlob: Blob,
): Promise<StudioProjectRecord> {
  return saveStudioProject(buildInstructionsFromAssemblyRecord(source, modelBlob));
}

export async function deleteStudioProject(projectId: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(PROJECT_STORE, 'readwrite');
  const store = transaction.objectStore(PROJECT_STORE);
  store.delete(projectId);
  await transactionDone(transaction);
}

export async function duplicateStudioProject(projectId: string): Promise<StudioProjectRecord | null> {
  const source = await loadStudioProject(projectId);
  if (!source) return null;
  const now = new Date().toISOString();
  const duplicate: StudioProjectRecord = {
    ...source,
    id: crypto.randomUUID(),
    name: `${source.name} Copy`,
    createdAt: now,
    updatedAt: now,
    data: cloneProjectData({
      ...source.data,
      projectName: `${source.name} Copy`,
    }),
    modelAsset: source.modelAsset
      ? {
          name: source.modelAsset.name,
          type: source.modelAsset.type,
          blob: source.modelAsset.blob,
        }
      : null,
    coverAsset: source.coverAsset
      ? {
          blob: source.coverAsset.blob,
          type: source.coverAsset.type,
          updatedAt: source.coverAsset.updatedAt,
          camera: {
            position: [...source.coverAsset.camera.position],
            target: [...source.coverAsset.camera.target],
          },
        }
      : null,
  };
  return saveStudioProject(duplicate);
}
