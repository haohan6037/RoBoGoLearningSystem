import type { AssemblyWorkspaceData } from '../../types/assembly.ts';
import type { PartLibraryItem } from '../../types/partLibrary.ts';

const LONG_BEAM_ID = '228-2500-010';
const CROSS_BEAM_ID = '228-2500-004';
const CORNER_CONNECTOR_ID = '228-2500-126';
const CLAW_SUPPORT_BEAM_ID = '228-2500-023';
const CLAW_CRANK_GEAR_ID = '228-2500-246';
const CLAW_LEFT_JAW_ID = '228-2500-400';
const CLAW_RIGHT_JAW_ID = '228-2500-401';
const CLAW_SHAFT_ID = '228-2500-120';
const QUARTER_TURN_Y = Math.SQRT1_2;
const CLAW_GEAR_CENTER_DISTANCE = 25.4;
const CLAW_CRANK_SQUARE_HOLE_LOCAL: [number, number] = [0.048, -15.272];
const CLAW_CRANK_ARM_LENGTH = 38.1;
const CLAW_LEFT_JAW_MOUNT_LOCAL: [number, number] = [-12.7, -3.175];
const CLAW_RIGHT_JAW_MOUNT_LOCAL: [number, number] = [12.7, -3.175];
const CLAW_CRANK_HALF_THICKNESS = 3.175;
const CLAW_CORNER_BEAM_HALF_THICKNESS = 6.2;
const CLAW_JAW_Z = CLAW_CRANK_HALF_THICKNESS + CLAW_CORNER_BEAM_HALF_THICKNESS;

type PrototypeCatalog = {
  parts: PartLibraryItem[];
};

export class AssemblyPrototypeError extends Error {
  readonly code = 'PART_NOT_FOUND';
  readonly partId: string;

  constructor(partId: string) {
    super(`Required prototype part is missing from the catalog: ${partId}`);
    this.name = 'AssemblyPrototypeError';
    this.partId = partId;
  }
}

function requirePart(catalog: PrototypeCatalog, partId: string): PartLibraryItem {
  const part = catalog.parts.find((candidate) => candidate.id === partId);
  if (!part) throw new AssemblyPrototypeError(partId);
  return part;
}

function rotatePoint(x: number, y: number, angle: number): [number, number] {
  return [
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle),
  ];
}

function quaternionAroundZ(angle: number): [number, number, number, number] {
  return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
}

function positionForLocalAnchor(
  worldAnchor: [number, number],
  localAnchor: [number, number],
  angle: number,
  z = 0,
): [number, number, number] {
  const rotated = rotatePoint(localAnchor[0], localAnchor[1], angle);
  return [worldAnchor[0] - rotated[0], worldAnchor[1] - rotated[1], z];
}

export function buildGearDrivenClawPrototype(
  catalog: PrototypeCatalog,
  openingDegrees = 24,
  createdAt = new Date().toISOString(),
): AssemblyWorkspaceData {
  const supportBeam = requirePart(catalog, CLAW_SUPPORT_BEAM_ID);
  const crankGear = requirePart(catalog, CLAW_CRANK_GEAR_ID);
  const leftJaw = requirePart(catalog, CLAW_LEFT_JAW_ID);
  const rightJaw = requirePart(catalog, CLAW_RIGHT_JAW_ID);
  const shaft = requirePart(catalog, CLAW_SHAFT_ID);
  const openingRadians = openingDegrees * Math.PI / 180;
  const leftAngle = openingRadians;
  const rightAngle = -openingRadians;
  const leftPivot: [number, number] = [-CLAW_GEAR_CENTER_DISTANCE / 2, 0];
  const rightPivot: [number, number] = [CLAW_GEAR_CENTER_DISTANCE / 2, 0];

  const buildJaw = (
    instanceId: string,
    jaw: PartLibraryItem,
    pivot: [number, number],
    crankAngle: number,
    localMount: [number, number],
    jawAngle: number,
  ): AssemblyWorkspaceData['instances'][number] => {
    const armOffset = rotatePoint(0, CLAW_CRANK_ARM_LENGTH, crankAngle);
    const armTip: [number, number] = [pivot[0] + armOffset[0], pivot[1] + armOffset[1]];
    return {
      instanceId,
      part: jaw,
      color: '#f59e0b',
      position: positionForLocalAnchor(
        armTip,
        localMount,
        jawAngle,
        CLAW_JAW_Z,
      ),
      quaternion: quaternionAroundZ(jawAngle),
    };
  };

  const instances: AssemblyWorkspaceData['instances'] = [
    {
      instanceId: 'claw-support-rear',
      part: supportBeam,
      color: '#334155',
      position: [0, 0, -6.225],
      quaternion: [0, 0, 0, 1],
    },
    {
      instanceId: 'claw-support-front',
      part: supportBeam,
      color: '#475569',
      position: [0, 0, 6.225],
      quaternion: [0, 0, 0, 1],
    },
    {
      instanceId: 'claw-left-crank-gear',
      part: crankGear,
      color: '#2563eb',
      position: positionForLocalAnchor(leftPivot, CLAW_CRANK_SQUARE_HOLE_LOCAL, leftAngle),
      quaternion: quaternionAroundZ(leftAngle),
    },
    {
      instanceId: 'claw-right-crank-gear',
      part: crankGear,
      color: '#7c3aed',
      position: positionForLocalAnchor(rightPivot, CLAW_CRANK_SQUARE_HOLE_LOCAL, rightAngle),
      quaternion: quaternionAroundZ(rightAngle),
    },
    buildJaw(
      'claw-left-jaw',
      leftJaw,
      leftPivot,
      leftAngle,
      CLAW_LEFT_JAW_MOUNT_LOCAL,
      leftAngle + Math.PI / 2,
    ),
    buildJaw(
      'claw-right-jaw',
      rightJaw,
      rightPivot,
      rightAngle,
      CLAW_RIGHT_JAW_MOUNT_LOCAL,
      rightAngle - Math.PI / 2,
    ),
    {
      instanceId: 'claw-drive-shaft',
      part: shaft,
      color: '#ef4444',
      position: [leftPivot[0], leftPivot[1], 0],
      quaternion: [0, 0, 0, 1],
    },
    {
      instanceId: 'claw-follower-shaft',
      part: shaft,
      color: '#94a3b8',
      position: [rightPivot[0], rightPivot[1], 0],
      quaternion: [0, 0, 0, 1],
    },
  ];

  return {
    instances,
    mateRecords: [
      {
        id: 'claw-drive-shaft-to-support',
        type: 'shaft',
        fixedInstanceId: 'claw-support-rear',
        movingInstanceId: 'claw-drive-shaft',
        fixedConnectorIds: ['manual-hole-5-b'],
        movingConnectorIds: ['shaft-end-1'],
        createdAt,
      },
      {
        id: 'claw-drive-gear-to-shaft',
        type: 'shaft',
        fixedInstanceId: 'claw-drive-shaft',
        movingInstanceId: 'claw-left-crank-gear',
        fixedConnectorIds: ['shaft-end-2'],
        movingConnectorIds: ['manual-square-hole-1-a'],
        createdAt,
      },
      {
        id: 'claw-follower-shaft-to-support',
        type: 'shaft',
        fixedInstanceId: 'claw-support-rear',
        movingInstanceId: 'claw-follower-shaft',
        fixedConnectorIds: ['manual-hole-2-b'],
        movingConnectorIds: ['shaft-end-1'],
        createdAt,
      },
      {
        id: 'claw-follower-gear-to-shaft',
        type: 'shaft',
        fixedInstanceId: 'claw-follower-shaft',
        movingInstanceId: 'claw-right-crank-gear',
        fixedConnectorIds: ['shaft-end-2'],
        movingConnectorIds: ['manual-square-hole-1-a'],
        createdAt,
      },
    ],
    groups: [],
  };
}

export type GearDrivenClawValidation = {
  valid: boolean;
  issues: string[];
  measurements: {
    gearCenterDistance: number;
    shaftAlignmentError: number;
    jawMirrorError: number;
    counterRotationError: number;
    jawCrankOverlapDepth: number;
  };
};

function roundMeasurement(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function validateGearDrivenClawPrototype(
  workspace: AssemblyWorkspaceData,
): GearDrivenClawValidation {
  const byId = new Map(workspace.instances.map((instance) => [instance.instanceId, instance]));
  const leftGear = byId.get('claw-left-crank-gear');
  const rightGear = byId.get('claw-right-crank-gear');
  const leftJaw = byId.get('claw-left-jaw');
  const rightJaw = byId.get('claw-right-jaw');
  const driveShaft = byId.get('claw-drive-shaft');
  const followerShaft = byId.get('claw-follower-shaft');
  const required = [leftGear, rightGear, leftJaw, rightJaw, driveShaft, followerShaft];
  if (required.some((instance) => !instance)) {
    return {
      valid: false,
      issues: ['The claw workspace is missing a required gear, jaw, or shaft instance.'],
      measurements: {
        gearCenterDistance: Number.POSITIVE_INFINITY,
        shaftAlignmentError: Number.POSITIVE_INFINITY,
        jawMirrorError: Number.POSITIVE_INFINITY,
        counterRotationError: Number.POSITIVE_INFINITY,
        jawCrankOverlapDepth: Number.POSITIVE_INFINITY,
      },
    };
  }

  const gearCenter = (instance: NonNullable<typeof leftGear>): [number, number] => {
    const angle = 2 * Math.atan2(instance.quaternion[2], instance.quaternion[3]);
    const offset = rotatePoint(
      CLAW_CRANK_SQUARE_HOLE_LOCAL[0],
      CLAW_CRANK_SQUARE_HOLE_LOCAL[1],
      angle,
    );
    return [instance.position[0] + offset[0], instance.position[1] + offset[1]];
  };
  const leftCenter = gearCenter(leftGear!);
  const rightCenter = gearCenter(rightGear!);
  const gearCenterDistance = Math.hypot(
    rightCenter[0] - leftCenter[0],
    rightCenter[1] - leftCenter[1],
  );
  const shaftAlignmentError = Math.max(
    Math.hypot(driveShaft!.position[0] - leftCenter[0], driveShaft!.position[1] - leftCenter[1]),
    Math.hypot(followerShaft!.position[0] - rightCenter[0], followerShaft!.position[1] - rightCenter[1]),
  );
  const jawMirrorError = Math.hypot(
    leftJaw!.position[0] + rightJaw!.position[0],
    leftJaw!.position[1] - rightJaw!.position[1],
  );
  const leftAngle = 2 * Math.atan2(leftGear!.quaternion[2], leftGear!.quaternion[3]);
  const rightAngle = 2 * Math.atan2(rightGear!.quaternion[2], rightGear!.quaternion[3]);
  const counterRotationError = Math.abs(leftAngle + rightAngle);
  const jawCrankOverlapDepth = Math.max(
    0,
    CLAW_CRANK_HALF_THICKNESS + CLAW_CORNER_BEAM_HALF_THICKNESS
      - Math.min(
        Math.abs(leftJaw!.position[2] - leftGear!.position[2]),
        Math.abs(rightJaw!.position[2] - rightGear!.position[2]),
      ),
  );
  const issues: string[] = [];
  if (Math.abs(gearCenterDistance - CLAW_GEAR_CENTER_DISTANCE) > 0.01) {
    issues.push('The two 23-tooth crank gears are not at the required 25.4 mm center distance.');
  }
  if (shaftAlignmentError > 0.01) issues.push('A gear pivot is not aligned with its shaft.');
  if (jawMirrorError > 0.01) issues.push('The left and right jaws are not mirrored about the center line.');
  if (counterRotationError > 0.001) issues.push('The two crank gears do not express equal counter-rotation.');
  if (leftJaw!.part.id !== CLAW_LEFT_JAW_ID || rightJaw!.part.id !== CLAW_RIGHT_JAW_ID) {
    issues.push('The claw tips must use the mirrored left and right 2x1 Corner Beam parts.');
  }
  if (jawCrankOverlapDepth > 0.001) {
    issues.push('A corner-beam jaw overlaps its crank gear layer.');
  }
  if (workspace.groups.length > 0) issues.push('Generated claw parts must remain independently editable.');

  return {
    valid: issues.length === 0,
    issues,
    measurements: {
      gearCenterDistance: roundMeasurement(gearCenterDistance),
      shaftAlignmentError: roundMeasurement(shaftAlignmentError),
      jawMirrorError: roundMeasurement(jawMirrorError),
      counterRotationError: roundMeasurement(counterRotationError),
      jawCrankOverlapDepth: roundMeasurement(jawCrankOverlapDepth),
    },
  };
}

export function buildRectangularChassisPrototype(
  catalog: PrototypeCatalog,
  createdAt = new Date().toISOString(),
): AssemblyWorkspaceData {
  const longBeam = requirePart(catalog, LONG_BEAM_ID);
  const crossBeam = requirePart(catalog, CROSS_BEAM_ID);
  const cornerConnector = requirePart(catalog, CORNER_CONNECTOR_ID);
  const instances: AssemblyWorkspaceData['instances'] = [
    {
      instanceId: 'chassis-left',
      part: longBeam,
      color: '#356fe3',
      position: [0, 0, -34.925],
      quaternion: [0, 0, 0, 1],
    },
    {
      instanceId: 'chassis-right',
      part: longBeam,
      color: '#356fe3',
      position: [0, 0, 34.925],
      quaternion: [0, 0, 0, 1],
    },
    {
      instanceId: 'chassis-front',
      part: crossBeam,
      color: '#f47a32',
      position: [-73.025, 0, 0],
      quaternion: [0, QUARTER_TURN_Y, 0, QUARTER_TURN_Y],
    },
    {
      instanceId: 'chassis-rear',
      part: crossBeam,
      color: '#f47a32',
      position: [73.025, 0, 0],
      quaternion: [0, QUARTER_TURN_Y, 0, QUARTER_TURN_Y],
    },
    {
      instanceId: 'connector-front-left',
      part: cornerConnector,
      color: '#db2777',
      position: [-60.419, 0, -22.319],
      quaternion: [QUARTER_TURN_Y, QUARTER_TURN_Y, 0, 0],
    },
    {
      instanceId: 'connector-front-right',
      part: cornerConnector,
      color: '#d69e2e',
      position: [-60.419, 0, 22.319],
      quaternion: [0, 0, -QUARTER_TURN_Y, QUARTER_TURN_Y],
    },
    {
      instanceId: 'connector-rear-left',
      part: cornerConnector,
      color: '#7c3aed',
      position: [60.419, 0, -22.319],
      quaternion: [-0.5, -0.5, -0.5, -0.5],
    },
    {
      instanceId: 'connector-rear-right',
      part: cornerConnector,
      color: '#0f9f76',
      position: [60.419, 0, 22.319],
      quaternion: [0.5, -0.5, 0.5, -0.5],
    },
  ];

  return {
    instances,
    mateRecords: [
      {
        id: 'mate-front-left-cross',
        type: 'pin',
        fixedInstanceId: 'chassis-front',
        movingInstanceId: 'connector-front-left',
        fixedConnectorIds: ['hole-1-5-top'],
        movingConnectorIds: ['built-in-leg-3'],
        createdAt,
      },
      {
        id: 'mate-front-left-side',
        type: 'pin',
        fixedInstanceId: 'connector-front-left',
        movingInstanceId: 'chassis-left',
        fixedConnectorIds: ['built-in-leg-2'],
        movingConnectorIds: ['hole-1-1-bottom'],
        createdAt,
      },
      {
        id: 'mate-front-right-cross',
        type: 'pin',
        fixedInstanceId: 'chassis-front',
        movingInstanceId: 'connector-front-right',
        fixedConnectorIds: ['hole-1-1-top'],
        movingConnectorIds: ['built-in-leg-3'],
        createdAt,
      },
      {
        id: 'mate-front-right-side',
        type: 'pin',
        fixedInstanceId: 'connector-front-right',
        movingInstanceId: 'chassis-right',
        fixedConnectorIds: ['built-in-leg-2'],
        movingConnectorIds: ['hole-1-1-bottom'],
        createdAt,
      },
      {
        id: 'mate-rear-left-side',
        type: 'pin',
        fixedInstanceId: 'chassis-left',
        movingInstanceId: 'connector-rear-left',
        fixedConnectorIds: ['hole-1-11-bottom'],
        movingConnectorIds: ['built-in-leg-2'],
        createdAt,
      },
      {
        id: 'mate-rear-left-cross',
        type: 'pin',
        fixedInstanceId: 'connector-rear-left',
        movingInstanceId: 'chassis-rear',
        fixedConnectorIds: ['built-in-leg-3'],
        movingConnectorIds: ['hole-1-5-bottom'],
        createdAt,
      },
      {
        id: 'mate-rear-right-side',
        type: 'pin',
        fixedInstanceId: 'chassis-right',
        movingInstanceId: 'connector-rear-right',
        fixedConnectorIds: ['hole-1-11-bottom'],
        movingConnectorIds: ['built-in-leg-2'],
        createdAt,
      },
      {
        id: 'mate-rear-right-cross',
        type: 'pin',
        fixedInstanceId: 'connector-rear-right',
        movingInstanceId: 'chassis-rear',
        fixedConnectorIds: ['built-in-leg-3'],
        movingConnectorIds: ['hole-1-1-bottom'],
        createdAt,
      },
    ],
    groups: [{
      id: 'chassis-frame',
      name: 'Rectangular Chassis Prototype',
      instanceIds: instances.map((instance) => instance.instanceId),
      createdAt,
    }],
  };
}
