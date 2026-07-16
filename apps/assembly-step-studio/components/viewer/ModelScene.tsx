'use client';

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAssemblyStore } from '@/store/useAssemblyStore';
import { parseModelTree } from '@/lib/gltf/parseModelTree';
import partNameCatalog from '@/lib/parts/partNameCatalog.json';
import type { ModelNode, ObjectState } from '@/types/assembly';

const origMaterials = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
const STEP_TRANSITION_MS = 520;
const PART_NUMBER_PATTERN = /\d{3}-\d{4}-\d{3,4}/;

function restoreSourceNames(root: THREE.Object3D) {
  root.traverse((object) => {
    const sourceName = object.userData.assemblySourceName;
    if (typeof sourceName === 'string') {
      object.name = sourceName;
    } else {
      object.userData.assemblySourceName = object.name;
    }
  });
}

function applyCatalogPartNames(root: THREE.Object3D): Map<string, string> {
  const displayNames = new Map<string, string>();
  root.traverse((object) => {
    const partNumber = object.name.match(PART_NUMBER_PATTERN)?.[0];
    if (!partNumber) return;
    const meaningfulName = (partNameCatalog as Record<string, string>)[partNumber];
    if (!meaningfulName) return;
    const displayName = `${meaningfulName} (${partNumber})`;
    object.name = displayName;
    displayNames.set(object.uuid, displayName);
  });
  return displayNames;
}

function applyTreeDisplayNames(nodes: ModelNode[], displayNames: Map<string, string>): ModelNode[] {
  return nodes.map((node) => ({
    ...node,
    name: displayNames.get(node.uuid) ?? node.name,
    children: applyTreeDisplayNames(node.children, displayNames),
  }));
}

type PartialObjectState = {
  visible?: boolean;
  position?: [number, number, number];
};

type TransitionItem = {
  object: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
};

type StepTransition = {
  startTime: number;
  targetStates: Record<string, PartialObjectState>;
  items: TransitionItem[];
};

function collectStates(obj: THREE.Object3D): Record<string, ObjectState> {
  const states: Record<string, ObjectState> = {};
  obj.traverse((child) => {
    states[child.uuid] = {
      uuid: child.uuid,
      stableKey: child.userData.assemblyStableKey,
      visible: child.visible,
      position: [child.position.x, child.position.y, child.position.z],
      rotation: [child.rotation.x, child.rotation.y, child.rotation.z],
      scale: [child.scale.x, child.scale.y, child.scale.z],
    };
  });
  return states;
}

function applyObjectStates(root: THREE.Object3D, states: Record<string, PartialObjectState>) {
  root.traverse((child) => {
    const state = states[child.uuid];
    if (!state) return;
    if (state.visible !== undefined) child.visible = state.visible;
    if (state.position) child.position.set(state.position[0], state.position[1], state.position[2]);
  });
}

function createStepTransition(
  root: THREE.Object3D,
  states: Record<string, PartialObjectState>
): StepTransition {
  const items: TransitionItem[] = [];
  root.traverse((child) => {
    const state = states[child.uuid];
    if (!state) return;

    if (state.visible === true) child.visible = true;
    if (!state.position) {
      if (state.visible !== undefined) child.visible = state.visible;
      return;
    }

    if (child.visible || state.visible !== false) {
      child.visible = true;
    }

    items.push({
      object: child,
      from: child.position.clone(),
      to: new THREE.Vector3(state.position[0], state.position[1], state.position[2]),
    });
  });

  return {
    startTime: performance.now(),
    targetStates: states,
    items,
  };
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function isSelectedOrChildOf(obj: THREE.Object3D, uuids: string[]): boolean {
  if (uuids.includes(obj.uuid)) return true;
  let parent = obj.parent;
  while (parent) {
    if (uuids.includes(parent.uuid)) return true;
    parent = parent.parent;
  }
  return false;
}

function highlightMeshes(root: THREE.Object3D, selectedUuids: string[], hoveredUuid?: string) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const isSelected = isSelectedOrChildOf(obj, selectedUuids);
    const isHovered = hoveredUuid ? isSelectedOrChildOf(obj, [hoveredUuid]) : false;
    if (isSelected || isHovered) {
      if (!origMaterials.has(obj)) origMaterials.set(obj, obj.material);
      const mat = isSelected
        ? new THREE.MeshStandardMaterial({ color: '#ff8800', emissive: '#ff4400', emissiveIntensity: 0.6 })
        : new THREE.MeshStandardMaterial({ color: '#60a5fa', emissive: '#1d4ed8', emissiveIntensity: 0.35 });
      obj.material = Array.isArray(obj.material) ? obj.material.map(() => mat) : mat;
    } else {
      const orig = origMaterials.get(obj);
      if (orig) { obj.material = orig; origMaterials.delete(obj); }
    }
  });
}

interface Props {
  modelUrl: string;
  onSceneReady?: (scene: THREE.Object3D) => void;
}

export default function ModelScene({ modelUrl, onSceneReady }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(modelUrl);
  const setObjectTree = useAssemblyStore((s) => s.setObjectTree);
  const saveInitialStates = useAssemblyStore((s) => s.saveInitialStates);
  const objectStates = useAssemblyStore((s) => s.objectStates);
  const selectedUuids = useAssemblyStore((s) => s.selectedObjectUuids);
  const hoveredUuid = useAssemblyStore((s) => s.hoveredObjectUuid);
  const stepTransitionToken = useAssemblyStore((s) => s.stepTransitionToken);
  const initDone = useRef(false);
  const lastTransitionToken = useRef(stepTransitionToken);
  const transitionRef = useRef<StepTransition | null>(null);

  // 初始化对象树和状态
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    restoreSourceNames(scene);
    const sourceTree = parseModelTree(scene);
    const displayNames = applyCatalogPartNames(scene);
    setObjectTree(applyTreeDisplayNames(sourceTree, displayNames));
    const states = collectStates(scene);
    saveInitialStates(states);
  }, [scene, setObjectTree, saveInitialStates]);

  // 模型居中
  useEffect(() => {
    if (!groupRef.current) return;
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 5;
    const s = targetSize / (maxDim || 1);
    groupRef.current.position.set(-center.x * s, -center.y * s, -center.z * s);
    groupRef.current.scale.setScalar(s);
  }, [scene]);

  // 应用对象状态（移动/隐藏）
  useEffect(() => {
    if (Object.keys(objectStates).length === 0) return;
    if (lastTransitionToken.current !== stepTransitionToken) {
      lastTransitionToken.current = stepTransitionToken;
      transitionRef.current = createStepTransition(scene, objectStates);
      return;
    }
    if (!transitionRef.current) {
      applyObjectStates(scene, objectStates);
    }
  }, [scene, objectStates, stepTransitionToken]);

  useFrame(() => {
    const transition = transitionRef.current;
    if (!transition) return;

    const progress = Math.min(1, (performance.now() - transition.startTime) / STEP_TRANSITION_MS);
    const eased = easeOutCubic(progress);
    transition.items.forEach((item) => {
      item.object.position.lerpVectors(item.from, item.to, eased);
    });

    if (progress >= 1) {
      applyObjectStates(scene, transition.targetStates);
      transitionRef.current = null;
    }
  });

  // 高亮选中对象
  useEffect(() => {
    highlightMeshes(scene, selectedUuids, hoveredUuid);
    if (onSceneReady) onSceneReady(scene);
  }, [scene, selectedUuids, hoveredUuid, onSceneReady]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}
