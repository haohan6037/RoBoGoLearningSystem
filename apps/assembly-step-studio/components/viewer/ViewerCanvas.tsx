'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { Suspense, useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useAssemblyStore } from '@/store/useAssemblyStore';
import ModelScene from './ModelScene';

function findInScene(root: THREE.Object3D, uuid: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (obj.uuid === uuid && !found && isEffectivelyVisible(obj)) found = obj;
  });
  return found;
}

function axisVector(axis: 'x' | 'y' | 'z'): THREE.Vector3 {
  if (axis === 'x') return new THREE.Vector3(1, 0, 0);
  if (axis === 'y') return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function screenPoint(
  point: THREE.Vector3,
  camera: THREE.Camera,
  rect: DOMRect
): THREE.Vector2 {
  const projected = point.clone().project(camera);
  return new THREE.Vector2(
    ((projected.x + 1) / 2) * rect.width,
    ((1 - projected.y) / 2) * rect.height
  );
}

type PointerState = {
  x: number;
  y: number;
  pointerId: number;
  part: THREE.Object3D | null;
  modifier: boolean;
  wasSelected: boolean;
  canDrag: boolean;
  dragging: boolean;
  dragSession?: DragSession;
};

type DragObjectSnapshot = {
  uuid: string;
  object: THREE.Object3D;
  initialWorldPosition: THREE.Vector3;
};

type DragSession = {
  axis: 'x' | 'y' | 'z';
  direction: THREE.Vector2;
  pixelsPerUnit: number;
  snapshots: DragObjectSnapshot[];
};

function isEffectivelyVisible(obj: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = obj;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function SceneContent() {
  const modelUrl = useAssemblyStore((s) => s.modelUrl);
  const selectedUuids = useAssemblyStore((s) => s.selectedObjectUuids);
  const updateObjectPositions = useAssemblyStore((s) => s.updateObjectPositions);
  const selectObject = useAssemblyStore((s) => s.selectObject);
  const deselectAll = useAssemblyStore((s) => s.deselectAll);
  const setHoveredObject = useAssemblyStore((s) => s.setHoveredObject);
  const activeMoveAxis = useAssemblyStore((s) => s.activeMoveAxis);
  const [isDragging, setIsDragging] = useState(false);
  const pointerDown = useRef<PointerState | null>(null);
  const { camera, gl, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());

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

  const pickPartFromPointer = useCallback((e: PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.current.setFromCamera(mouse, camera);
    const intersects = raycaster.current.intersectObjects(scene.children, true);
    for (const intersect of intersects) {
      const obj = intersect.object;
      if (!(obj instanceof THREE.Mesh)) continue;
      if (!isEffectivelyVisible(obj)) continue;
      const part = findPartGroup(obj);
      if (!isEffectivelyVisible(part)) continue;
      return part;
    }
    return null;
  }, [camera, scene, findPartGroup]);

  const onSceneReady = useCallback((modelScene: THREE.Object3D) => {
    selectedUuids.forEach((uuid) => findInScene(modelScene, uuid));
  }, [selectedUuids]);

  const createDragSession = useCallback((canvas: HTMLCanvasElement, part: THREE.Object3D): DragSession | null => {
    const axis = activeMoveAxis;
    const axisWorld = axisVector(axis);
    const anchor = new THREE.Vector3();
    part.getWorldPosition(anchor);
    const rect = canvas.getBoundingClientRect();
    const screenAxis = screenPoint(anchor.clone().add(axisWorld), camera, rect).sub(screenPoint(anchor, camera, rect));
    const axisPixels = screenAxis.length();
    if (axisPixels < 0.001) return null;

    const snapshots = selectedUuids
      .map((uuid) => {
        const object = findInScene(scene, uuid);
        if (!object) return null;
        const initialWorldPosition = new THREE.Vector3();
        object.getWorldPosition(initialWorldPosition);
        return { uuid, object, initialWorldPosition };
      })
      .filter((snapshot): snapshot is DragObjectSnapshot => snapshot !== null);

    if (snapshots.length === 0) return null;

    return {
      axis,
      direction: screenAxis.normalize(),
      pixelsPerUnit: Math.max(axisPixels, 140),
      snapshots,
    };
  }, [activeMoveAxis, camera, scene, selectedUuids]);

  const dragAlongAxis = useCallback((e: PointerEvent, canvas: HTMLCanvasElement, state: PointerState) => {
    if (!state.part || !state.canDrag) return;
    const totalDx = e.clientX - state.x;
    const totalDy = e.clientY - state.y;
    if (!state.dragging && Math.hypot(totalDx, totalDy) <= 3) return;

    if (!state.dragging) {
      const dragSession = createDragSession(canvas, state.part);
      if (!dragSession) return;
      state.dragSession = dragSession;
      state.dragging = true;
      setIsDragging(true);
    }

    const dragSession = state.dragSession;
    if (!dragSession) return;
    const pointerTotal = new THREE.Vector2(totalDx, totalDy);
    const worldDistance = pointerTotal.dot(dragSession.direction) / dragSession.pixelsPerUnit;
    const worldDelta = axisVector(dragSession.axis).multiplyScalar(worldDistance);

    const nextPositions: Record<string, [number, number, number]> = {};
    for (const snapshot of dragSession.snapshots) {
      const targetWorld = snapshot.initialWorldPosition.clone().add(worldDelta);
      const targetLocal = snapshot.object.parent
        ? snapshot.object.parent.worldToLocal(targetWorld.clone())
        : targetWorld;
      snapshot.object.position.copy(targetLocal);
      nextPositions[snapshot.uuid] = [targetLocal.x, targetLocal.y, targetLocal.z];
    }
    updateObjectPositions(nextPositions);
  }, [createDragSession, updateObjectPositions]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onDown = (e: PointerEvent) => {
      const part = pickPartFromPointer(e, canvas);
      const modifier = e.metaKey || e.ctrlKey || e.shiftKey;
      const wasSelected = !!part && selectedUuids.includes(part.uuid);
      const canDrag = e.button === 0 && !!part && wasSelected && !modifier;
      pointerDown.current = {
        x: e.clientX,
        y: e.clientY,
        pointerId: e.pointerId,
        part,
        modifier,
        wasSelected,
        canDrag,
        dragging: false,
      };
      if (canDrag) {
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (pointerDown.current) {
        if (pointerDown.current.canDrag) {
          dragAlongAxis(e, canvas, pointerDown.current);
        }
        if (pointerDown.current.dragging) {
          canvas.style.cursor = 'grabbing';
          setHoveredObject(pointerDown.current.part?.uuid);
        }
        return;
      }
      const part = pickPartFromPointer(e, canvas);
      setHoveredObject(part?.uuid);
      canvas.style.cursor = part && selectedUuids.includes(part.uuid) ? 'grab' : part ? 'pointer' : 'default';
    };
    const onUp = (e: PointerEvent) => {
      const state = pointerDown.current;
      if (!state) return;
      const dx = e.clientX - state.x;
      const dy = e.clientY - state.y;
      pointerDown.current = null;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      setIsDragging(false);
      if (state.dragging || Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        canvas.style.cursor = 'default';
        return;
      }
      if (!state.part) {
        deselectAll();
        return;
      }
      selectObject(state.part.uuid, state.modifier);
    };
    const onLeave = () => {
      pointerDown.current = null;
      setIsDragging(false);
      setHoveredObject(undefined);
      canvas.style.cursor = 'default';
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.style.cursor = 'default';
    };
  }, [
    gl,
    selectObject,
    deselectAll,
    setHoveredObject,
    pickPartFromPointer,
    selectedUuids,
    dragAlongAxis,
  ]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 10]} intensity={0.8} />
      <OrbitControls
        makeDefault
        enabled={!isDragging}
        mouseButtons={{
          LEFT: -1 as THREE.MOUSE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
      />
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
