import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.dirname(SCRIPT_DIR);
const CAD_ROOT = path.join(APP_ROOT, 'CAD Files');
const OUTPUT_FILE = path.join(APP_ROOT, 'lib', 'parts', 'partNameCatalog.json');
const PART_NUMBER_PATTERN = /\d{3}-\d{4}-\d{3,4}/g;

export function parseStepFileName(fileName) {
  const stem = fileName.replace(/\.(step|stp)$/i, '').trim();
  const partNumber = stem.match(PART_NUMBER_PATTERN)?.[0];
  if (!partNumber) return null;

  const escapedPartNumber = partNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let meaningfulName = stem
    .replace(new RegExp(`\\s*\\(${escapedPartNumber}\\)\\s*`, 'g'), ' ')
    .replace(new RegExp(`^${escapedPartNumber}\\s*`), '')
    .trim();

  if (meaningfulName.startsWith('(') && meaningfulName.endsWith(')')) {
    meaningfulName = meaningfulName.slice(1, -1).trim();
  }

  return meaningfulName ? { partNumber, meaningfulName } : null;
}

function findStepFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findStepFiles(absolutePath);
    return /\.(step|stp)$/i.test(entry.name) ? [absolutePath] : [];
  });
}

export function buildPartNameCatalog(directory = CAD_ROOT) {
  const namesByPartNumber = new Map();

  for (const filePath of findStepFiles(directory).sort()) {
    const parsed = parseStepFileName(path.basename(filePath));
    if (!parsed) continue;
    const names = namesByPartNumber.get(parsed.partNumber) ?? new Set();
    names.add(parsed.meaningfulName);
    namesByPartNumber.set(parsed.partNumber, names);
  }

  return Object.fromEntries(
    [...namesByPartNumber.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([partNumber, names]) => [partNumber, [...names].sort().join(' / ')]),
  );
}

export function serializePartNameCatalog(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

function main() {
  const output = serializePartNameCatalog(buildPartNameCatalog());
  const checkOnly = process.argv.includes('--check');
  const existing = fs.existsSync(OUTPUT_FILE) ? fs.readFileSync(OUTPUT_FILE, 'utf8') : '';

  if (checkOnly) {
    if (existing !== output) {
      console.error('Part-name catalog is out of date. Run: node scripts/generate-part-name-catalog.mjs');
      process.exitCode = 1;
    } else {
      console.log('Part-name catalog is up to date.');
    }
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, output);
  console.log(`Generated ${Object.keys(JSON.parse(output)).length} part names at ${OUTPUT_FILE}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
