import { NextRequest } from 'next/server';
import { networkInterfaces } from 'node:os';
import type { TransportStudioProject } from '@/lib/projects/projectTransport';
import {
  deleteServerProject,
  listServerProjects,
  loadServerProject,
  loadServerPublication,
  publishServerProject,
  revokeServerPublication,
  saveServerProject,
} from '@/lib/projects/serverProjectStorage';

export const runtime = 'nodejs';

function errorResponse(error: unknown, status = 500): Response {
  return Response.json({ error: error instanceof Error ? error.message : 'Unexpected storage error.' }, { status });
}

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.has('networkOrigin')) {
      const addresses = Object.values(networkInterfaces()).flatMap((entries) => entries ?? [])
        .filter((entry) => entry.family === 'IPv4' && !entry.internal)
        .map((entry) => entry.address)
        .sort((a, b) => Number(b.startsWith('192.168.')) - Number(a.startsWith('192.168.')));
      const host = addresses[0] ?? request.nextUrl.hostname;
      const port = request.nextUrl.port ? `:${request.nextUrl.port}` : '';
      return Response.json({ origin: `${request.nextUrl.protocol}//${host}${port}` });
    }
    const projectId = request.nextUrl.searchParams.get('projectId');
    const publicationId = request.nextUrl.searchParams.get('publicationId');
    if (publicationId) {
      const publication = await loadServerPublication(publicationId);
      if (!publication) return errorResponse(new Error('Published Build Instructions not found.'), 404);
      if (publication.revokedAt) return errorResponse(new Error('These Build Instructions have been withdrawn by the teacher.'), 410);
      return Response.json(publication);
    }
    if (projectId) {
      const project = await loadServerProject(projectId);
      return project ? Response.json(project) : errorResponse(new Error('Project not found.'), 404);
    }
    const projects = await listServerProjects();
    return Response.json(projects.map((project) => ({ ...project, modelAsset: null, coverAsset: null })));
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const record = await request.json() as TransportStudioProject;
    await saveServerProject(record);
    return Response.json({ saved: true });
  } catch (error: unknown) {
    return errorResponse(error, 400);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { action?: string; projectId?: string; publicationId?: string };
    if (body.action === 'publish' && body.projectId) return Response.json(await publishServerProject(body.projectId));
    if (body.action === 'revoke' && body.publicationId) return Response.json(await revokeServerPublication(body.publicationId));
    return errorResponse(new Error('Unsupported studio action.'), 400);
  } catch (error: unknown) {
    return errorResponse(error, 400);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) return errorResponse(new Error('Project id is required.'), 400);
    await deleteServerProject(projectId);
    return new Response(null, { status: 204 });
  } catch (error: unknown) {
    return errorResponse(error, 400);
  }
}
