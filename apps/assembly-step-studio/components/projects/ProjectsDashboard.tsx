'use client';

import { useEffect, useRef, useState } from 'react';
import type { StudioProjectRecord } from '@/types/assembly';

interface Props {
  projects: StudioProjectRecord[];
  onCreateProject: (name: string) => Promise<void> | void;
  onOpenProject: (projectId: string) => void;
  onDuplicateProject: (projectId: string) => Promise<void> | void;
  onDeleteProject: (projectId: string) => Promise<void> | void;
  onCopyProjectLink: (projectId: string) => Promise<void> | void;
}

type ProjectFilter = 'Published' | 'All';

function formatProjectDate(value: string): string {
  return new Intl.DateTimeFormat('en-NZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatProjectTime(value: string): string {
  return new Intl.DateTimeFormat('en-NZ', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function buildProjectAccent(projectId: string): string {
  const palette = [
    'from-sky-100 via-cyan-50 to-blue-100',
    'from-emerald-100 via-lime-50 to-teal-100',
    'from-orange-100 via-amber-50 to-rose-100',
    'from-fuchsia-100 via-pink-50 to-violet-100',
  ];
  const seed = projectId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[seed % palette.length];
}

export default function ProjectsDashboard({
  projects,
  onCreateProject,
  onOpenProject,
  onDuplicateProject,
  onDeleteProject,
  onCopyProjectLink,
}: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProjectFilter>('Published');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuProjectId(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => {
    const matchesFilter = filter === 'All' || project.status === filter;
    const matchesQuery =
      normalizedQuery.length === 0 ||
      project.name.toLowerCase().includes(normalizedQuery) ||
      project.id.toLowerCase().includes(normalizedQuery) ||
      project.data.modelFileName?.toLowerCase().includes(normalizedQuery);
    return matchesFilter && matchesQuery;
  });

  const countPublished = projects.filter((project) => project.status === 'Published').length;
  const effectiveSelectedProjectId = selectedProjectId ?? filteredProjects[0]?.id ?? projects[0]?.id ?? null;

  const handleCreate = async () => {
    const name = draftName.trim();
    if (!name) return;
    await onCreateProject(name);
    setDraftName('');
    setShowCreateForm(false);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#eff6ff_0%,_#ffffff_38%,_#f8fafc_100%)] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 border-r border-slate-200/80 bg-white/70 px-5 py-6 backdrop-blur xl:flex xl:flex-col">
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-sm font-semibold text-white shadow-lg shadow-sky-200">
                HH
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Hao Han</p>
                <p className="text-xs text-slate-500">haohan6037@gmail.com</p>
              </div>
            </div>
            <span className="mt-3 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
              Admin
            </span>
          </div>
          <nav className="space-y-1 text-sm">
            <div className="rounded-2xl bg-sky-50 px-3 py-2 font-medium text-sky-700">Projects</div>
            <div className="rounded-2xl px-3 py-2 text-slate-500">Layouts</div>
            <div className="rounded-2xl px-3 py-2 text-slate-500">Library</div>
            <div className="rounded-2xl px-3 py-2 text-slate-500">Workspace</div>
          </nav>
        </aside>

        <main className="flex-1 px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-5 flex flex-col gap-4 rounded-[28px] border border-white/70 bg-white/85 px-5 py-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-medium text-sky-600">Assembly Studio</p>
                  <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Projects</h1>
                  <p className="mt-2 text-sm text-slate-500">
                    Pick a project to continue in Designer. Each project keeps its own ID, model, steps, and link.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative">
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search projects or IDs"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100 sm:w-72"
                    />
                  </div>
                  <button
                    onClick={() => setShowCreateForm((value) => !value)}
                    className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:translate-y-[-1px]"
                  >
                    + New Project
                  </button>
                </div>
              </div>

              {showCreateForm && (
                <div className="flex flex-col gap-3 rounded-2xl border border-sky-100 bg-sky-50/80 p-4 sm:flex-row sm:items-center">
                  <input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder="Project name"
                    className="flex-1 rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  />
                  <button
                    onClick={handleCreate}
                    className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Create
                  </button>
                </div>
              )}
            </div>

            <div className="flex min-h-[540px] flex-col rounded-[30px] border border-white/70 bg-white/90 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur md:min-h-[600px]">
              <div className="flex flex-col gap-4 border-b border-slate-200/80 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {[
                    { value: 'Published' as const, label: 'Published', count: countPublished },
                    { value: 'All' as const, label: 'All', count: projects.length },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFilter(option.value)}
                      className={`rounded-full px-3 py-1.5 transition ${
                        filter === option.value
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {option.label} <span className="ml-1 text-xs opacity-75">{option.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-x-auto overflow-y-visible pb-6">
                <table className="min-w-full table-fixed border-separate border-spacing-y-3 px-4">
                  <colgroup>
                    <col className="w-[42%]" />
                    <col className="w-[12%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[8%]" />
                    <col className="w-[10%]" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-400">
                      <th className="w-[44%] px-6 py-3">Name</th>
                      <th className="w-[12%] px-4 py-3">Status</th>
                      <th className="w-[14%] px-4 py-3">Modified</th>
                      <th className="w-[14%] px-4 py-3">Created</th>
                      <th className="w-[8%] px-4 py-3">Owner</th>
                      <th className="w-[8%] px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-400">
                          No projects matched this view.
                        </td>
                      </tr>
                    )}
                    {filteredProjects.map((project) => {
                      const isSelected = project.id === effectiveSelectedProjectId;
                      const sharedRowClass = isSelected
                        ? 'border-sky-300 bg-sky-50/80'
                        : 'border-slate-200 bg-white';
                      const hoverRowClass = isSelected ? '' : 'transition group-hover:border-slate-300 group-hover:bg-slate-50/80';
                      return (
                        <tr key={project.id} className="group cursor-pointer" onClick={() => setSelectedProjectId(project.id)}>
                          <td className={`rounded-l-[24px] border-y border-l px-6 py-4 ${sharedRowClass} ${hoverRowClass}`}>
                            <div className="flex min-w-0 items-center gap-4">
                              <div className={`flex h-16 w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${buildProjectAccent(project.id)} text-[11px] font-semibold text-slate-600 shadow-inner`}>
                                {project.data.modelFileName ? project.data.modelFileName.split('.').pop()?.toUpperCase() : 'PROJECT'}
                              </div>
                              <div className="min-w-0">
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onOpenProject(project.id);
                                  }}
                                  className="block truncate text-left text-sm font-semibold text-slate-900 transition hover:text-sky-700"
                                >
                                  {project.name}
                                </button>
                                <p className="mt-1 truncate text-xs text-slate-500">ID: {project.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className={`border-y px-4 py-4 align-middle ${sharedRowClass} ${hoverRowClass}`}>
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              {project.status}
                            </span>
                          </td>
                          <td className={`border-y px-4 py-4 align-middle text-sm text-slate-600 ${sharedRowClass} ${hoverRowClass}`}>
                            <div>{formatProjectDate(project.updatedAt)}</div>
                            <div className="mt-1 text-xs text-slate-400">{formatProjectTime(project.updatedAt)}</div>
                          </td>
                          <td className={`border-y px-4 py-4 align-middle text-sm text-slate-600 ${sharedRowClass} ${hoverRowClass}`}>
                            <div>{formatProjectDate(project.createdAt)}</div>
                            <div className="mt-1 text-xs text-slate-400">{formatProjectTime(project.createdAt)}</div>
                          </td>
                          <td className={`border-y px-4 py-4 align-middle text-sm text-slate-600 ${sharedRowClass} ${hoverRowClass}`}>
                            {project.owner}
                          </td>
                          <td className={`rounded-r-[24px] border-y border-r px-4 py-4 align-middle ${sharedRowClass} ${hoverRowClass}`}>
                            <div className="relative z-10 flex items-center justify-end gap-2">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onOpenProject(project.id);
                                }}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-700"
                              >
                                Designer
                              </button>
                              <div
                                ref={menuProjectId === project.id ? menuRef : undefined}
                                className={`relative ${menuProjectId === project.id ? 'z-30' : ''}`}
                              >
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setMenuProjectId((value) => (value === project.id ? null : project.id));
                                  }}
                                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg leading-none text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                                >
                                  ⋮
                                </button>
                                {menuProjectId === project.id && (
                                  <div className="absolute right-0 top-11 z-40 w-44 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
                                    <button
                                      onClick={() => {
                                        setMenuProjectId(null);
                                        onOpenProject(project.id);
                                      }}
                                      className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                                    >
                                      Designer
                                    </button>
                                    <button
                                      onClick={async () => {
                                        setMenuProjectId(null);
                                        await onDuplicateProject(project.id);
                                      }}
                                      className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                                    >
                                      Duplicate
                                    </button>
                                    <button
                                      onClick={async () => {
                                        setMenuProjectId(null);
                                        await onCopyProjectLink(project.id);
                                      }}
                                      className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                                    >
                                      Copy Link
                                    </button>
                                    <button
                                      onClick={async () => {
                                        setMenuProjectId(null);
                                        await onDeleteProject(project.id);
                                      }}
                                      className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
