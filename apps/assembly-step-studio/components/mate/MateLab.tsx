'use client';

import { Canvas } from '@react-three/fiber';
import { Grid, Html, TrackballControls } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import BeamStackLab from '@/components/mate/BeamStackLab';
import ShaftInsertionLab from '@/components/mate/ShaftInsertionLab';
import { connectorWorldFrame, snapObjectToMate } from '@/lib/mate/mateMath';
import { loadStepModel } from '@/lib/mate/loadStep';
import {
  BEAM_HOLE_FACES,
  PIN_RING_FACES,
  type ConnectorChoice,
} from '@/lib/mate/partConnectors';

const INITIAL_PIN_POSITION = new THREE.Vector3(38, 15, 24);

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function LabScene({
  selectedHoleId,
  selectedPinId,
  connectRequest,
  resetRequest,
  onSelectHole,
  onSelectPin,
  onReadyChange,
  onConnected,
}: {
  selectedHoleId: string | null;
  selectedPinId: string | null;
  connectRequest: number;
  resetRequest: number;
  onSelectHole: (connector: ConnectorChoice) => void;
  onSelectPin: (connector: ConnectorChoice) => void;
  onReadyChange: (ready: boolean, error?: string) => void;
  onConnected: () => void;
}) {
  const beamRef = useRef<THREE.Group>(null);
  const pinRef = useRef<THREE.Group>(null);
  const handledConnectRequest = useRef(0);
  const [beamModel, setBeamModel] = useState<THREE.Group | null>(null);
  const [pinModel, setPinModel] = useState<THREE.Group | null>(null);
  const selectedHole = useMemo(
    () => BEAM_HOLE_FACES.find((connector) => connector.id === selectedHoleId) ?? null,
    [selectedHoleId],
  );
  const selectedPin = useMemo(
    () => PIN_RING_FACES.find((connector) => connector.id === selectedPinId) ?? null,
    [selectedPinId],
  );

  useEffect(() => {
    let cancelled = false;
    let loadedBeam: THREE.Group | null = null;
    let loadedPin: THREE.Group | null = null;

    void Promise.all([
      loadStepModel('/mate-lab/parts/1x4-beam.step', '#356fe3'),
      loadStepModel('/mate-lab/parts/connector-pin.step', '#f47a32'),
    ])
      .then(([beam, pin]) => {
        loadedBeam = beam;
        loadedPin = pin;
        if (cancelled) {
          disposeObject(beam);
          disposeObject(pin);
          return;
        }
        setBeamModel(beam);
        setPinModel(pin);
        onReadyChange(true);
      })
      .catch((error: unknown) => {
        onReadyChange(false, error instanceof Error ? error.message : 'Unable to load parts.');
      });

    return () => {
      cancelled = true;
      if (loadedBeam) disposeObject(loadedBeam);
      if (loadedPin) disposeObject(loadedPin);
    };
  }, [onReadyChange]);

  useEffect(() => {
    if (
      !connectRequest ||
      connectRequest === handledConnectRequest.current ||
      !beamRef.current ||
      !pinRef.current ||
      !selectedHole ||
      !selectedPin
    ) return;
    handledConnectRequest.current = connectRequest;
    const target = connectorWorldFrame(beamRef.current, selectedHole);
    snapObjectToMate(pinRef.current, selectedPin, target);
    onConnected();
  }, [connectRequest, onConnected, selectedHole, selectedPin]);

  useEffect(() => {
    if (!pinRef.current) return;
    pinRef.current.position.copy(INITIAL_PIN_POSITION);
    pinRef.current.quaternion.identity();
    pinRef.current.updateWorldMatrix(true, false);
  }, [resetRequest]);

  return (
    <>
      <color attach="background" args={['#f8fafc']} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[35, 55, 75]} intensity={2.2} castShadow />
      <directionalLight position={[-45, -20, 35]} intensity={0.8} />

      <group ref={beamRef}>
        {beamModel && <primitive object={beamModel} />}
        {beamModel && BEAM_HOLE_FACES.map((connector) => {
          const selected = selectedHoleId === connector.id;
          return (
            <mesh
              key={connector.id}
              position={connector.position}
              onClick={(event) => {
                event.stopPropagation();
                onSelectHole(connector);
              }}
              onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { document.body.style.cursor = 'default'; }}
            >
              <torusGeometry args={[3.2, selected ? 0.65 : 0.42, 14, 40]} />
              <meshBasicMaterial
                color={selected ? '#22c55e' : connector.normal.z > 0 ? '#38bdf8' : '#2563eb'}
                depthTest={false}
              />
              {selected && (
                <Html center position={[0, 0, connector.normal.z * 2.5]}>
                  <span className="whitespace-nowrap rounded-full bg-emerald-600 px-2 py-1 text-xs font-semibold text-white shadow-lg">
                    {connector.label}
                  </span>
                </Html>
              )}
            </mesh>
          );
        })}
      </group>

      <group ref={pinRef} position={INITIAL_PIN_POSITION}>
        {pinModel && <primitive object={pinModel} />}
        {pinModel && PIN_RING_FACES.map((connector) => {
          const selected = selectedPinId === connector.id;
          return (
            <mesh
              key={connector.id}
              position={connector.position}
              onClick={(event) => {
                event.stopPropagation();
                onSelectPin(connector);
              }}
              onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { document.body.style.cursor = 'default'; }}
            >
              <torusGeometry args={[3.55, selected ? 0.65 : 0.48, 14, 40]} />
              <meshBasicMaterial
                color={selected ? '#22c55e' : connector.normal.z > 0 ? '#fb923c' : '#ea580c'}
                depthTest={false}
              />
              {selected && (
                <Html center position={[0, 0, connector.normal.z * 3]}>
                  <span className="whitespace-nowrap rounded-full bg-emerald-600 px-2 py-1 text-xs font-semibold text-white shadow-lg">
                    {connector.label}
                  </span>
                </Html>
              )}
            </mesh>
          );
        })}
      </group>

      <Grid
        position={[0, 0, -13]}
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

function PinMateLab({
  onBack,
  onSwitchToBeam,
  onSwitchToShaft,
}: {
  onBack: () => void;
  onSwitchToBeam: () => void;
  onSwitchToShaft: () => void;
}) {
  const [selectedHole, setSelectedHole] = useState<ConnectorChoice | null>(null);
  const [selectedPin, setSelectedPin] = useState<ConnectorChoice | null>(null);
  const [connectRequest, setConnectRequest] = useState(0);
  const [resetRequest, setResetRequest] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const handleReadyChange = useCallback((nextReady: boolean, error?: string) => {
    setReady(nextReady);
    setLoadError(error ?? null);
  }, []);
  const handleConnected = useCallback(
    () => setConnected(true),
    [],
  );

  const reset = () => {
    setSelectedHole(null);
    setSelectedPin(null);
    setConnected(false);
    setResetRequest((value) => value + 1);
  };

  return (
    <main className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-white text-slate-900">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            Back
          </button>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Assembly experiment</p>
            <h1 className="text-lg font-bold">Hole-to-pin Mate Lab</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onSwitchToBeam} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Beam stacking</button>
          <button onClick={onSwitchToShaft} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Shaft test</button>
          <button onClick={reset} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Reset</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="z-10 w-72 shrink-0 border-r border-slate-200 bg-white p-5 shadow-[8px_0_24px_rgba(15,23,42,0.04)]">
          <h2 className="text-base font-bold">Connect two ring faces</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">This first experiment uses two real parts from your VEX STEP library.</p>

          <ol className="mt-6 space-y-3 text-sm">
            <li className={`rounded-2xl border p-3 ${selectedHole ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="font-bold">1. Select a hole face</span>
              <p className="mt-1 text-slate-500">Choose the blue ring on the side you want to use.</p>
            </li>
            <li className={`rounded-2xl border p-3 ${selectedPin ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="font-bold">2. Select a stop-ring face</span>
              <p className="mt-1 text-slate-500">Choose either side of the orange stop ring.</p>
            </li>
            <li className={`rounded-2xl border p-3 ${connected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="font-bold">3. Connect</span>
              <p className="mt-1 text-slate-500">The selected faces meet and their center axes align.</p>
            </li>
          </ol>

          <button
            disabled={!ready || !selectedHole || !selectedPin}
            onClick={() => setConnectRequest((value) => value + 1)}
            className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            Connect selected points
          </button>

          <div className="mt-5 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            Left drag: rotate<br />Right drag: move view<br />Scroll: zoom
          </div>
        </aside>

        <section className="relative min-w-0 flex-1">
          {!ready && !loadError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 text-sm font-semibold text-slate-500">Loading STEP parts...</div>
          )}
          {loadError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white p-8 text-center text-sm font-semibold text-red-600">{loadError}</div>
          )}
          <Canvas camera={{ position: [78, 70, 105], fov: 38 }} shadows dpr={[1, 1.6]}>
            <LabScene
              selectedHoleId={selectedHole?.id ?? null}
              selectedPinId={selectedPin?.id ?? null}
              connectRequest={connectRequest}
              resetRequest={resetRequest}
              onSelectHole={(connector) => { setSelectedHole(connector); setConnected(false); }}
              onSelectPin={(connector) => { setSelectedPin(connector); setConnected(false); }}
              onReadyChange={handleReadyChange}
              onConnected={handleConnected}
            />
          </Canvas>
        </section>
      </div>
    </main>
  );
}

export default function MateLab({ onBack }: { onBack: () => void }) {
  const [experiment, setExperiment] = useState<'pin' | 'beam' | 'shaft'>('pin');
  if (experiment === 'beam') {
    return (
      <BeamStackLab
        onBack={onBack}
        onSwitchToPin={() => setExperiment('pin')}
        onSwitchToShaft={() => setExperiment('shaft')}
      />
    );
  }
  if (experiment === 'shaft') {
    return (
      <ShaftInsertionLab
        onBack={onBack}
        onSwitchToPin={() => setExperiment('pin')}
        onSwitchToBeam={() => setExperiment('beam')}
      />
    );
  }
  return (
    <PinMateLab
      onBack={onBack}
      onSwitchToBeam={() => setExperiment('beam')}
      onSwitchToShaft={() => setExperiment('shaft')}
    />
  );
}
