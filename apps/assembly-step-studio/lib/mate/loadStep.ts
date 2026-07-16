import * as THREE from 'three';

let occtPromise: ReturnType<(typeof import('occt-import-js'))['default']> | null = null;

async function getOcct() {
  if (!occtPromise) {
    const { default: createOcct } = await import('occt-import-js');
    occtPromise = createOcct({
      locateFile: (fileName) =>
        fileName.endsWith('.wasm') ? '/mate-lab/occt-import-js.wasm' : fileName,
    });
  }
  return occtPromise;
}

export async function loadStepModel(url: string, color: THREE.ColorRepresentation) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load STEP file: ${response.status}`);

  const occt = await getOcct();
  const result = occt.ReadStepFile(new Uint8Array(await response.arrayBuffer()), null);
  if (!result.success || result.meshes.length === 0) {
    throw new Error('The STEP file did not contain a usable mesh.');
  }

  const group = new THREE.Group();
  for (const sourceMesh of result.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(sourceMesh.attributes.position.array, 3),
    );
    if (sourceMesh.attributes.normal) {
      geometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(sourceMesh.attributes.normal.array, 3),
      );
    } else {
      geometry.computeVertexNormals();
    }
    geometry.setIndex(sourceMesh.index.array);
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, roughness: 0.54, metalness: 0.05 }),
    );
    mesh.name = sourceMesh.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}
