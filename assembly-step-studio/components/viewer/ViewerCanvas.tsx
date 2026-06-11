'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, TransformControls } from '@react-three/drei';
import { Suspense, useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useAssemblyStore } from '@/store/useAssemblyStore';
import ModelScene from './ModelScene';

function findInScene(root: THREE.Object3D, uuid: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((obj) => { if (obj.uuid === uuid && !found) found = obj; });
  return found;
}

function SceneContent() {
  const modelUrl = useAssemblyStore((s) => s.modelUrl);
  const selectedUuids = useAssemblyStore((s) => s.selectedObjectUuids);
  const updateObjectState = useAssemblyStore((s) => s.updateObjectState);
  const selectObject = useAssemblyStore((s) => s.selectObject);
  const deselectAll = useAssemblyStore((s) => s.deselectAll);
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const prevWorld = useRef(new THREE.Vector3());
  const { camera, gl, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());

  const updateTargetFromSelection = useCallback((uuids: string[], root: THREE.Object3D) => {
    if (uuids.length === 0) {
      setTarget(null);
      return;
    }
    const obj = findInScene(root, uuids[0]);
    if (obj) {
      setTarget(obj);
      obj.getWorldPosition(prevWorld.current);
    }
  }, []);

  const findPartGroup = useCallback((mesh: THREE.Object3D): THREE.Object3D => {
    let current: THREE.Object3D | null = mesh;
    while (current && current.parent) {
      if (current instanceof THREE.Group && current.name && current.type !== 'Scene') {
        return current;
      }
      current = current.parent;
    }
    return mesh;
  }, []);

  const onSceneReady = useCallback((modelScene: THREE.Object3D) => {
    updateTargetFromSelection(selectedUuids, modelScene);
  }, [selectedUuids, updateTargetFromSelection]);

  const handleObjectChange = useCallback(() => {
    if (!target) return;
    const newWorld = new THREE.Vector3();
    target.getWorldPosition(newWorld);
    const worldDelta = newWorld.clone().sub(prevWorld.current);
    prevWorld.current.copy(newWorld);
    if (worldDelta.length() < 0.0001) return;

    for (const uuid of selectedUuids) {
      const obj = findInScene(scene, uuid);
      if (!obj) continue;
      // 方法：目标世界位置 = 当前世界位置 + worldDelta
      // 转换为局部坐标 → 计算局部 delta
      const curWorld = new THREE.Vector3();
      obj.getWorldPosition(curWorld);
      const targetWorld = curWorld.clone().add(worldDelta);
      const targetLocal = obj.parent
        ? obj.parent.worldToLocal(targetWorld.clone())
        : targetWorld;
      const curLocal = obj.position.clone();
      obj.position.copy(targetLocal);
      updateObjectState(uuid, {
        position: [obj.position.x, obj.position.y, obj.position.z],
      });
    }
  }, [target, selectedUuids, scene, updateObjectState]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onDown = (e: PointerEvent) => { pointerDown.current = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!pointerDown.current) return;
      const dx = e.clientX - pointerDown.current.x;
      const dy = e.clientY - pointerDown.current.y;
      pointerDown.current = null;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) return;
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.current.setFromCamera(mouse, camera);
      const intersects = raycaster.current.intersectObjects(scene.children, true);
      if (intersects.length === 0) {
        deselectAll();
        return;
      }
      for (const intersect of intersects) {
        const obj = intersect.object;
        if (!(obj instanceof THREE.Mesh)) continue;
        const part = findPartGroup(obj);
        selectObject(part.uuid, e.metaKey);
        return;
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
    };
  }, [gl, camera, scene, selectObject, findPartGroup]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 10]} intensity={0.8} />
      <OrbitControls makeDefault enabled={!target} />
      <Grid
        position={[0, -0.01, 0]}
        args={[30, 30]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#4a4a6a"
        sectionSize={5}
        sectionThickness={1.2}
        sectionColor="#6a6a8a"
        fadeDistance={50}
        fadeStrength={1}
        infiniteGrid
      />
      {modelUrl && (
        <Suspense fallback={null}>
          <ModelScene modelUrl={modelUrl} onSceneReady={onSceneReady} />
        </Suspense>
      )}
      {target && (
        <TransformControls
          object={target}
          mode="translate"
          onObjectChange={handleObjectChange}
        />
      )}
    </>
  );
}

export default function ViewerCanvas() {
  return (
    <Canvas
      camera={{ position: [5, 4, 8], fov: 50 }}
      style={{ background: '#1a1a2e' }}
    >
      <SceneContent />
    </Canvas>
  );
}
