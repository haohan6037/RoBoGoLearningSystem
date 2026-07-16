import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import createOcct from 'occt-import-js';

const DEFAULT_OUTPUT = 'public/part-library/thumbnails';

function usage() {
  console.log(`Generate consistent PNG thumbnails from STEP files.

Usage:
  npm run generate:thumbnails -- [options] <file-or-folder> [...]

Options:
  --output <folder>   Output folder (default: ${DEFAULT_OUTPUT})
  --size <pixels>     Square image size (default: 512)
  --limit <count>     Process only the first N files
  --color <hex>       Part color (default: #3b82f6)
  --help              Show this help
`);
}

function parseArguments(argv) {
  const options = {
    inputs: [],
    output: DEFAULT_OUTPUT,
    size: 512,
    limit: Number.POSITIVE_INFINITY,
    color: '#3b82f6',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') options.help = true;
    else if (argument === '--output') options.output = argv[++index];
    else if (argument === '--size') options.size = Number(argv[++index]);
    else if (argument === '--limit') options.limit = Number(argv[++index]);
    else if (argument === '--color') options.color = argv[++index];
    else if (argument.startsWith('--')) throw new Error(`Unknown option: ${argument}`);
    else options.inputs.push(argument);
  }

  if (!Number.isInteger(options.size) || options.size < 128 || options.size > 2048) {
    throw new Error('--size must be an integer from 128 to 2048.');
  }
  if ((!Number.isInteger(options.limit) || options.limit < 1) && options.limit !== Number.POSITIVE_INFINITY) {
    throw new Error('--limit must be a positive integer.');
  }
  if (!/^#[0-9a-f]{6}$/i.test(options.color)) {
    throw new Error('--color must use six-digit hex format, for example #3b82f6.');
  }
  return options;
}

function collectStepFiles(inputPath) {
  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) throw new Error(`Input does not exist: ${inputPath}`);
  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    if (!/\.step$/i.test(resolved)) throw new Error(`Input is not a STEP file: ${inputPath}`);
    return [resolved];
  }

  return fs.readdirSync(resolved, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(resolved, entry.name);
    if (entry.isDirectory()) return collectStepFiles(child);
    return entry.isFile() && /\.step$/i.test(entry.name) ? [child] : [];
  });
}

function outputName(stepPath) {
  const name = path.basename(stepPath, path.extname(stepPath));
  return `${name
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()}.png`;
}

function writeBinaryStl(meshes, destination) {
  const triangleCount = meshes.reduce((sum, mesh) => sum + mesh.index.array.length / 3, 0);
  const buffer = Buffer.alloc(84 + triangleCount * 50);
  buffer.write('RoBoGo STEP thumbnail', 0, 'ascii');
  buffer.writeUInt32LE(triangleCount, 80);
  let offset = 84;

  for (const mesh of meshes) {
    const positions = mesh.attributes.position.array;
    const indices = mesh.index.array;
    for (let index = 0; index < indices.length; index += 3) {
      const points = [indices[index], indices[index + 1], indices[index + 2]].map((vertexIndex) => [
        positions[vertexIndex * 3],
        positions[vertexIndex * 3 + 1],
        positions[vertexIndex * 3 + 2],
      ]);
      const ab = points[1].map((value, axis) => value - points[0][axis]);
      const ac = points[2].map((value, axis) => value - points[0][axis]);
      const normal = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      const length = Math.hypot(...normal) || 1;
      const values = [normal.map((value) => value / length), ...points];
      for (const vector of values) {
        for (const value of vector) {
          buffer.writeFloatLE(value, offset);
          offset += 4;
        }
      }
      buffer.writeUInt16LE(0, offset);
      offset += 2;
    }
  }

  fs.writeFileSync(destination, buffer);
  return triangleCount;
}

function escapeScadString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function renderPng(stlPath, scadPath, outputPath, size, color) {
  fs.writeFileSync(
    scadPath,
    `color("${color}") import("${escapeScadString(stlPath)}", convexity=10);\n`,
  );
  const result = spawnSync('openscad', [
    '-o', outputPath,
    `--imgsize=${size},${size}`,
    '--autocenter',
    '--viewall',
    '--projection=ortho',
    '--colorscheme=Tomorrow',
    '--camera=0,0,0,65,0,30,0',
    scadPath,
  ], { encoding: 'utf8' });
  if (result.error) {
    throw new Error(`OpenSCAD is required but could not be started: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `OpenSCAD exited with status ${result.status}.`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (options.inputs.length === 0) {
    usage();
    throw new Error('Provide at least one STEP file or folder.');
  }

  const stepFiles = [...new Set(options.inputs.flatMap(collectStepFiles))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, options.limit);
  if (stepFiles.length === 0) throw new Error('No STEP files were found.');

  const outputDirectory = path.resolve(options.output);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'robogo-step-thumbnails-'));
  const occt = await createOcct({
    locateFile: (fileName) => path.resolve('node_modules/occt-import-js/dist', fileName),
  });
  let failures = 0;

  try {
    for (let index = 0; index < stepFiles.length; index += 1) {
      const stepPath = stepFiles[index];
      const base = `part-${index}`;
      const stlPath = path.join(temporaryDirectory, `${base}.stl`);
      const scadPath = path.join(temporaryDirectory, `${base}.scad`);
      const destination = path.join(outputDirectory, outputName(stepPath));
      try {
        const result = occt.ReadStepFile(new Uint8Array(fs.readFileSync(stepPath)), null);
        if (!result.success || result.meshes.length === 0) throw new Error('STEP conversion returned no mesh.');
        const triangles = writeBinaryStl(result.meshes, stlPath);
        renderPng(stlPath, scadPath, destination, options.size, options.color);
        console.log(`✓ ${path.basename(stepPath)} → ${path.relative(process.cwd(), destination)} (${triangles} triangles)`);
      } catch (error) {
        failures += 1;
        console.error(`✗ ${path.basename(stepPath)}: ${error instanceof Error ? error.message : error}`);
      }
    }
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  if (failures > 0) throw new Error(`${failures} thumbnail(s) failed.`);
  console.log(`Generated ${stepFiles.length} thumbnail(s) in ${path.relative(process.cwd(), outputDirectory)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
