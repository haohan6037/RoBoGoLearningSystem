import * as THREE from 'three';

const originalMaterials = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();

export function highlightSelectedMeshes(
  root: THREE.Object3D,
  selectedUuids: string[]
) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const isSelected = selectedUuids.includes(obj.uuid);

    if (isSelected) {
      if (!originalMaterials.has(obj)) {
        originalMaterials.set(obj, obj.material);
      }
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(() =>
          new THREE.MeshStandardMaterial({
            color: '#ffaa00',
            emissive: '#ff6600',
            emissiveIntensity: 0.5,
          })
        );
      } else {
        obj.material = new THREE.MeshStandardMaterial({
          color: '#ffaa00',
          emissive: '#ff6600',
          emissiveIntensity: 0.5,
        });
      }
    } else {
      const orig = originalMaterials.get(obj);
      if (orig) {
        obj.material = orig;
        originalMaterials.delete(obj);
      }
    }
  });
}
