'use client';

import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Grid, Html, TrackballControls, TransformControls } from '@react-three/drei';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import * as THREE from 'three';
import type { TrackballControls as TrackballControlsImpl } from 'three-stdlib';
import {
  buildLibraryConnectors,
  buildManualHoleConnectors,
  buildManualSquareHoleConnectors,
  centerLibraryConnectors,
  type ConnectorAxis,
  type LibraryConnector,
} from '@/lib/mate/libraryConnectors';
import { loadStepModel } from '@/lib/mate/loadStep';
import type { AssemblyPartInstance, CameraView, CoverCapture } from '@/types/assembly';

const COVER_WIDTH = 1200;
const COVER_HEIGHT = 675;

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

export type LibraryPartInstance = AssemblyPartInstance;

export type LibraryMateMode = 'connect' | 'pin' | 'multi-leg' | 'beam' | 'shaft' | 'hole-align';
export type HoleMarkingShape = 'round' | 'square';

export type LibraryConnectorPick = {
  instanceId: string;
  partName: string;
  connector: LibraryConnector;
};

export type ShaftAdjustment = {
  instanceId: string;
  axis: ConnectorAxis;
};

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function SelectionBounds({ object, primary }: { object: THREE.Object3D; primary: boolean }) {
  const helper = useMemo(() => {
    const next = new THREE.BoxHelper(object, primary ? '#16a34a' : '#22c55e');
    next.renderOrder = 1000;
    next.material.depthTest = false;
    next.material.transparent = true;
    next.material.opacity = primary ? 1 : 0.72;
    return next;
  }, [object, primary]);

  useFrame(() => helper.update());
  useEffect(() => () => {
    helper.geometry.dispose();
    helper.material.dispose();
  }, [helper]);
  return <primitive object={helper} raycast={() => null} />;
}

function PartInstance({
  instance,
  holeMarkingShape,
  onSelect,
  onRegisterObject,
  onConnectorsReady,
  onLoadState,
  onHoleMarkingResult,
}: {
  instance: LibraryPartInstance;
  holeMarkingShape: HoleMarkingShape | null;
  onSelect: () => void;
  onRegisterObject: (instanceId: string, object: THREE.Group | null) => void;
  onConnectorsReady: (instanceId: string, connectors: LibraryConnector[]) => void;
  onLoadState: (instanceId: string, loaded: boolean) => void;
  onHoleMarkingResult: (result: { partName: string; holeCount: number; removed: boolean; error?: string }) => void;
}) {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [automaticConnectors, setAutomaticConnectors] = useState<LibraryConnector[]>([]);
  const [manualConnectors, setManualConnectors] = useState<LibraryConnector[]>([]);
  const [markingBusy, setMarkingBusy] = useState(false);
  const groupRef = useRef<THREE.Group | null>(null);
  const assignGroupRef = useCallback((object: THREE.Group | null) => {
    groupRef.current = object;
    onRegisterObject(instance.instanceId, object);
  }, [instance.instanceId, onRegisterObject]);

  useEffect(() => {
    let cancelled = false;
    let loaded: THREE.Group | null = null;
    onLoadState(instance.instanceId, false);
    const savedConnectors = fetch(`/api/part-library/connectors/${encodeURIComponent(instance.part.id)}`)
      .then(async (response) => response.ok
        ? response.json() as Promise<{ connectors: LibraryConnector[] }>
        : { connectors: [] as LibraryConnector[] })
      .catch(() => ({ connectors: [] as LibraryConnector[] }));
    void Promise.all([
      loadStepModel(`/api/part-library/step/${encodeURIComponent(instance.part.id)}`, instance.color),
      savedConnectors,
    ])
      .then(([nextModel, saved]) => {
        loaded = nextModel;
        if (cancelled) {
          disposeObject(nextModel);
          return;
        }
        const bounds = new THREE.Box3().setFromObject(nextModel);
        const center = bounds.getCenter(new THREE.Vector3());
        const detected = centerLibraryConnectors(
          buildLibraryConnectors(instance.part, nextModel),
          center,
        );
        nextModel.position.sub(center);
        nextModel.name = `${instance.part.name} geometry`;
        setModel(nextModel);
        setAutomaticConnectors(detected);
        setManualConnectors(saved.connectors);
        onConnectorsReady(instance.instanceId, [...detected, ...saved.connectors]);
        onLoadState(instance.instanceId, true);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to load part.');
        onLoadState(instance.instanceId, false);
      });

    return () => {
      cancelled = true;
      onConnectorsReady(instance.instanceId, []);
      onLoadState(instance.instanceId, false);
      onRegisterObject(instance.instanceId, null);
      if (loaded) disposeObject(loaded);
    };
  }, [
    instance.color,
    instance.instanceId,
    instance.part,
    onConnectorsReady,
    onLoadState,
    onRegisterObject,
  ]);

  const markHole = async (event: ThreeEvent<MouseEvent>) => {
    if (!holeMarkingShape || markingBusy) return;
    event.stopPropagation();
    const root = groupRef.current;
    if (!(event.object instanceof THREE.Mesh) || event.faceIndex == null || !root) {
      onHoleMarkingResult({
        partName: instance.part.name,
        holeCount: manualConnectors.length / 2,
        removed: false,
        error: holeMarkingShape === 'square'
          ? 'Click one flat inside wall of a square hole.'
          : 'Click the curved inside wall of a round hole.',
      });
      return;
    }

    const connectorPrefix = holeMarkingShape === 'square' ? 'manual-square-hole' : 'manual-hole';
    const nextNumber = manualConnectors.reduce((largest, connector) => {
      const match = connector.id.match(new RegExp(`^${connectorPrefix}-(\\d+)-`));
      return Math.max(largest, Number(match?.[1] ?? 0));
    }, 0) + 1;
    const detected = holeMarkingShape === 'square'
      ? buildManualSquareHoleConnectors(event.object, event.faceIndex, root, nextNumber)
      : buildManualHoleConnectors(event.object, event.faceIndex, root, nextNumber);
    const center = detected[0]?.centerPosition;
    if (!center) {
      onHoleMarkingResult({
        partName: instance.part.name,
        holeCount: manualConnectors.length / 2,
        removed: false,
        error: holeMarkingShape === 'square'
          ? 'No square hole was found there. Click one of its flat inside walls.'
          : 'No round hole was found there. Click its curved inside wall.',
      });
      return;
    }

    const duplicate = manualConnectors.find((connector) => connector.kind === detected[0]?.kind
      && connector.centerPosition
      && new THREE.Vector3(...connector.centerPosition).distanceTo(new THREE.Vector3(...center)) < 0.35);
    const nextManual = duplicate
      ? manualConnectors.filter((connector) => connector.id !== duplicate.id.replace(/-[ab]$/, '-a')
        && connector.id !== duplicate.id.replace(/-[ab]$/, '-b'))
      : [...manualConnectors, ...detected];

    setMarkingBusy(true);
    try {
      const response = await fetch(`/api/part-library/connectors/${encodeURIComponent(instance.part.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectors: nextManual }),
      });
      if (!response.ok) throw new Error('Unable to save this hole.');
      setManualConnectors(nextManual);
      onConnectorsReady(instance.instanceId, [...automaticConnectors, ...nextManual]);
      onHoleMarkingResult({
        partName: instance.part.name,
        holeCount: nextManual.length / 2,
        removed: Boolean(duplicate),
      });
    } catch (error: unknown) {
      onHoleMarkingResult({
        partName: instance.part.name,
        holeCount: manualConnectors.length / 2,
        removed: false,
        error: error instanceof Error ? error.message : 'Unable to save this hole.',
      });
    } finally {
      setMarkingBusy(false);
    }
  };

  return (
    <group
      ref={assignGroupRef}
      name={instance.part.name}
      position={instance.position}
      quaternion={instance.quaternion}
      userData={{
        robogoInstanceId: instance.instanceId,
        partId: instance.part.id,
        partNumber: instance.part.partNumber,
        category: instance.part.category,
      }}
      onClick={(event) => {
        if (holeMarkingShape) {
          void markHole(event);
          return;
        }
        event.stopPropagation();
        onSelect();
      }}
      onPointerOver={() => { document.body.style.cursor = holeMarkingShape ? 'crosshair' : 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = 'default'; }}
    >
      {model && <primitive object={model} />}
      {!model && !loadError && (
        <Html center>
          <span className="whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow">Loading...</span>
        </Html>
      )}
      {loadError && (
        <Html center>
          <span className="whitespace-nowrap rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 shadow">Load failed</span>
        </Html>
      )}
    </group>
  );
}

function connectorKindsForMode(mode: LibraryMateMode): LibraryConnector['kind'][] {
  if (mode === 'connect') return ['hole', 'square-hole', 'pin-ring', 'shaft-end'];
  if (mode === 'pin' || mode === 'multi-leg') return ['hole', 'pin-ring'];
  if (mode === 'shaft') return ['hole', 'square-hole', 'shaft-end'];
  if (mode === 'hole-align') return ['hole', 'square-hole'];
  return ['hole'];
}

function ConnectorMarkers({
  instance,
  connectors,
  mode,
  picks,
  onPick,
  interactive = true,
}: {
  instance: LibraryPartInstance;
  connectors: LibraryConnector[];
  mode: LibraryMateMode;
  picks: LibraryConnectorPick[];
  onPick: (pick: LibraryConnectorPick) => void;
  interactive?: boolean;
}) {
  const [hoveredConnectorId, setHoveredConnectorId] = useState<string | null>(null);
  const visibleKinds = connectorKindsForMode(mode);
  const visibleConnectors = connectors.filter((connector) => visibleKinds.includes(connector.kind));

  return (
    <group position={instance.position} quaternion={instance.quaternion}>
      {visibleConnectors.map((connector) => {
        const selectedIndex = picks.findIndex(
          (pick) => pick.instanceId === instance.instanceId && pick.connector.id === connector.id,
        );
        const selected = selectedIndex >= 0;
        const pairNumber = selected
          ? picks.slice(0, selectedIndex + 1).filter((pick) => pick.connector.kind === connector.kind).length
          : 0;
        const hovered = hoveredConnectorId === connector.id;
        const orientation = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(...connector.normal).normalize(),
        );
        const idleColor = connector.kind === 'hole'
          ? '#2563eb'
          : connector.kind === 'square-hole' ? '#9333ea'
          : connector.kind === 'pin-ring' ? '#f97316' : '#f59e0b';

        return (
          <group
            key={connector.id}
            position={connector.markerPosition}
            quaternion={orientation}
            scale={hovered ? 1.12 : 1}
          >
            <mesh
              raycast={interactive ? undefined : () => null}
              onClick={(event) => {
                event.stopPropagation();
                onPick({
                  instanceId: instance.instanceId,
                  partName: instance.part.name,
                  connector,
                });
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                setHoveredConnectorId(connector.id);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHoveredConnectorId((current) => current === connector.id ? null : current);
                document.body.style.cursor = 'default';
              }}
            >
              {connector.kind === 'square-hole' ? (
                <boxGeometry args={[connector.radius * 2, connector.radius * 2, selected ? 0.72 : 0.5]} />
              ) : (
                <torusGeometry args={[connector.radius, selected ? 1 : hovered ? 0.9 : 0.75, 14, 40]} />
              )}
              <meshBasicMaterial
                color={selected
                  ? (selectedIndex % 2 === 0 ? '#22c55e' : '#a855f7')
                  : hovered ? '#facc15' : idleColor}
                depthTest={false}
                wireframe={connector.kind === 'square-hole'}
              />
            </mesh>
            {selected && (
              <Html center position={[0, 0, 2.4]}>
                <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-black text-white shadow-lg ${mode === 'multi-leg' && connector.kind === 'pin-ring' ? 'bg-purple-500' : 'bg-emerald-500'}`}>
                  {mode === 'multi-leg' ? `${connector.kind === 'hole' ? 'H' : 'C'}${pairNumber}` : selectedIndex + 1}
                </span>
              </Html>
            )}
            {hovered && !selected && (
              <Html center position={[0, 0, 2.4]} style={{ pointerEvents: 'none' }}>
                <span className="whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-lg">
                  {connector.label}
                </span>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

function AssemblyCoverCapture({
  request,
  assemblyRoot,
  controlsRef,
  onCaptured,
  onError,
}: {
  request: number;
  assemblyRoot: THREE.Group | null;
  controlsRef: RefObject<TrackballControlsImpl | null>;
  onCaptured: (capture: CoverCapture) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const { camera, gl, scene } = useThree();
  const lastRequest = useRef(0);

  useEffect(() => {
    if (
      request === 0
      || request === lastRequest.current
      || !assemblyRoot
      || !(camera instanceof THREE.PerspectiveCamera)
    ) return;
    lastRequest.current = request;

    const capture = async () => {
      const bounds = new THREE.Box3().setFromObject(assemblyRoot);
      if (bounds.isEmpty()) throw new Error('The assembled model is not ready for a cover yet.');

      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const controls = controlsRef.current;
      const previousPosition = camera.position.clone();
      const previousUp = camera.up.clone();
      const previousTarget = controls?.target.clone() ?? new THREE.Vector3();
      const previousAspect = camera.aspect;
      const previousNear = camera.near;
      const previousFar = camera.far;
      const direction = camera.position.clone().sub(previousTarget);
      if (direction.lengthSq() < 0.0001) direction.set(1, 0.75, 1);
      direction.normalize();

      const aspect = COVER_WIDTH / COVER_HEIGHT;
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
      const fitFov = Math.min(verticalFov, horizontalFov);
      const distance = Math.max(1, sphere.radius / Math.sin(fitFov / 2) * 1.16);
      const capturePosition = sphere.center.clone().add(direction.multiplyScalar(distance));
      const cameraView: CameraView = {
        position: capturePosition.toArray(),
        target: sphere.center.toArray(),
        up: camera.up.toArray(),
      };

      const visibility = scene.children.map((child) => ({ child, visible: child.visible }));
      const renderTarget = new THREE.WebGLRenderTarget(COVER_WIDTH, COVER_HEIGHT, { depthBuffer: true });
      renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
      const previousRenderTarget = gl.getRenderTarget();
      const previousClearColor = gl.getClearColor(new THREE.Color());
      const previousClearAlpha = gl.getClearAlpha();
      const pixels = new Uint8Array(COVER_WIDTH * COVER_HEIGHT * 4);

      try {
        visibility.forEach(({ child }) => {
          child.visible = child === assemblyRoot || child instanceof THREE.Light;
        });
        camera.position.copy(capturePosition);
        camera.aspect = aspect;
        camera.near = Math.max(0.01, distance - sphere.radius * 2.5);
        camera.far = Math.max(camera.near + 1, distance + sphere.radius * 2.5);
        camera.lookAt(sphere.center);
        camera.updateProjectionMatrix();
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        gl.setRenderTarget(renderTarget);
        gl.setClearColor('#f8fafc', 1);
        gl.clear(true, true, true);
        gl.render(scene, camera);
        gl.readRenderTargetPixels(renderTarget, 0, 0, COVER_WIDTH, COVER_HEIGHT, pixels);
      } finally {
        visibility.forEach(({ child, visible }) => { child.visible = visible; });
        camera.position.copy(previousPosition);
        camera.up.copy(previousUp);
        camera.aspect = previousAspect;
        camera.near = previousNear;
        camera.far = previousFar;
        if (controls) controls.target.copy(previousTarget);
        camera.lookAt(previousTarget);
        camera.updateProjectionMatrix();
        controls?.update();
        gl.setRenderTarget(previousRenderTarget);
        gl.setClearColor(previousClearColor, previousClearAlpha);
        renderTarget.dispose();
      }

      const blob = await pixelsToWebp(pixels, COVER_WIDTH, COVER_HEIGHT);
      await onCaptured({ blob, camera: cameraView });
    };

    void capture().catch((error: unknown) => {
      onError(error instanceof Error ? error.message : 'Unable to capture the model cover.');
    });
  }, [assemblyRoot, camera, controlsRef, gl, onCaptured, onError, request, scene]);

  return null;
}

export default function LibraryAssemblyCanvas({
  instances,
  selectedInstanceId,
  selectedInstanceIds,
  mode,
  mateMode,
  holeMarkingInstanceId,
  holeMarkingShape,
  connectorPicks,
  shaftAdjustment,
  assemblyName,
  mateRecords,
  onSelect,
  onLassoSelect,
  onClearSelection,
  onTransformChange,
  onConnectorPick,
  onHoleMarkingResult,
  onAssemblyRootChange,
  onReadyChange,
  coverCaptureRequest,
  onCoverCaptured,
  onCoverCaptureError,
}: {
  instances: LibraryPartInstance[];
  selectedInstanceId: string | null;
  selectedInstanceIds: string[];
  mode: 'translate' | 'rotate';
  mateMode: LibraryMateMode | null;
  holeMarkingInstanceId: string | null;
  holeMarkingShape: HoleMarkingShape | null;
  connectorPicks: LibraryConnectorPick[];
  shaftAdjustment: ShaftAdjustment | null;
  assemblyName: string;
  mateRecords: unknown[];
  onSelect: (instanceId: string, additive: boolean) => void;
  onLassoSelect: (instanceIds: string[]) => void;
  onClearSelection: () => void;
  onTransformChange: (
    instanceId: string,
    position: [number, number, number],
    quaternion: [number, number, number, number],
  ) => void;
  onConnectorPick: (pick: LibraryConnectorPick) => void;
  onHoleMarkingResult: (result: { partName: string; holeCount: number; removed: boolean; error?: string }) => void;
  onAssemblyRootChange: (root: THREE.Group | null) => void;
  onReadyChange: (ready: boolean) => void;
  coverCaptureRequest: number;
  onCoverCaptured: (capture: CoverCapture) => void | Promise<void>;
  onCoverCaptureError: (message: string) => void;
}) {
  const [objects, setObjects] = useState<Record<string, THREE.Group>>({});
  const [connectorsByInstance, setConnectorsByInstance] = useState<Record<string, LibraryConnector[]>>({});
  const [loadedIds, setLoadedIds] = useState<Set<string>>(() => new Set());
  const [assemblyRoot, setAssemblyRoot] = useState<THREE.Group | null>(null);
  const [lasso, setLasso] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    pointerId: number;
  } | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const controlsRef = useRef<TrackballControlsImpl>(null);

  const restoreCameraInteraction = useCallback(() => {
    setLasso(null);
    if (controlsRef.current) controlsRef.current.enabled = true;
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', restoreCameraInteraction);
    window.addEventListener('pointercancel', restoreCameraInteraction);
    window.addEventListener('blur', restoreCameraInteraction);
    return () => {
      window.removeEventListener('pointerup', restoreCameraInteraction);
      window.removeEventListener('pointercancel', restoreCameraInteraction);
      window.removeEventListener('blur', restoreCameraInteraction);
    };
  }, [restoreCameraInteraction]);

  const registerObject = useCallback((instanceId: string, object: THREE.Group | null) => {
    setObjects((current) => {
      if (object) return current[instanceId] === object ? current : { ...current, [instanceId]: object };
      if (!current[instanceId]) return current;
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);

  const handleConnectorsReady = useCallback((instanceId: string, connectors: LibraryConnector[]) => {
    setConnectorsByInstance((current) => {
      if (connectors.length > 0) return { ...current, [instanceId]: connectors };
      if (!current[instanceId]) return current;
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);

  const handleLoadState = useCallback((instanceId: string, loaded: boolean) => {
    setLoadedIds((current) => {
      const next = new Set(current);
      if (loaded) next.add(instanceId);
      else next.delete(instanceId);
      return next;
    });
  }, []);

  const assignAssemblyRoot = useCallback((root: THREE.Group | null) => {
    setAssemblyRoot(root);
    onAssemblyRootChange(root);
  }, [onAssemblyRootChange]);

  useEffect(() => {
    onReadyChange(instances.length > 0 && instances.every((instance) => loadedIds.has(instance.instanceId)));
  }, [instances, loadedIds, onReadyChange]);

  const selectedObject = selectedInstanceId ? objects[selectedInstanceId] ?? null : null;
  const activeShaftAdjustment = selectedInstanceId && shaftAdjustment?.instanceId === selectedInstanceId
    ? shaftAdjustment
    : null;
  const transformMode = activeShaftAdjustment ? 'translate' : mode;
  const transformSpace = activeShaftAdjustment || mode === 'rotate' ? 'local' : 'world';
  const selectedInstance = useMemo(
    () => instances.find((instance) => instance.instanceId === selectedInstanceId) ?? null,
    [instances, selectedInstanceId],
  );

  const commitTransform = () => {
    if (!selectedInstanceId || !selectedObject) return;
    onTransformChange(
      selectedInstanceId,
      [selectedObject.position.x, selectedObject.position.y, selectedObject.position.z],
      [selectedObject.quaternion.x, selectedObject.quaternion.y, selectedObject.quaternion.z, selectedObject.quaternion.w],
    );
  };

  const pointerPosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const projectObjectBounds = (object: THREE.Object3D, width: number, height: number) => {
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty() || !cameraRef.current) return null;
    const screenPoints = [
      [bounds.min.x, bounds.min.y, bounds.min.z],
      [bounds.min.x, bounds.min.y, bounds.max.z],
      [bounds.min.x, bounds.max.y, bounds.min.z],
      [bounds.min.x, bounds.max.y, bounds.max.z],
      [bounds.max.x, bounds.min.y, bounds.min.z],
      [bounds.max.x, bounds.min.y, bounds.max.z],
      [bounds.max.x, bounds.max.y, bounds.min.z],
      [bounds.max.x, bounds.max.y, bounds.max.z],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z).project(cameraRef.current!));
    return {
      minX: Math.min(...screenPoints.map((point) => (point.x + 1) * width / 2)),
      maxX: Math.max(...screenPoints.map((point) => (point.x + 1) * width / 2)),
      minY: Math.min(...screenPoints.map((point) => (1 - point.y) * height / 2)),
      maxY: Math.max(...screenPoints.map((point) => (1 - point.y) * height / 2)),
    };
  };

  const selectAtPoint = (x: number, y: number) => {
    const wrapper = wrapperRef.current;
    const camera = cameraRef.current;
    if (!wrapper || !camera) return;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(
      x / wrapper.clientWidth * 2 - 1,
      -(y / wrapper.clientHeight) * 2 + 1,
    ), camera);
    const hit = raycaster.intersectObjects(Object.values(objects), true)[0]?.object;
    let candidate: THREE.Object3D | null = hit ?? null;
    while (candidate && typeof candidate.userData.robogoInstanceId !== 'string') {
      candidate = candidate.parent;
    }
    if (candidate) onSelect(candidate.userData.robogoInstanceId as string, true);
  };

  const finishLasso = (nextLasso: NonNullable<typeof lasso>) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const distance = Math.hypot(
      nextLasso.currentX - nextLasso.startX,
      nextLasso.currentY - nextLasso.startY,
    );
    if (distance < 5) {
      selectAtPoint(nextLasso.currentX, nextLasso.currentY);
      return;
    }
    const minX = Math.min(nextLasso.startX, nextLasso.currentX);
    const maxX = Math.max(nextLasso.startX, nextLasso.currentX);
    const minY = Math.min(nextLasso.startY, nextLasso.currentY);
    const maxY = Math.max(nextLasso.startY, nextLasso.currentY);
    const selectedIds = Object.entries(objects).flatMap(([instanceId, object]) => {
      const projected = projectObjectBounds(object, wrapper.clientWidth, wrapper.clientHeight);
      if (!projected) return [];
      const intersects = projected.maxX >= minX && projected.minX <= maxX
        && projected.maxY >= minY && projected.minY <= maxY;
      return intersects ? [instanceId] : [];
    });
    onLassoSelect(selectedIds);
  };

  const beginCommandSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((!event.metaKey && !event.ctrlKey) || event.button !== 0 || mateMode || holeMarkingInstanceId) return;
    event.preventDefault();
    event.stopPropagation();
    const position = pointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setLasso({
      startX: position.x,
      startY: position.y,
      currentX: position.x,
      currentY: position.y,
      pointerId: event.pointerId,
    });
  };

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full"
      onPointerDownCapture={beginCommandSelection}
      onPointerMoveCapture={(event) => {
        if (!lasso || event.pointerId !== lasso.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const position = pointerPosition(event);
        setLasso((current) => current ? {
          ...current,
          currentX: position.x,
          currentY: position.y,
        } : null);
      }}
      onPointerUpCapture={(event) => {
        if (!lasso || event.pointerId !== lasso.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const position = pointerPosition(event);
        const completed = { ...lasso, currentX: position.x, currentY: position.y };
        event.currentTarget.releasePointerCapture(event.pointerId);
        setLasso(null);
        finishLasso(completed);
      }}
      onPointerCancelCapture={(event) => {
        if (!lasso || event.pointerId !== lasso.pointerId) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        restoreCameraInteraction();
      }}
      onLostPointerCapture={restoreCameraInteraction}
    >
      <Canvas
        camera={{ position: [115, 95, 145], fov: 40 }}
        dpr={[1, 1.6]}
        shadows
        onCreated={({ camera }) => { cameraRef.current = camera; }}
        onPointerMissed={() => { if (!holeMarkingInstanceId) onClearSelection(); }}
      >
      <color attach="background" args={['#f8fafc']} />
      <ambientLight intensity={1.45} />
      <directionalLight position={[45, 65, 90]} intensity={2.2} castShadow />
      <directionalLight position={[-55, -25, 35]} intensity={0.8} />

      <AssemblyCoverCapture
        request={coverCaptureRequest}
        assemblyRoot={assemblyRoot}
        controlsRef={controlsRef}
        onCaptured={onCoverCaptured}
        onError={onCoverCaptureError}
      />

      <group
        ref={assignAssemblyRoot}
        name={assemblyName.trim() || 'RoBoGo Assembly'}
        userData={{ robogoAssembly: { version: 1, mates: mateRecords } }}
      >
        {instances.map((instance) => (
          <PartInstance
            key={instance.instanceId}
            instance={instance}
            holeMarkingShape={holeMarkingInstanceId === instance.instanceId ? holeMarkingShape : null}
            onSelect={() => onSelect(instance.instanceId, false)}
            onRegisterObject={registerObject}
            onConnectorsReady={handleConnectorsReady}
            onLoadState={handleLoadState}
            onHoleMarkingResult={onHoleMarkingResult}
          />
        ))}
      </group>

      {selectedInstanceIds.map((instanceId) => objects[instanceId] && (
        <SelectionBounds
          key={`selection-${instanceId}`}
          object={objects[instanceId]}
          primary={instanceId === selectedInstanceId}
        />
      ))}

      {mateMode && instances.filter((instance) => (
        selectedInstanceIds.includes(instance.instanceId)
        || connectorPicks.some((pick) => pick.instanceId === instance.instanceId)
      )).map((instance) => (
        <ConnectorMarkers
          key={`markers-${instance.instanceId}`}
          instance={instance}
          connectors={selectedInstanceIds.includes(instance.instanceId)
            ? connectorsByInstance[instance.instanceId] ?? []
            : (connectorsByInstance[instance.instanceId] ?? []).filter((connector) => (
                connectorPicks.some((pick) => (
                  pick.instanceId === instance.instanceId && pick.connector.id === connector.id
                ))
              ))}
          mode={mateMode}
          picks={connectorPicks}
          onPick={onConnectorPick}
        />
      ))}

      {holeMarkingInstanceId && instances.filter(
        (instance) => instance.instanceId === holeMarkingInstanceId,
      ).map((instance) => (
        <ConnectorMarkers
          key={`hole-markers-${instance.instanceId}`}
          instance={instance}
          connectors={(connectorsByInstance[instance.instanceId] ?? []).filter(
            (connector) => connector.id.startsWith(
              holeMarkingShape === 'square' ? 'manual-square-hole-' : 'manual-hole-',
            ),
          )}
          mode={holeMarkingShape === 'square' ? 'hole-align' : 'beam'}
          picks={[]}
          onPick={() => {}}
          interactive={false}
        />
      ))}

      {selectedInstance && selectedObject && !mateMode && !holeMarkingInstanceId && (
        <group position={selectedInstance.position} quaternion={selectedInstance.quaternion}>
          <Html center position={[0, 0, 18]}>
            <span className="whitespace-nowrap rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-lg">{selectedInstance.part.name}</span>
          </Html>
        </group>
      )}

      {selectedObject && !mateMode && !holeMarkingInstanceId && (
        <TransformControls
          object={selectedObject}
          mode={transformMode}
          space={transformSpace}
          size={0.85}
          showX={!activeShaftAdjustment || activeShaftAdjustment.axis === 'x'}
          showY={!activeShaftAdjustment || activeShaftAdjustment.axis === 'y'}
          showZ={!activeShaftAdjustment || activeShaftAdjustment.axis === 'z'}
          onObjectChange={commitTransform}
        />
      )}

      <Grid
        position={[0, 0, -18]}
        args={[300, 300]}
        cellSize={5}
        sectionSize={25}
        cellColor="#dbe4ee"
        sectionColor="#aab9ca"
        fadeDistance={280}
        infiniteGrid
      />
        <TrackballControls
          ref={controlsRef}
          makeDefault
          enabled={!lasso}
          rotateSpeed={3.2}
          panSpeed={0.9}
          zoomSpeed={1.15}
        />
      </Canvas>
      {lasso && Math.hypot(lasso.currentX - lasso.startX, lasso.currentY - lasso.startY) >= 5 && (
        <div
          className="pointer-events-none absolute border-2 border-emerald-500 bg-emerald-200/20"
          style={{
            left: Math.min(lasso.startX, lasso.currentX),
            top: Math.min(lasso.startY, lasso.currentY),
            width: Math.abs(lasso.currentX - lasso.startX),
            height: Math.abs(lasso.currentY - lasso.startY),
          }}
        />
      )}
    </div>
  );
}
