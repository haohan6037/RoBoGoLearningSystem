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

function buildPartsListFromAssemblyRecord(
  source: StudioProjectRecord,
): NonNullable<AssemblyProject['partsList']> {
  const partCounts = new Map<string, NonNullable<AssemblyProject['partsList']>[number]>();
  for (const instance of source.assemblyData?.instances ?? []) {
    const existing = partCounts.get(instance.part.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      partCounts.set(instance.part.id, {
        id: instance.part.id,
        name: instance.part.name,
        partNumber: instance.part.partNumber,
        thumbnailUrl: instance.part.thumbnailUrl,
        quantity: 1,
      });
    }
  }
  return [...partCounts.values()].sort((a, b) => (
    a.name.localeCompare(b.name, undefined, { numeric: true })
  ));
}

export function refreshBuildInstructionsFromAssemblyRecord(
  instructions: StudioProjectRecord,
  source: StudioProjectRecord,
): StudioProjectRecord {
  return {
    ...instructions,
    sourceAssemblyProjectId: source.id,
    updatedAt: new Date().toISOString(),
    data: {
      ...instructions.data,
      partsList: buildPartsListFromAssemblyRecord(source),
    },
    coverAsset: source.coverAsset ? { ...source.coverAsset } : null,
  };
}

export function buildInstructionsFromAssemblyRecord(
  source: StudioProjectRecord,
  modelBlob: Blob,
  id = crypto.randomUUID(),
): StudioProjectRecord {
  const record = buildStudioProjectRecord(`${source.name} Build Instructions`, 'build-instructions', id);
  const modelName = `${source.name.replace(/[^a-z0-9-_]+/gi, '_') || 'assembly'}.glb`;
  const refreshed = refreshBuildInstructionsFromAssemblyRecord(record, source);
  return {
    ...refreshed,
    data: {
      ...refreshed.data,
      modelFileName: modelName,
    },
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
      partsList: record.data?.partsList ?? [],
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
