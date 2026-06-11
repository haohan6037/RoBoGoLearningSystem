export type ModelNode = {
  id: string;
  name: string;
  uuid: string;
  parentId?: string;
  children: ModelNode[];
  type: 'Group' | 'Mesh' | 'Object3D';
};

export type ObjectState = {
  uuid: string;
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
  camera?: {
    position: [number, number, number];
    target: [number, number, number];
  };
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
