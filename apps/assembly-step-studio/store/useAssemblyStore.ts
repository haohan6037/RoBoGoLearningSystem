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
  hoveredObjectUuid?: string;
  activeMoveAxis: 'x' | 'y' | 'z';
  objectStates: Record<string, ObjectState>;
  initialObjectStates: Record<string, ObjectState>;
  disassemblySteps: AssemblyStep[];
  assemblySteps: AssemblyStep[];
  currentStepId?: string;
  currentMode: 'edit' | 'disassembly-preview' | 'assembly-preview';
  stepTransitionToken: number;

  setProjectName: (name: string) => void;
  resetEditor: (projectName?: string) => void;
  setModelUrl: (url: string, fileName: string) => void;
  setObjectTree: (tree: ModelNode[]) => void;
  saveInitialStates: (states: Record<string, ObjectState>) => void;
  selectObject: (uuid: string, multi?: boolean) => void;
  setHoveredObject: (uuid?: string) => void;
  setActiveMoveAxis: (axis: 'x' | 'y' | 'z') => void;
  isObjectInteractable: (uuid: string) => boolean;
  deselectAll: () => void;
  updateObjectState: (uuid: string, updates: Partial<ObjectState>) => void;
  updateObjectPositions: (positions: Record<string, [number, number, number]>) => void;
  hideSelected: () => void;
  showSelected: () => void;
  showAll: () => void;
  moveSelected: (axis: 'x' | 'y' | 'z', delta: number) => void;
  resetSelectedTransform: () => void;
  saveCurrentStep: (title: string, description?: string) => void;
  deleteStep: (stepId: string) => void;
  reorderStep: (mode: 'disassembly' | 'assembly', stepId: string, direction: 'up' | 'down') => void;
  applyStep: (stepId: string) => void;
  generateAssemblySteps: () => void;
  exportProject: () => AssemblyProject;
  importProject: (project: AssemblyProject) => void;
}

const MOVE_STEP = 0.5;

function buildParentMap(tree: ModelNode[]): Record<string, string | undefined> {
  const parents: Record<string, string | undefined> = {};
  const visit = (node: ModelNode, parentId?: string) => {
    parents[node.uuid] = parentId;
    node.children.forEach((child) => visit(child, node.uuid));
  };
  tree.forEach((node) => visit(node));
  return parents;
}

function isObjectEffectivelyVisible(
  uuid: string,
  tree: ModelNode[],
  states: Record<string, ObjectState>
): boolean {
  const parents = buildParentMap(tree);
  let current: string | undefined = uuid;
  while (current) {
    if (states[current]?.visible === false) return false;
    current = parents[current];
  }
  return true;
}

function filterInteractableUuids(
  uuids: string[],
  tree: ModelNode[],
  states: Record<string, ObjectState>
): string[] {
  return uuids.filter((uuid) => isObjectEffectivelyVisible(uuid, tree, states));
}

function reindexSteps<T extends AssemblyStep>(steps: T[]): T[] {
  return steps.map((step, index) => ({ ...step, index: index + 1 }));
}

function flattenStableKeys(
  tree: ModelNode[],
  parentStableKey = 'root',
  result: Record<string, string> = {}
): Record<string, string> {
  tree.forEach((node, index) => {
    const stableKey = node.stableKey || `${parentStableKey}/${node.type}:${node.name}:${index}`;
    result[stableKey] = node.uuid;
    flattenStableKeys(node.children, stableKey, result);
  });
  return result;
}

function buildUuidRemap(sourceTree: ModelNode[], targetTree: ModelNode[]): Record<string, string> {
  const sourceByStableKey = flattenStableKeys(sourceTree);
  const targetByStableKey = flattenStableKeys(targetTree);
  const remap: Record<string, string> = {};
  for (const [stableKey, sourceUuid] of Object.entries(sourceByStableKey)) {
    const targetUuid = targetByStableKey[stableKey];
    if (targetUuid) remap[sourceUuid] = targetUuid;
  }
  return remap;
}

function remapObjectStates(
  states: Record<string, ObjectState>,
  uuidRemap: Record<string, string>
): Record<string, ObjectState> {
  const remapped: Record<string, ObjectState> = {};
  for (const [uuid, state] of Object.entries(states)) {
    const nextUuid = uuidRemap[uuid];
    if (!nextUuid) continue;
    remapped[nextUuid] = { ...state, uuid: nextUuid };
  }
  return remapped;
}

function remapUuidList(uuids: string[], uuidRemap: Record<string, string>): string[] {
  return uuids.map((uuid) => uuidRemap[uuid]).filter((uuid): uuid is string => Boolean(uuid));
}

function remapStep(step: AssemblyStep, uuidRemap: Record<string, string>): AssemblyStep {
  return {
    ...step,
    objectStates: remapObjectStates(step.objectStates, uuidRemap),
    selectedObjectUuids: remapUuidList(step.selectedObjectUuids, uuidRemap),
  };
}

export const useAssemblyStore = create<AssemblyStore>((set, get) => ({
  projectName: 'Untitled Project',
  objectTree: [],
  selectedObjectUuids: [],
  activeMoveAxis: 'x',
  objectStates: {},
  initialObjectStates: {},
  disassemblySteps: [],
  assemblySteps: [],
  currentMode: 'edit',
  stepTransitionToken: 0,

  setProjectName: (name) => set({ projectName: name }),
  resetEditor: (projectName = 'Untitled Project') => {
    set({
      modelUrl: undefined,
      modelFileName: undefined,
      projectName,
      objectTree: [],
      selectedObjectUuids: [],
      hoveredObjectUuid: undefined,
      activeMoveAxis: 'x',
      objectStates: {},
      initialObjectStates: {},
      disassemblySteps: [],
      assemblySteps: [],
      currentStepId: undefined,
      currentMode: 'edit',
      stepTransitionToken: 0,
    });
  },
  setModelUrl: (url, fileName) => {
    set({
      modelUrl: url,
      modelFileName: fileName,
      objectTree: [],
      objectStates: {},
      initialObjectStates: {},
      disassemblySteps: [],
      assemblySteps: [],
      selectedObjectUuids: [],
      hoveredObjectUuid: undefined,
      activeMoveAxis: 'x',
      currentStepId: undefined,
      currentMode: 'edit',
      stepTransitionToken: 0,
    });
  },
  setObjectTree: (tree) => set({ objectTree: tree }),
  saveInitialStates: (states) => set({ initialObjectStates: states, objectStates: { ...states } }),
  selectObject: (uuid, multi = false) => {
    const state = get();
    if (!isObjectEffectivelyVisible(uuid, state.objectTree, state.objectStates)) return;
    if (multi) {
      const current = filterInteractableUuids(state.selectedObjectUuids, state.objectTree, state.objectStates);
      set({
        selectedObjectUuids: current.includes(uuid)
          ? current.filter((id) => id !== uuid)
          : [...current, uuid],
      });
    } else {
      set({ selectedObjectUuids: [uuid] });
    }
  },
  setHoveredObject: (uuid) => {
    const state = get();
    if (uuid && !isObjectEffectivelyVisible(uuid, state.objectTree, state.objectStates)) {
      set({ hoveredObjectUuid: undefined });
      return;
    }
    set({ hoveredObjectUuid: uuid });
  },
  setActiveMoveAxis: (axis) => set({ activeMoveAxis: axis }),
  isObjectInteractable: (uuid) => {
    const state = get();
    return isObjectEffectivelyVisible(uuid, state.objectTree, state.objectStates);
  },
  deselectAll: () => set({ selectedObjectUuids: [], hoveredObjectUuid: undefined }),

  updateObjectState: (uuid, updates) => {
    const current = get().objectStates[uuid];
    if (!current) return;
    set({ objectStates: { ...get().objectStates, [uuid]: { ...current, ...updates } } });
  },

  updateObjectPositions: (positions) => {
    const objectStates = get().objectStates;
    const updated = { ...objectStates };
    for (const [uuid, position] of Object.entries(positions)) {
      const current = objectStates[uuid];
      if (current) updated[uuid] = { ...current, position };
    }
    set({ objectStates: updated });
  },

  hideSelected: () => {
    const { selectedObjectUuids, objectStates } = get();
    const updated = { ...objectStates };
    selectedObjectUuids.forEach((uuid) => {
      if (updated[uuid]) updated[uuid] = { ...updated[uuid], visible: false };
    });
    set({ objectStates: updated, selectedObjectUuids: [], hoveredObjectUuid: undefined });
  },

  showSelected: () => {
    const { selectedObjectUuids, objectStates, objectTree } = get();
    const interactableSelection = filterInteractableUuids(selectedObjectUuids, objectTree, objectStates);
    const updated = { ...objectStates };
    interactableSelection.forEach((uuid) => {
      if (updated[uuid]) updated[uuid] = { ...updated[uuid], visible: true };
    });
    set({ objectStates: updated, selectedObjectUuids: interactableSelection });
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
    const { selectedObjectUuids, objectStates, objectTree } = get();
    const movableSelection = filterInteractableUuids(selectedObjectUuids, objectTree, objectStates);
    const updated = { ...objectStates };
    movableSelection.forEach((uuid) => {
      if (!updated[uuid]) return;
      const pos = [...updated[uuid].position] as [number, number, number];
      if (axis === 'x') pos[0] += effectiveDelta;
      if (axis === 'y') pos[1] += effectiveDelta;
      if (axis === 'z') pos[2] += effectiveDelta;
      updated[uuid] = { ...updated[uuid], position: pos };
    });
    set({ objectStates: updated, selectedObjectUuids: movableSelection });
  },

  resetSelectedTransform: () => {
    const { selectedObjectUuids, initialObjectStates, objectStates, objectTree } = get();
    const resettableSelection = filterInteractableUuids(selectedObjectUuids, objectTree, objectStates);
    const updated = { ...objectStates };
    resettableSelection.forEach((uuid) => {
      const init = initialObjectStates[uuid];
      if (init) updated[uuid] = { ...init };
    });
    set({ objectStates: updated, selectedObjectUuids: resettableSelection });
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
      disassemblySteps: reindexSteps(get().disassemblySteps.filter((s) => s.id !== stepId)),
      assemblySteps: reindexSteps(get().assemblySteps.filter((s) => s.id !== stepId)),
    });
  },

  reorderStep: (mode, stepId, direction) => {
    const key = mode === 'disassembly' ? 'disassemblySteps' : 'assemblySteps';
    const steps = [...get()[key]];
    const currentIndex = steps.findIndex((step) => step.id === stepId);
    if (currentIndex < 0) return;
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= steps.length) return;
    [steps[currentIndex], steps[nextIndex]] = [steps[nextIndex], steps[currentIndex]];
    set({ [key]: reindexSteps(steps) } as Pick<AssemblyStore, typeof key>);
  },

  applyStep: (stepId) => {
    const allSteps = [...get().disassemblySteps, ...get().assemblySteps];
    const step = allSteps.find((s) => s.id === stepId);
    if (!step) return;
    const stepStates = JSON.parse(JSON.stringify(step.objectStates));
    set({
      objectStates: stepStates,
      selectedObjectUuids: filterInteractableUuids(step.selectedObjectUuids, get().objectTree, stepStates),
      hoveredObjectUuid: undefined,
      currentStepId: stepId,
      currentMode: step.mode === 'disassembly' ? 'disassembly-preview' : 'assembly-preview',
      stepTransitionToken: get().stepTransitionToken + 1,
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
    const currentTree = get().objectTree;
    const hasCurrentModelTree = currentTree.length > 0;
    const uuidRemap = hasCurrentModelTree
      ? buildUuidRemap(project.modelObjectTree || [], currentTree)
      : {};
    const shouldRemap = Object.keys(uuidRemap).length > 0;

    set({
      projectName: project.projectName,
      modelFileName: project.modelFileName,
      objectTree: hasCurrentModelTree ? currentTree : project.modelObjectTree,
      disassemblySteps: reindexSteps(
        shouldRemap ? project.disassemblySteps.map((step) => remapStep(step, uuidRemap)) : project.disassemblySteps
      ),
      assemblySteps: reindexSteps(
        shouldRemap ? project.assemblySteps.map((step) => remapStep(step, uuidRemap)) : project.assemblySteps
      ),
      currentStepId: project.currentStepId,
      hoveredObjectUuid: undefined,
      selectedObjectUuids: [],
    });
  },
}));
