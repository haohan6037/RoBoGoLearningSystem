'use client';

import { Canvas } from '@react-three/fiber';
import { Grid, Html, TrackballControls, TransformControls } from '@react-three/drei';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { connectorWorldFrame, measureInsertionDepth, snapObjectToMate } from '@/lib/mate/mateMath';
import { loadStepModel } from '@/lib/mate/loadStep';
import {
  BEAM_HOLE_FACES,
  SHAFT_END_FACES,
  beamHoleCenterFromFace,
  shaftCenterFromEnd,
  type ConnectorChoice,
} from '@/lib/mate/partConnectors';

const SHAFT_INITIAL_POSITION = new THREE.Vector3(46, 18, 26);
const SHAFT_INITIAL_ROTATION = new THREE.Euler(0.32, -0.24, 0.18);

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function ShaftScene({
  selectedHole,
  selectedShaftEnd,
  alignRequest,
  resetRequest,
  shaftSelected,
  onSelectHole,
  onSelectShaftEnd,
  onSelectShaft,
  onReadyChange,
  onAligned,
  onDepthChange,
}: {
  selectedHole: ConnectorChoice | null;
  selectedShaftEnd: ConnectorChoice | null;
  alignRequest: number;
  resetRequest: number;
  shaftSelected: boolean;
  onSelectHole: (face: ConnectorChoice) => void;
  onSelectShaftEnd: (face: ConnectorChoice) => void;
  onSelectShaft: () => void;
  onReadyChange: (ready: boolean, error?: string) => void;
  onAligned: () => void;
  onDepthChange: (depth: number) => void;
}) {
  const beamRef = useRef<THREE.Group>(null);
  const shaftRef = useRef<THREE.Group>(null);
  const handledAlignRequest = useRef(0);
  const alignedPosition = useRef(new THREE.Vector3());
  const insertionDirection = useRef(new THREE.Vector3(0, 0, -1));
  const [beamModel, setBeamModel] = useState<THREE.Group | null>(null);
  const [shaftModel, setShaftModel] = useState<THREE.Group | null>(null);
  const [shaftObject, setShaftObject] = useState<THREE.Group | null>(null);
  const [aligned, setAligned] = useState(false);
  const assignShaftRef = useCallback((object: THREE.Group | null) => {
    shaftRef.current = object;
    setShaftObject(object);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadedBeam: THREE.Group | null = null;
    let loadedShaft: THREE.Group | null = null;
    void Promise.all([
      loadStepModel('/mate-lab/parts/1x4-beam.step', '#356fe3'),
      loadStepModel('/mate-lab/parts/5x-pitch-shaft.step', '#64748b'),
    ])
      .then(([beam, shaft]) => {
        loadedBeam = beam;
        loadedShaft = shaft;
        if (cancelled) {
          disposeObject(beam);
          disposeObject(shaft);
          return;
        }
        setBeamModel(beam);
        setShaftModel(shaft);
        onReadyChange(true);
      })
      .catch((error: unknown) => {
        onReadyChange(false, error instanceof Error ? error.message : 'Unable to load shaft test parts.');
      });

    return () => {
      cancelled = true;
      if (loadedBeam) disposeObject(loadedBeam);
      if (loadedShaft) disposeObject(loadedShaft);
    };
  }, [onReadyChange]);

  useEffect(() => {
    if (
      !alignRequest ||
      alignRequest === handledAlignRequest.current ||
      !beamRef.current ||
      !shaftRef.current ||
      !selectedHole ||
      !selectedShaftEnd
    ) return;
    handledAlignRequest.current = alignRequest;
    const target = connectorWorldFrame(
      beamRef.current,
      beamHoleCenterFromFace(selectedHole),
    );
    snapObjectToMate(
      shaftRef.current,
      shaftCenterFromEnd(selectedShaftEnd),
      target,
    );
    alignedPosition.current.copy(shaftRef.current.position);
    insertionDirection.current.copy(target.normal).negate().normalize();
    setAligned(true);
    onDepthChange(0);
    onAligned();
  }, [alignRequest, onAligned, onDepthChange, selectedHole, selectedShaftEnd]);

  useEffect(() => {
    if (!shaftRef.current) return;
    shaftRef.current.position.copy(SHAFT_INITIAL_POSITION);
    shaftRef.current.rotation.copy(SHAFT_INITIAL_ROTATION);
    shaftRef.current.updateWorldMatrix(true, false);
    setAligned(false);
  }, [resetRequest]);

  const updateDepth = () => {
    if (!shaftRef.current || !aligned) return;
    onDepthChange(
      measureInsertionDepth(
        shaftRef.current.position,
        alignedPosition.current,
        insertionDirection.current,
      ),
    );
  };

  return (
    <>
      <color attach="background" args={['#f8fafc']} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[35, 55, 75]} intensity={2.2} castShadow />
      <directionalLight position={[-45, -20, 35]} intensity={0.8} />

      <group ref={beamRef} position={[0, -10, 0]}>
        {beamModel && <primitive object={beamModel} />}
        {beamModel && !aligned && BEAM_HOLE_FACES.map((face) => {
          const selected = selectedHole?.id === face.id;
          return (
            <mesh
              key={face.id}
              position={face.position}
              onClick={(event) => { event.stopPropagation(); onSelectHole(face); }}
              onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { document.body.style.cursor = 'default'; }}
            >
              <torusGeometry args={[3.2, selected ? 0.68 : 0.42, 14, 40]} />
              <meshBasicMaterial color={selected ? '#22c55e' : face.normal.z > 0 ? '#38bdf8' : '#2563eb'} depthTest={false} />
              {selected && (
                <Html center position={[0, 0, face.normal.z * 2.5]}>
                  <span className="whitespace-nowrap rounded-full bg-emerald-600 px-2 py-1 text-xs font-semibold text-white shadow-lg">Hole face</span>
                </Html>
              )}
            </mesh>
          );
        })}
      </group>

      <group
        ref={assignShaftRef}
        position={SHAFT_INITIAL_POSITION}
        rotation={SHAFT_INITIAL_ROTATION}
        onClick={(event) => {
          event.stopPropagation();
          if (aligned) onSelectShaft();
        }}
        onPointerOver={() => { if (aligned) document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        {shaftModel && <primitive object={shaftModel} />}
        {shaftModel && !aligned && SHAFT_END_FACES.map((face) => {
          const selected = selectedShaftEnd?.id === face.id;
          return (
            <mesh
              key={face.id}
              position={face.position}
              onClick={(event) => { event.stopPropagation(); onSelectShaftEnd(face); }}
              onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { document.body.style.cursor = 'default'; }}
            >
              <boxGeometry args={[5.1, 5.1, 0.55]} />
              <meshBasicMaterial color={selected ? '#22c55e' : '#f59e0b'} transparent opacity={selected ? 0.92 : 0.68} depthTest={false} />
              {selected && (
                <Html center position={[0, 0, face.normal.z * 2.5]}>
                  <span className="whitespace-nowrap rounded-full bg-emerald-600 px-2 py-1 text-xs font-semibold text-white shadow-lg">Shaft entry end</span>
                </Html>
              )}
            </mesh>
          );
        })}
      </group>

      {aligned && shaftSelected && shaftObject && (
        <TransformControls
          object={shaftObject}
          mode="translate"
          space="local"
          showX={false}
          showY={false}
          showZ
          size={0.9}
          onObjectChange={updateDepth}
        />
      )}

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

export default function ShaftInsertionLab({
  onBack,
  onSwitchToPin,
  onSwitchToBeam,
}: {
  onBack: () => void;
  onSwitchToPin: () => void;
  onSwitchToBeam: () => void;
}) {
  const [selectedHole, setSelectedHole] = useState<ConnectorChoice | null>(null);
  const [selectedShaftEnd, setSelectedShaftEnd] = useState<ConnectorChoice | null>(null);
  const [alignRequest, setAlignRequest] = useState(0);
  const [resetRequest, setResetRequest] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aligned, setAligned] = useState(false);
  const [shaftSelected, setShaftSelected] = useState(false);
  const [depth, setDepth] = useState(0);

  const handleReadyChange = useCallback((nextReady: boolean, error?: string) => {
    setReady(nextReady);
    setLoadError(error ?? null);
  }, []);
  const handleAligned = useCallback(() => {
    setAligned(true);
    setShaftSelected(false);
  }, []);
  const handleDepthChange = useCallback((nextDepth: number) => setDepth(nextDepth), []);

  const reset = () => {
    setSelectedHole(null);
    setSelectedShaftEnd(null);
    setAligned(false);
    setShaftSelected(false);
    setDepth(0);
    setResetRequest((value) => value + 1);
  };

  return (
    <main className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-white text-slate-900">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Back</button>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Assembly experiment</p>
            <h1 className="text-lg font-bold">Shaft Through Hole</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onSwitchToPin} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Pin test</button>
          <button onClick={onSwitchToBeam} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Beam stacking</button>
          <button onClick={reset} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Reset</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="z-10 w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-5 shadow-[8px_0_24px_rgba(15,23,42,0.04)]">
          <h2 className="text-base font-bold">Insert and keep adjusting</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Align the shaft once, then click it whenever you need the movement arrow.</p>

          <ol className="mt-6 space-y-3 text-sm">
            <li className={`rounded-2xl border p-3 ${selectedHole ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="font-bold">1. Select a hole face</span>
              <p className="mt-1 text-slate-500">This decides the insertion side.</p>
            </li>
            <li className={`rounded-2xl border p-3 ${selectedShaftEnd ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="font-bold">2. Select a shaft end</span>
              <p className="mt-1 text-slate-500">This decides which end enters first.</p>
            </li>
            <li className={`rounded-2xl border p-3 ${aligned ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="font-bold">3. Adjust the shaft</span>
              <p className="mt-1 text-slate-500">It starts centered. Click the shaft, then drag its blue arrow if needed.</p>
            </li>
          </ol>

          {!aligned ? (
            <button
              disabled={!ready || !selectedHole || !selectedShaftEnd}
              onClick={() => setAlignRequest((value) => value + 1)}
              className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              Center shaft in hole
            </button>
          ) : (
            <div className="mt-6 rounded-2xl bg-blue-50 p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Offset from center</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{depth.toFixed(1)} mm</p>
              <p className="mt-1 text-xs text-slate-500">No confirmation needed. Click the shaft again at any time.</p>
            </div>
          )}

          <div className="mt-5 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            Click shaft: show arrow<br />Click empty space: hide arrow<br />Blue arrow: push or pull only
          </div>
        </aside>

        <section className="relative min-w-0 flex-1">
          {!ready && !loadError && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 text-sm font-semibold text-slate-500">Loading STEP parts...</div>}
          {loadError && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white p-8 text-center text-sm font-semibold text-red-600">{loadError}</div>}
          <Canvas
            camera={{ position: [90, 76, 118], fov: 38 }}
            shadows
            dpr={[1, 1.6]}
            onPointerMissed={() => setShaftSelected(false)}
          >
            <ShaftScene
              selectedHole={selectedHole}
              selectedShaftEnd={selectedShaftEnd}
              alignRequest={alignRequest}
              resetRequest={resetRequest}
              shaftSelected={shaftSelected}
              onSelectHole={(face) => setSelectedHole(face)}
              onSelectShaftEnd={(face) => setSelectedShaftEnd(face)}
              onSelectShaft={() => setShaftSelected(true)}
              onReadyChange={handleReadyChange}
              onAligned={handleAligned}
              onDepthChange={handleDepthChange}
            />
          </Canvas>
        </section>
      </div>
    </main>
  );
}
