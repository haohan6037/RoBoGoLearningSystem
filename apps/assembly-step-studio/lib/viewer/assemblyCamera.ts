import * as THREE from 'three';

export type AssemblyFocus = {
  target: THREE.Vector3;
  position: THREE.Vector3;
  near: number;
  far: number;
};

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function primaryAssemblyBoxes(boxes: THREE.Box3[]) {
  if (boxes.length < 4) return boxes;
  const centers = boxes.map((box) => box.getCenter(new THREE.Vector3()));
  const medianCenter = new THREE.Vector3(
    median(centers.map((center) => center.x)),
    median(centers.map((center) => center.y)),
    median(centers.map((center) => center.z)),
  );
  const distances = centers.map((center) => center.distanceTo(medianCenter));
  const medianDistance = median(distances);
  const medianDiagonal = median(boxes.map((box) => box.getSize(new THREE.Vector3()).length()));
  const threshold = Math.max(100, medianDistance * 4, medianDiagonal * 12);
  const primary = boxes.filter((_, index) => distances[index] <= threshold);
  return primary.length >= Math.max(3, Math.ceil(boxes.length * 0.7)) ? primary : boxes;
}

export function calculateAssemblyFocus(
  boxes: THREE.Box3[],
  options: {
    cameraPosition: THREE.Vector3;
    currentTarget: THREE.Vector3;
    verticalFovDegrees: number;
    aspect: number;
    padding?: number;
  },
): AssemblyFocus | null {
  const usable = boxes.filter((box) => !box.isEmpty());
  if (usable.length === 0) return null;

  const bounds = primaryAssemblyBoxes(usable)
    .reduce((combined, box) => combined.union(box), new THREE.Box3());
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const direction = options.cameraPosition.clone().sub(options.currentTarget);
  if (direction.lengthSq() < 0.0001) direction.set(1, 0.75, 1);
  direction.normalize();

  const verticalFov = THREE.MathUtils.degToRad(options.verticalFovDegrees);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(options.aspect, 0.01));
  const fitFov = Math.min(verticalFov, horizontalFov);
  const distance = Math.max(1, sphere.radius / Math.sin(fitFov / 2) * (options.padding ?? 1.18));

  return {
    target: sphere.center.clone(),
    position: sphere.center.clone().add(direction.multiplyScalar(distance)),
    near: Math.max(0.01, distance - sphere.radius * 2.5),
    far: Math.max(1, distance + sphere.radius * 2.5),
  };
}
