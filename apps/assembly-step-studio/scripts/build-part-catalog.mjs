import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT = 'public/part-library/catalog.json';
const DEFAULT_THUMBNAIL_DIRECTORY = 'public/part-library/thumbnails';

function collectStepFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectStepFiles(child);
    return entry.isFile() && /\.step$/i.test(entry.name) ? [child] : [];
  });
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function categoryFor(name) {
  const value = name.toLowerCase();
  if (/\bpins?\b/.test(value)) return 'Pins';
  if (/\bstandoffs?\b/.test(value)) return 'Standoffs';
  if (/\b(spacers?|washers?|collars?)\b/.test(value)) return 'Shaft Hardware';
  if (/shaft|axle/.test(value)) return 'Shafts';
  if (/gear|sprocket|rack/.test(value)) return 'Gears';
  if (/wheel|tire|tyre|hub/.test(value)) return 'Wheels';
  if (/pulley|belt/.test(value)) return 'Pulleys';
  if (/plate/.test(value)) return 'Plates';
  if (/beam|angle|truss/.test(value)) return 'Beams';
  if (/panel/.test(value)) return 'Panels';
  if (/motor|sensor|brain|battery|radio|led|switch/.test(value)) return 'Electronics';
  if (/connector|bushing|socket|ball/.test(value)) return 'Connectors';
  if (/screw|nut|fastener/.test(value)) return 'Fasteners';
  return 'Other';
}

function parsePart(stepPath, sourceDirectory, thumbnailDirectory, usedIds) {
  const sourceFile = path.relative(sourceDirectory, stepPath);
  const baseName = path.basename(stepPath, path.extname(stepPath));
  const partNumberMatch = baseName.match(/\(([^()]+)\)\s*$/);
  const partNumber = partNumberMatch?.[1]?.trim() ?? '';
  const name = (partNumberMatch ? baseName.slice(0, partNumberMatch.index) : baseName).trim();
  const thumbnailName = `${slugify(baseName)}.png`;
  let id = partNumber ? slugify(partNumber) : slugify(baseName);
  const originalId = id;
  let suffix = 2;
  while (usedIds.has(id)) id = `${originalId}-${suffix++}`;
  usedIds.add(id);

  return {
    id,
    name,
    partNumber,
    category: categoryFor(name),
    sourceFile,
    thumbnailUrl: fs.existsSync(path.join(thumbnailDirectory, thumbnailName))
      ? `/part-library/thumbnails/${thumbnailName}`
      : null,
  };
}

function main() {
  const sourceArgument = process.argv[2];
  const outputArgument = process.argv[3] ?? DEFAULT_OUTPUT;
  if (!sourceArgument) {
    throw new Error('Usage: npm run build:part-catalog -- <STEP folder> [catalog output]');
  }

  const sourceDirectory = path.resolve(sourceArgument);
  const outputPath = path.resolve(outputArgument);
  const thumbnailDirectory = path.resolve(DEFAULT_THUMBNAIL_DIRECTORY);
  if (!fs.existsSync(sourceDirectory)) throw new Error(`STEP folder does not exist: ${sourceArgument}`);

  const usedIds = new Set();
  const parts = collectStepFiles(sourceDirectory)
    .sort((left, right) => left.localeCompare(right))
    .map((stepPath) => parsePart(stepPath, sourceDirectory, thumbnailDirectory, usedIds));
  const categories = [...new Set(parts.map((part) => part.category))].sort();
  const catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceDirectory: path.basename(sourceDirectory),
    total: parts.length,
    categories,
    parts,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  const withThumbnails = parts.filter((part) => part.thumbnailUrl).length;
  console.log(`Catalogued ${parts.length} parts (${withThumbnails} thumbnails available).`);
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
