import fs from 'node:fs/promises';
import path from 'node:path';
import type { LibraryConnector } from '@/lib/mate/libraryConnectors';
import type { PartLibraryCatalog } from '@/types/partLibrary';

export const runtime = 'nodejs';

type ConnectorFile = {
  version: 1;
  partId: string;
  updatedAt: string;
  connectors: LibraryConnector[];
};

async function resolvePart(id: string) {
  const catalogPath = path.join(process.cwd(), 'public', 'part-library', 'catalog.json');
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8')) as PartLibraryCatalog;
  return catalog.parts.find((candidate) => candidate.id === id) ?? null;
}

function connectorPath(partId: string): string {
  return path.join(process.cwd(), 'data', 'part-library-connectors', `${partId}.json`);
}

function isTuple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3
    && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function isHoleConnector(value: unknown): value is LibraryConnector {
  if (!value || typeof value !== 'object') return false;
  const connector = value as Partial<LibraryConnector>;
  return typeof connector.id === 'string'
    && typeof connector.label === 'string'
    && connector.kind === 'hole'
    && isTuple(connector.position)
    && (!connector.centerPosition || isTuple(connector.centerPosition))
    && isTuple(connector.markerPosition)
    && isTuple(connector.normal)
    && typeof connector.radius === 'number'
    && Number.isFinite(connector.radius)
    && ['x', 'y', 'z'].includes(connector.axis ?? '');
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const part = await resolvePart(id);
    if (!part) return Response.json({ error: 'Part not found.' }, { status: 404 });
    try {
      const saved = JSON.parse(await fs.readFile(connectorPath(part.id), 'utf8')) as ConnectorFile;
      return Response.json({ connectors: saved.connectors.filter(isHoleConnector) });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return Response.json({ connectors: [] });
      }
      throw error;
    }
  } catch (error) {
    console.error('Part connector request failed:', error);
    return Response.json({ error: 'Unable to load saved hole markers.' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const part = await resolvePart(id);
    if (!part) return Response.json({ error: 'Part not found.' }, { status: 404 });
    const body = await request.json() as { connectors?: unknown };
    if (!Array.isArray(body.connectors) || !body.connectors.every(isHoleConnector)) {
      return Response.json({ error: 'Invalid hole connector data.' }, { status: 400 });
    }

    const destination = connectorPath(part.id);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const payload: ConnectorFile = {
      version: 1,
      partId: part.id,
      updatedAt: new Date().toISOString(),
      connectors: body.connectors,
    };
    await fs.writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return Response.json({ connectors: payload.connectors });
  } catch (error) {
    console.error('Part connector save failed:', error);
    return Response.json({ error: 'Unable to save hole markers.' }, { status: 500 });
  }
}
