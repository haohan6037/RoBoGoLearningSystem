export type ModelNode = {
  id: string;
  name: string;
  uuid: string;
  stableKey?: string;
  parentId?: string;
  children: ModelNode[];
  type: 'Group' | 'Mesh' | 'Object3D';
};

export type ObjectState = {
  uuid: string;
  stableKey?: string;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  highlighted?: boolean;
};

export type AssemblyStep = {
  id: string;
  index: number;
  title: string;
  description?: string;
  mode: 'disassembly' | 'assembly';
  objectStates: Record<string, ObjectState>;
  selectedObjectUuids: string[];
  camera?: CameraView;
  createdAt: string;
  sourceStepId?: string;
};

export type BuildPartSummary = {
  id: string;
  name: string;
  partNumber?: string;
  thumbnailUrl?: string | null;
  quantity: number;
};

export type AssemblyProject = {
  version: '0.1.0';
  projectName: string;
  modelFileName?: string;
  modelObjectTree: ModelNode[];
  disassemblySteps: AssemblyStep[];
  assemblySteps: AssemblyStep[];
  currentStepId?: string;
  partsList?: BuildPartSummary[];
};

export type StudioProjectStatus = 'In Progress' | 'Published';
export type StudioProjectType = 'assembly' | 'build-instructions';

export type AssemblyPartInstance = {
  instanceId: string;
  part: import('./partLibrary').PartLibraryItem;
  color: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
};

export type AssemblyMateRecord = {
  id: string;
  type: 'pin' | 'multi-leg' | 'beam' | 'shaft' | 'hole-align';
  fixedInstanceId: string;
  movingInstanceId: string;
  fixedConnectorIds: string[];
  movingConnectorIds: string[];
  createdAt: string;
};

export type AssemblyRigidGroup = {
  id: string;
  name: string;
  instanceIds: string[];
  createdAt: string;
};

export type AssemblyWorkspaceData = {
  instances: AssemblyPartInstance[];
  mateRecords: AssemblyMateRecord[];
  groups: AssemblyRigidGroup[];
};

export type CameraView = {
  position: [number, number, number];
  target: [number, number, number];
  up?: [number, number, number];
};

export type CoverCapture = {
  blob: Blob;
  camera: CameraView;
};

export type ProjectCoverAsset = CoverCapture & {
  type: string;
  updatedAt: string;
};

export type StudioProjectRecord = {
  id: string;
  name: string;
  projectType: StudioProjectType;
  status: StudioProjectStatus;
  createdAt: string;
  updatedAt: string;
  owner: string;
  tags: string[];
  data: AssemblyProject;
  assemblyData?: AssemblyWorkspaceData | null;
  sourceAssemblyProjectId?: string;
  publishedBuildId?: string;
  publishedAt?: string;
  modelAsset?: {
    name: string;
    type: string;
    blob: Blob;
  } | null;
  coverAsset?: ProjectCoverAsset | null;
};

export type PublishedBuildRecord = {
  id: string;
  projectId: string;
  publishedAt: string;
  revokedAt?: string;
  project: StudioProjectRecord;
};
