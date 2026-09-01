import * as THREE from 'three';

export type ConnectorKind = 'hole' | 'square-hole' | 'pin-ring' | 'shaft-end';
export type ConnectorAxis = 'x' | 'y' | 'z';

export type LibraryConnector = {
  id: string;
  label: string;
  kind: ConnectorKind;
  position: [number, number, number];
  centerPosition?: [number, number, number];
  markerPosition: [number, number, number];
  normal: [number, number, number];
  radius: number;
  axis: ConnectorAxis;
};

type ConnectorPart = {
  name: string;
  category: string;
};

const AXES: ConnectorAxis[] = ['x', 'y', 'z'];
const PITCH = 12.7;
const HOLE_EDGE_MIN_RADIUS = 1.7;
const HOLE_EDGE_MAX_RADIUS = 2.5;
const HOLE_ANGLE_BIN_COUNT = 12;
const MIN_HOLE_ANGLE_BINS = 8;
const MIN_CIRCULAR_HOLE_ANGLE_BINS = 10;
const LEG_SHOULDER_MIN_RADIUS = 2.75;
const LEG_SHOULDER_MAX_RADIUS = 3.55;
const LEG_SCAN_DISTANCE = 8;

function clean(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function tuple(vector: THREE.Vector3): [number, number, number] {
  return [clean(vector.x), clean(vector.y), clean(vector.z)];
}

function axisValue(vector: THREE.Vector3, axis: ConnectorAxis): number {
  return vector[axis];
}

function setAxis(vector: THREE.Vector3, axis: ConnectorAxis, value: number): void {
  vector[axis] = value;
}

function axisNormal(axis: ConnectorAxis, direction: -1 | 1): THREE.Vector3 {
  const normal = new THREE.Vector3();
  setAxis(normal, axis, direction);
  return normal;
}

function rankedAxes(bounds: THREE.Box3): ConnectorAxis[] {
  const size = bounds.getSize(new THREE.Vector3());
  return [...AXES].sort((left, right) => axisValue(size, right) - axisValue(size, left));
}

function circularHoleFaceCoordinates(
  vertices: THREE.Vector3[],
  center: THREE.Vector3,
  firstRadialAxis: ConnectorAxis,
  secondRadialAxis: ConnectorAxis,
  thicknessAxis: ConnectorAxis,
): { negative: number; positive: number } | null {
  const planes = new Map<number, Map<number, Set<number>>>();

  for (const point of vertices) {
    const firstOffset = axisValue(point, firstRadialAxis) - axisValue(center, firstRadialAxis);
    const secondOffset = axisValue(point, secondRadialAxis) - axisValue(center, secondRadialAxis);
    const radius = Math.hypot(firstOffset, secondOffset);
    if (radius < HOLE_EDGE_MIN_RADIUS || radius > HOLE_EDGE_MAX_RADIUS) continue;

    const normalizedAngle = (Math.atan2(secondOffset, firstOffset) + Math.PI) / (Math.PI * 2);
    const angleBin = Math.min(
      HOLE_ANGLE_BIN_COUNT - 1,
      Math.floor(normalizedAngle * HOLE_ANGLE_BIN_COUNT),
    );
    const coordinate = clean(axisValue(point, thicknessAxis));
    const radiusBins = planes.get(coordinate) ?? new Map<number, Set<number>>();
    const radiusBin = Math.round(radius * 10) / 10;
    const angleBins = radiusBins.get(radiusBin) ?? new Set<number>();
    angleBins.add(angleBin);
    radiusBins.set(radiusBin, angleBins);
    planes.set(coordinate, radiusBins);
  }

  const circularPlanes = [...planes.entries()]
    .filter(([, radiusBins]) => [...radiusBins.values()].some(
      (angleBins) => angleBins.size >= MIN_CIRCULAR_HOLE_ANGLE_BINS,
    ))
    .map(([coordinate]) => coordinate)
    .sort((left, right) => left - right);
  if (circularPlanes.length < 2) return null;

  return {
    negative: circularPlanes[0],
    positive: circularPlanes[circularPlanes.length - 1],
  };
}

function squareHoleFaceCoordinates(
  vertices: THREE.Vector3[],
  center: THREE.Vector3,
  firstRadialAxis: ConnectorAxis,
  secondRadialAxis: ConnectorAxis,
  thicknessAxis: ConnectorAxis,
): { negative: number; positive: number } | null {
  const planes = new Map<number, Set<string>>();
  for (const point of vertices) {
    const firstOffset = axisValue(point, firstRadialAxis) - axisValue(center, firstRadialAxis);
    const secondOffset = axisValue(point, secondRadialAxis) - axisValue(center, secondRadialAxis);
    const edgeDistance = Math.max(Math.abs(firstOffset), Math.abs(secondOffset));
    if (edgeDistance < 1.3 || edgeDistance > 2.7) continue;

    const sides = planes.get(clean(axisValue(point, thicknessAxis))) ?? new Set<string>();
    if (Math.abs(firstOffset) >= Math.abs(secondOffset) - 0.15) {
      sides.add(firstOffset < 0 ? 'first-negative' : 'first-positive');
    }
    if (Math.abs(secondOffset) >= Math.abs(firstOffset) - 0.15) {
      sides.add(secondOffset < 0 ? 'second-negative' : 'second-positive');
    }
    planes.set(clean(axisValue(point, thicknessAxis)), sides);
  }

  const squarePlanes = [...planes.entries()]
    .filter(([, sides]) => sides.size === 4)
    .map(([coordinate]) => coordinate)
    .sort((left, right) => left - right);
  if (squarePlanes.length < 2) return null;
  return { negative: squarePlanes[0], positive: squarePlanes[squarePlanes.length - 1] };
}

function buildHoleConnectors(
  part: ConnectorPart,
  model: THREE.Object3D,
  bounds: THREE.Box3,
): LibraryConnector[] {
  const dimensionMatch = part.name.match(/^(\d+)x(\d+)/i);
  if (!dimensionMatch) return [];

  const rows = Number(dimensionMatch[1]);
  const columns = Number(dimensionMatch[2]);
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 || rows > 24 || columns > 24) {
    return [];
  }

  const [columnAxis, rowAxis, thicknessAxis] = rankedAxes(bounds);
  const center = bounds.getCenter(new THREE.Vector3());
  const vertices = collectLocalVertices(model);
  const connectors: LibraryConnector[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const holeCenter = center.clone();
      setAxis(holeCenter, columnAxis, axisValue(center, columnAxis) + (column - (columns - 1) / 2) * PITCH);
      setAxis(holeCenter, rowAxis, axisValue(center, rowAxis) + (row - (rows - 1) / 2) * PITCH);
      const circularFaces = circularHoleFaceCoordinates(
        vertices,
        holeCenter,
        columnAxis,
        rowAxis,
        thicknessAxis,
      );
      const squareFaces = circularFaces ? null : squareHoleFaceCoordinates(
        vertices,
        holeCenter,
        columnAxis,
        rowAxis,
        thicknessAxis,
      );
      const holeFaces = circularFaces ?? squareFaces;
      if (!holeFaces) continue;

      for (const direction of [-1, 1] as const) {
        const facePosition = holeCenter.clone();
        setAxis(facePosition, thicknessAxis, direction < 0 ? holeFaces.negative : holeFaces.positive);
        const side = direction < 0 ? 'bottom' : 'top';
        connectors.push({
          id: `hole-${row + 1}-${column + 1}-${side}`,
          label: `Hole ${row + 1}.${column + 1} · ${side} face`,
          kind: squareFaces ? 'square-hole' : 'hole',
          position: tuple(facePosition),
          centerPosition: tuple(holeCenter),
          markerPosition: tuple(facePosition),
          normal: tuple(axisNormal(thicknessAxis, direction)),
          radius: 3.2,
          axis: thicknessAxis,
        });
      }
    }
  }

  return connectors;
}

function buildCentralSquareHoleConnectors(
  model: THREE.Object3D,
  bounds: THREE.Box3,
): LibraryConnector[] {
  const thicknessAxis = rankedAxes(bounds).at(-1);
  if (!thicknessAxis) return [];
  const radialAxes = AXES.filter((candidate) => candidate !== thicknessAxis);
  const center = bounds.getCenter(new THREE.Vector3());
  const vertices = collectLocalVertices(model);
  const squareFaces = squareHoleFaceCoordinates(
    vertices,
    center,
    radialAxes[0],
    radialAxes[1],
    thicknessAxis,
  );
  if (!squareFaces) return [];

  return ([-1, 1] as const).map((direction) => {
    const facePosition = center.clone();
    setAxis(facePosition, thicknessAxis, direction < 0 ? squareFaces.negative : squareFaces.positive);
    const side = direction < 0 ? 'bottom' : 'top';
    return {
      id: `central-square-hole-${side}`,
      label: `Square hole · ${side} face`,
      kind: 'square-hole',
      position: tuple(facePosition),
      centerPosition: tuple(center),
      markerPosition: tuple(facePosition),
      normal: tuple(axisNormal(thicknessAxis, direction)),
      radius: 3.2,
      axis: thicknessAxis,
    };
  });
}

function collectLocalVertices(model: THREE.Object3D): THREE.Vector3[] {
  model.updateMatrixWorld(true);
  const inverseRoot = model.matrixWorld.clone().invert();
  const points: THREE.Vector3[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    if (!positions) return;
    const toRoot = inverseRoot.clone().multiply(object.matrixWorld);
    for (let index = 0; index < positions.count; index += 1) {
      points.push(
        new THREE.Vector3(positions.getX(index), positions.getY(index), positions.getZ(index))
          .applyMatrix4(toRoot),
      );
    }
  });
  return points;
}

function buildPinConnectors(
  part: ConnectorPart,
  model: THREE.Object3D,
  bounds: THREE.Box3,
): LibraryConnector[] {
  const axis = rankedAxes(bounds)[0];
  const radialAxes = AXES.filter((candidate) => candidate !== axis);
  const center = bounds.getCenter(new THREE.Vector3());
  const planes = new Map<number, { count: number; maxRadius: number }>();

  collectLocalVertices(model).forEach((point) => {
    const coordinate = Math.round(axisValue(point, axis) * 100) / 100;
    const radialFirst = axisValue(point, radialAxes[0]) - axisValue(center, radialAxes[0]);
    const radialSecond = axisValue(point, radialAxes[1]) - axisValue(center, radialAxes[1]);
    const radius = Math.hypot(radialFirst, radialSecond);
    const plane = planes.get(coordinate) ?? { count: 0, maxRadius: 0 };
    plane.count += 1;
    plane.maxRadius = Math.max(plane.maxRadius, radius);
    planes.set(coordinate, plane);
  });

  const widestRadius = Math.max(0, ...[...planes.values()].map((plane) => plane.maxRadius));
  const widePlanes = [...planes.entries()].filter(([, plane]) => plane.maxRadius >= widestRadius * 0.92);
  const largestPlane = Math.max(0, ...widePlanes.map(([, plane]) => plane.count));
  let candidates = widePlanes
    .filter(([, plane]) => plane.count >= Math.max(12, largestPlane * 0.6))
    .map(([coordinate, plane]) => ({ coordinate, ...plane }))
    .sort((left, right) => left.coordinate - right.coordinate);

  const clustered: typeof candidates = [];
  candidates.forEach((candidate) => {
    const previous = clustered.at(-1);
    if (previous && Math.abs(previous.coordinate - candidate.coordinate) < 0.08) {
      if (candidate.count > previous.count) clustered[clustered.length - 1] = candidate;
      return;
    }
    clustered.push(candidate);
  });
  candidates = clustered.length > 6
    ? [...clustered].sort((left, right) => right.count - left.count).slice(0, 6).sort((left, right) => left.coordinate - right.coordinate)
    : clustered;

  const directionalPinMatch = part.name.match(/^0x([23]) Connector Pin$/i);
  if (directionalPinMatch && candidates.length > 0) {
    const layerCount = Number(directionalPinMatch[1]);
    const minimum = axisValue(bounds.min, axis);
    const maximum = axisValue(bounds.max, axis);
    const candidateMiddle = candidates.reduce(
      (sum, candidate) => sum + candidate.coordinate,
      0,
    ) / candidates.length;
    const headAtMinimum = Math.abs(candidateMiddle - minimum) <= Math.abs(maximum - candidateMiddle);
    const headInnerFace = headAtMinimum
      ? candidates[candidates.length - 1]
      : candidates[0];
    const direction: -1 | 1 = headAtMinimum ? 1 : -1;

    return Array.from({ length: layerCount }, (_, index) => {
      const position = center.clone();
      setAxis(position, axis, headInnerFace.coordinate + direction * index * (PITCH / 2));
      return {
        id: `pin-ring-${index + 1}`,
        label: `Beam layer seat ${index + 1}`,
        kind: 'pin-ring',
        position: tuple(position),
        markerPosition: tuple(position),
        normal: tuple(axisNormal(axis, direction)),
        radius: clean(headInnerFace.maxRadius * 1.05),
        axis,
      };
    });
  }

  const middle = candidates.reduce((sum, candidate) => sum + candidate.coordinate, 0) / (candidates.length || 1);
  return candidates.map((candidate, index) => {
    const position = center.clone();
    setAxis(position, axis, candidate.coordinate);
    const direction: -1 | 1 = candidate.coordinate <= middle ? -1 : 1;
    return {
      id: `pin-ring-${index + 1}`,
      label: `Stop ring face ${index + 1}`,
      kind: 'pin-ring',
      position: tuple(position),
      markerPosition: tuple(position),
      normal: tuple(axisNormal(axis, direction)),
      radius: clean(candidate.maxRadius * 1.05),
      axis,
    };
  });
}

function buildShaftConnectors(bounds: THREE.Box3): LibraryConnector[] {
  const axis = rankedAxes(bounds)[0];
  const center = bounds.getCenter(new THREE.Vector3());
  return ([-1, 1] as const).map((direction, index) => {
    const markerPosition = center.clone();
    setAxis(
      markerPosition,
      axis,
      direction < 0 ? axisValue(bounds.min, axis) : axisValue(bounds.max, axis),
    );
    return {
      id: `shaft-end-${index + 1}`,
      label: `Shaft end ${index + 1}`,
      kind: 'shaft-end',
      position: tuple(center),
      markerPosition: tuple(markerPosition),
      normal: tuple(axisNormal(axis, direction)),
      radius: 3,
      axis,
    };
  });
}

type BrepFaceRange = { first: number; last: number };

function canonicalDirection(vector: THREE.Vector3): THREE.Vector3 {
  const axis = dominantAxis(vector);
  return axisValue(vector, axis) < 0 ? vector.negate() : vector;
}

function fitCircle(firstValues: number[], secondValues: number[]) {
  const normalMatrix = new THREE.Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
  const rightHandSide = new THREE.Vector3();
  const elements = normalMatrix.elements;
  for (let index = 0; index < firstValues.length; index += 1) {
    const first = firstValues[index];
    const second = secondValues[index];
    const row = [2 * first, 2 * second, 1];
    const squaredRadius = first * first + second * second;
    for (let column = 0; column < 3; column += 1) {
      rightHandSide.setComponent(
        column,
        rightHandSide.getComponent(column) + row[column] * squaredRadius,
      );
      for (let inner = 0; inner < 3; inner += 1) {
        elements[column + inner * 3] += row[column] * row[inner];
      }
    }
  }
  if (Math.abs(normalMatrix.determinant()) < 1e-8) return null;
  const solution = rightHandSide.applyMatrix3(normalMatrix.invert());
  const radiusSquared = solution.z + solution.x * solution.x + solution.y * solution.y;
  if (radiusSquared <= 0) return null;
  return { firstCenter: solution.x, secondCenter: solution.y, radius: Math.sqrt(radiusSquared) };
}

export function buildManualHoleConnectors(
  mesh: THREE.Mesh,
  faceIndex: number,
  root: THREE.Object3D,
  connectorNumber: number,
): LibraryConnector[] {
  const positions = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index;
  const faces = mesh.geometry.userData.brepFaces as BrepFaceRange[] | undefined;
  const face = faces?.find((candidate) => faceIndex >= candidate.first && faceIndex <= candidate.last);
  if (!positions || !index || !face) return [];

  root.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const points: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];

  for (let triangleIndex = face.first; triangleIndex <= face.last; triangleIndex += 1) {
    const triangle = [0, 1, 2].map((corner) => {
      const vertexIndex = index.getX(triangleIndex * 3 + corner);
      return new THREE.Vector3(
        positions.getX(vertexIndex),
        positions.getY(vertexIndex),
        positions.getZ(vertexIndex),
      ).applyMatrix4(toRoot);
    });
    points.push(...triangle);
    const normal = triangle[1].clone().sub(triangle[0])
      .cross(triangle[2].clone().sub(triangle[0]));
    if (normal.lengthSq() > 1e-8) normals.push(normal.normalize());
  }
  if (points.length < 12 || normals.length < 4) return [];

  let axis = new THREE.Vector3();
  let strongestCross = 0;
  for (let first = 0; first < normals.length; first += 1) {
    for (let second = first + 1; second < normals.length; second += 1) {
      const candidate = normals[first].clone().cross(normals[second]);
      if (candidate.lengthSq() <= strongestCross) continue;
      strongestCross = candidate.lengthSq();
      axis = candidate;
    }
  }
  if (strongestCross < 0.25) return [];
  axis = canonicalDirection(axis.normalize());

  const reference = Math.abs(axis.z) < 0.9
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0);
  const firstRadial = reference.clone().cross(axis).normalize();
  const secondRadial = axis.clone().cross(firstRadial).normalize();
  const axialValues = points.map((point) => point.dot(axis));
  const firstValues = points.map((point) => point.dot(firstRadial));
  const secondValues = points.map((point) => point.dot(secondRadial));
  const axialMin = Math.min(...axialValues);
  const axialMax = Math.max(...axialValues);
  const depth = axialMax - axialMin;
  if (depth < 0.4) return [];

  const fittedCircle = fitCircle(firstValues, secondValues);
  if (!fittedCircle) return [];
  const { firstCenter, secondCenter, radius } = fittedCircle;
  const axialCenter = (axialMin + axialMax) / 2;
  const radii = points.map((point) => Math.hypot(
    point.dot(firstRadial) - firstCenter,
    point.dot(secondRadial) - secondCenter,
  ));
  if (radius < 1 || radius > 12 || Math.max(...radii) - Math.min(...radii) > Math.max(0.4, radius * 0.14)) {
    return [];
  }

  const center = firstRadial.clone().multiplyScalar(firstCenter)
    .addScaledVector(secondRadial, secondCenter)
    .addScaledVector(axis, axialCenter);
  const connectorAxis = dominantAxis(axis);
  return ([-1, 1] as const).map((direction) => {
    const side = direction < 0 ? 'a' : 'b';
    const position = center.clone().addScaledVector(axis, direction * depth / 2);
    const normal = axis.clone().multiplyScalar(direction);
    return {
      id: `manual-hole-${connectorNumber}-${side}`,
      label: `Marked hole ${connectorNumber} · side ${side.toUpperCase()}`,
      kind: 'hole',
      position: tuple(position),
      centerPosition: tuple(center),
      markerPosition: tuple(position),
      normal: tuple(normal),
      radius: clean(radius * 1.5),
      axis: connectorAxis,
    };
  });
}

export function buildManualSquareHoleConnectors(
  mesh: THREE.Mesh,
  faceIndex: number,
  root: THREE.Object3D,
  connectorNumber: number,
): LibraryConnector[] {
  const positions = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index;
  const faces = mesh.geometry.userData.brepFaces as BrepFaceRange[] | undefined;
  const face = faces?.find((candidate) => faceIndex >= candidate.first && faceIndex <= candidate.last);
  if (!positions || !index || !face) return [];

  root.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const facePoints: THREE.Vector3[] = [];
  for (let triangleIndex = face.first; triangleIndex <= face.last; triangleIndex += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = index.getX(triangleIndex * 3 + corner);
      facePoints.push(new THREE.Vector3(
        positions.getX(vertexIndex),
        positions.getY(vertexIndex),
        positions.getZ(vertexIndex),
      ).applyMatrix4(toRoot));
    }
  }
  if (facePoints.length < 6) return [];

  const allVertices = collectLocalVertices(root);
  const rootBounds = new THREE.Box3().setFromPoints(allVertices);
  const holeAxis = rankedAxes(rootBounds).at(-1);
  if (!holeAxis) return [];
  const radialAxes = AXES.filter((candidate) => candidate !== holeAxis);
  const faceBounds = new THREE.Box3().setFromPoints(facePoints);
  const faceSize = faceBounds.getSize(new THREE.Vector3());
  const wallNormalAxis = radialAxes.sort(
    (left, right) => axisValue(faceSize, left) - axisValue(faceSize, right),
  )[0];
  const sideAxis = radialAxes.find((candidate) => candidate !== wallNormalAxis);
  if (!sideAxis) return [];

  const sideWidth = axisValue(faceSize, sideAxis);
  const depth = axisValue(faceSize, holeAxis);
  if (sideWidth < 2.6 || sideWidth > 5.4 || depth < 0.4) return [];

  const faceCenter = faceBounds.getCenter(new THREE.Vector3());
  for (const direction of [-1, 1] as const) {
    const center = faceCenter.clone();
    setAxis(
      center,
      wallNormalAxis,
      axisValue(faceCenter, wallNormalAxis) + direction * sideWidth / 2,
    );
    const squareFaces = squareHoleFaceCoordinates(
      allVertices,
      center,
      wallNormalAxis,
      sideAxis,
      holeAxis,
    );
    if (!squareFaces) continue;

    return ([-1, 1] as const).map((faceDirection) => {
      const side = faceDirection < 0 ? 'a' : 'b';
      const position = center.clone();
      setAxis(position, holeAxis, faceDirection < 0 ? squareFaces.negative : squareFaces.positive);
      return {
        id: `manual-square-hole-${connectorNumber}-${side}`,
        label: `Marked square hole ${connectorNumber} · side ${side.toUpperCase()}`,
        kind: 'square-hole',
        position: tuple(position),
        centerPosition: tuple(center),
        markerPosition: tuple(position),
        normal: tuple(axisNormal(holeAxis, faceDirection)),
        radius: clean(Math.max(2.6, sideWidth * 0.75)),
        axis: holeAxis,
      };
    });
  }

  return [];
}

function dominantAxis(normal: THREE.Vector3): ConnectorAxis {
  return [...AXES].sort(
    (left, right) => Math.abs(axisValue(normal, right)) - Math.abs(axisValue(normal, left)),
  )[0];
}

function firstFaceNormal(triangles: THREE.Vector3[][]): THREE.Vector3 | null {
  for (const triangle of triangles) {
    const normal = triangle[1].clone().sub(triangle[0])
      .cross(triangle[2].clone().sub(triangle[0]));
    if (normal.lengthSq() > 1e-8) return normal.normalize();
  }
  return null;
}

function buildEmbeddedLegConnectors(model: THREE.Object3D): LibraryConnector[] {
  model.updateMatrixWorld(true);
  const inverseRoot = model.matrixWorld.clone().invert();
  const rootWorldQuaternion = new THREE.Quaternion();
  model.getWorldQuaternion(rootWorldQuaternion);
  const candidates: Array<{ position: THREE.Vector3; normal: THREE.Vector3; radius: number }> = [];

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    const index = object.geometry.index;
    const faces = object.geometry.userData.brepFaces as BrepFaceRange[] | undefined;
    if (!positions || !index || !faces?.length) return;

    const toRoot = inverseRoot.clone().multiply(object.matrixWorld);
    for (const face of faces) {
      const vertexIndices = new Set<number>();
      const triangles: THREE.Vector3[][] = [];
      for (let triangleIndex = face.first; triangleIndex <= face.last; triangleIndex += 1) {
        const triangle: THREE.Vector3[] = [];
        for (let corner = 0; corner < 3; corner += 1) {
          const vertexIndex = index.getX(triangleIndex * 3 + corner);
          vertexIndices.add(vertexIndex);
          triangle.push(new THREE.Vector3(
            positions.getX(vertexIndex),
            positions.getY(vertexIndex),
            positions.getZ(vertexIndex),
          ).applyMatrix4(toRoot));
        }
        triangles.push(triangle);
      }
      const normal = firstFaceNormal(triangles);
      if (!normal) continue;
      const points = [...vertexIndices].map((vertexIndex) => new THREE.Vector3(
        positions.getX(vertexIndex),
        positions.getY(vertexIndex),
        positions.getZ(vertexIndex),
      ).applyMatrix4(toRoot));
      const anchor = points[0];
      if (points.some((point) => Math.abs(point.clone().sub(anchor).dot(normal)) > 0.04)) continue;

      const reference = Math.abs(normal.z) < 0.9
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(0, 1, 0);
      const firstRadial = reference.cross(normal).normalize();
      const secondRadial = normal.clone().cross(firstRadial).normalize();
      const projected = points.map((point) => {
        const offset = point.clone().sub(anchor);
        return [offset.dot(firstRadial), offset.dot(secondRadial)] as const;
      });
      const firstValues = projected.map(([first]) => first);
      const secondValues = projected.map(([, second]) => second);
      const firstMin = Math.min(...firstValues);
      const firstMax = Math.max(...firstValues);
      const secondMin = Math.min(...secondValues);
      const secondMax = Math.max(...secondValues);
      const firstWidth = firstMax - firstMin;
      const secondWidth = secondMax - secondMin;
      if (Math.abs(firstWidth - secondWidth) > 0.35) continue;
      const radius = (firstWidth + secondWidth) / 4;
      if (radius < LEG_SHOULDER_MIN_RADIUS || radius > LEG_SHOULDER_MAX_RADIUS) continue;

      const firstCenter = (firstMin + firstMax) / 2;
      const secondCenter = (secondMin + secondMax) / 2;
      const angleBins = new Set<number>();
      projected.forEach(([first, second]) => {
        const firstOffset = first - firstCenter;
        const secondOffset = second - secondCenter;
        if (Math.hypot(firstOffset, secondOffset) < radius * 0.8) return;
        const angle = (Math.atan2(secondOffset, firstOffset) + Math.PI) / (Math.PI * 2);
        angleBins.add(Math.min(HOLE_ANGLE_BIN_COUNT - 1, Math.floor(angle * HOLE_ANGLE_BIN_COUNT)));
      });
      if (angleBins.size < MIN_HOLE_ANGLE_BINS) continue;

      const position = anchor.clone()
        .addScaledVector(firstRadial, firstCenter)
        .addScaledVector(secondRadial, secondCenter);
      const worldPosition = position.clone().applyMatrix4(model.matrixWorld);
      const worldNormal = normal.clone().applyQuaternion(rootWorldQuaternion).normalize();
      const raycaster = new THREE.Raycaster(
        worldPosition.clone().addScaledVector(worldNormal, LEG_SCAN_DISTANCE),
        worldNormal.clone().negate(),
        0.2,
        LEG_SCAN_DISTANCE - 0.35,
      );
      if (raycaster.intersectObject(model, true).length === 0) continue;

      const duplicate = candidates.some((candidate) => (
        candidate.position.distanceTo(position) < 0.35
        && candidate.normal.dot(normal) > 0.95
      ));
      if (!duplicate) candidates.push({ position, normal, radius });
    }
  });

  return candidates.map((candidate, index) => ({
    id: `built-in-leg-${index + 1}`,
    label: `Built-in connector leg ${index + 1}`,
    kind: 'pin-ring',
    position: tuple(candidate.position),
    markerPosition: tuple(candidate.position),
    normal: tuple(candidate.normal),
    radius: clean(candidate.radius * 1.05),
    axis: dominantAxis(candidate.normal),
  }));
}

export function buildLibraryConnectors(part: ConnectorPart, model: THREE.Object3D): LibraryConnector[] {
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) return [];
  if (part.category === 'Pins') {
    const pinConnectors = buildPinConnectors(part, model, bounds);
    return /idler pin/i.test(part.name)
      ? [...pinConnectors, ...buildShaftConnectors(bounds)]
      : pinConnectors;
  }
  if (part.category === 'Shafts') return buildShaftConnectors(bounds);
  const gridHoles = buildHoleConnectors(part, model, bounds);
  if (['Beams', 'Plates'].includes(part.category)) return gridHoles;

  const supportsCentralSquareHole = ['Gears', 'Wheels', 'Pulleys', 'Shaft Hardware'].includes(part.category);
  const centralSquareHoles = !supportsCentralSquareHole || gridHoles.some((connector) => connector.kind === 'square-hole')
    ? []
    : buildCentralSquareHoleConnectors(model, bounds);
  return [...gridHoles, ...centralSquareHoles, ...buildEmbeddedLegConnectors(model)];
}

export function centerLibraryConnectors(
  connectors: LibraryConnector[],
  center: THREE.Vector3,
): LibraryConnector[] {
  const shift = (position: [number, number, number]) => tuple(new THREE.Vector3(...position).sub(center));
  return connectors.map((connector) => ({
    ...connector,
    position: shift(connector.position),
    centerPosition: connector.centerPosition ? shift(connector.centerPosition) : undefined,
    markerPosition: shift(connector.markerPosition),
  }));
}
