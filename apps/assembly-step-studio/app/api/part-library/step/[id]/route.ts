import fs from 'node:fs/promises';
import path from 'node:path';
import type { PartLibraryCatalog } from '@/types/partLibrary';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const catalogPath = path.join(process.cwd(), 'public', 'part-library', 'catalog.json');

  try {
    const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8')) as PartLibraryCatalog;
    const part = catalog.parts.find((candidate) => candidate.id === id);
    if (!part) return Response.json({ error: 'Part not found.' }, { status: 404 });

    const sourceRoot = path.resolve(process.cwd(), 'CAD Files');
    const stepPath = path.resolve(sourceRoot, part.sourceFile);
    if (!stepPath.startsWith(`${sourceRoot}${path.sep}`)) {
      return Response.json({ error: 'Invalid part path.' }, { status: 400 });
    }

    const content = await fs.readFile(stepPath);
    return new Response(new Uint8Array(content), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(content.byteLength),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return Response.json({ error: 'The local STEP library is unavailable.' }, { status: 404 });
    }
    console.error('Part library STEP request failed:', error);
    return Response.json({ error: 'Unable to load this part.' }, { status: 500 });
  }
}
