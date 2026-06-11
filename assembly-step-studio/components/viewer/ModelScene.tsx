'use client';

import { useGLTF } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAssemblyStore } from '@/store/useAssemblyStore';
import { parseModelTree } from '@/lib/gltf/parseModelTree';

const origMaterials = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();

function collectStates(obj: THREE.Object3D): Record<string, { uuid: string; visible: boolean; position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }> {
  const states: Record<string, { uuid: string; visible: boolean; position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }> = {};
  obj.traverse((child) => {
    states[child.uuid] = {
      uuid: child.uuid,
      visible: child.visible,
      position: [child.position.x, child.position.y, child.position.z],
      rotation: [child.rotation.x, child.rotation.y, child.rotation.z],
      scale: [child.scale.x, child.scale.y, child.scale.z],
    };
  });
  return states;
}

function applyObjectStates(root: THREE.Object3D, states: Record<string, { visible?: boolean; position?: [number, number, number] }>) {
  root.traverse((child) => {
    const state = states[child.uuid];
    if (!state) return;
    if (state.visible !== undefined) child.visible = state.visible;
    if (state.position) child.position.set(state.position[0], state.position[1], state.position[2]);
  });
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

function highlightMeshes(root: THREE.Object3D, selectedUuids: string[]) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const isSelected = isSelectedOrChildOf(obj, selectedUuids);
    if (isSelected) {
      if (!origMaterials.has(obj)) origMaterials.set(obj, obj.material);
      const mat = new THREE.MeshStandardMaterial({ color: '#ff8800', emissive: '#ff4400', emissiveIntensity: 0.6 });
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
  const initDone = useRef(false);

  // 初始化对象树和状态
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    const tree = parseModelTree(scene);
    setObjectTree(tree);
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
    if (Object.keys(objectStates).length > 0) {
      applyObjectStates(scene, objectStates);
    }
  }, [scene, objectStates]);

  // 高亮选中对象
  useEffect(() => {
    highlightMeshes(scene, selectedUuids);
    if (onSceneReady) onSceneReady(scene);
  }, [scene, selectedUuids, onSceneReady]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}
