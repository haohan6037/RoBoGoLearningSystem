'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { GizmoHelper, GizmoViewcube, Grid, Html, TrackballControls } from '@react-three/drei';
import { Suspense, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { TrackballControls as TrackballControlsImpl } from 'three-stdlib';
import { useAssemblyStore } from '@/store/useAssemblyStore';
import type { CameraView, CoverCapture, ObjectState } from '@/types/assembly';
import ModelScene from './ModelScene';

const COVER_WIDTH = 1200;
const COVER_HEIGHT = 675;
const STEP_THUMBNAIL_WIDTH = 320;
const STEP_THUMBNAIL_HEIGHT = 180;

export type StepThumbnailCaptureRequest = {
  token: number;
  stepId: string;
  objectStates: Record<string, ObjectState>;
};

function pixelsToWebp(pixels: Uint8Array, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('Canvas 2D is unavailable.'));

  const image = context.createImageData(width, height);
  const rowSize = width * 4;
  for (let y = 0; y < height; y += 1) {
    const sourceStart = (height - y - 1) * rowSize;
    image.data.set(pixels.subarray(sourceStart, sourceStart + rowSize), y * rowSize);
  }
  context.putImageData(image, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Failed to encode cover image.')),
      'image/webp',
      0.88,
    );
  });
}

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

type ViewerVariant = 'editor' | 'presentation';

function selectedPartDisplayName(name: string): string {
  return name.replace(/\s*\(\d{3}-\d{4}-\d{3,4}\)\s*$/, '').trim() || 'Unnamed part';
}

function SelectedPartLabel({ uuid }: { uuid: string }) {
  const { scene } = useThree();
  const anchorRef = useRef<THREE.Group>(null);
  const boundsRef = useRef(new THREE.Box3());
  const centerRef = useRef(new THREE.Vector3());
  const sizeRef = useRef(new THREE.Vector3());
  const part = useMemo(() => scene.getObjectByProperty('uuid', uuid), [scene, uuid]);

  useFrame(() => {
    if (!part || !anchorRef.current) return;
    part.updateWorldMatrix(true, true);
    const bounds = boundsRef.current.setFromObject(part);
    if (bounds.isEmpty()) {
      part.getWorldPosition(anchorRef.current.position);
      return;
    }
    const center = bounds.getCenter(centerRef.current);
    const size = bounds.getSize(sizeRef.current);
    anchorRef.current.position.set(
      center.x,
      bounds.max.y + Math.max(size.y * 0.08, 0.08),
      center.z,
    );
  });

  if (!part) return null;

  return (
    <group ref={anchorRef}>
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded-xl border border-blue-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-slate-900/10">
          {selectedPartDisplayName(part.name)}
        </div>
      </Html>
    </group>
  );
}

interface SceneContentProps {
  variant: ViewerVariant;
  captureRequest: number;
  onCoverCaptured?: (capture: CoverCapture) => Promise<void> | void;
  onCaptureError?: () => void;
  initialCameraView?: CameraView;
  stepThumbnailRequest?: StepThumbnailCaptureRequest;
  onStepThumbnailCaptured?: (stepId: string, blob: Blob) => void;
}

function SceneContent({
  variant,
  captureRequest,
  onCoverCaptured,
  onCaptureError,
  initialCameraView,
  stepThumbnailRequest,
  onStepThumbnailCaptured,
}: SceneContentProps) {
  const modelUrl = useAssemblyStore((s) => s.modelUrl);
  const initialObjectStates = useAssemblyStore((s) => s.initialObjectStates);
  const selectedUuids = useAssemblyStore((s) => s.selectedObjectUuids);
  const stepTransitionToken = useAssemblyStore((s) => s.stepTransitionToken);
  const updateObjectPositions = useAssemblyStore((s) => s.updateObjectPositions);
  const selectObject = useAssemblyStore((s) => s.selectObject);
  const deselectAll = useAssemblyStore((s) => s.deselectAll);
  const setHoveredObject = useAssemblyStore((s) => s.setHoveredObject);
  const activeMoveAxis = useAssemblyStore((s) => s.activeMoveAxis);
  const [isDragging, setIsDragging] = useState(false);
  const pointerDown = useRef<PointerState | null>(null);
  const { camera, gl, scene, size } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const cameraRef = useRef(camera);
  const controlsRef = useRef<TrackballControlsImpl>(null);
  const gridRef = useRef<THREE.Group>(null);
  const lastCaptureRequest = useRef(0);
  const lastThumbnailRequest = useRef(0);
  const initialCameraApplied = useRef(false);
  const initialModelFitApplied = useRef(false);
  const initialStepFitApplied = useRef(false);
  const modelSceneRef = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    if (!initialCameraView || initialCameraApplied.current || !controlsRef.current) return;
    camera.position.fromArray(initialCameraView.position);
    if (initialCameraView.up) camera.up.fromArray(initialCameraView.up);
    controlsRef.current.target.fromArray(initialCameraView.target);
    controlsRef.current.update();
    initialCameraApplied.current = true;
  }, [camera, initialCameraView]);

  useEffect(() => {
    if (
      captureRequest === 0 ||
      captureRequest === lastCaptureRequest.current ||
      !onCoverCaptured ||
      !(camera instanceof THREE.PerspectiveCamera)
    ) return;
    lastCaptureRequest.current = captureRequest;

    const capture = async () => {
      const controls = controlsRef.current;
      const cameraView: CameraView = {
        position: camera.position.toArray(),
        target: controls?.target.toArray() ?? [0, 0, 0],
        up: camera.up.toArray(),
      };
      const snapshots: Array<{
        object: THREE.Object3D;
        visible: boolean;
        position: THREE.Vector3;
        rotation: THREE.Euler;
        scale: THREE.Vector3;
      }> = [];

      Object.entries(initialObjectStates).forEach(([uuid, state]: [string, ObjectState]) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (!object) return;
        snapshots.push({
          object,
          visible: object.visible,
          position: object.position.clone(),
          rotation: object.rotation.clone(),
          scale: object.scale.clone(),
        });
        object.visible = state.visible;
        object.position.fromArray(state.position);
        object.rotation.fromArray([...state.rotation, object.rotation.order]);
        object.scale.fromArray(state.scale);
      });

      const renderTarget = new THREE.WebGLRenderTarget(COVER_WIDTH, COVER_HEIGHT, {
        depthBuffer: true,
      });
      renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
      const previousTarget = gl.getRenderTarget();
      const previousClearColor = gl.getClearColor(new THREE.Color());
      const previousClearAlpha = gl.getClearAlpha();
      const previousAspect = camera.aspect;
      const previousGridVisibility = gridRef.current?.visible ?? false;
      const pixels = new Uint8Array(COVER_WIDTH * COVER_HEIGHT * 4);

      try {
        if (gridRef.current) gridRef.current.visible = false;
        camera.aspect = COVER_WIDTH / COVER_HEIGHT;
        camera.updateProjectionMatrix();
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        gl.setRenderTarget(renderTarget);
        gl.setClearColor('#ffffff', 1);
        gl.clear(true, true, true);
        gl.render(scene, camera);
        gl.readRenderTargetPixels(renderTarget, 0, 0, COVER_WIDTH, COVER_HEIGHT, pixels);
      } finally {
        snapshots.forEach((snapshot) => {
          snapshot.object.visible = snapshot.visible;
          snapshot.object.position.copy(snapshot.position);
          snapshot.object.rotation.copy(snapshot.rotation);
          snapshot.object.scale.copy(snapshot.scale);
        });
        if (gridRef.current) gridRef.current.visible = previousGridVisibility;
        camera.aspect = previousAspect;
        camera.updateProjectionMatrix();
        gl.setRenderTarget(previousTarget);
        gl.setClearColor(previousClearColor, previousClearAlpha);
        renderTarget.dispose();
      }

      const blob = await pixelsToWebp(pixels, COVER_WIDTH, COVER_HEIGHT);
      await onCoverCaptured({ blob, camera: cameraView });
    };

    void capture().catch(() => onCaptureError?.());
  }, [camera, captureRequest, gl, initialObjectStates, onCaptureError, onCoverCaptured, scene]);

  useEffect(() => {
    if (
      !stepThumbnailRequest ||
      stepThumbnailRequest.token === lastThumbnailRequest.current ||
      !onStepThumbnailCaptured ||
      Object.keys(initialObjectStates).length === 0 ||
      !(camera instanceof THREE.PerspectiveCamera)
    ) return;
    lastThumbnailRequest.current = stepThumbnailRequest.token;

    const captureThumbnail = async () => {
      const snapshots: Array<{
        object: THREE.Object3D;
        visible: boolean;
        position: THREE.Vector3;
        rotation: THREE.Euler;
        scale: THREE.Vector3;
      }> = [];

      Object.entries(stepThumbnailRequest.objectStates).forEach(([uuid, state]) => {
        const object = scene.getObjectByProperty('uuid', uuid);
        if (!object) return;
        snapshots.push({
          object,
          visible: object.visible,
          position: object.position.clone(),
          rotation: object.rotation.clone(),
          scale: object.scale.clone(),
        });
        object.visible = state.visible;
        object.position.fromArray(state.position);
        object.rotation.fromArray([...state.rotation, object.rotation.order]);
        object.scale.fromArray(state.scale);
      });

      if (snapshots.length === 0) return;

      const renderTarget = new THREE.WebGLRenderTarget(STEP_THUMBNAIL_WIDTH, STEP_THUMBNAIL_HEIGHT, {
        depthBuffer: true,
      });
      renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
      const previousTarget = gl.getRenderTarget();
      const previousClearColor = gl.getClearColor(new THREE.Color());
      const previousClearAlpha = gl.getClearAlpha();
      const previousAspect = camera.aspect;
      const pixels = new Uint8Array(STEP_THUMBNAIL_WIDTH * STEP_THUMBNAIL_HEIGHT * 4);

      try {
        camera.aspect = STEP_THUMBNAIL_WIDTH / STEP_THUMBNAIL_HEIGHT;
        camera.updateProjectionMatrix();
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        gl.setRenderTarget(renderTarget);
        gl.setClearColor('#ffffff', 1);
        gl.clear(true, true, true);
        gl.render(scene, camera);
        gl.readRenderTargetPixels(
          renderTarget,
          0,
          0,
          STEP_THUMBNAIL_WIDTH,
          STEP_THUMBNAIL_HEIGHT,
          pixels,
        );
      } finally {
        snapshots.forEach((snapshot) => {
          snapshot.object.visible = snapshot.visible;
          snapshot.object.position.copy(snapshot.position);
          snapshot.object.rotation.copy(snapshot.rotation);
          snapshot.object.scale.copy(snapshot.scale);
        });
        camera.aspect = previousAspect;
        camera.updateProjectionMatrix();
        gl.setRenderTarget(previousTarget);
        gl.setClearColor(previousClearColor, previousClearAlpha);
        renderTarget.dispose();
      }

      const blob = await pixelsToWebp(
        pixels,
        STEP_THUMBNAIL_WIDTH,
        STEP_THUMBNAIL_HEIGHT,
      );
      onStepThumbnailCaptured(stepThumbnailRequest.stepId, blob);
    };

    void captureThumbnail();
  }, [camera, gl, initialObjectStates, onStepThumbnailCaptured, scene, stepThumbnailRequest]);

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

  const fitVisibleModel = useCallback((modelScene: THREE.Object3D) => {
    const controls = controlsRef.current;
    const activeCamera = cameraRef.current;
    if (!controls || !(activeCamera instanceof THREE.PerspectiveCamera)) return;

    modelScene.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    const objectBounds = new THREE.Box3();
    let hasVisibleGeometry = false;

    modelScene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !isEffectivelyVisible(object)) return;
      const geometry = object.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingBox) return;
      objectBounds.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld);
      bounds.union(objectBounds);
      hasVisibleGeometry = true;
    });

    if (!hasVisibleGeometry || bounds.isEmpty()) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const direction = activeCamera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 0.0001) direction.set(1, 0.7, 1);
    direction.normalize();

    const verticalFov = THREE.MathUtils.degToRad(activeCamera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * activeCamera.aspect);
    const limitingFov = Math.min(verticalFov, horizontalFov);
    const distance = Math.max(
      sphere.radius / Math.sin(limitingFov / 2) * 1.18,
      0.25,
    );

    controls.target.copy(center);
    activeCamera.position.copy(center).addScaledVector(direction, distance);
    activeCamera.near = Math.max(distance / 100, 0.001);
    activeCamera.far = Math.max(distance * 100, 1000);
    activeCamera.updateProjectionMatrix();
    controls.update();
  }, []);

  const onSceneReady = useCallback((modelScene: THREE.Object3D) => {
    modelSceneRef.current = modelScene;
    selectedUuids.forEach((uuid) => findInScene(modelScene, uuid));
    if (variant === 'presentation' && !initialModelFitApplied.current) {
      initialModelFitApplied.current = true;
      window.setTimeout(() => fitVisibleModel(modelScene), 0);
    }
  }, [fitVisibleModel, selectedUuids, variant]);

  useEffect(() => {
    if (
      variant !== 'presentation' ||
      !modelSceneRef.current ||
      stepTransitionToken === 0 ||
      initialStepFitApplied.current
    ) return;
    initialStepFitApplied.current = true;
    const timer = window.setTimeout(
      () => modelSceneRef.current && fitVisibleModel(modelSceneRef.current),
      560,
    );
    return () => window.clearTimeout(timer);
  }, [fitVisibleModel, stepTransitionToken, variant]);

  useEffect(() => {
    if (variant !== 'presentation' || !modelSceneRef.current || !initialModelFitApplied.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (modelSceneRef.current) fitVisibleModel(modelSceneRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitVisibleModel, size.height, size.width, variant]);

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
      const modifier = variant === 'editor' && (e.metaKey || e.ctrlKey || e.shiftKey);
      const wasSelected = !!part && selectedUuids.includes(part.uuid);
      const canDrag = variant === 'editor' && e.button === 0 && !!part && wasSelected && !modifier;
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
    variant,
  ]);

  return (
    <>
      <ambientLight intensity={variant === 'presentation' ? 0.8 : 0.4} />
      <directionalLight position={[10, 15, 10]} intensity={variant === 'presentation' ? 1.1 : 0.8} />
      <TrackballControls
        ref={controlsRef}
        makeDefault
        enabled={!isDragging}
        rotateSpeed={3.2}
        zoomSpeed={1.2}
        panSpeed={0.8}
        staticMoving={false}
        dynamicDampingFactor={0.16}
        mouseButtons={{
          LEFT: variant === 'presentation' ? THREE.MOUSE.ROTATE : -1 as THREE.MOUSE,
          MIDDLE: variant === 'presentation' ? THREE.MOUSE.DOLLY : THREE.MOUSE.PAN,
          RIGHT: variant === 'presentation' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
        }}
      />
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewcube
          color={variant === 'presentation' ? '#e2e8f0' : '#475569'}
          hoverColor="#38bdf8"
          textColor="#0f172a"
          strokeColor="#94a3b8"
          opacity={0.96}
        />
      </GizmoHelper>
      {variant === 'presentation' && selectedUuids[0] && (
        <SelectedPartLabel uuid={selectedUuids[0]} />
      )}
      {variant === 'editor' && (
        <group ref={gridRef}>
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
        </group>
      )}
      {modelUrl && (
        <Suspense fallback={null}>
          <ModelScene modelUrl={modelUrl} onSceneReady={onSceneReady} />
        </Suspense>
      )}
    </>
  );
}

interface ViewerCanvasProps {
  variant?: ViewerVariant;
  onCoverCaptured?: (capture: CoverCapture) => Promise<void> | void;
  initialCameraView?: CameraView;
  stepThumbnailRequest?: StepThumbnailCaptureRequest;
  onStepThumbnailCaptured?: (stepId: string, blob: Blob) => void;
}

export default function ViewerCanvas({
  variant = 'editor',
  onCoverCaptured,
  initialCameraView,
  stepThumbnailRequest,
  onStepThumbnailCaptured,
}: ViewerCanvasProps) {
  const isPresentation = variant === 'presentation';
  const modelUrl = useAssemblyStore((s) => s.modelUrl);
  const initialObjectStates = useAssemblyStore((s) => s.initialObjectStates);
  const deselectAll = useAssemblyStore((s) => s.deselectAll);
  const [captureRequest, setCaptureRequest] = useState(0);
  const [captureStatus, setCaptureStatus] = useState<'idle' | 'capturing' | 'saved' | 'failed'>('idle');

  const handleCapture = () => {
    deselectAll();
    setCaptureStatus('capturing');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setCaptureRequest((value) => value + 1));
    });
  };

  const handleCoverCaptured = async (capture: CoverCapture) => {
    try {
      await onCoverCaptured?.(capture);
      setCaptureStatus('saved');
      window.setTimeout(() => setCaptureStatus('idle'), 2200);
    } catch {
      setCaptureStatus('failed');
    }
  };

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [5, 4, 8], fov: 50 }}
        dpr={isPresentation ? [1, 1.25] : [1, 2]}
        gl={isPresentation ? { antialias: false, powerPreference: 'low-power' } : undefined}
        style={{ background: isPresentation ? '#ffffff' : '#1a1a2e' }}
      >
        <SceneContent
          variant={variant}
          captureRequest={captureRequest}
          onCoverCaptured={onCoverCaptured ? handleCoverCaptured : undefined}
          onCaptureError={() => setCaptureStatus('failed')}
          initialCameraView={initialCameraView}
          stepThumbnailRequest={stepThumbnailRequest}
          onStepThumbnailCaptured={onStepThumbnailCaptured}
        />
      </Canvas>
      {variant === 'editor' && onCoverCaptured && (
        <button
          type="button"
          onClick={handleCapture}
          disabled={!modelUrl || Object.keys(initialObjectStates).length === 0 || captureStatus === 'capturing'}
          className="absolute bottom-5 left-5 rounded-xl border border-slate-600 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white shadow-xl transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {captureStatus === 'capturing' && 'Capturing cover...'}
          {captureStatus === 'saved' && 'Cover saved'}
          {captureStatus === 'failed' && 'Capture failed — retry'}
          {captureStatus === 'idle' && 'Capture Cover'}
        </button>
      )}
    </div>
  );
}
