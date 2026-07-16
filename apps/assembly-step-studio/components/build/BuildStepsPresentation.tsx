'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import ViewerCanvas, { type StepThumbnailCaptureRequest } from '@/components/viewer/ViewerCanvas';
import { useAssemblyStore } from '@/store/useAssemblyStore';
import type { CameraView } from '@/types/assembly';

interface Props {
  projectName: string;
  stepCount: number;
  coverImageUrl: string | null;
  coverCamera?: CameraView;
  onBackToProjects: () => void;
}

export default function BuildStepsPresentation({
  projectName,
  stepCount,
  coverImageUrl,
  coverCamera,
  onBackToProjects,
}: Props) {
  const steps = useAssemblyStore((s) => s.assemblySteps);
  const currentStepId = useAssemblyStore((s) => s.currentStepId);
  const applyStep = useAssemblyStore((s) => s.applyStep);
  const deselectAll = useAssemblyStore((s) => s.deselectAll);
  const [started, setStarted] = useState(false);
  const [stepBrowserOpen, setStepBrowserOpen] = useState(false);
  const [stepThumbnailUrls, setStepThumbnailUrls] = useState<Record<string, string>>({});
  const [thumbnailRequest, setThumbnailRequest] = useState<StepThumbnailCaptureRequest>();
  const firstStepApplied = useRef(false);
  const thumbnailUrlsRef = useRef<Record<string, string>>({});
  const thumbnailTokenRef = useRef(0);

  const activeStepIndex = useMemo(
    () => Math.max(0, steps.findIndex((step) => step.id === currentStepId)),
    [currentStepId, steps],
  );
  const activeStep = steps[activeStepIndex];

  useEffect(() => {
    if (started && steps.length > 0 && !firstStepApplied.current) {
      firstStepApplied.current = true;
      applyStep(steps[0].id);
      deselectAll();
    }
  }, [started, steps, applyStep, deselectAll]);

  useEffect(() => {
    if (!stepBrowserOpen || thumbnailRequest) return;
    const nextStep = steps.find((step) => !stepThumbnailUrls[step.id]);
    if (!nextStep) return;
    thumbnailTokenRef.current += 1;
    setThumbnailRequest({
      token: thumbnailTokenRef.current,
      stepId: nextStep.id,
      objectStates: nextStep.objectStates,
    });
  }, [stepBrowserOpen, stepThumbnailUrls, steps, thumbnailRequest]);

  useEffect(() => () => {
    Object.values(thumbnailUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const selectStep = useCallback((stepId: string) => {
    applyStep(stepId);
    deselectAll();
  }, [applyStep, deselectAll]);

  const handleStepThumbnailCaptured = useCallback((stepId: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const previousUrl = thumbnailUrlsRef.current[stepId];
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    thumbnailUrlsRef.current = { ...thumbnailUrlsRef.current, [stepId]: url };
    setStepThumbnailUrls(thumbnailUrlsRef.current);
    setThumbnailRequest(undefined);
  }, []);

  const moveStep = (offset: number) => {
    const nextStep = steps[activeStepIndex + offset];
    if (nextStep) selectStep(nextStep.id);
  };

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-white text-slate-900">
      <header className="flex min-h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">RoBoGo Build Instruction</p>
          <h1 className="truncate text-lg font-semibold text-slate-900">{projectName}</h1>
        </div>
        <button onClick={onBackToProjects} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          Projects
        </button>
      </header>

      {!started ? (
        <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-slate-50 px-4 py-8 sm:px-8">
          <section className="grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-xl shadow-slate-900/10 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="relative aspect-video min-h-[320px] bg-white">
              {coverImageUrl ? (
                <Image
                  src={coverImageUrl}
                  alt={`${projectName} completed model`}
                  fill
                  unoptimized
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  className="object-contain"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-8 text-center">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Cover image not captured yet</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">The teacher can create one with Capture Cover in Designer.</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col justify-center border-t border-slate-200 p-6 lg:border-l lg:border-t-0 lg:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Ready to build</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">{projectName}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {stepCount > 0 ? `${stepCount} guided build steps` : 'Build steps have not been generated yet.'}
              </p>
              <button
                type="button"
                onClick={() => setStarted(true)}
                disabled={stepCount === 0}
                className="mt-6 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                Start Building
              </button>
            </div>
          </section>
        </main>
      ) : (
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <section className="relative min-h-0 flex-1 bg-white">
          <ViewerCanvas
            variant="presentation"
            initialCameraView={coverCamera}
            stepThumbnailRequest={thumbnailRequest}
            onStepThumbnailCaptured={handleStepThumbnailCaptured}
          />
          <div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm">
            Left drag to rotate · Right drag to move · Scroll to zoom · Click a part to see its name
          </div>
        </section>

        {stepBrowserOpen && (
          <div
            className="absolute inset-0 z-30 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={() => setStepBrowserOpen(false)}
          >
            <div
              className="border-b border-slate-300 bg-white/95 p-3 shadow-2xl sm:p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Choose a step</p>
                  <p className="mt-0.5 text-sm text-slate-500">Select a thumbnail to jump directly to that build step.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStepBrowserOpen(false)}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
              <ol className="flex gap-3 overflow-x-auto pb-2">
                {steps.map((step) => {
                  const active = step.id === currentStepId;
                  const thumbnailUrl = stepThumbnailUrls[step.id];
                  return (
                    <li key={step.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          selectStep(step.id);
                          setStepBrowserOpen(false);
                        }}
                        aria-current={active ? 'step' : undefined}
                        className={`w-40 overflow-hidden rounded-xl border-2 bg-white text-left shadow-sm transition sm:w-44 ${active ? 'border-blue-600 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}
                      >
                        <span className="relative block aspect-video bg-slate-100">
                          {thumbnailUrl ? (
                            <Image
                              src={thumbnailUrl}
                              alt={`Step ${step.index} model preview`}
                              fill
                              unoptimized
                              sizes="176px"
                              className="object-contain"
                            />
                          ) : coverImageUrl ? (
                            <Image
                              src={coverImageUrl}
                              alt=""
                              fill
                              unoptimized
                              sizes="176px"
                              className="object-contain opacity-35"
                            />
                          ) : (
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-400">
                              Generating preview…
                            </span>
                          )}
                        </span>
                        <span className={`block truncate border-t px-3 py-2 text-sm font-semibold ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-700'}`}>
                          Step {step.index}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        )}

        <nav className="flex min-h-20 shrink-0 items-center gap-3 border-t border-slate-200 bg-white px-3 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] sm:gap-5 sm:px-6">
          <button
            type="button"
            onClick={() => moveStep(-1)}
            disabled={steps.length === 0 || activeStepIndex === 0}
            aria-label="Previous step"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 transition hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-35 sm:h-14 sm:w-14"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden="true"><path d="M16.5 4.5v15L6 12l10.5-7.5Z" /></svg>
          </button>
          <button
            type="button"
            onClick={() => setStepBrowserOpen((open) => !open)}
            aria-expanded={stepBrowserOpen}
            aria-label="Browse all build steps"
            className={`grid h-12 w-12 shrink-0 grid-cols-2 grid-rows-3 gap-1 rounded-xl p-2.5 transition ${stepBrowserOpen ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-900 hover:bg-blue-50 hover:text-blue-600'}`}
          >
            {Array.from({ length: 6 }).map((_, index) => <span key={index} className="rounded-[1px] bg-current" />)}
          </button>

          <label className="min-w-0 flex-1">
            <span className="sr-only">Current build step</span>
            <select
              value={activeStep?.id ?? ''}
              onChange={(event) => selectStep(event.target.value)}
              disabled={steps.length === 0}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              {steps.length === 0 ? (
                <option value="">{stepCount > 0 ? 'Loading build steps…' : 'No build steps'}</option>
              ) : steps.map((step) => (
                <option key={step.id} value={step.id}>Step {step.index} — {step.title}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => moveStep(1)}
            disabled={steps.length === 0 || activeStepIndex >= steps.length - 1}
            aria-label="Next step"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-200 disabled:shadow-none sm:h-14 sm:w-14"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden="true"><path d="m7.5 4.5 10.5 7.5-10.5 7.5v-15Z" /></svg>
          </button>
        </nav>
      </main>
      )}
    </div>
  );
}
