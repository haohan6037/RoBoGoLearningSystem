import { Suspense } from 'react';
import StudioHome from '@/components/studio/StudioHome';

export default function Home() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading Assembly Studio...</div>}>
      <StudioHome />
    </Suspense>
  );
}
