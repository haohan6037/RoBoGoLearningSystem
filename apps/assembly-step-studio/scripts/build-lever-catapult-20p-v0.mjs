import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = path.join(APP_ROOT, 'public', 'part-library', 'catalog.json');
const STORAGE_ROOT = path.join(APP_ROOT, 'data', 'studio-storage');
const PROJECTS_DIR = path.join(STORAGE_ROOT, 'projects');
const BACKUPS_DIR = path.join(STORAGE_ROOT, 'backups');
const PROJECT_ID = 'ai-lever-catapult-20p-v0';
const PROJECT_NAME = '20P Lever Catapult · Elastic V0';
const ORIGIN = process.env.ASSEMBLY_STUDIO_ORIGIN ?? 'http://127.0.0.1:3000';
const FORCE = process.argv.includes('--force');
const P = 12.7;
const HALF_PI_QUATERNION = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
const NOW = new Date().toISOString();

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const parts = new Map(catalog.parts.map((part) => [part.partNumber, part]));

function requiredPart(partNumber) {
  const part = parts.get(partNumber);
  if (!part) throw new Error(`Missing catalog part ${partNumber}`);
  return part;
}

function instance(instanceId, partNumber, color, position, quaternion = [0, 0, 0, 1]) {
  return {
    instanceId,
    part: requiredPart(partNumber),
    color,
    position,
    quaternion,
  };
}

function mate(id, type, fixedInstanceId, movingInstanceId, fixedConnectorIds, movingConnectorIds) {
  return {
    id,
    type,
    fixedInstanceId,
    movingInstanceId,
    fixedConnectorIds,
    movingConnectorIds,
    createdAt: NOW,
  };
}

const supportZ = 1 * P;
const outsideCollarZ = 1.6 * P;
const armCenter = [7 * P, 0.5 * P, 0];
const cupCenter = [14.5 * P, 0.5 * P, 10.133645720883882];
const cupPinZ = 3.05;

const instances = [
  instance('frame-left-2x12', '228-2500-026', '#334155', [-0.5 * P, 0, -supportZ], HALF_PI_QUATERNION),
  instance('frame-right-2x12', '228-2500-026', '#334155', [-0.5 * P, 0, supportZ], HALF_PI_QUATERNION),

  instance('pivot-shaft-5p', '228-2500-121', '#94a3b8', [0, 0, 0]),
  instance('pivot-collar-left', '228-2500-226', '#475569', [0, 0, -outsideCollarZ]),
  instance('pivot-collar-right', '228-2500-226', '#475569', [0, 0, outsideCollarZ]),

  instance('band-anchor-shaft-5p', '228-2500-121', '#94a3b8', [0, -5 * P, 0]),
  instance('band-anchor-collar-left', '228-2500-226', '#475569', [0, -5 * P, -outsideCollarZ]),
  instance('band-anchor-collar-right', '228-2500-226', '#475569', [0, -5 * P, outsideCollarZ]),

  instance('release-stop-shaft-5p', '228-2500-121', '#94a3b8', [-1 * P, -3 * P, 0]),
  instance('release-stop-collar-left', '228-2500-226', '#475569', [-1 * P, -3 * P, -outsideCollarZ]),
  instance('release-stop-collar-right', '228-2500-226', '#475569', [-1 * P, -3 * P, outsideCollarZ]),
  instance('release-stop-rubber', '228-2500-143', '#111827', [-1 * P, -3 * P, 0], [Math.SQRT1_2, 0, 0, Math.SQRT1_2]),

  instance('lever-arm-2x20', '228-2500-030', '#2563eb', armCenter),
  instance('pivot-spacer-left-inner', '228-2500-114', '#64748b', [0, 0, -0.36515748031496065 * P]),
  instance('pivot-spacer-left-outer', '228-2500-114', '#64748b', [0, 0, -0.6151574803149607 * P]),
  instance('pivot-spacer-right-inner', '228-2500-114', '#64748b', [0, 0, 0.36515748031496065 * P]),
  instance('pivot-spacer-right-outer', '228-2500-114', '#64748b', [0, 0, 0.6151574803149607 * P]),
  instance('moving-band-pin', '228-2500-086', '#f97316', [-2 * P, 0, 0.061]),

  instance('ball-cup-strong', '228-2500-509', '#f97316', cupCenter),
  instance('cup-pin-rear-low', '228-2500-086', '#facc15', [13 * P, 0, cupPinZ]),
  instance('cup-pin-rear-high', '228-2500-086', '#facc15', [13 * P, 1 * P, cupPinZ]),
  instance('cup-pin-front-low', '228-2500-086', '#facc15', [16 * P, 0, cupPinZ]),
  instance('cup-pin-front-high', '228-2500-086', '#facc15', [16 * P, 1 * P, cupPinZ]),

  // STEP rubber bands are rigid rings. These two instances document the neutral
  // routing only; they are intentionally excluded from rigid-body sweep claims.
  instance('elastic-band-left-reference', '228-2500-468', '#ef4444', [-1 * P, -2.5 * P, -0.5 * P]),
  instance('elastic-band-right-reference', '228-2500-468', '#ef4444', [-1 * P, -2.5 * P, 0.5 * P]),
];

const mateRecords = [
  mate('pivot-left-support', 'shaft', 'frame-left-2x12', 'pivot-shaft-5p', ['pivot-hole'], ['shaft-end-1']),
  mate('pivot-right-support', 'shaft', 'frame-right-2x12', 'pivot-shaft-5p', ['pivot-hole'], ['shaft-end-2']),
  mate('pivot-arm', 'shaft', 'pivot-shaft-5p', 'lever-arm-2x20', ['shaft-axis'], ['hole-3-row-1']),
  mate('pivot-collar-left-mate', 'shaft', 'pivot-shaft-5p', 'pivot-collar-left', ['shaft-axis'], ['center-hole']),
  mate('pivot-collar-right-mate', 'shaft', 'pivot-shaft-5p', 'pivot-collar-right', ['shaft-axis'], ['center-hole']),

  mate('anchor-left-support', 'shaft', 'frame-left-2x12', 'band-anchor-shaft-5p', ['lower-hole-row-1'], ['shaft-end-1']),
  mate('anchor-right-support', 'shaft', 'frame-right-2x12', 'band-anchor-shaft-5p', ['lower-hole-row-1'], ['shaft-end-2']),
  mate('anchor-collar-left-mate', 'shaft', 'band-anchor-shaft-5p', 'band-anchor-collar-left', ['shaft-axis'], ['center-hole']),
  mate('anchor-collar-right-mate', 'shaft', 'band-anchor-shaft-5p', 'band-anchor-collar-right', ['shaft-axis'], ['center-hole']),

  mate('stop-left-support', 'shaft', 'frame-left-2x12', 'release-stop-shaft-5p', ['stop-hole-row-2'], ['shaft-end-1']),
  mate('stop-right-support', 'shaft', 'frame-right-2x12', 'release-stop-shaft-5p', ['stop-hole-row-2'], ['shaft-end-2']),
  mate('stop-collar-left-mate', 'shaft', 'release-stop-shaft-5p', 'release-stop-collar-left', ['shaft-axis'], ['center-hole']),
  mate('stop-collar-right-mate', 'shaft', 'release-stop-shaft-5p', 'release-stop-collar-right', ['shaft-axis'], ['center-hole']),
  mate('stop-rubber-mate', 'shaft', 'release-stop-shaft-5p', 'release-stop-rubber', ['shaft-axis'], ['center-hole']),

  mate('spacer-left-inner-mate', 'shaft', 'pivot-shaft-5p', 'pivot-spacer-left-inner', ['shaft-axis'], ['center-hole']),
  mate('spacer-left-outer-mate', 'shaft', 'pivot-shaft-5p', 'pivot-spacer-left-outer', ['shaft-axis'], ['center-hole']),
  mate('spacer-right-inner-mate', 'shaft', 'pivot-shaft-5p', 'pivot-spacer-right-inner', ['shaft-axis'], ['center-hole']),
  mate('spacer-right-outer-mate', 'shaft', 'pivot-shaft-5p', 'pivot-spacer-right-outer', ['shaft-axis'], ['center-hole']),
  mate('moving-band-pin-arm', 'pin', 'lever-arm-2x20', 'moving-band-pin', ['hole-1-row-1'], ['pin-axis']),

  ...[
    ['cup-rear-low', 'cup-pin-rear-low', 'hole-16-row-1', 'cup-hole-rear-low'],
    ['cup-rear-high', 'cup-pin-rear-high', 'hole-16-row-2', 'cup-hole-rear-high'],
    ['cup-front-low', 'cup-pin-front-low', 'hole-19-row-1', 'cup-hole-front-low'],
    ['cup-front-high', 'cup-pin-front-high', 'hole-19-row-2', 'cup-hole-front-high'],
  ].flatMap(([prefix, pinId, armHole, cupHole]) => [
    mate(`${prefix}-arm`, 'pin', 'lever-arm-2x20', pinId, [armHole], ['pin-ring-1']),
    mate(`${prefix}-cup`, 'pin', pinId, 'ball-cup-strong', ['pin-ring-2'], [cupHole]),
  ]),
];

const groups = [
  {
    id: 'catapult-fixed-frame',
    name: 'Fixed · Double-Supported Frame, Elastic Anchor and Stop',
    instanceIds: [
      'frame-left-2x12',
      'frame-right-2x12',
      'pivot-shaft-5p',
      'pivot-collar-left',
      'pivot-collar-right',
      'band-anchor-shaft-5p',
      'band-anchor-collar-left',
      'band-anchor-collar-right',
      'release-stop-shaft-5p',
      'release-stop-collar-left',
      'release-stop-collar-right',
      'release-stop-rubber',
    ],
    createdAt: NOW,
  },
  {
    id: 'catapult-moving-lever',
    name: 'Moving · 20P Lever, Ball Cup and Elastic Pickup',
    instanceIds: [
      'lever-arm-2x20',
      'pivot-spacer-left-inner',
      'pivot-spacer-left-outer',
      'pivot-spacer-right-inner',
      'pivot-spacer-right-outer',
      'moving-band-pin',
      'ball-cup-strong',
      'cup-pin-rear-low',
      'cup-pin-rear-high',
      'cup-pin-front-low',
      'cup-pin-front-high',
    ],
    createdAt: NOW,
  },
  {
    id: 'catapult-elastic-reference',
    name: 'Reference Only · Two Deformable Elastic Paths at Neutral Pose',
    instanceIds: ['elastic-band-left-reference', 'elastic-band-right-reference'],
    createdAt: NOW,
  },
];

const project = {
  id: PROJECT_ID,
  name: PROJECT_NAME,
  projectType: 'assembly',
  status: 'In Progress',
  createdAt: NOW,
  updatedAt: NOW,
  owner: 'Admin',
  tags: [
    'ai-assisted',
    'lever-catapult',
    '20p-arm',
    'elastic-powered',
    'no-motor',
    'no-ratchet',
    'double-supported-pivot',
    '60-degree-rubber-stop',
    '25mm-ball-cup',
    'elastic-reference-not-rigid',
  ],
  data: {
    version: '0.1.0',
    projectName: PROJECT_NAME,
    modelObjectTree: [],
    disassemblySteps: [],
    assemblySteps: [],
    partsList: [],
  },
  assemblyData: { instances, mateRecords, groups },
  modelAsset: null,
  coverAsset: null,
};

function validateProject(record) {
  const ids = record.assemblyData.instances.map((entry) => entry.instanceId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate instance id');
  const knownIds = new Set(ids);
  for (const recordMate of record.assemblyData.mateRecords) {
    if (!knownIds.has(recordMate.fixedInstanceId) || !knownIds.has(recordMate.movingInstanceId)) {
      throw new Error(`Mate ${recordMate.id} references a missing instance`);
    }
  }
  const grouped = record.assemblyData.groups.flatMap((group) => group.instanceIds);
  if (grouped.length !== ids.length || new Set(grouped).size !== ids.length) {
    throw new Error('Every instance must appear in exactly one group');
  }
  for (const id of ids) if (!grouped.includes(id)) throw new Error(`Ungrouped instance ${id}`);
  if (record.assemblyData.instances.find((entry) => entry.instanceId === 'lever-arm-2x20')?.part.partNumber !== '228-2500-030') {
    throw new Error('The main lever is not the required 20P beam');
  }
}

validateProject(project);
fs.mkdirSync(BACKUPS_DIR, { recursive: true });
const existingPath = path.join(PROJECTS_DIR, `${PROJECT_ID}.json`);
if (fs.existsSync(existingPath)) {
  if (!FORCE) throw new Error(`${PROJECT_ID} already exists; rerun with --force only after reviewing it`);
  const previous = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  fs.copyFileSync(existingPath, path.join(BACKUPS_DIR, `${PROJECT_ID}.before-${stamp}.json`));
  if (previous.updatedAt === project.updatedAt) throw new Error('Refusing to overwrite an unchanged timestamp');
}

const response = await fetch(`${ORIGIN}/api/studio`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(project),
});
if (!response.ok) throw new Error(`Studio save failed: ${response.status} ${await response.text()}`);

const savedResponse = await fetch(`${ORIGIN}/api/studio?projectId=${PROJECT_ID}`);
if (!savedResponse.ok) throw new Error(`Studio reload failed: ${savedResponse.status} ${await savedResponse.text()}`);
const saved = await savedResponse.json();
validateProject(saved);
if (saved.updatedAt !== NOW) throw new Error('Saved project timestamp does not match this build');

const validatedBackup = path.join(BACKUPS_DIR, `${PROJECT_ID}.initial-validated.json`);
fs.writeFileSync(validatedBackup, JSON.stringify(saved));

console.log(JSON.stringify({
  id: saved.id,
  name: saved.name,
  updatedAt: saved.updatedAt,
  parts: saved.assemblyData.instances.length,
  mates: saved.assemblyData.mateRecords.length,
  groups: saved.assemblyData.groups.length,
  movingRangeDegrees: [-55, 60],
  backup: path.relative(APP_ROOT, validatedBackup),
}, null, 2));
