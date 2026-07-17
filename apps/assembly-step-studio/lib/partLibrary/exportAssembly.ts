import * as THREE from 'three';

function safeFileName(value: string): string {
  return value.trim().replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'RoBoGo_Assembly';
}

export async function downloadAssemblyGlb(root: THREE.Object3D, assemblyName: string): Promise<void> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  root.updateWorldMatrix(true, true);
  const result = await new GLTFExporter().parseAsync(root, {
    binary: true,
    onlyVisible: true,
    trs: true,
  });
  if (!(result instanceof ArrayBuffer)) {
    throw new Error('The assembly exporter did not create a binary GLB file.');
  }

  const blob = new Blob([result], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileName(assemblyName)}.glb`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
