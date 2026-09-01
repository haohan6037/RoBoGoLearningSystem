'use client';

import { use } from 'react';
import StudioWorkspace from '@/components/studio/StudioWorkspace';

export default function PublishedBuildPage({ params }: { params: Promise<{ publicationId: string }> }) {
  const { publicationId } = use(params);
  return (
    <StudioWorkspace
      projectId=""
      publicationId={publicationId}
      presentationMode
      onProjectSaved={() => undefined}
    />
  );
}
