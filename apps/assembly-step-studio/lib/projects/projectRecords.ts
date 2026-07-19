import type {
  AssemblyProject,
  StudioProjectRecord,
  StudioProjectType,
} from '../../types/assembly.ts';

export function buildEmptyAssemblyProject(name: string): AssemblyProject {
  return {
    version: '0.1.0',
    projectName: name,
    modelObjectTree: [],
    disassemblySteps: [],
    assemblySteps: [],
  };
}

export function buildStudioProjectRecord(
  name: string,
  projectType: StudioProjectType,
  id = crypto.randomUUID(),
): StudioProjectRecord {
  const now = new Date().toISOString();
  return {
    id,
    name,
    projectType,
    status: 'In Progress',
    createdAt: now,
    updatedAt: now,
    owner: 'Admin',
    tags: [],
    data: buildEmptyAssemblyProject(name),
    assemblyData: projectType === 'assembly' ? { instances: [], mateRecords: [], groups: [] } : null,
    modelAsset: null,
    coverAsset: null,
  };
}

export function buildInstructionsFromAssemblyRecord(
  source: StudioProjectRecord,
  modelBlob: Blob,
  id = crypto.randomUUID(),
): StudioProjectRecord {
  const record = buildStudioProjectRecord(`${source.name} Build Instructions`, 'build-instructions', id);
  const modelName = `${source.name.replace(/[^a-z0-9-_]+/gi, '_') || 'assembly'}.glb`;
  return {
    ...record,
    sourceAssemblyProjectId: source.id,
    data: { ...record.data, modelFileName: modelName },
    modelAsset: {
      name: modelName,
      type: 'model/gltf-binary',
      blob: modelBlob,
    },
  };
}

export function normalizeStudioProjectRecord(
  record: Omit<StudioProjectRecord, 'projectType'> & Partial<Pick<StudioProjectRecord, 'projectType'>>,
): StudioProjectRecord {
  const projectType: StudioProjectType = record.projectType ?? 'build-instructions';
  return {
    ...record,
    projectType,
    status: record.status ?? 'Published',
    owner: record.owner || 'Admin',
    tags: record.tags ?? [],
    data: {
      ...record.data,
      projectName: record.name,
      version: '0.1.0',
      modelObjectTree: record.data?.modelObjectTree ?? [],
      disassemblySteps: record.data?.disassemblySteps ?? [],
      assemblySteps: record.data?.assemblySteps ?? [],
    },
    assemblyData: projectType === 'assembly'
      ? {
          instances: record.assemblyData?.instances ?? [],
          mateRecords: record.assemblyData?.mateRecords ?? [],
          groups: record.assemblyData?.groups ?? [],
        }
      : null,
    modelAsset: record.modelAsset ?? null,
    coverAsset: record.coverAsset ?? null,
  };
}
