'use client';

import { Canvas } from '@react-three/fiber';
import { Grid, Html, TrackballControls, TransformControls } from '@react-three/drei';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadStepModel } from '@/lib/mate/loadStep';
import type { PartLibraryItem } from '@/types/partLibrary';

export type LibraryPartInstance = {
  instanceId: string;
  part: PartLibraryItem;
  color: THREE.ColorRepresentation;
};

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function PartInstance({
  instance,
  index,
  selected,
  mode,
  onSelect,
}: {
  instance: LibraryPartInstance;
  index: number;
  selected: boolean;
  mode: 'translate' | 'rotate';
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [groupObject, setGroupObject] = useState<THREE.Group | null>(null);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const column = index % 4;
  const row = Math.floor(index / 4);
  const assignGroupRef = useCallback((object: THREE.Group | null) => {
    groupRef.current = object;
    setGroupObject(object);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loaded: THREE.Group | null = null;
    void loadStepModel(`/api/part-library/step/${encodeURIComponent(instance.part.id)}`, instance.color)
      .then((nextModel) => {
        loaded = nextModel;
        if (cancelled) {
          disposeObject(nextModel);
          return;
        }
        const bounds = new THREE.Box3().setFromObject(nextModel);
        const center = bounds.getCenter(new THREE.Vector3());
        nextModel.position.sub(center);
        setModel(nextModel);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : 'Unable to load part.');
      });

    return () => {
      cancelled = true;
      if (loaded) disposeObject(loaded);
    };
  }, [instance.color, instance.part.id]);

  return (
    <>
      <group
        ref={assignGroupRef}
        position={[(column - 1.5) * 38, (row - 0.5) * 34, 0]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
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
        {selected && model && (
          <Html center position={[0, 0, 18]}>
            <span className="whitespace-nowrap rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-lg">{instance.part.name}</span>
          </Html>
        )}
      </group>

      {selected && model && groupObject && (
        <TransformControls
          object={groupObject}
          mode={mode}
          space={mode === 'rotate' ? 'local' : 'world'}
          size={0.85}
        />
      )}
    </>
  );
}

export default function LibraryAssemblyCanvas({
  instances,
  selectedInstanceId,
  mode,
  onSelect,
}: {
  instances: LibraryPartInstance[];
  selectedInstanceId: string | null;
  mode: 'translate' | 'rotate';
  onSelect: (instanceId: string | null) => void;
}) {
  return (
    <Canvas
      camera={{ position: [115, 95, 145], fov: 40 }}
      dpr={[1, 1.6]}
      shadows
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#f8fafc']} />
      <ambientLight intensity={1.45} />
      <directionalLight position={[45, 65, 90]} intensity={2.2} castShadow />
      <directionalLight position={[-55, -25, 35]} intensity={0.8} />
      {instances.map((instance, index) => (
        <PartInstance
          key={instance.instanceId}
          instance={instance}
          index={index}
          selected={selectedInstanceId === instance.instanceId}
          mode={mode}
          onSelect={() => onSelect(instance.instanceId)}
        />
      ))}
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
      <TrackballControls makeDefault rotateSpeed={3.2} panSpeed={0.9} zoomSpeed={1.15} />
    </Canvas>
  );
}
