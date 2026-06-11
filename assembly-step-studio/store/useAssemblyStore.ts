import { create } from 'zustand';
import type { ModelNode, ObjectState, AssemblyStep, AssemblyProject } from '@/types/assembly';

let stepCounter = 0;
function makeId(): string {
  return `step-${Date.now()}-${stepCounter++}-${Math.random().toString(36).slice(2, 8)}`;
}

interface AssemblyStore {
  modelUrl?: string;
  modelFileName?: string;
  projectName: string;
  objectTree: ModelNode[];
  selectedObjectUuids: string[];
  objectStates: Record<string, ObjectState>;
  initialObjectStates: Record<string, ObjectState>;
  disassemblySteps: AssemblyStep[];
  assemblySteps: AssemblyStep[];
  currentStepId?: string;
  currentMode: 'edit' | 'disassembly-preview' | 'assembly-preview';

  setProjectName: (name: string) => void;
  setModelUrl: (url: string, fileName: string) => void;
  setObjectTree: (tree: ModelNode[]) => void;
  saveInitialStates: (states: Record<string, ObjectState>) => void;
  selectObject: (uuid: string, multi?: boolean) => void;
  deselectAll: () => void;
  updateObjectState: (uuid: string, updates: Partial<ObjectState>) => void;
  hideSelected: () => void;
  showSelected: () => void;
  showAll: () => void;
  moveSelected: (axis: 'x' | 'y' | 'z', delta: number) => void;
  resetSelectedTransform: () => void;
  saveCurrentStep: (title: string, description?: string) => void;
  deleteStep: (stepId: string) => void;
  applyStep: (stepId: string) => void;
  generateAssemblySteps: () => void;
  exportProject: () => AssemblyProject;
  importProject: (project: AssemblyProject) => void;
}

const MOVE_STEP = 0.5;

export const useAssemblyStore = create<AssemblyStore>((set, get) => ({
  projectName: 'Untitled Project',
  objectTree: [],
  selectedObjectUuids: [],
  objectStates: {},
  initialObjectStates: {},
  disassemblySteps: [],
  assemblySteps: [],
  currentMode: 'edit',

  setProjectName: (name) => set({ projectName: name }),
  setModelUrl: (url, fileName) => {
    set({ modelUrl: url, modelFileName: fileName, objectTree: [], objectStates: {}, initialObjectStates: {}, disassemblySteps: [], assemblySteps: [], selectedObjectUuids: [] });
  },
  setObjectTree: (tree) => set({ objectTree: tree }),
  saveInitialStates: (states) => set({ initialObjectStates: states, objectStates: { ...states } }),
  selectObject: (uuid, multi = false) => {
    if (multi) {
      const current = get().selectedObjectUuids;
      set({
        selectedObjectUuids: current.includes(uuid)
          ? current.filter((id) => id !== uuid)
          : [...current, uuid],
      });
    } else {
      set({ selectedObjectUuids: [uuid] });
    }
  },
  deselectAll: () => set({ selectedObjectUuids: [] }),

  updateObjectState: (uuid, updates) => {
    const current = get().objectStates[uuid];
    if (!current) return;
    set({ objectStates: { ...get().objectStates, [uuid]: { ...current, ...updates } } });
  },

  hideSelected: () => {
    const { selectedObjectUuids, objectStates } = get();
    const updated = { ...objectStates };
    selectedObjectUuids.forEach((uuid) => {
      if (updated[uuid]) updated[uuid] = { ...updated[uuid], visible: false };
    });
    set({ objectStates: updated });
  },

  showSelected: () => {
    const { selectedObjectUuids, objectStates } = get();
    const updated = { ...objectStates };
    selectedObjectUuids.forEach((uuid) => {
      if (updated[uuid]) updated[uuid] = { ...updated[uuid], visible: true };
    });
    set({ objectStates: updated });
  },

  showAll: () => {
    const updated = { ...get().objectStates };
    Object.keys(updated).forEach((uuid) => {
      updated[uuid] = { ...updated[uuid], visible: true };
    });
    set({ objectStates: updated });
  },

  moveSelected: (axis, delta) => {
    const effectiveDelta = delta === 0.1 || delta === -0.1 ? (delta > 0 ? MOVE_STEP : -MOVE_STEP) : delta;
    const { selectedObjectUuids, objectStates } = get();
    const updated = { ...objectStates };
    selectedObjectUuids.forEach((uuid) => {
      if (!updated[uuid]) return;
      const pos = [...updated[uuid].position] as [number, number, number];
      if (axis === 'x') pos[0] += effectiveDelta;
      if (axis === 'y') pos[1] += effectiveDelta;
      if (axis === 'z') pos[2] += effectiveDelta;
      updated[uuid] = { ...updated[uuid], position: pos };
    });
    set({ objectStates: updated });
  },

  resetSelectedTransform: () => {
    const { selectedObjectUuids, initialObjectStates, objectStates } = get();
    const updated = { ...objectStates };
    selectedObjectUuids.forEach((uuid) => {
      const init = initialObjectStates[uuid];
      if (init) updated[uuid] = { ...init };
    });
    set({ objectStates: updated });
  },

  saveCurrentStep: (title, description) => {
    const state = get();
    const step: AssemblyStep = {
      id: makeId(),
      index: state.disassemblySteps.length + 1,
      title,
      description,
      mode: 'disassembly',
      objectStates: JSON.parse(JSON.stringify(state.objectStates)),
      selectedObjectUuids: [...state.selectedObjectUuids],
      createdAt: new Date().toISOString(),
    };
    set({ disassemblySteps: [...state.disassemblySteps, step] });
  },

  deleteStep: (stepId) => {
    set({
      disassemblySteps: get().disassemblySteps.filter((s) => s.id !== stepId),
      assemblySteps: get().assemblySteps.filter((s) => s.id !== stepId),
    });
  },

  applyStep: (stepId) => {
    const allSteps = [...get().disassemblySteps, ...get().assemblySteps];
    const step = allSteps.find((s) => s.id === stepId);
    if (!step) return;
    set({
      objectStates: JSON.parse(JSON.stringify(step.objectStates)),
      selectedObjectUuids: [...step.selectedObjectUuids],
      currentStepId: stepId,
      currentMode: step.mode === 'disassembly' ? 'disassembly-preview' : 'assembly-preview',
    });
  },

  generateAssemblySteps: () => {
    const disassembly = get().disassemblySteps;
    const reversed = [...disassembly].reverse().map((step, i) => ({
      ...step,
      id: makeId(),
      index: i + 1,
      mode: 'assembly' as const,
      title: `Build Step ${i + 1}`,
      createdAt: new Date().toISOString(),
    }));
    set({ assemblySteps: reversed });
  },

  exportProject: () => ({
    version: '0.1.0',
    projectName: get().projectName,
    modelFileName: get().modelFileName,
    modelObjectTree: get().objectTree,
    disassemblySteps: get().disassemblySteps,
    assemblySteps: get().assemblySteps,
    currentStepId: get().currentStepId,
  }),

  importProject: (project) => {
    set({
      projectName: project.projectName,
      modelFileName: project.modelFileName,
      objectTree: project.modelObjectTree,
      disassemblySteps: project.disassemblySteps,
      assemblySteps: project.assemblySteps,
      currentStepId: project.currentStepId,
    });
  },
}));
