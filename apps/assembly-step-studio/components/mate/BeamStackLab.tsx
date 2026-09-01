'use client';

import { Canvas } from '@react-three/fiber';
import { Grid, Html, TrackballControls } from '@react-three/drei';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { connectorWorldFrame, snapObjectByTwoMates } from '@/lib/mate/mateMath';
import { loadStepModel } from '@/lib/mate/loadStep';
import { BEAM_HOLE_FACES, type ConnectorChoice } from '@/lib/mate/partConnectors';

const FIXED_POSITION = new THREE.Vector3(-12, -16, 0);
const MOVING_POSITION = new THREE.Vector3(20, 22, 20);
const MOVING_ROTATION = new THREE.Euler(0.28, -0.32, 0.22);

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function FaceMarkers({
  role,
  selectedIds,
  onSelect,
}: {
  role: 'fixed' | 'moving';
  selectedIds: string[];
  onSelect: (face: ConnectorChoice) => void;
}) {
  return BEAM_HOLE_FACES.map((face) => {
    const selectedIndex = selectedIds.indexOf(face.id);
    const selected = selectedIndex >= 0;
    const idleColor = role === 'fixed'
      ? (face.normal.z > 0 ? '#38bdf8' : '#2563eb')
      : (face.normal.z > 0 ? '#fb923c' : '#ea580c');
    const selectedColor = selectedIndex === 0 ? '#22c55e' : '#a855f7';

    return (
      <mesh
        key={face.id}
        position={face.position}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(face);
        }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <torusGeometry args={[3.2, selected ? 0.68 : 0.42, 14, 40]} />
        <meshBasicMaterial color={selected ? selectedColor : idleColor} depthTest={false} />
        {selected && (
          <Html center position={[0, 0, face.normal.z * 2.5]}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black text-white shadow-lg ${selectedIndex === 0 ? 'bg-emerald-500' : 'bg-purple-500'}`}>
              {selectedIndex + 1}
            </span>
          </Html>
        )}
      </mesh>
    );
  });
}

function BeamStackScene({
  fixedFaces,
  movingFaces,
  connectRequest,
  resetRequest,
  onSelectFixed,
  onSelectMoving,
  onReadyChange,
  onConnected,
  onConnectError,
}: {
  fixedFaces: ConnectorChoice[];
  movingFaces: ConnectorChoice[];
  connectRequest: number;
  resetRequest: number;
  onSelectFixed: (face: ConnectorChoice) => void;
  onSelectMoving: (face: ConnectorChoice) => void;
  onReadyChange: (ready: boolean, error?: string) => void;
  onConnected: () => void;
  onConnectError: (message: string) => void;
}) {
  const fixedRef = useRef<THREE.Group>(null);
  const movingRef = useRef<THREE.Group>(null);
  const handledConnectRequest = useRef(0);
  const [fixedModel, setFixedModel] = useState<THREE.Group | null>(null);
  const [movingModel, setMovingModel] = useState<THREE.Group | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadedFixed: THREE.Group | null = null;
    let loadedMoving: THREE.Group | null = null;
    void Promise.all([
      loadStepModel('/mate-lab/parts/1x4-beam.step', '#356fe3'),
      loadStepModel('/mate-lab/parts/1x4-beam.step', '#f47a32'),
    ])
      .then(([fixed, moving]) => {
        loadedFixed = fixed;
        loadedMoving = moving;
        if (cancelled) {
          disposeObject(fixed);
          disposeObject(moving);
          return;
        }
        setFixedModel(fixed);
        setMovingModel(moving);
        onReadyChange(true);
      })
      .catch((error: unknown) => {
        onReadyChange(false, error instanceof Error ? error.message : 'Unable to load beams.');
      });

    return () => {
      cancelled = true;
      if (loadedFixed) disposeObject(loadedFixed);
      if (loadedMoving) disposeObject(loadedMoving);
    };
  }, [onReadyChange]);

  useEffect(() => {
    if (
      !connectRequest ||
      connectRequest === handledConnectRequest.current ||
      !fixedRef.current ||
      !movingRef.current ||
      fixedFaces.length !== 2 ||
      movingFaces.length !== 2
    ) return;
    handledConnectRequest.current = connectRequest;

    try {
      const targetFirst = connectorWorldFrame(fixedRef.current, fixedFaces[0]);
      const targetSecond = connectorWorldFrame(fixedRef.current, fixedFaces[1]);
      snapObjectByTwoMates(
        movingRef.current,
        movingFaces[0],
        movingFaces[1],
        targetFirst,
        targetSecond,
      );
      onConnected();
    } catch (error: unknown) {
      onConnectError(error instanceof Error ? error.message : 'Unable to align these holes.');
    }
  }, [connectRequest, fixedFaces, movingFaces, onConnected, onConnectError]);

  useEffect(() => {
    if (!movingRef.current) return;
    movingRef.current.position.copy(MOVING_POSITION);
    movingRef.current.rotation.copy(MOVING_ROTATION);
    movingRef.current.updateWorldMatrix(true, false);
  }, [resetRequest]);

  return (
    <>
      <color attach="background" args={['#f8fafc']} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[35, 55, 75]} intensity={2.2} castShadow />
      <directionalLight position={[-45, -20, 35]} intensity={0.8} />

      <group ref={fixedRef} position={FIXED_POSITION}>
        {fixedModel && <primitive object={fixedModel} />}
        {fixedModel && (
          <FaceMarkers role="fixed" selectedIds={fixedFaces.map((face) => face.id)} onSelect={onSelectFixed} />
        )}
      </group>

      <group ref={movingRef} position={MOVING_POSITION} rotation={MOVING_ROTATION}>
        {movingModel && <primitive object={movingModel} />}
        {movingModel && (
          <FaceMarkers role="moving" selectedIds={movingFaces.map((face) => face.id)} onSelect={onSelectMoving} />
        )}
      </group>

      <Grid
        position={[0, 0, -14]}
        args={[180, 180]}
        cellSize={5}
        sectionSize={25}
        cellColor="#dbe4ee"
        sectionColor="#aab9ca"
        fadeDistance={190}
        infiniteGrid
      />
      <TrackballControls makeDefault rotateSpeed={3.2} panSpeed={0.9} zoomSpeed={1.15} />
    </>
  );
}

function updateFaceSelection(current: ConnectorChoice[], face: ConnectorChoice) {
  if (current.some((selected) => selected.id === face.id)) {
    return current.filter((selected) => selected.id !== face.id);
  }
  if (current.length > 0 && current[0].normal.dot(face.normal) < 0.99) {
    return [face];
  }
  if (current.length === 2) return [face];
  return [...current, face];
}

export default function BeamStackLab({
  onBack,
  onSwitchToPin,
  onSwitchToShaft,
}: {
  onBack: () => void;
  onSwitchToPin: () => void;
  onSwitchToShaft: () => void;
}) {
  const [fixedFaces, setFixedFaces] = useState<ConnectorChoice[]>([]);
  const [movingFaces, setMovingFaces] = useState<ConnectorChoice[]>([]);
  const [connectRequest, setConnectRequest] = useState(0);
  const [resetRequest, setResetRequest] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const handleReadyChange = useCallback((nextReady: boolean, error?: string) => {
    setReady(nextReady);
    setLoadError(error ?? null);
  }, []);
  const handleConnected = useCallback(() => {
    setConnected(true);
    setConnectError(null);
  }, []);
  const handleConnectError = useCallback((message: string) => {
    setConnected(false);
    setConnectError(message);
  }, []);

  const reset = () => {
    setFixedFaces([]);
    setMovingFaces([]);
    setConnected(false);
    setConnectError(null);
    setResetRequest((value) => value + 1);
  };

  return (
    <main className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-white text-slate-900">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Back</button>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Assembly experiment</p>
            <h1 className="text-lg font-bold">Two-hole Beam Stacking</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onSwitchToPin} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Pin test</button>
          <button onClick={onSwitchToShaft} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Shaft test</button>
          <button onClick={reset} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Reset</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="z-10 w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-5 shadow-[8px_0_24px_rgba(15,23,42,0.04)]">
          <h2 className="text-base font-bold">Align two hole pairs</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Select two holes from the same side of each beam. Selection order determines the matching pairs.</p>

          <ol className="mt-6 space-y-3 text-sm">
            <li className={`rounded-2xl border p-3 ${fixedFaces.length === 2 ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="font-bold">1. Fixed blue Beam</span>
              <p className="mt-1 text-slate-500">Select holes 1 and 2 on one side.</p>
            </li>
            <li className={`rounded-2xl border p-3 ${movingFaces.length === 2 ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="font-bold">2. Moving orange Beam</span>
              <p className="mt-1 text-slate-500">Select the matching holes 1 and 2.</p>
            </li>
            <li className={`rounded-2xl border p-3 ${connected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="font-bold">3. Stack Beams</span>
              <p className="mt-1 text-slate-500">Both hole pairs align and the selected faces meet.</p>
            </li>
          </ol>

          {connectError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600">{connectError}</p>}
          <button
            disabled={!ready || fixedFaces.length !== 2 || movingFaces.length !== 2}
            onClick={() => setConnectRequest((value) => value + 1)}
            className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            Align and stack Beams
          </button>

          <div className="mt-5 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            Green = hole 1 · Purple = hole 2<br />Left drag: rotate · Right drag: move
          </div>
        </aside>

        <section className="relative min-w-0 flex-1">
          {!ready && !loadError && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 text-sm font-semibold text-slate-500">Loading STEP parts...</div>}
          {loadError && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white p-8 text-center text-sm font-semibold text-red-600">{loadError}</div>}
          <Canvas camera={{ position: [82, 72, 110], fov: 38 }} shadows dpr={[1, 1.6]}>
            <BeamStackScene
              fixedFaces={fixedFaces}
              movingFaces={movingFaces}
              connectRequest={connectRequest}
              resetRequest={resetRequest}
              onSelectFixed={(face) => { setFixedFaces((current) => updateFaceSelection(current, face)); setConnected(false); setConnectError(null); }}
              onSelectMoving={(face) => { setMovingFaces((current) => updateFaceSelection(current, face)); setConnected(false); setConnectError(null); }}
              onReadyChange={handleReadyChange}
              onConnected={handleConnected}
              onConnectError={handleConnectError}
            />
          </Canvas>
        </section>
      </div>
    </main>
  );
}
