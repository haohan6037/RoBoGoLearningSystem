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
};

export type AssemblyProject = {
  version: '0.1.0';
  projectName: string;
  modelFileName?: string;
  modelObjectTree: ModelNode[];
  disassemblySteps: AssemblyStep[];
  assemblySteps: AssemblyStep[];
  currentStepId?: string;
};

export type StudioProjectStatus = 'In Progress' | 'Published';

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
  status: StudioProjectStatus;
  createdAt: string;
  updatedAt: string;
  owner: string;
  tags: string[];
  data: AssemblyProject;
  modelAsset?: {
    name: string;
    type: string;
    blob: Blob;
  } | null;
  coverAsset?: ProjectCoverAsset | null;
};
